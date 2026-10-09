const express = require('express');
const ctrl = require('../controllers/restaurant.controller');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();

router.get('/', ctrl.listRestaurants);
router.get('/featured', ctrl.featured);
router.get('/mine', protect, restrictTo('restaurant_owner', 'admin'), ctrl.myRestaurants);
router.get('/:id', ctrl.getRestaurant);
router.get('/:id/menu', ctrl.getMenu);
router.get('/:id/stats', protect, restrictTo('restaurant_owner', 'admin'), ctrl.getStats);

router.post('/', protect, restrictTo('restaurant_owner', 'admin'), ctrl.createRestaurant);
router.patch('/:id', protect, restrictTo('restaurant_owner', 'admin'), ctrl.updateRestaurant);

module.exports = router;
