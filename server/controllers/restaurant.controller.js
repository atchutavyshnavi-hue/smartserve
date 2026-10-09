const Restaurant = require('../models/Restaurant');
const MenuItem = require('../models/MenuItem');
const Order = require('../models/Order');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const etaService = require('../services/eta.service');

// GET /api/restaurants
// Supports: search (q), cuisine, zone, minRating, maxPrice, sort, page, limit
exports.listRestaurants = catchAsync(async (req, res) => {
  const {
    q, cuisine, zone, minRating, maxPrice, sort = '-rating', page = 1, limit = 20,
  } = req.query;

  const filter = {};
  if (q) filter.$text = { $search: q };
  if (cuisine) filter.cuisines = cuisine;
  if (zone) filter.zone = zone;
  if (minRating) filter.rating = { $gte: Number(minRating) };
  if (maxPrice) filter.priceForTwo = { ...(filter.priceForTwo || {}), $lte: Number(maxPrice) };

  const sortMap = {
    rating: '-rating',
    popularity: '-ratingCount',
    price_low: 'priceForTwo',
    price_high: '-priceForTwo',
  };
  const sortBy = sortMap[sort] || sort;

  const skip = (Number(page) - 1) * Number(limit);
  const [items, total] = await Promise.all([
    Restaurant.find(filter).sort(sortBy).skip(skip).limit(Number(limit)),
    Restaurant.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    message: 'Success',
    data: { restaurants: items, total, page: Number(page), pages: Math.ceil(total / limit) },
  });
});

// GET /api/restaurants/featured
exports.featured = catchAsync(async (req, res) => {
  const restaurants = await Restaurant.find({ isFeatured: true, isOpen: true }).limit(10);
  res.status(200).json({ success: true, message: 'Success', data: { restaurants } });
});

// GET /api/restaurants/:id
exports.getRestaurant = catchAsync(async (req, res, next) => {
  const restaurant = await Restaurant.findById(req.params.id);
  if (!restaurant) return next(new AppError('Restaurant not found', 404));
  res.status(200).json({ success: true, message: 'Success', data: { restaurant } });
});

// GET /api/restaurants/:id/menu
exports.getMenu = catchAsync(async (req, res, next) => {
  const restaurant = await Restaurant.findById(req.params.id);
  if (!restaurant) return next(new AppError('Restaurant not found', 404));
  const menu = await MenuItem.find({ restaurant: restaurant._id, isAvailable: true }).sort('category name');
  res.status(200).json({ success: true, message: 'Success', data: { menu } });
});

// POST /api/restaurants  (restaurant_owner, admin)
exports.createRestaurant = catchAsync(async (req, res, next) => {
  const payload = { ...req.body, owner: req.user._id };
  const restaurant = await Restaurant.create(payload);
  await etaService.initStats(restaurant); // seed restaurant:{id}:stats for Smart ETA
  res.status(201).json({ success: true, message: 'Restaurant created', data: { restaurant } });
});

// PATCH /api/restaurants/:id  (owner of this restaurant, or admin)
exports.updateRestaurant = catchAsync(async (req, res, next) => {
  const restaurant = await Restaurant.findById(req.params.id);
  if (!restaurant) return next(new AppError('Restaurant not found', 404));
  if (String(restaurant.owner) !== String(req.user._id) && req.user.role !== 'admin') {
    return next(new AppError('You do not own this restaurant', 403));
  }
  Object.assign(restaurant, req.body);
  await restaurant.save();
  res.status(200).json({ success: true, message: 'Restaurant updated', data: { restaurant } });
});

// GET /api/restaurants/mine  (restaurant_owner dashboard — my restaurants)
exports.myRestaurants = catchAsync(async (req, res) => {
  const restaurants = await Restaurant.find({ owner: req.user._id }).sort('-createdAt');
  res.status(200).json({ success: true, message: 'Success', data: { restaurants } });
});

// GET /api/restaurants/:id/stats  (restaurant_owner dashboard)
// Powers the "daily sales / popular dishes / stats + charts" section
// of the dashboard: last 7 days of orders & revenue, top 5 dishes by
// quantity sold, and current live workload from Redis (Smart ETA stats).
exports.getStats = catchAsync(async (req, res, next) => {
  const restaurant = await Restaurant.findById(req.params.id);
  if (!restaurant) return next(new AppError('Restaurant not found', 404));
  if (String(restaurant.owner) !== String(req.user._id) && req.user.role !== 'admin') {
    return next(new AppError('You do not own this restaurant', 403));
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const dailySeries = await Order.aggregate([
    { $match: { restaurant: restaurant._id, createdAt: { $gte: sevenDaysAgo }, status: { $ne: 'cancelled' } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        orders: { $sum: 1 },
        revenue: { $sum: '$pricing.total' },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const popularDishes = await Order.aggregate([
    { $match: { restaurant: restaurant._id, status: { $ne: 'cancelled' } } },
    { $unwind: '$items' },
    { $group: { _id: '$items.name', quantity: { $sum: '$items.quantity' } } },
    { $sort: { quantity: -1 } },
    { $limit: 5 },
  ]);

  const [totalOrders, totalRevenueAgg] = await Promise.all([
    Order.countDocuments({ restaurant: restaurant._id, status: { $ne: 'cancelled' } }),
    Order.aggregate([
      { $match: { restaurant: restaurant._id, status: { $ne: 'cancelled' } } },
      { $group: { _id: null, total: { $sum: '$pricing.total' } } },
    ]),
  ]);

  const liveStats = await etaService.getStats(restaurant._id);

  res.status(200).json({
    success: true,
    message: 'Success',
    data: {
      dailySeries,
      popularDishes: popularDishes.map((d) => ({ name: d._id, quantity: d.quantity })),
      totalOrders,
      totalRevenue: totalRevenueAgg[0]?.total || 0,
      liveStats,
    },
  });
});
