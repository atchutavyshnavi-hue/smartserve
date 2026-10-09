const Restaurant = require('../models/Restaurant');
const MenuItem = require('../models/MenuItem');
const Order = require('../models/Order');
const pricingService = require('./pricing.service');
const surgeService = require('./surge.service');
const etaService = require('./eta.service');
const recommendationService = require('./recommendation.service');
const paymentService = require('./payment.service');

// ---------------------------------------------------------------------
// Shared "turn a list of items into a real, paid Order" logic. Used by:
//   - order.controller.js checkout        (immediate solo order)
//   - group.controller.js checkout        (immediate group order)
//   - scheduledOrder.service.js worker     (fires at a future timestamp)
//   - subscription.service.js worker       (fires on a recurring schedule)
//
// Centralizing this means surge pricing, ETA, trending, and payment
// charging behave IDENTICALLY no matter which flow triggered the order
// — a scheduled order placed at 1pm gets the same live surge fee as
// someone ordering by hand at 1pm, not a stale price from when it was
// scheduled.
//
// `items` here is always [{ menuItem: id, quantity }] — price/name are
// always looked up fresh from MongoDB, never trusted from a stored
// snapshot, since a menu can change between scheduling and execution.
// ---------------------------------------------------------------------

async function fulfillOrder({
  customerId, restaurantId, items, deliveryAddress, contactPhone, paymentMethod,
  couponDiscount = 0, couponCode = null, scheduledFor = null, subscriptionId = null,
}) {
  const restaurant = await Restaurant.findById(restaurantId);
  if (!restaurant) throw new Error('Restaurant no longer exists');
  if (!restaurant.isOpen) throw new Error('Restaurant is currently closed');

  const menuItems = await MenuItem.find({ _id: { $in: items.map((i) => i.menuItem) } });
  const menuItemMap = new Map(menuItems.map((mi) => [String(mi._id), mi]));

  const orderItems = items.map((i) => {
    const mi = menuItemMap.get(String(i.menuItem));
    if (!mi || !mi.isAvailable) throw new Error(`${mi ? mi.name : 'An item'} is no longer available`);
    return { menuItem: mi._id, name: mi.name, price: mi.price, quantity: i.quantity, addedBy: customerId };
  });
  const subtotal = orderItems.reduce((sum, i) => sum + i.price * i.quantity, 0);

  const surge = await surgeService.getDynamicDeliveryFee(deliveryAddress.zone);
  const pricing = pricingService.calculatePricing({ subtotal, deliveryFee: surge.fee, discount: couponDiscount });
  const eta = await etaService.getETA(restaurant, deliveryAddress.zone);

  const order = await Order.create({
    customer: customerId,
    restaurant: restaurant._id,
    items: orderItems,
    deliveryAddress,
    contactPhone,
    pricing: { ...pricing, surgeApplied: surge.isSurge, couponCode },
    paymentMethod,
    status: 'placed',
    statusHistory: [{ status: 'placed', at: new Date() }],
    estimatedDeliveryMinutes: eta.estimatedMinutes,
    scheduledFor: scheduledFor || undefined,
    subscriptionId: subscriptionId || undefined,
  });

  const { success, payment } = await paymentService.charge({
    orderId: order._id, customerId, amount: pricing.total, method: paymentMethod,
  });
  order.payment = payment._id;
  order.paymentStatus = success ? (paymentMethod === 'cod' ? 'pending' : 'paid') : 'failed';
  await order.save();
  if (!success) throw new Error('Payment failed');

  await surgeService.recordOrder(deliveryAddress.zone);
  await recommendationService.recordCompletedOrder(restaurant.zone, restaurant._id);
  await etaService.incrementActiveOrders(restaurant._id);

  return { order, restaurant, pricing };
}

module.exports = { fulfillOrder };
