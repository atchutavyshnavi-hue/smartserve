const express = require('express');
const ctrl = require('../controllers/subscription.controller');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();
router.use(protect, restrictTo('customer', 'admin'));

router.post('/', ctrl.create);
router.get('/', ctrl.mySubscriptions);
router.patch('/:id/pause', ctrl.pause);
router.patch('/:id/resume', ctrl.resume);
router.patch('/:id/cancel', ctrl.cancel);

module.exports = router;
