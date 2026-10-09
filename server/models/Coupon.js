const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  type: { type: String, enum: ['percentage', 'fixed'], required: true },
  value: { type: Number, required: true }, // percent (0-100) or flat amount
  minOrderAmount: { type: Number, default: 0 },
  maxDiscount: { type: Number, default: null }, // caps a percentage discount
  expiresAt: { type: Date, required: true },
  usageLimit: { type: Number, default: null }, // total redemptions allowed, null = unlimited
  usedCount: { type: Number, default: 0 },
  perUserLimit: { type: Number, default: 1 },
  applicableUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // empty = all users
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('Coupon', couponSchema);
