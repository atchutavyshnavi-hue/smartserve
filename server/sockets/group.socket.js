const { redisSub } = require('../config/redis');

// Bridges Redis Pub/Sub to Socket.IO.
//
//   React (client A) -> Socket.IO -> Node instance #1 -> REST call mutates
//   the group cart -> group.service publishes to Redis channel group:{id}
//   -> EVERY Node.js instance's redisSub (subscribed here, once, at boot)
//   receives the message -> each instance re-emits it to its own
//   Socket.IO room `group:{id}` -> every connected browser in that room
//   (client A, B, C, ... possibly connected to different instances)
//   gets the update instantly, no refresh needed.
//
// This one PSUBSCRIBE is what lets SmartServe run behind a load balancer
// with multiple backend processes and still keep every group member in
// sync — no instance has to know which other instances hold which sockets.
function registerGroupSocketBridge(io) {
  redisSub.pSubscribe('group:*', (message, channel) => {
    const groupId = channel.split(':')[1];
    let payload;
    try {
      payload = JSON.parse(message);
    } catch (err) {
      console.error('[group.socket] failed to parse pub/sub message', err);
      return;
    }
    io.to(`group:${groupId}`).emit('group:update', payload);
  });

  console.log('[Socket.IO] Group order Pub/Sub bridge active (pattern: group:*)');
}

module.exports = registerGroupSocketBridge;
