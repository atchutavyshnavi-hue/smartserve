const Notification = require('../models/Notification');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

// GET /api/notifications?unreadOnly=true
exports.list = catchAsync(async (req, res) => {
  const filter = { user: req.user._id };
  if (req.query.unreadOnly === 'true') filter.isRead = false;
  const [notifications, unreadCount] = await Promise.all([
    Notification.find(filter).sort('-createdAt').limit(50),
    Notification.countDocuments({ user: req.user._id, isRead: false }),
  ]);
  res.status(200).json({ success: true, message: 'Success', data: { notifications, unreadCount } });
});

// PATCH /api/notifications/:id/read
exports.markRead = catchAsync(async (req, res, next) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    { isRead: true },
    { new: true },
  );
  if (!notification) return next(new AppError('Notification not found', 404));
  res.status(200).json({ success: true, message: 'Marked as read', data: { notification } });
});

// PATCH /api/notifications/read-all
exports.markAllRead = catchAsync(async (req, res) => {
  await Notification.updateMany({ user: req.user._id, isRead: false }, { isRead: true });
  res.status(200).json({ success: true, message: 'All notifications marked as read', data: {} });
});
