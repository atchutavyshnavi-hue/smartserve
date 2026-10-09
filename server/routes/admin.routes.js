const express = require('express');
const ctrl = require('../controllers/admin.controller');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();
router.use(protect, restrictTo('admin'));

router.get('/stats', ctrl.stats);
router.get('/users', ctrl.listUsers);
router.patch('/users/:id', ctrl.updateUser);
router.get('/restaurants', ctrl.listRestaurants);
router.get('/orders', ctrl.listOrders);
router.get('/zones', ctrl.listZones);
router.patch('/zones/:code', ctrl.updateZone);

module.exports = router;
