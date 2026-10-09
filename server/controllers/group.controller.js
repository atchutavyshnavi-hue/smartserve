const groupService = require('../services/group.service');
const pricingService = require('../services/pricing.service');
const couponService = require('../services/coupon.service');
const paymentService = require('../services/payment.service');
const surgeService = require('../services/surge.service');
const recommendationService = require('../services/recommendation.service');
const etaService = require('../services/eta.service');
const Order = require('../models/Order');
const Restaurant = require('../models/Restaurant');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');

// POST /api/groups  { restaurantId }
exports.createGroup = catchAsync(async (req, res, next) => {
  const { restaurantId } = req.body;
  if (!restaurantId) return next(new AppError('restaurantId is required', 400));
  const groupId = await groupService.createGroup(req.user._id, req.user.name, restaurantId);
  const state = await groupService.getGroupState(groupId);
  res.status(201).json({
    success: true,
    message: 'Group order created',
    data: { groupId, shareLink: `/group/${groupId}`, group: state },
  });
});

// POST /api/groups/:groupId/join
exports.joinGroup = catchAsync(async (req, res) => {
  const state = await groupService.joinGroup(req.params.groupId, req.user._id, req.user.name);
  res.status(200).json({ success: true, message: 'Joined group order', data: { group: state } });
});

// GET /api/groups/:groupId
exports.getGroup = catchAsync(async (req, res) => {
  const state = await groupService.getGroupState(req.params.groupId);
  res.status(200).json({ success: true, message: 'Success', data: { group: state } });
});

// POST /api/groups/:groupId/items  { menuItemId, quantity }
exports.addItem = catchAsync(async (req, res, next) => {
  const { menuItemId, quantity = 1 } = req.body;
  if (!menuItemId) return next(new AppError('menuItemId is required', 400));
  const state = await groupService.addItem(req.params.groupId, req.user._id, menuItemId, Number(quantity));
  res.status(200).json({ success: true, message: 'Item added', data: { group: state } });
});

// PATCH /api/groups/:groupId/items/:menuItemId  { quantity }
exports.updateQuantity = catchAsync(async (req, res, next) => {
  const { quantity } = req.body;
  if (quantity === undefined) return next(new AppError('quantity is required', 400));
  const state = await groupService.updateQuantity(
    req.params.groupId, req.user._id, req.params.menuItemId, Number(quantity),
  );
  res.status(200).json({ success: true, message: 'Item updated', data: { group: state } });
});

// DELETE /api/groups/:groupId/items/:menuItemId
// A user may only remove their OWN line — enforced inside group.service
// by keying the hash field on {itemId}:{userId}, so this call can only
// ever touch req.user's own entry.
exports.removeItem = catchAsync(async (req, res) => {
  const state = await groupService.removeItem(req.params.groupId, req.user._id, req.params.menuItemId);
  res.status(200).json({ success: true, message: 'Item removed', data: { group: state } });
});

// POST /api/groups/:groupId/checkout  { deliveryAddress, contactPhone, paymentMethod, couponCode }
// Only the group creator can finalize — one shared cart becomes ONE order.
exports.checkout = catchAsync(async (req, res, next) => {
  const { deliveryAddress, contactPhone, paymentMethod, couponCode } = req.body;
  const state = await groupService.getGroupState(req.params.groupId);

  if (String(state.creatorId) !== String(req.user._id)) {
    return next(new AppError('Only the group creator can check out', 403));
  }
  if (state.status !== 'active') return next(new AppError('This group order has already been checked out', 409));
  if (state.items.length === 0) return next(new AppError('The group cart is empty', 400));
  if (!deliveryAddress?.zone) return next(new AppError('A delivery address with a zone is required', 400));
  if (!['cod', 'online'].includes(paymentMethod)) return next(new AppError('Invalid payment method', 400));

  const restaurant = await Restaurant.findById(state.restaurant);
  if (!restaurant) return next(new AppError('Restaurant not found', 404));
  if (!restaurant.isOpen) return next(new AppError('This restaurant is currently closed', 400));

  const surge = await surgeService.getDynamicDeliveryFee(deliveryAddress.zone);
  const deliveryFee = surge.fee;
  const { discount, coupon } = await couponService.validateAndComputeDiscount(
    couponCode, req.user._id, state.subtotal,
  );
  const pricing = pricingService.calculatePricing({ subtotal: state.subtotal, deliveryFee, discount });
  const eta = await etaService.getETA(restaurant, deliveryAddress.zone);

  const order = await Order.create({
    customer: req.user._id,
    restaurant: restaurant._id,
    items: state.lines.map((l) => ({
      menuItem: l.menuItem, name: l.name, price: l.price, quantity: l.quantity, addedBy: l.addedBy,
    })),
    groupId: state.groupId,
    isGroupOrder: true,
    groupMembers: state.members.map((m) => m.userId),
    deliveryAddress,
    contactPhone,
    pricing: { ...pricing, surgeApplied: surge.isSurge, couponCode: coupon ? coupon.code : null },
    paymentMethod,
    status: 'placed',
    statusHistory: [{ status: 'placed', at: new Date() }],
    estimatedDeliveryMinutes: eta.estimatedMinutes,
  });

  const { success, payment } = await paymentService.charge({
    orderId: order._id, customerId: req.user._id, amount: pricing.total, method: paymentMethod,
  });
  if (!success) {
    order.paymentStatus = 'failed';
    order.payment = payment._id;
    await order.save();
    return next(new AppError('Payment failed. Please try again or choose Cash on Delivery.', 402));
  }

  order.paymentStatus = paymentMethod === 'cod' ? 'pending' : 'paid';
  order.payment = payment._id;
  await order.save();
  if (coupon) await couponService.markCouponUsed(coupon._id);

  await groupService.markCheckedOut(state.groupId);
  await groupService.publish(state.groupId, { type: 'checked_out', orderId: order._id });
  // Small delay-free cleanup — group data has served its purpose once the order exists.
  await groupService.clearGroup(state.groupId);

  await surgeService.recordOrder(deliveryAddress.zone);
  await recommendationService.recordCompletedOrder(restaurant.zone, restaurant._id);
  await etaService.incrementActiveOrders(restaurant._id);

  const io = req.app.get('io');
  io.to(`restaurant:${restaurant._id}`).emit('order:new', { orderId: order._id, restaurantId: restaurant._id });

  res.status(201).json({ success: true, message: 'Group order placed successfully', data: { order } });
});
