const mongoose = require('mongoose');

const menuItemSchema = new mongoose.Schema({
  restaurant: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true, index: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  price: { type: Number, required: true, min: 0 },
  category: { type: String, default: 'Other' }, // e.g. Starters, Main Course, Beverages
  isVeg: { type: Boolean, default: true },
  isAvailable: { type: Boolean, default: true },
  image: { type: String, default: '' },
  rating: { type: Number, default: 0 },
  ratingCount: { type: Number, default: 0 },
  spiceLevel: { type: String, enum: ['mild', 'medium', 'hot', 'none'], default: 'none' },
  isPopular: { type: Boolean, default: false },
}, { timestamps: true });

menuItemSchema.index({ name: 'text', description: 'text' });

module.exports = mongoose.model('MenuItem', menuItemSchema);
