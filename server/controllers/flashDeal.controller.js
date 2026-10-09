const flashDealService = require('../services/flashDeal.service');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

// POST /api/flash-deals  (admin)  { title, discountPercent, restaurantId, couponsTotal, expiresInMinutes }
exports.create = catchAsync(async (req, res, next) => {
  const { title, discountPercent, couponsTotal, expiresInMinutes } = req.body;
  if (!title || !discountPercent || !couponsTotal || !expiresInMinutes) {
    return next(new AppError('title, discountPercent, couponsTotal and expiresInMinutes are required', 400));
  }
  const deal = await flashDealService.createDeal(req.body);
  res.status(201).json({ success: true, message: 'Flash deal created', data: { deal } });
});

// GET /api/flash-deals  (public)
exports.list = catchAsync(async (req, res) => {
  const deals = await flashDealService.listActiveDeals();
  res.status(200).json({ success: true, message: 'Success', data: { deals } });
});

// POST /api/flash-deals/:dealId/claim
exports.claim = catchAsync(async (req, res) => {
  const { coupon, couponsRemaining } = await flashDealService.claimDeal(req.params.dealId, req.user._id);
  res.status(200).json({
    success: true,
    message: 'Deal claimed! Use this coupon code at checkout.',
    data: { code: coupon.code, discountPercent: coupon.value, expiresAt: coupon.expiresAt, couponsRemaining },
  });
});
