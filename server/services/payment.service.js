const crypto = require('crypto');
const Payment = require('../models/Payment');

// Mock payment gateway. Swap the body of `charge()` for a real
// Razorpay/Stripe/PayPal call when going to production — the calling
// code (order.controller.js) only depends on the { success, transactionId }
// shape, not on any gateway-specific detail.
async function charge({ orderId, customerId, amount, method }) {
  const payment = await Payment.create({
    order: orderId,
    customer: customerId,
    amount,
    method,
    status: 'pending',
  });

  if (method === 'cod') {
    payment.status = 'pending'; // captured on delivery, not now
    await payment.save();
    return { success: true, payment };
  }

  // Simulate an online gateway call: ~95% success rate, small artificial delay.
  await new Promise((resolve) => setTimeout(resolve, 300));
  const succeeded = Math.random() < 0.95;

  payment.status = succeeded ? 'success' : 'failed';
  payment.gatewayTransactionId = succeeded ? `MOCK_${crypto.randomBytes(8).toString('hex')}` : null;
  payment.failureReason = succeeded ? null : 'Mock gateway declined the transaction';
  await payment.save();

  return { success: succeeded, payment };
}

// Mock refund — mirrors charge()'s shape. Only meaningful for an online
// payment that actually succeeded; a COD order was never charged, so
// there's nothing to reverse (callers should check paymentStatus first).
async function refund(paymentId) {
  const payment = await Payment.findById(paymentId);
  if (!payment) return { success: false };
  if (payment.status !== 'success') return { success: false, payment };

  await new Promise((resolve) => setTimeout(resolve, 200));
  payment.status = 'refunded';
  await payment.save();
  return { success: true, payment };
}

module.exports = { charge, refund };
