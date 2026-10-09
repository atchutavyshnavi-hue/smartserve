const MenuItem = require('../models/MenuItem');
const Restaurant = require('../models/Restaurant');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');

async function assertOwnership(req, next, restaurantId) {
  const restaurant = await Restaurant.findById(restaurantId);
  if (!restaurant) {
    next(new AppError('Restaurant not found', 404));
    return null;
  }
  if (String(restaurant.owner) !== String(req.user._id) && req.user.role !== 'admin') {
    next(new AppError('You do not own this restaurant', 403));
    return null;
  }
  return restaurant;
}

// GET /api/menu/:itemId
exports.getItem = catchAsync(async (req, res, next) => {
  const item = await MenuItem.findById(req.params.itemId).populate('restaurant', 'name zone avgPrepTimeMinutes');
  if (!item) return next(new AppError('Menu item not found', 404));
  res.status(200).json({ success: true, message: 'Success', data: { item } });
});

// POST /api/menu  { restaurant, name, price, ... }
exports.createItem = catchAsync(async (req, res, next) => {
  const restaurant = await assertOwnership(req, next, req.body.restaurant);
  if (!restaurant) return;
  const item = await MenuItem.create(req.body);
  res.status(201).json({ success: true, message: 'Menu item added', data: { item } });
});

// PATCH /api/menu/:itemId
exports.updateItem = catchAsync(async (req, res, next) => {
  const item = await MenuItem.findById(req.params.itemId);
  if (!item) return next(new AppError('Menu item not found', 404));
  const restaurant = await assertOwnership(req, next, item.restaurant);
  if (!restaurant) return;
  Object.assign(item, req.body);
  await item.save();
  res.status(200).json({ success: true, message: 'Menu item updated', data: { item } });
});

// DELETE /api/menu/:itemId
exports.deleteItem = catchAsync(async (req, res, next) => {
  const item = await MenuItem.findById(req.params.itemId);
  if (!item) return next(new AppError('Menu item not found', 404));
  const restaurant = await assertOwnership(req, next, item.restaurant);
  if (!restaurant) return;
  await item.deleteOne();
  res.status(200).json({ success: true, message: 'Menu item deleted', data: {} });
});

// PATCH /api/menu/:itemId/availability  { isAvailable: true|false }
exports.setAvailability = catchAsync(async (req, res, next) => {
  const item = await MenuItem.findById(req.params.itemId);
  if (!item) return next(new AppError('Menu item not found', 404));
  const restaurant = await assertOwnership(req, next, item.restaurant);
  if (!restaurant) return;
  item.isAvailable = !!req.body.isAvailable;
  await item.save();
  res.status(200).json({ success: true, message: 'Availability updated', data: { item } });
});
