const recommendationService = require('../services/recommendation.service');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

// GET /api/recommendations/trending?zone=north&limit=5
exports.trending = catchAsync(async (req, res, next) => {
  const { zone, limit = 5 } = req.query;
  if (!zone) return next(new AppError('zone query parameter is required', 400));
  const trending = await recommendationService.getTrending(zone, Number(limit));
  res.status(200).json({ success: true, message: 'Success', data: { trending } });
});

// GET /api/recommendations  (auth required — uses the logged-in user's zone & preferences)
exports.recommended = catchAsync(async (req, res, next) => {
  const zone = req.query.zone || req.user.addresses?.find((a) => a.isDefault)?.zone || req.user.addresses?.[0]?.zone;
  if (!zone) return next(new AppError('No zone available — pass ?zone= or add a default address', 400));
  const recommended = await recommendationService.getRecommended(
    zone, req.user.cuisinePreferences || [], Number(req.query.limit) || 5,
  );
  res.status(200).json({ success: true, message: 'Success', data: { recommended } });
});
