// Standard application error. Thrown anywhere in controllers/services;
// caught by the centralized error handler in middleware/errorHandler.js
// so every API response has a consistent shape.
class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
