const express = require('express');
const ctrl = require('../controllers/coupon.controller');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();
router.use(protect);

router.post('/validate', ctrl.validate);
router.post('/', restrictTo('admin'), ctrl.createCoupon);
router.get('/', restrictTo('admin'), ctrl.listCoupons);
router.patch('/:id', restrictTo('admin'), ctrl.updateCoupon);

module.exports = router;
