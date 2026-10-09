const Category = require('../models/Category');
const Zone = require('../models/Zone');
const catchAsync = require('../utils/catchAsync');

exports.listCategories = catchAsync(async (req, res) => {
  const categories = await Category.find({ isActive: true }).sort('name');
  res.status(200).json({ success: true, message: 'Success', data: { categories } });
});

exports.listZones = catchAsync(async (req, res) => {
  const zones = await Zone.find({ isActive: true }).sort('name');
  res.status(200).json({ success: true, message: 'Success', data: { zones } });
});
