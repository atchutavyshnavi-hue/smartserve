const crypto = require('crypto');
const User = require('../models/User');
const Restaurant = require('../models/Restaurant');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const etaService = require('../services/eta.service');
const { signAccessToken, signRefreshToken } = require('../services/token.service');

function sendAuthResponse(res, statusCode, user) {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  res.status(statusCode).json({
    success: true,
    message: 'Success',
    data: { user: user.toSafeObject(), accessToken, refreshToken },
  });
}

// POST /api/auth/register
// restaurant_owner signups additionally take { restaurantName, zone } and get
// their Restaurant record created immediately, so there's no separate
// "create my restaurant" step before they can use their dashboard.
// delivery_partner signups take { zone } — the area they'll receive
// "food ready, needs a rider" notifications for.
exports.register = catchAsync(async (req, res, next) => {
  const { name, email, password, phone, role, restaurantName, zone } = req.body;

  if (!name || !email || !password) {
    return next(new AppError('Name, email and password are required', 400));
  }
  if (password.length < 8) {
    return next(new AppError('Password must be at least 8 characters', 400));
  }

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    return next(new AppError('An account with this email already exists', 409));
  }

  // Only allow self-registration as customer/restaurant_owner/delivery_partner.
  // Admin accounts must be created directly in the database or by another admin.
  const allowedRoles = ['customer', 'restaurant_owner', 'delivery_partner'];
  const finalRole = allowedRoles.includes(role) ? role : 'customer';
  const validZones = ['north', 'south', 'east', 'west', 'central'];

  if (finalRole === 'restaurant_owner') {
    if (!restaurantName || !restaurantName.trim()) {
      return next(new AppError('Restaurant name is required for a restaurant owner account', 400));
    }
    if (!validZones.includes(zone)) {
      return next(new AppError('A valid delivery zone is required for a restaurant owner account', 400));
    }
  }
  if (finalRole === 'delivery_partner' && zone && !validZones.includes(zone)) {
    return next(new AppError('Invalid zone', 400));
  }

  const user = await User.create({
    name, email, password, phone, role: finalRole,
    zone: finalRole === 'delivery_partner' && zone ? zone : undefined,
  });

  if (finalRole === 'restaurant_owner') {
    const restaurant = await Restaurant.create({
      name: restaurantName.trim(), owner: user._id, zone, address: { city: '' },
    });
    await etaService.initStats(restaurant); // seed restaurant:{id}:stats for Smart ETA
  }

  sendAuthResponse(res, 201, user);
});

// POST /api/auth/login
exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return next(new AppError('Email and password are required', 400));
  }

  const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
  if (!user || !(await user.comparePassword(password))) {
    return next(new AppError('Incorrect email or password', 401));
  }
  if (!user.isActive) {
    return next(new AppError('This account has been deactivated', 403));
  }

  sendAuthResponse(res, 200, user);
});

// POST /api/auth/logout
// Stateless JWT: logout is handled client-side by discarding the token.
// (A future phase can maintain a Redis blocklist keyed by jti for
// immediate server-side revocation, e.g. SETEX blocklist:{jti} <ttl> 1.)
exports.logout = catchAsync(async (req, res) => {
  res.status(200).json({ success: true, message: 'Logged out successfully', data: {} });
});

// GET /api/auth/me
exports.getMe = catchAsync(async (req, res) => {
  res.status(200).json({ success: true, message: 'Success', data: { user: req.user.toSafeObject() } });
});

// PATCH /api/auth/change-password
exports.changePassword = catchAsync(async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return next(new AppError('Current and new password are required', 400));
  }
  const user = await User.findById(req.user._id).select('+password');
  if (!(await user.comparePassword(currentPassword))) {
    return next(new AppError('Current password is incorrect', 401));
  }
  user.password = newPassword;
  await user.save();
  sendAuthResponse(res, 200, user);
});

// POST /api/auth/forgot-password
exports.forgotPassword = catchAsync(async (req, res, next) => {
  const { email } = req.body;
  const user = await User.findOne({ email: (email || '').toLowerCase() });

  // Always respond the same way whether or not the user exists,
  // so attackers can't use this endpoint to enumerate registered emails.
  const genericResponse = {
    success: true,
    message: 'If an account with that email exists, a reset link has been sent.',
    data: {},
  };
  if (!user) return res.status(200).json(genericResponse);

  const resetToken = crypto.randomBytes(32).toString('hex');
  user.passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
  user.passwordResetExpires = Date.now() + 15 * 60 * 1000; // 15 min
  await user.save({ validateBeforeSave: false });

  // In production this would be emailed. For local dev/testing we return
  // it directly so the reset flow can be exercised end-to-end.
  const payload = process.env.NODE_ENV === 'production' ? {} : { resetToken };
  res.status(200).json({ ...genericResponse, data: payload });
});

// POST /api/auth/reset-password/:token
exports.resetPassword = catchAsync(async (req, res, next) => {
  const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');
  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  });
  if (!user) {
    return next(new AppError('Reset link is invalid or has expired', 400));
  }
  if (!req.body.password || req.body.password.length < 8) {
    return next(new AppError('Password must be at least 8 characters', 400));
  }
  user.password = req.body.password;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();
  sendAuthResponse(res, 200, user);
});

// PATCH /api/auth/profile
exports.updateProfile = catchAsync(async (req, res, next) => {
  const allowed = ['name', 'phone', 'cuisinePreferences', 'addresses'];
  const updates = {};
  allowed.forEach((field) => {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  });
  const user = await User.findByIdAndUpdate(req.user._id, updates, {
    new: true,
    runValidators: true,
  });
  res.status(200).json({ success: true, message: 'Profile updated', data: { user: user.toSafeObject() } });
});
