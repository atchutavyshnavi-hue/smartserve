const ScheduledOrder = require('../models/ScheduledOrder');
const scheduledOrderService = require('../services/scheduledOrder.service');
const catchAsync = require('../utils/catchAsync');

// POST /api/scheduled-orders
// { restaurantId, items: [{menuItemId, quantity}], deliveryAddress, contactPhone, paymentMethod, scheduledFor }
exports.create = catchAsync(async (req, res) => {
  const scheduledOrder = await scheduledOrderService.createScheduledOrder(req.user._id, req.body);
  res.status(201).json({ success: true, message: 'Order scheduled', data: { scheduledOrder } });
});

// GET /api/scheduled-orders
exports.myScheduledOrders = catchAsync(async (req, res) => {
  const scheduledOrders = await ScheduledOrder.find({ customer: req.user._id })
    .sort('scheduledFor')
    .populate('restaurant', 'name');
  res.status(200).json({ success: true, message: 'Success', data: { scheduledOrders } });
});

// PATCH /api/scheduled-orders/:id/cancel
exports.cancel = catchAsync(async (req, res) => {
  const scheduledOrder = await scheduledOrderService.cancelScheduledOrder(req.params.id, req.user._id);
  res.status(200).json({ success: true, message: 'Scheduled order cancelled', data: { scheduledOrder } });
});
