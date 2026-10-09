const User = require('../models/User');
const Restaurant = require('../models/Restaurant');
const Order = require('../models/Order');
const Zone = require('../models/Zone');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

// GET /api/admin/stats — the numbers shown at the top of the admin dashboard
exports.stats = catchAsync(async (req, res) => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [
    totalUsers, totalRestaurants, activeOrders, completedOrders,
    activeDeliveryPartners, todayRevenueAgg,
  ] = await Promise.all([
    User.countDocuments(),
    Restaurant.countDocuments(),
    Order.countDocuments({ status: { $nin: ['delivered', 'cancelled'] } }),
    Order.countDocuments({ status: 'delivered' }),
    User.countDocuments({ role: 'delivery_partner', isActive: true }),
    Order.aggregate([
      { $match: { createdAt: { $gte: startOfDay }, status: { $ne: 'cancelled' } } },
      { $group: { _id: null, total: { $sum: '$pricing.total' } } },
    ]),
  ]);

  res.status(200).json({
    success: true,
    message: 'Success',
    data: {
      totalUsers,
      totalRestaurants,
      activeOrders,
      completedOrders,
      activeDeliveryPartners,
      todaysRevenue: todayRevenueAgg[0]?.total || 0,
    },
  });
});

// GET /api/admin/users?role=&page=&limit=
exports.listUsers = catchAsync(async (req, res) => {
  const { role, page = 1, limit = 25 } = req.query;
  const filter = {};
  if (role) filter.role = role;
  const skip = (Number(page) - 1) * Number(limit);
  const [users, total] = await Promise.all([
    User.find(filter).sort('-createdAt').skip(skip).limit(Number(limit)),
    User.countDocuments(filter),
  ]);
  res.status(200).json({
    success: true,
    message: 'Success',
    data: { users: users.map((u) => u.toSafeObject()), total, page: Number(page), pages: Math.ceil(total / limit) },
  });
});

// PATCH /api/admin/users/:id  { role?, isActive? }
exports.updateUser = catchAsync(async (req, res, next) => {
  const allowed = ['role', 'isActive'];
  const updates = {};
  allowed.forEach((field) => { if (req.body[field] !== undefined) updates[field] = req.body[field]; });
  const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
  if (!user) return next(new AppError('User not found', 404));
  res.status(200).json({ success: true, message: 'User updated', data: { user: user.toSafeObject() } });
});

// GET /api/admin/restaurants?page=&limit=
exports.listRestaurants = catchAsync(async (req, res) => {
  const { page = 1, limit = 25 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);
  const [restaurants, total] = await Promise.all([
    Restaurant.find().sort('-createdAt').skip(skip).limit(Number(limit)).populate('owner', 'name email'),
    Restaurant.countDocuments(),
  ]);
  res.status(200).json({
    success: true, message: 'Success', data: { restaurants, total, page: Number(page), pages: Math.ceil(total / limit) },
  });
});

// GET /api/admin/orders?status=&page=&limit=
exports.listOrders = catchAsync(async (req, res) => {
  const { status, page = 1, limit = 25 } = req.query;
  const filter = {};
  if (status) filter.status = status;
  const skip = (Number(page) - 1) * Number(limit);
  const [orders, total] = await Promise.all([
    Order.find(filter).sort('-createdAt').skip(skip).limit(Number(limit))
      .populate('customer', 'name').populate('restaurant', 'name'),
    Order.countDocuments(filter),
  ]);
  res.status(200).json({
    success: true, message: 'Success', data: { orders, total, page: Number(page), pages: Math.ceil(total / limit) },
  });
});

// GET /api/admin/zones
exports.listZones = catchAsync(async (req, res) => {
  const zones = await Zone.find().sort('name');
  res.status(200).json({ success: true, message: 'Success', data: { zones } });
});

// PATCH /api/admin/zones/:code  { surgeThresholds, isActive }
exports.updateZone = catchAsync(async (req, res, next) => {
  const allowed = ['surgeThresholds', 'isActive'];
  const updates = {};
  allowed.forEach((field) => { if (req.body[field] !== undefined) updates[field] = req.body[field]; });
  const zone = await Zone.findOneAndUpdate({ code: req.params.code }, updates, { new: true, runValidators: true });
  if (!zone) return next(new AppError('Zone not found', 404));
  res.status(200).json({ success: true, message: 'Zone updated', data: { zone } });
});
