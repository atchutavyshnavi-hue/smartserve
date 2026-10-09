const { createClient } = require('redis');

// SmartServe uses TWO Redis client instances:
//  - redisClient: general purpose commands (GET/SET/HSET/ZADD/INCR/EXPIRE...)
//  - redisPub / redisSub: dedicated Pub/Sub pair (a client in subscribe mode
//    cannot run normal commands, so it must be a separate connection).
//
// This split is also what lets the architecture scale horizontally:
// every Node.js instance publishes to the same Redis Pub/Sub channels,
// so Socket.IO events broadcast correctly across multiple server processes.

const redisClient = createClient({ url: process.env.REDIS_URL });
const redisPub = createClient({ url: process.env.REDIS_URL });
const redisSub = createClient({ url: process.env.REDIS_URL });

[redisClient, redisPub, redisSub].forEach((client, i) => {
  const label = ['main', 'pub', 'sub'][i];
  client.on('error', (err) => console.error(`[Redis:${label}] error`, err));
});

async function connectRedis() {
  await redisClient.connect();
  await redisPub.connect();
  await redisSub.connect();
  console.log('[Redis] Connected (main, pub, sub)');
}

module.exports = { redisClient, redisPub, redisSub, connectRedis };
