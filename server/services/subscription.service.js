const { redisClient } = require('../config/redis');
const Subscription = require('../models/Subscription');
const Restaurant = require('../models/Restaurant');
const MenuItem = require('../models/MenuItem');
const AppError = require('../utils/AppError');
const orderFulfillment = require('./orderFulfillment.service');
const notificationService = require('./notification.service');
const { computeNextRun } = require('./subscriptionSchedule.util');

// ---------------------------------------------------------------------
// SUBSCRIPTIONS / RECURRING ORDERS
//
//   subscription_tasks   ZSET: member = Subscription._id, score = unix seconds of nextRunAt
//
// Same execution-queue pattern as scheduled_orders, with one addition:
// after each firing, the worker recomputes the NEXT occurrence and
// re-adds the subscription to the set — so the queue is self-renewing
// as long as the subscription stays active. Pausing/cancelling removes
// it from the set immediately, so a paused subscription simply never
// comes up again until resumed.
// ---------------------------------------------------------------------

const QUEUE_KEY = 'subscription_tasks';

async function createSubscription(customerId, payload) {
  const {
    restaurantId, items, deliveryAddress, contactPhone, paymentMethod,
    frequency, timeOfDay, dayOfWeek, dayOfMonth,
  } = payload;

  const restaurant = await Restaurant.findById(restaurantId);
  if (!restaurant) throw new AppError('Restaurant not found', 404);
  if (!Array.isArray(items) || items.length === 0) throw new AppError('At least one item is required', 400);

  const menuItems = await MenuItem.find({ _id: { $in: items.map((i) => i.menuItemId) }, restaurant: restaurantId });
  if (menuItems.length !== items.length) {
    throw new AppError('One or more items do not belong to this restaurant', 400);
  }

  let nextRunAt;
  try {
    nextRunAt = computeNextRun({ frequency, timeOfDay, dayOfWeek, dayOfMonth });
  } catch (err) {
    throw new AppError(err.message, 400);
  }

  const subscription = await Subscription.create({
    customer: customerId,
    restaurant: restaurantId,
    items: items.map((i) => ({ menuItem: i.menuItemId, quantity: i.quantity })),
    deliveryAddress,
    contactPhone,
    paymentMethod,
    frequency, timeOfDay, dayOfWeek, dayOfMonth,
    nextRunAt,
  });

  await redisClient.zAdd(QUEUE_KEY, [{ score: Math.floor(nextRunAt.getTime() / 1000), value: String(subscription._id) }]);
  return subscription;
}

async function requireOwnedSubscription(id, customerId) {
  const subscription = await Subscription.findById(id);
  if (!subscription) throw new AppError('Subscription not found', 404);
  if (String(subscription.customer) !== String(customerId)) {
    throw new AppError('You do not own this subscription', 403);
  }
  return subscription;
}

async function pauseSubscription(id, customerId) {
  const subscription = await requireOwnedSubscription(id, customerId);
  if (subscription.status !== 'active') throw new AppError('Only active subscriptions can be paused', 400);
  subscription.status = 'paused';
  await subscription.save();
  await redisClient.zRem(QUEUE_KEY, String(subscription._id));
  return subscription;
}

async function resumeSubscription(id, customerId) {
  const subscription = await requireOwnedSubscription(id, customerId);
  if (subscription.status !== 'paused') throw new AppError('Only paused subscriptions can be resumed', 400);

  // If the original nextRunAt has already passed while paused, roll
  // forward to the next valid occurrence from now rather than firing
  // immediately for a slot that's long gone.
  const next = subscription.nextRunAt > new Date()
    ? subscription.nextRunAt
    : computeNextRun(subscription, new Date());

  subscription.status = 'active';
  subscription.nextRunAt = next;
  await subscription.save();
  await redisClient.zAdd(QUEUE_KEY, [{ score: Math.floor(next.getTime() / 1000), value: String(subscription._id) }]);
  return subscription;
}

async function cancelSubscription(id, customerId) {
  const subscription = await requireOwnedSubscription(id, customerId);
  subscription.status = 'cancelled';
  await subscription.save();
  await redisClient.zRem(QUEUE_KEY, String(subscription._id));
  return subscription;
}

async function getDueTaskIds(now = Math.floor(Date.now() / 1000)) {
  return redisClient.zRangeByScore(QUEUE_KEY, 0, now);
}

// Fires one due subscription: creates the order, then reschedules
// itself for the next occurrence (unless the user paused/cancelled it
// in the meantime, in which case it's simply dropped from the queue).
async function processDueTask(id) {
  const subscription = await Subscription.findById(id);
  if (!subscription || subscription.status !== 'active') {
    await redisClient.zRem(QUEUE_KEY, id);
    return null;
  }

  let order = null;
  try {
    const result = await orderFulfillment.fulfillOrder({
      customerId: subscription.customer,
      restaurantId: subscription.restaurant,
      items: subscription.items,
      deliveryAddress: subscription.deliveryAddress,
      contactPhone: subscription.contactPhone,
      paymentMethod: subscription.paymentMethod,
      subscriptionId: subscription._id,
    });
    order = result.order;

    subscription.lastRunAt = new Date();
    subscription.totalOrdersGenerated += 1;

    await notificationService.notify(subscription.customer, {
      type: 'subscription_order_generated',
      title: 'Your subscription order was placed',
      message: `Your recurring order from ${result.restaurant.name} has been placed.`,
      data: { orderId: order._id },
    });
    await notificationService.notify(result.restaurant.owner, {
      type: 'new_order',
      title: 'New subscription order received',
      message: `A recurring order (₹${result.pricing.total}) just came in.`,
      data: { orderId: order._id },
    });
  } catch (err) {
    await notificationService.notify(subscription.customer, {
      type: 'subscription_order_generated',
      title: 'Your subscription order could not be placed',
      message: err.message,
      data: { subscriptionId: subscription._id },
    });
  } finally {
    // Reschedule regardless of success/failure — a single missed slot
    // (e.g. restaurant closed that day) shouldn't kill the whole
    // subscription; it just tries again next cycle.
    const next = computeNextRun(subscription, new Date());
    subscription.nextRunAt = next;
    await subscription.save();
    await redisClient.zRem(QUEUE_KEY, id);
    if (subscription.status === 'active') {
      await redisClient.zAdd(QUEUE_KEY, [{ score: Math.floor(next.getTime() / 1000), value: String(subscription._id) }]);
    }
  }

  return order;
}

module.exports = {
  QUEUE_KEY, createSubscription, pauseSubscription, resumeSubscription, cancelSubscription,
  getDueTaskIds, processDueTask,
};
