const { redisSub } = require('../config/redis');

// Same bridge pattern as group.socket.js: notification.service.js
// publishes to `notify:{userId}` from wherever the event happens
// (an HTTP request in this process, or a standalone background worker
// process with no Socket.IO server at all) — every Node instance
// subscribed here re-emits it to the Socket.IO room `user:{userId}`.
function registerNotificationSocketBridge(io) {
  redisSub.pSubscribe('notify:*', (message, channel) => {
    const userId = channel.split(':')[1];
    let payload;
    try {
      payload = JSON.parse(message);
    } catch (err) {
      console.error('[notification.socket] failed to parse pub/sub message', err);
      return;
    }
    io.to(`user:${userId}`).emit('notification:new', payload);
  });

  console.log('[Socket.IO] Notification Pub/Sub bridge active (pattern: notify:*)');
}

module.exports = registerNotificationSocketBridge;
