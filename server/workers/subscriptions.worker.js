require('dotenv').config();
const cron = require('node-cron');
const connectDB = require('../config/db');
const { connectRedis } = require('../config/redis');
const subscriptionService = require('../services/subscription.service');

async function tick() {
  const now = Math.floor(Date.now() / 1000);
  const dueIds = await subscriptionService.getDueTaskIds(now);
  if (dueIds.length === 0) return;

  console.log(`[subscriptions.worker] ${dueIds.length} subscription(s) due`);
  for (const id of dueIds) {
    try {
      const order = await subscriptionService.processDueTask(id);
      console.log(`[subscriptions.worker] processed ${id} -> ${order ? `order ${order._id}` : 'no-op/failed'}`);
    } catch (err) {
      console.error(`[subscriptions.worker] error processing ${id}`, err);
    }
  }
}

async function start() {
  await connectDB();
  await connectRedis();
  console.log('[subscriptions.worker] started — checking every minute');
  cron.schedule('* * * * *', tick);
  await tick();
}

start();
