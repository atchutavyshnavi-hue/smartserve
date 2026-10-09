const mongoose = require('mongoose');

// Connects to MongoDB. This holds all PERSISTENT business data:
// users, restaurants, menu items, orders, payments, coupons, reviews,
// subscriptions, scheduled orders — anything that must survive forever
// and be queried/reported on. Redis (see config/redis.js) is used
// separately for temporary, high-speed, real-time data.
async function connectDB() {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`[MongoDB] Connected: ${conn.connection.host}/${conn.connection.name}`);
  } catch (err) {
    console.error('[MongoDB] Connection error:', err.message);
    process.exit(1);
  }
}

module.exports = connectDB;
