const surgeService = require('../services/surge.service');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

// GET /api/pricing/delivery-fee?zone=north
// Lets the checkout page show the live delivery fee (and surge banner)
// before the order is actually placed. order.controller.js recomputes
// this independently at checkout time, so a stale preview can't be
// exploited to lock in a lower fee.
exports.deliveryFee = catchAsync(async (req, res, next) => {
  const { zone } = req.query;
  if (!zone) return next(new AppError('zone query parameter is required', 400));
  const result = await surgeService.getDynamicDeliveryFee(zone);
  res.status(200).json({ success: true, message: 'Success', data: result });
});
