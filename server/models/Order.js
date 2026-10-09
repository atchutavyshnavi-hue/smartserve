const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  menuItem: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem', required: true },
  name: String,       // snapshot at time of order, so later menu edits don't rewrite history
  price: Number,       // snapshot price
  quantity: { type: Number, required: true, min: 1 },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // who added it (for group orders)
}, { _id: false });

const orderSchema = new mongoose.Schema({
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  restaurant: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true },
  items: [orderItemSchema],

  // Group ordering (Phase 4) — null for a normal solo order
  groupId: { type: String, default: null, index: true },
  isGroupOrder: { type: Boolean, default: false },
  groupMembers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

  deliveryAddress: {
    line1: String, line2: String, city: String, state: String, pincode: String,
    zone: { type: String, enum: ['north', 'south', 'east', 'west', 'central'], required: true },
    lat: Number, lng: Number,
  },
  contactPhone: String,

  pricing: {
    subtotal: { type: Number, required: true },
    tax: { type: Number, required: true },
    deliveryFee: { type: Number, required: true },
    surgeApplied: { type: Boolean, default: false },
    discount: { type: Number, default: 0 },
    couponCode: { type: String, default: null },
    total: { type: Number, required: true },
  },

  paymentMethod: { type: String, enum: ['cod', 'online'], required: true },
  paymentStatus: { type: String, enum: ['pending', 'paid', 'failed', 'refunded'], default: 'pending' },
  payment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' },

  status: {
    type: String,
    enum: ['placed', 'accepted', 'preparing', 'ready', 'rider_assigned', 'out_for_delivery', 'delivered', 'cancelled'],
    default: 'placed',
  },
  statusHistory: [{
    status: String,
    at: { type: Date, default: Date.now },
  }],

  deliveryPartner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  estimatedDeliveryMinutes: { type: Number, default: null }, // filled in by Smart ETA (Phase 7)
  scheduledFor: { type: Date, default: null }, // set for scheduled orders (Phase 8)
  subscriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subscription', default: null },

  // In-flight cancellation redirect (see services/orderRedirect.service.js):
  // when a customer cancels an order that is already 'out_for_delivery',
  // the system may hand that same physical delivery off to another nearby
  // customer who ordered identical items and hadn't been prepped yet,
  // instead of wasting the food. These fields are the audit trail of that
  // handoff — restaurant/admin facing only, never exposed to either
  // customer's own view of their order (order.controller.js strips them
  // before returning a customer-owned order).
  redirectedToOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null }, // on the CANCELLED donor order
  redirectedFromOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null }, // on the RECEIVING order
  fulfilledViaRedirect: { type: Boolean, default: false }, // true on the receiving order — restaurant needs no fresh prep
}, { timestamps: true });

orderSchema.index({ customer: 1, createdAt: -1 });
orderSchema.index({ restaurant: 1, status: 1 });

orderSchema.methods.pushStatus = function pushStatus(status) {
  this.status = status;
  this.statusHistory.push({ status, at: new Date() });
};

module.exports = mongoose.model('Order', orderSchema);
