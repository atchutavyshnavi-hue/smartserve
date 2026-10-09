require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cron = require('node-cron');
const { Server } = require('socket.io');

const connectDB = require('./config/db');
const { connectRedis } = require('./config/redis');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { apiLimiter, authLimiter } = require('./middleware/rateLimiter');
const recommendationService = require('./services/recommendation.service');

const authRoutes = require('./routes/auth.routes');
const restaurantRoutes = require('./routes/restaurant.routes');
const menuRoutes = require('./routes/menu.routes');
const metaRoutes = require('./routes/meta.routes');
const cartRoutes = require('./routes/cart.routes');
const orderRoutes = require('./routes/order.routes');
const couponRoutes = require('./routes/coupon.routes');
const groupRoutes = require('./routes/group.routes');
const pricingRoutes = require('./routes/pricing.routes');
const recommendationRoutes = require('./routes/recommendation.routes');
const etaRoutes = require('./routes/eta.routes');
const notificationRoutes = require('./routes/notification.routes');
const scheduledOrderRoutes = require('./routes/scheduledOrder.routes');
const subscriptionRoutes = require('./routes/subscription.routes');
const flashDealRoutes = require('./routes/flashDeal.routes');
const adminRoutes = require('./routes/admin.routes');
const registerGroupSocketBridge = require('./sockets/group.socket');
const registerNotificationSocketBridge = require('./sockets/notification.socket');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.CLIENT_URL || '*', credentials: true },
});

// Make io accessible in controllers/services via req.app.get('io')
app.set('io', io);

// --- Core middleware ---
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL || '*', credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));
app.use('/api', apiLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// --- Routes ---
// Phase 1
app.use('/api/auth', authRoutes);
app.use('/api/restaurants', restaurantRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/meta', metaRoutes);
// Phase 2
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/coupons', couponRoutes);
// Phase 4
app.use('/api/groups', groupRoutes);
// Phase 5 & 6
app.use('/api/pricing', pricingRoutes);
app.use('/api/recommendations', recommendationRoutes);
// Phase 7
app.use('/api/eta', etaRoutes);
app.use('/api/notifications', notificationRoutes);
// Phase 8 (scheduled orders)
app.use('/api/scheduled-orders', scheduledOrderRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/flash-deals', flashDealRoutes);
// Phase 9
app.use('/api/admin', adminRoutes);

// Placeholders wired up in later phases:
// app.use('/api/reviews', require('./routes/review.routes'));

app.get('/api/health', (req, res) => {
  res.status(200).json({ success: true, message: 'SmartServe API is running', data: {} });
});

app.use(notFound);
app.use(errorHandler);

// --- Socket.IO ---
// Room conventions used across the app:
//   user:{userId}        -> personal notifications (order status, etc.)
//   restaurant:{restId}  -> restaurant dashboard live feed (new orders)
//   order:{orderId}      -> live tracking timeline for one order
//   group:{groupId}      -> group-order cart sync (added in Phase 4)
io.on('connection', (socket) => {
  console.log(`[Socket.IO] client connected: ${socket.id}`);

  socket.on('join', ({ room }) => {
    if (typeof room === 'string' && room.length < 100) socket.join(room);
  });
  socket.on('leave', ({ room }) => {
    if (typeof room === 'string') socket.leave(room);
  });

  socket.on('disconnect', () => {
    console.log(`[Socket.IO] client disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 5000;

async function start() {
  await connectDB();
  await connectRedis();
  registerGroupSocketBridge(io);
  registerNotificationSocketBridge(io);

  // Trending decay: halves every zone's Redis sorted-set scores every 30
  // minutes, so "trending" reflects recent demand rather than an
  // all-time total that only ever grows (FR-07).
  cron.schedule('*/30 * * * *', () => {
    recommendationService.decayAllZones().catch((err) => console.error('[trending decay] failed', err));
  });

  server.listen(PORT, () => {
    console.log(`[SmartServe] Server listening on port ${PORT}`);
  });
}

start();

module.exports = { app, server, io };
