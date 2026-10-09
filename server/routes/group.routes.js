const express = require('express');
const ctrl = require('../controllers/group.controller');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();
router.use(protect);

router.get('/:groupId', ctrl.getGroup);
router.use(restrictTo('customer', 'admin'));
router.post('/', ctrl.createGroup);
router.post('/:groupId/join', ctrl.joinGroup);
router.post('/:groupId/items', ctrl.addItem);
router.patch('/:groupId/items/:menuItemId', ctrl.updateQuantity);
router.delete('/:groupId/items/:menuItemId', ctrl.removeItem);
router.post('/:groupId/checkout', ctrl.checkout);

module.exports = router;
