const mongoose = require('mongoose');

// Delivery zones used for surge pricing (Phase 5) and trending
// recommendations (Phase 6). Kept in Mongo because admins configure
// them; Redis keys for zones (active_orders:{zone}, trending:zone:{zone})
// reference zone.code.
const zoneSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  code: { type: String, required: true, unique: true, enum: ['north', 'south', 'east', 'west', 'central'] },
  isActive: { type: Boolean, default: true },
  surgeThresholds: [{
    minOrders: Number,
    maxOrders: Number, // null/undefined means "and above"
    fee: Number,
  }],
}, { timestamps: true });

module.exports = mongoose.model('Zone', zoneSchema);
