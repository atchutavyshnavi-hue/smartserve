const Order = require('../models/Order');
const Restaurant = require('../models/Restaurant');
const User = require('../models/User');
const { redisClient } = require('../config/redis');
const cartService = require('../services/cart.service');
const pricingService = require('../services/pricing.service');
const couponService = require('../services/coupon.service');
const paymentService = require('../services/payment.service');
const surgeService = require('../services/surge.service');
const recommendationService = require('../services/recommendation.service');
const etaService = require('../services/eta.service');
const notificationService = require('../services/notification.service');
const orderRedirectService = require('../services/orderRedirect.service');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');

// The in-flight redirect mechanism (orderRedirect.service.js) is
// restaurant/admin-facing bookkeeping only — a customer must never see
// that their order was merged with, or fulfilled via, someone else's
// cancelled delivery. Strips those fields before an order (or list of
// orders) is returned to the customer who owns it.
function stripRedirectFields(orderDoc) {
  const obj = orderDoc.toObject ? orderDoc.toObject() : orderDoc;
  delete obj.redirectedFromOrder;
  delete obj.redirectedToOrder;
  delete obj.fulfilledViaRedirect;
  return obj;
}

// POST /api/orders/checkout
// { deliveryAddress, contactPhone, paymentMethod: 'cod'|'online', couponCode? }
exports.checkout = catchAsync(async (req, res, next) => {
  const { deliveryAddress, contactPhone, paymentMethod, couponCode } = req.body;

  if (!deliveryAddress?.zone) return next(new AppError('A delivery address with a zone is required', 400));
  if (!['cod', 'online'].includes(paymentMethod)) return next(new AppError('Invalid payment method', 400));

  // Double-submit guard (FR-03): a short-lived per-user lock so a
  // double-click or a retried request can't create two orders from the
  // same cart before the first request finishes clearing it.
  const lockKey = `checkout:lock:${req.user._id}`;
  const acquired = await redisClient.set(lockKey, '1', { NX: true, PX: 10000 });
  if (!acquired) return next(new AppError('Your previous order is still being processed — please wait a moment.', 409));

  try {
    const cart = await cartService.getCart(req.user._id);
    if (cart.items.length === 0) return next(new AppError('Your cart is empty', 400));

  const unavailable = cart.items.find((i) => !i.isAvailable);
  if (unavailable) return next(new AppError(`${unavailable.name} is no longer available`, 409));

  const restaurant = await Restaurant.findById(cart.restaurant);
  if (!restaurant) return next(new AppError('Restaurant not found', 404));
  if (!restaurant.isOpen) return next(new AppError('This restaurant is currently closed', 400));

  // Delivery fee: dynamic, based on the last 10 minutes of demand in
  // the customer's delivery zone (Phase 5 — surge pricing).
  const surge = await surgeService.getDynamicDeliveryFee(deliveryAddress.zone);
  const deliveryFee = surge.fee;

  const { discount, coupon } = await couponService.validateAndComputeDiscount(
    couponCode, req.user._id, cart.subtotal,
  );
  const pricing = pricingService.calculatePricing({ subtotal: cart.subtotal, deliveryFee, discount });
  const eta = await etaService.getETA(restaurant, deliveryAddress.zone);

  const order = await Order.create({
    customer: req.user._id,
    restaurant: restaurant._id,
    items: cart.items.map((i) => ({
      menuItem: i.menuItem, name: i.name, price: i.price, quantity: i.quantity, addedBy: req.user._id,
    })),
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
  await cartService.clearCart(req.user._id);

  // Feed the two Redis-driven signals that key off "an order happened":
  // surge demand (this zone just got busier) and trending (this
  // restaurant just got a point in its zone's leaderboard).
  await surgeService.recordOrder(deliveryAddress.zone);
  await recommendationService.recordCompletedOrder(restaurant.zone, restaurant._id);
  await etaService.incrementActiveOrders(restaurant._id);

  // Real-time: let the restaurant's dashboard know a new order landed.
  const io = req.app.get('io');
  io.to(`restaurant:${restaurant._id}`).emit('order:new', { orderId: order._id, restaurantId: restaurant._id });
  io.to(`user:${req.user._id}`).emit('order:placed', { orderId: order._id });

  await notificationService.notify(restaurant.owner, {
    type: 'new_order', title: 'New order received',
    message: `A new order (₹${pricing.total}) just came in.`, data: { orderId: order._id },
  });

    res.status(201).json({ success: true, message: 'Order placed successfully', data: { order } });
  } finally {
    await redisClient.del(lockKey);
  }
});

// GET /api/orders  (current customer's order history)
exports.myOrders = catchAsync(async (req, res) => {
  const orders = await Order.find({ customer: req.user._id }).sort('-createdAt')
    .populate('restaurant', 'name address zone')
    .populate('deliveryPartner', 'name phone');
  res.status(200).json({ success: true, message: 'Success', data: { orders: orders.map(stripRedirectFields) } });
});

// GET /api/orders/:id
exports.getOrder = catchAsync(async (req, res, next) => {
  const order = await Order.findById(req.params.id)
    .populate('restaurant', 'name address zone')
    .populate('deliveryPartner', 'name phone');
  if (!order) return next(new AppError('Order not found', 404));

  const isOwner = String(order.customer) === String(req.user._id);
  const restaurant = await Restaurant.findById(order.restaurant);
  const isRestaurantOwner = restaurant && String(restaurant.owner) === String(req.user._id);
  const isRider = order.deliveryPartner && String(order.deliveryPartner) === String(req.user._id);
  if (!isOwner && !isRestaurantOwner && !isRider && req.user.role !== 'admin') {
    return next(new AppError('You do not have access to this order', 403));
  }

  // Only the customer's own view is sanitized — restaurant owners, riders
  // and admins are allowed to see the redirect bookkeeping.
  const payload = (isOwner && !isRestaurantOwner && req.user.role !== 'admin')
    ? stripRedirectFields(order)
    : order;

  res.status(200).json({ success: true, message: 'Success', data: { order: payload } });
});

const VALID_TRANSITIONS = {
  placed: ['accepted', 'cancelled'],
  accepted: ['preparing', 'cancelled'],
  preparing: ['ready'],
  ready: ['rider_assigned'],
  rider_assigned: ['out_for_delivery'],
  out_for_delivery: ['delivered'],
  delivered: [],
  cancelled: [],
};

// PATCH /api/orders/:id/status  { status }  (restaurant owner / delivery partner / admin)
exports.updateStatus = catchAsync(async (req, res, next) => {
  const { status } = req.body;
  const order = await Order.findById(req.params.id);
  if (!order) return next(new AppError('Order not found', 404));

  const allowedNext = VALID_TRANSITIONS[order.status] || [];
  if (!allowedNext.includes(status)) {
    return next(new AppError(`Cannot move order from '${order.status}' to '${status}'`, 400));
  }

  const restaurant = await Restaurant.findById(order.restaurant);
  const isRestaurantOwner = restaurant && String(restaurant.owner) === String(req.user._id);
  const isAssignedRider = order.deliveryPartner && String(order.deliveryPartner) === String(req.user._id);
  const restaurantStatuses = ['accepted', 'preparing', 'ready', 'cancelled'];
  const riderStatuses = ['rider_assigned', 'out_for_delivery', 'delivered'];

  const permitted = req.user.role === 'admin'
    || (restaurantStatuses.includes(status) && isRestaurantOwner)
    || (riderStatuses.includes(status) && (isAssignedRider || req.user.role === 'delivery_partner'));
  if (!permitted) return next(new AppError('You are not permitted to make this status change', 403));

  if (status === 'rider_assigned' && !order.deliveryPartner) {
    order.deliveryPartner = req.user.role === 'delivery_partner' ? req.user._id : order.deliveryPartner;
  }
  if (order.paymentMethod === 'cod' && status === 'delivered') {
    order.paymentStatus = 'paid';
  }

  order.pushStatus(status);
  await order.save();

  if (status === 'delivered') {
    await etaService.decrementActiveOrders(order.restaurant);
  }

  const io = req.app.get('io');
  io.to(`order:${order._id}`).emit('order:status', { orderId: order._id, status });
  io.to(`user:${order.customer}`).emit('order:status', { orderId: order._id, status });

  const statusMessages = {
    accepted: 'Your order has been accepted by the restaurant.',
    preparing: 'The restaurant has started preparing your food.',
    ready: 'Your food is ready and waiting for a rider.',
    rider_assigned: 'A delivery partner has been assigned to your order.',
    out_for_delivery: 'Your order is out for delivery.',
    delivered: 'Your order has been delivered. Enjoy your meal!',
  };
  // Maps each transition to the Notification model's enum — 'preparing'
  // and 'ready' are stored as 'order_preparing'/'order_ready', the rest
  // already match the status name exactly.
  const statusNotificationType = {
    accepted: 'order_accepted', preparing: 'order_preparing', ready: 'order_ready',
    rider_assigned: 'rider_assigned', out_for_delivery: 'out_for_delivery', delivered: 'delivered',
  };
  if (statusMessages[status]) {
    await notificationService.notify(order.customer, {
      type: statusNotificationType[status] || 'new_order',
      title: `Order update: ${status.replace('_', ' ')}`,
      message: statusMessages[status],
      data: { orderId: order._id },
    });
  }

  // The restaurant just finished prepping this order ("mark order as
  // completed" on their side) — proactively notify every delivery
  // partner registered in this restaurant's zone that a delivery is
  // waiting, instead of leaving them to keep checking "Available"
  // themselves. Riders with no zone set (e.g. demo accounts) get every
  // zone's notifications, for backwards compatibility.
  if (status === 'ready') {
    const restaurantForNotify = await Restaurant.findById(order.restaurant);
    if (restaurantForNotify) {
      const riders = await User.find({
        role: 'delivery_partner',
        $or: [{ zone: restaurantForNotify.zone }, { zone: null }],
      });
      await Promise.all(riders.map((rider) => notificationService.notify(rider._id, {
        type: 'order_ready',
        title: 'New delivery available',
        message: `${restaurantForNotify.name} has an order ready for pickup in the ${restaurantForNotify.zone} zone.`,
        data: { orderId: order._id, restaurantId: restaurantForNotify._id },
      })));
    }
  }

  res.status(200).json({ success: true, message: 'Order status updated', data: { order } });
});

// PATCH /api/orders/:id/cancel
// Allowed while status === 'placed' (plain cancel), and additionally
// while status === 'out_for_delivery' — in that case the food is already
// cooked and moving, so we first try to hand this same delivery off to
// another nearby customer with an identical, not-yet-prepared order (see
// orderRedirect.service.js) before falling back to an ordinary cancel.
exports.cancelOrder = catchAsync(async (req, res, next) => {
  const order = await Order.findById(req.params.id);
  if (!order) return next(new AppError('Order not found', 404));
  if (String(order.customer) !== String(req.user._id)) {
    return next(new AppError('You do not own this order', 403));
  }

  const io = req.app.get('io');
  const wasOutForDelivery = order.status === 'out_for_delivery';

  if (wasOutForDelivery) {
    const { redirected } = await orderRedirectService.attemptRedirect(order, io);
    if (redirected) {
      // order.js already re-saved as 'cancelled' (and refunded, if paid
      // online) inside attemptRedirect — the customer sees a completely
      // ordinary cancellation, no hint their meal went to someone else.
      await etaService.decrementActiveOrders(order.restaurant);
      io.to(`restaurant:${order.restaurant}`).emit('order:cancelled', { orderId: order._id });
      return res.status(200).json({ success: true, message: 'Order cancelled', data: { order: stripRedirectFields(order) } });
    }
    // No matching order to redirect to — falls through to a normal
    // cancellation below; this food can no longer be recovered.
  } else if (order.status !== 'placed') {
    return next(new AppError('This order can no longer be cancelled', 400));
  }

  order.pushStatus('cancelled');
  if (order.paymentStatus === 'paid') {
    await paymentService.refund(order.payment);
    order.paymentStatus = 'refunded';
  }
  await order.save();
  await etaService.decrementActiveOrders(order.restaurant);

  io.to(`restaurant:${order.restaurant}`).emit('order:cancelled', { orderId: order._id });

  const restaurant = await Restaurant.findById(order.restaurant);
  if (restaurant) {
    await notificationService.notify(restaurant.owner, {
      type: 'order_cancelled',
      title: 'Order cancelled',
      message: wasOutForDelivery
        ? `Order #${String(order._id).slice(-6).toUpperCase()} was cancelled after it was already out for `
          + 'delivery, and no matching order nearby was found to redirect it to — this food cannot be recovered.'
        : `Order #${String(order._id).slice(-6).toUpperCase()} was cancelled by the customer.`,
      data: { orderId: order._id },
    });
  }

  res.status(200).json({ success: true, message: 'Order cancelled', data: { order: stripRedirectFields(order) } });
});

// GET /api/orders/restaurant/:restaurantId  (restaurant owner incoming orders)
exports.restaurantOrders = catchAsync(async (req, res, next) => {
  const restaurant = await Restaurant.findById(req.params.restaurantId);
  if (!restaurant) return next(new AppError('Restaurant not found', 404));
  if (String(restaurant.owner) !== String(req.user._id) && req.user.role !== 'admin') {
    return next(new AppError('You do not own this restaurant', 403));
  }
  const { status } = req.query;
  const filter = { restaurant: restaurant._id };
  if (status) filter.status = status;
  const orders = await Order.find(filter).sort('-createdAt').populate('customer', 'name phone');
  res.status(200).json({ success: true, message: 'Success', data: { orders } });
});

// GET /api/orders/delivery/available  (delivery_partner dashboard)
// Orders ready for pickup with no rider assigned yet — first partner to
// PATCH /:id/status {status:'rider_assigned'} claims it. Scoped to the
// rider's own zone when they've set one (riders with none set, e.g. demo
// accounts, still see every zone).
exports.availableForDelivery = catchAsync(async (req, res) => {
  let orders = await Order.find({ status: 'ready', deliveryPartner: null })
    .sort('createdAt')
    .populate('restaurant', 'name address zone');
  if (req.user.zone) {
    orders = orders.filter((o) => o.restaurant?.zone === req.user.zone);
  }
  res.status(200).json({ success: true, message: 'Success', data: { orders } });
});

// GET /api/orders/delivery/mine  (delivery_partner — active + past deliveries)
exports.myDeliveries = catchAsync(async (req, res) => {
  const orders = await Order.find({ deliveryPartner: req.user._id })
    .sort('-createdAt')
    .populate('restaurant', 'name address');
  res.status(200).json({ success: true, message: 'Success', data: { orders } });
});

// GET /api/orders/delivery/earnings  (delivery_partner)
// Simplified earnings model: a rider earns the delivery fee on every
// order they complete. A real system would have its own payout ledger;
// this is enough to demonstrate the dashboard end-to-end.
exports.deliveryEarnings = catchAsync(async (req, res) => {
  const delivered = await Order.find({ deliveryPartner: req.user._id, status: 'delivered' });
  const totalEarnings = delivered.reduce((sum, o) => sum + o.pricing.deliveryFee, 0);
  res.status(200).json({
    success: true,
    message: 'Success',
    data: { completedDeliveries: delivered.length, totalEarnings },
  });
});