const jwt = require('jsonwebtoken');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');

// Verifies the JWT sent in `Authorization: Bearer <token>`, loads the
// user, and attaches it to req.user. Any route behind this middleware
// requires a logged-in user.
const protect = catchAsync(async (req, res, next) => {
  let token;
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    token = header.split(' ')[1];
  }
  if (!token) {
    return next(new AppError('You are not logged in. Please log in to continue.', 401));
  }

  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  const user = await User.findById(decoded.id);
  if (!user || !user.isActive) {
    return next(new AppError('User no longer exists or is deactivated', 401));
  }

  req.user = user;
  next();
});

// Role-based access control: restrictTo('admin', 'restaurant_owner')
function restrictTo(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new AppError('You do not have permission to perform this action', 403));
    }
    next();
  };
}

module.exports = { protect, restrictTo };
