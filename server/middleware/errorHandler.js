const AppError = require('../utils/AppError');

// Every API response follows the same envelope:
//   success  -> boolean
//   message  -> human readable string
//   data     -> payload (success) — omitted or {} on error
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  let error = err;

  if (err.name === 'CastError') {
    error = new AppError(`Invalid ${err.path}: ${err.value}`, 400);
  }
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    error = new AppError(`${field} already exists`, 409);
  }
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map((e) => e.message).join(', ');
    error = new AppError(message, 400);
  }
  if (err.name === 'JsonWebTokenError') {
    error = new AppError('Invalid token. Please log in again.', 401);
  }
  if (err.name === 'TokenExpiredError') {
    error = new AppError('Session expired. Please log in again.', 401);
  }

  const statusCode = error.statusCode || 500;
  const message = error.isOperational ? error.message : 'Something went wrong on our end';

  if (!error.isOperational) {
    console.error('[Unhandled Error]', err);
  }

  res.status(statusCode).json({
    success: false,
    message,
  });
}

function notFound(req, res, next) {
  next(new AppError(`Route not found: ${req.originalUrl}`, 404));
}

module.exports = { errorHandler, notFound };
