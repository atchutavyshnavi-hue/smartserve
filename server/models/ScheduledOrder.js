const mongoose = require('mongoose');

// The permanent record of what to order and when. The Redis Sorted Set
// (scheduled_orders) only ever holds this document's _id as a pointer
// with the due timestamp as score — Redis has zero opinion about menu
// items, pricing, or addresses; Mongo is the source of truth for that.
const scheduledOrderSchema = new mongoose.Schema({
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
  scheduledFor: { type: Date, required: true },
  status: { type: String, enum: ['pending', 'completed', 'failed', 'cancelled'], default: 'pending' },
  failureReason: { type: String, default: null },
  resultingOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
}, { timestamps: true });

scheduledOrderSchema.index({ customer: 1, status: 1 });

module.exports = mongoose.model('ScheduledOrder', scheduledOrderSchema);
