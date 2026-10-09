const { redisPub } = require('../config/redis');
const Notification = require('../models/Notification');

// ---------------------------------------------------------------------
// NOTIFICATIONS — persisted in MongoDB (so a user's notification list
// survives and can be paged through), pushed in real time via the same
// Redis Pub/Sub -> Socket.IO bridge pattern as group ordering.
//
// Channel: notify:{userId}   (mirrored to Socket.IO room user:{userId})
//
// This is also how background workers — which run as separate
// processes with no Socket.IO server of their own (scheduled orders,
// subscriptions, flash deals) — can still push live updates: they only
// need a Redis connection, not a running Express/Socket.IO instance.
// ---------------------------------------------------------------------

async function notify(userId, { type, title, message, data = {} }) {
  const notification = await Notification.create({ user: userId, type, title, message, data });
  await redisPub.publish(`notify:${userId}`, JSON.stringify({
    id: notification._id, type, title, message, data, createdAt: notification.createdAt,
  }));
  return notification;
}

module.exports = { notify };
