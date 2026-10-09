const express = require('express');
const ctrl = require('../controllers/menu.controller');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();

router.get('/:itemId', ctrl.getItem);

router.use(protect, restrictTo('restaurant_owner', 'admin'));
router.post('/', ctrl.createItem);
router.patch('/:itemId', ctrl.updateItem);
router.delete('/:itemId', ctrl.deleteItem);
router.patch('/:itemId/availability', ctrl.setAvailability);

module.exports = router;
