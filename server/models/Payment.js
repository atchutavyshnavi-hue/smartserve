const mongoose = require('mongoose');

// Persistent payment record. The actual gateway call is mocked
// (services/payment.service.js) but the record shape mirrors what a
// real gateway (Razorpay/Stripe) integration would store.
const paymentSchema = new mongoose.Schema({
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true },
  method: { type: String, enum: ['cod', 'online'], required: true },
  status: { type: String, enum: ['pending', 'success', 'failed', 'refunded'], default: 'pending' },
  gatewayTransactionId: { type: String, default: null },
  failureReason: { type: String, default: null },
}, { timestamps: true });

module.exports = mongoose.model('Payment', paymentSchema);
