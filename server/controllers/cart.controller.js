const cartService = require('../services/cart.service');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

// GET /api/cart
exports.getCart = catchAsync(async (req, res) => {
  const cart = await cartService.getCart(req.user._id);
  res.status(200).json({ success: true, message: 'Success', data: { cart } });
});

// POST /api/cart/items  { menuItemId, quantity }
exports.addItem = catchAsync(async (req, res, next) => {
  const { menuItemId, quantity = 1 } = req.body;
  if (!menuItemId) return next(new AppError('menuItemId is required', 400));
  const cart = await cartService.addItem(req.user._id, menuItemId, Number(quantity));
  res.status(200).json({ success: true, message: 'Item added to cart', data: { cart } });
});

// PATCH /api/cart/items/:menuItemId  { quantity }
exports.updateQuantity = catchAsync(async (req, res, next) => {
  const { quantity } = req.body;
  if (quantity === undefined) return next(new AppError('quantity is required', 400));
  const cart = await cartService.updateQuantity(req.user._id, req.params.menuItemId, Number(quantity));
  res.status(200).json({ success: true, message: 'Cart updated', data: { cart } });
});

// DELETE /api/cart/items/:menuItemId
exports.removeItem = catchAsync(async (req, res) => {
  const cart = await cartService.removeItem(req.user._id, req.params.menuItemId);
  res.status(200).json({ success: true, message: 'Item removed', data: { cart } });
});

// DELETE /api/cart
exports.clearCart = catchAsync(async (req, res) => {
  await cartService.clearCart(req.user._id);
  res.status(200).json({ success: true, message: 'Cart cleared', data: {} });
});
