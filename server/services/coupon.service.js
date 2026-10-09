const Coupon = require('../models/Coupon');
const Order = require('../models/Order');
const AppError = require('../utils/AppError');

// All coupon math happens here, server-side, from data pulled fresh
// from MongoDB. The frontend may display a discount preview, but it is
// NEVER trusted — this function is the only source of truth used when
// an order is actually created.
async function validateAndComputeDiscount(code, userId, subtotal) {
  if (!code) return { discount: 0, coupon: null };

  const coupon = await Coupon.findOne({ code: code.toUpperCase(), isActive: true });
  if (!coupon) throw new AppError('Invalid coupon code', 400);
  if (coupon.expiresAt < new Date()) throw new AppError('This coupon has expired', 400);
  if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
    throw new AppError('This coupon has reached its usage limit', 400);
  }
  if (subtotal < coupon.minOrderAmount) {
    throw new AppError(`Minimum order amount for this coupon is ₹${coupon.minOrderAmount}`, 400);
  }
  if (coupon.applicableUsers.length > 0 && !coupon.applicableUsers.some((u) => String(u) === String(userId))) {
    throw new AppError('This coupon is not applicable to your account', 400);
  }

  if (coupon.perUserLimit !== null) {
    const usedByUser = await Order.countDocuments({ customer: userId, 'pricing.couponCode': coupon.code });
    if (usedByUser >= coupon.perUserLimit) {
      throw new AppError('You have already used this coupon the maximum number of times', 400);
    }
  }

  let discount = coupon.type === 'percentage' ? (subtotal * coupon.value) / 100 : coupon.value;
  if (coupon.maxDiscount !== null) discount = Math.min(discount, coupon.maxDiscount);
  discount = Math.min(discount, subtotal); // never discount below zero

  return { discount: Math.round(discount), coupon };
}

async function markCouponUsed(couponId) {
  await Coupon.findByIdAndUpdate(couponId, { $inc: { usedCount: 1 } });
}

module.exports = { validateAndComputeDiscount, markCouponUsed };
