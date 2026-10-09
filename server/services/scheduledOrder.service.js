const { redisClient } = require('../config/redis');
const ScheduledOrder = require('../models/ScheduledOrder');
const Restaurant = require('../models/Restaurant');
const MenuItem = require('../models/MenuItem');
const AppError = require('../utils/AppError');
const orderFulfillment = require('./orderFulfillment.service');
const notificationService = require('./notification.service');

// ---------------------------------------------------------------------
// SCHEDULED ORDERS
//
//   scheduled_orders   ZSET: member = ScheduledOrder._id, score = unix seconds it's due
//
// A background worker (workers/scheduledOrders.worker.js) polls this
// set on a cron tick with ZRANGEBYSCORE 0 <now>, turns each due entry
// into a real Order, and ZREMs it — so the set only ever holds work
// that hasn't happened yet.
// ---------------------------------------------------------------------

const SCHEDULE_KEY = 'scheduled_orders';

async function createScheduledOrder(customerId, payload) {
  const { restaurantId, items, deliveryAddress, contactPhone, paymentMethod, scheduledFor } = payload;

  const restaurant = await Restaurant.findById(restaurantId);
  if (!restaurant) throw new AppError('Restaurant not found', 404);
  if (!Array.isArray(items) || items.length === 0) throw new AppError('At least one item is required', 400);

  const scheduledDate = new Date(scheduledFor);
  if (Number.isNaN(scheduledDate.getTime()) || scheduledDate <= new Date()) {
    throw new AppError('scheduledFor must be a valid future date/time', 400);
  }

  // Validate items belong to this restaurant now — price is re-checked
  // fresh again at execution time, since a menu can change between
  // scheduling and the actual order.
  const menuItems = await MenuItem.find({ _id: { $in: items.map((i) => i.menuItemId) }, restaurant: restaurantId });
  if (menuItems.length !== items.length) {
    throw new AppError('One or more items do not belong to this restaurant', 400);
  }

  const scheduledOrder = await ScheduledOrder.create({
    customer: customerId,
    restaurant: restaurantId,
    items: items.map((i) => ({ menuItem: i.menuItemId, quantity: i.quantity })),
    deliveryAddress,
    contactPhone,
    paymentMethod,
    scheduledFor: scheduledDate,
  });

  const dueScore = Math.floor(scheduledDate.getTime() / 1000);
  await redisClient.zAdd(SCHEDULE_KEY, [{ score: dueScore, value: String(scheduledOrder._id) }]);

  return scheduledOrder;
}

async function cancelScheduledOrder(id, customerId) {
  const scheduledOrder = await ScheduledOrder.findById(id);
  if (!scheduledOrder) throw new AppError('Scheduled order not found', 404);
  if (String(scheduledOrder.customer) !== String(customerId)) {
    throw new AppError('You do not own this scheduled order', 403);
  }
  if (scheduledOrder.status !== 'pending') {
    throw new AppError('This scheduled order can no longer be cancelled', 400);
  }
  scheduledOrder.status = 'cancelled';
  await scheduledOrder.save();
  await redisClient.zRem(SCHEDULE_KEY, String(scheduledOrder._id));
  return scheduledOrder;
}

// Fetches every task due at or before `now` (unix seconds).
async function getDueTaskIds(now = Math.floor(Date.now() / 1000)) {
  return redisClient.zRangeByScore(SCHEDULE_KEY, 0, now);
}

// Converts one due ScheduledOrder into a real Order. Called by the
// worker for each id returned by getDueTaskIds(). Always removes the
// task from the Redis set when done, success or failure, so a
// permanently-broken task can't spin the worker forever.
async function processDueTask(id) {
  const scheduledOrder = await ScheduledOrder.findById(id);
  if (!scheduledOrder || scheduledOrder.status !== 'pending') {
    await redisClient.zRem(SCHEDULE_KEY, id);
    return null;
  }

  try {
    const { order, restaurant, pricing } = await orderFulfillment.fulfillOrder({
      customerId: scheduledOrder.customer,
      restaurantId: scheduledOrder.restaurant,
      items: scheduledOrder.items,
      deliveryAddress: scheduledOrder.deliveryAddress,
      contactPhone: scheduledOrder.contactPhone,
      paymentMethod: scheduledOrder.paymentMethod,
      scheduledFor: scheduledOrder.scheduledFor,
    });

    scheduledOrder.status = 'completed';
    scheduledOrder.resultingOrder = order._id;
    await scheduledOrder.save();

    await notificationService.notify(scheduledOrder.customer, {
      type: 'scheduled_order_placed',
      title: 'Your scheduled order has been placed',
      message: `Your order from ${restaurant.name} is on its way to being prepared.`,
      data: { orderId: order._id },
    });
    await notificationService.notify(restaurant.owner, {
      type: 'new_order',
      title: 'New scheduled order received',
      message: `A scheduled order (₹${pricing.total}) just came in.`,
      data: { orderId: order._id },
    });

    return order;
  } catch (err) {
    scheduledOrder.status = 'failed';
    scheduledOrder.failureReason = err.message;
    await scheduledOrder.save();
    await notificationService.notify(scheduledOrder.customer, {
      type: 'scheduled_order_placed',
      title: 'Your scheduled order could not be placed',
      message: err.message,
      data: { scheduledOrderId: scheduledOrder._id },
    });
    return null;
  } finally {
    await redisClient.zRem(SCHEDULE_KEY, id);
  }
}

module.exports = { SCHEDULE_KEY, createScheduledOrder, cancelScheduledOrder, getDueTaskIds, processDueTask };
