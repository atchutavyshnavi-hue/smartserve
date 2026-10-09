const Coupon = require('../models/Coupon');
const couponService = require('../services/coupon.service');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

// POST /api/coupons/validate  { code, subtotal }
// Lets the checkout page preview a discount. This is display-only —
// order.controller.js re-validates and re-computes independently at
// checkout time, so a tampered client response can't be exploited.
exports.validate = catchAsync(async (req, res, next) => {
  const { code, subtotal } = req.body;
  if (!code || subtotal === undefined) return next(new AppError('code and subtotal are required', 400));
  const { discount, coupon } = await couponService.validateAndComputeDiscount(code, req.user._id, Number(subtotal));
  res.status(200).json({
    success: true,
    message: 'Coupon applied',
    data: { discount, code: coupon.code, type: coupon.type, value: coupon.value },
  });
});

// POST /api/coupons  (admin)
exports.createCoupon = catchAsync(async (req, res) => {
  const coupon = await Coupon.create(req.body);
  res.status(201).json({ success: true, message: 'Coupon created', data: { coupon } });
});

// GET /api/coupons  (admin)
exports.listCoupons = catchAsync(async (req, res) => {
  const coupons = await Coupon.find().sort('-createdAt');
  res.status(200).json({ success: true, message: 'Success', data: { coupons } });
});

// PATCH /api/coupons/:id  (admin)
exports.updateCoupon = catchAsync(async (req, res, next) => {
  const coupon = await Coupon.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!coupon) return next(new AppError('Coupon not found', 404));
  res.status(200).json({ success: true, message: 'Coupon updated', data: { coupon } });
});
