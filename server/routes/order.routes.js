const express = require('express');
const ctrl = require('../controllers/order.controller');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();
router.use(protect);

router.post('/checkout', restrictTo('customer', 'admin'), ctrl.checkout);
router.get('/', ctrl.myOrders);

// Delivery-partner dashboard endpoints — must come before /:id
router.get('/delivery/available', restrictTo('delivery_partner', 'admin'), ctrl.availableForDelivery);
router.get('/delivery/mine', restrictTo('delivery_partner', 'admin'), ctrl.myDeliveries);
router.get('/delivery/earnings', restrictTo('delivery_partner', 'admin'), ctrl.deliveryEarnings);

router.get('/restaurant/:restaurantId', restrictTo('restaurant_owner', 'admin'), ctrl.restaurantOrders);
router.get('/:id', ctrl.getOrder);
router.patch('/:id/status', restrictTo('restaurant_owner', 'delivery_partner', 'admin'), ctrl.updateStatus);
router.patch('/:id/cancel', ctrl.cancelOrder);

module.exports = router;
