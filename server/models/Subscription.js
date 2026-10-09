const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  restaurant: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true },
  items: [{
    menuItem: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem', required: true },
    quantity: { type: Number, required: true, min: 1 },
  }],
  deliveryAddress: {
    line1: String, line2: String, city: String, state: String, pincode: String,
    zone: { type: String, enum: ['north', 'south', 'east', 'west', 'central'], required: true },
  },
  contactPhone: String,
  paymentMethod: { type: String, enum: ['cod', 'online'], required: true },

  frequency: { type: String, enum: ['daily', 'weekly', 'monthly'], required: true },
  timeOfDay: { type: String, required: true }, // "HH:MM", 24-hour
  dayOfWeek: { type: Number, min: 0, max: 6, default: null },   // required for weekly (0 = Sunday)
  dayOfMonth: { type: Number, min: 1, max: 28, default: null }, // required for monthly (capped at 28 to stay valid every month)

  status: { type: String, enum: ['active', 'paused', 'cancelled'], default: 'active' },
  nextRunAt: { type: Date, required: true },
  lastRunAt: { type: Date, default: null },
  totalOrdersGenerated: { type: Number, default: 0 },
}, { timestamps: true });

subscriptionSchema.index({ customer: 1, status: 1 });

module.exports = mongoose.model('Subscription', subscriptionSchema);
