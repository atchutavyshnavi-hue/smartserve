const mongoose = require('mongoose');

const restaurantSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  cuisines: [{ type: String }],
  category: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
  address: {
    line1: String,
    city: String,
    state: String,
    pincode: String,
    lat: Number,
    lng: Number,
  },
  zone: { type: String, enum: ['north', 'south', 'east', 'west', 'central'], required: true },
  priceForTwo: { type: Number, default: 0 },
  rating: { type: Number, default: 0, min: 0, max: 5 },
  ratingCount: { type: Number, default: 0 },
  avgPrepTimeMinutes: { type: Number, default: 20 },
  isOpen: { type: Boolean, default: true },
  isFeatured: { type: Boolean, default: false },
  coverImage: { type: String, default: '' },
  logo: { type: String, default: '' },
  tags: [String], // e.g. 'pure veg', 'fast delivery'
}, { timestamps: true });

restaurantSchema.index({ name: 'text', cuisines: 'text', tags: 'text' });
restaurantSchema.index({ zone: 1 });
restaurantSchema.index({ rating: -1 });

module.exports = mongoose.model('Restaurant', restaurantSchema);
