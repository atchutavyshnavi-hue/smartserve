const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: {
    type: String,
    required: true,
    enum: [
      'order_accepted', 'order_preparing', 'order_ready', 'rider_assigned', 'out_for_delivery', 'delivered',
      'order_cancelled', 'new_order', 'scheduled_order_reminder', 'scheduled_order_placed',
      'subscription_order_generated', 'flash_deal',
    ],
  },
  title: { type: String, required: true },
  message: { type: String, required: true },
  data: { type: mongoose.Schema.Types.Mixed, default: {} }, // e.g. { orderId }
  isRead: { type: Boolean, default: false },
}, { timestamps: true });

notificationSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
