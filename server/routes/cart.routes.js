const express = require('express');
const ctrl = require('../controllers/cart.controller');
const { protect } = require('../middleware/auth');

const router = express.Router();
router.use(protect);

router.get('/', ctrl.getCart);
router.post('/items', ctrl.addItem);
router.patch('/items/:menuItemId', ctrl.updateQuantity);
router.delete('/items/:menuItemId', ctrl.removeItem);
router.delete('/', ctrl.clearCart);

module.exports = router;
