const Restaurant = require('../models/Restaurant');
const etaService = require('../services/eta.service');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

// GET /api/eta/:restaurantId?zone=north
exports.getETA = catchAsync(async (req, res, next) => {
  const restaurant = await Restaurant.findById(req.params.restaurantId);
  if (!restaurant) return next(new AppError('Restaurant not found', 404));
  const customerZone = req.query.zone || restaurant.zone;
  const eta = await etaService.getETA(restaurant, customerZone);
  res.status(200).json({ success: true, message: 'Success', data: eta });
});
