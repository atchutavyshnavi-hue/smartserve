require('dotenv').config();
const cron = require('node-cron');
const connectDB = require('../config/db');
const { connectRedis } = require('../config/redis');
const scheduledOrderService = require('../services/scheduledOrder.service');

// Standalone process: `npm run worker:scheduled`. Runs independently of
// the API server (and can be scaled/deployed separately) — it only
// needs a MongoDB + Redis connection, no Express/Socket.IO.
async function tick() {
  const now = Math.floor(Date.now() / 1000);
  const dueIds = await scheduledOrderService.getDueTaskIds(now);
  if (dueIds.length === 0) return;

  console.log(`[scheduledOrders.worker] ${dueIds.length} task(s) due`);
  for (const id of dueIds) {
    try {
      const order = await scheduledOrderService.processDueTask(id);
      console.log(`[scheduledOrders.worker] processed ${id} -> ${order ? `order ${order._id}` : 'no-op/failed'}`);
    } catch (err) {
      console.error(`[scheduledOrders.worker] error processing ${id}`, err);
    }
  }
}

async function start() {
  await connectDB();
  await connectRedis();
  console.log('[scheduledOrders.worker] started — checking every minute');
  cron.schedule('* * * * *', tick); // every minute
  await tick(); // also run once immediately on boot
}

start();
