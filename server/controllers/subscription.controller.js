const Subscription = require('../models/Subscription');
const subscriptionService = require('../services/subscription.service');
const catchAsync = require('../utils/catchAsync');

// POST /api/subscriptions
exports.create = catchAsync(async (req, res) => {
  const subscription = await subscriptionService.createSubscription(req.user._id, req.body);
  res.status(201).json({ success: true, message: 'Subscription created', data: { subscription } });
});

// GET /api/subscriptions
exports.mySubscriptions = catchAsync(async (req, res) => {
  const subscriptions = await Subscription.find({ customer: req.user._id })
    .sort('-createdAt')
    .populate('restaurant', 'name');
  res.status(200).json({ success: true, message: 'Success', data: { subscriptions } });
});

// PATCH /api/subscriptions/:id/pause
exports.pause = catchAsync(async (req, res) => {
  const subscription = await subscriptionService.pauseSubscription(req.params.id, req.user._id);
  res.status(200).json({ success: true, message: 'Subscription paused', data: { subscription } });
});

// PATCH /api/subscriptions/:id/resume
exports.resume = catchAsync(async (req, res) => {
  const subscription = await subscriptionService.resumeSubscription(req.params.id, req.user._id);
  res.status(200).json({ success: true, message: 'Subscription resumed', data: { subscription } });
});

// PATCH /api/subscriptions/:id/cancel
exports.cancel = catchAsync(async (req, res) => {
  const subscription = await subscriptionService.cancelSubscription(req.params.id, req.user._id);
  res.status(200).json({ success: true, message: 'Subscription cancelled', data: { subscription } });
});
