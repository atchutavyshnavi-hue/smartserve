const express = require('express');
const ctrl = require('../controllers/scheduledOrder.controller');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();
router.use(protect, restrictTo('customer', 'admin'));

router.post('/', ctrl.create);
router.get('/', ctrl.myScheduledOrders);
router.patch('/:id/cancel', ctrl.cancel);

module.exports = router;
