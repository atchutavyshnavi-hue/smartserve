const express = require('express');
const ctrl = require('../controllers/flashDeal.controller');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();

router.get('/', ctrl.list);
router.post('/', protect, restrictTo('admin'), ctrl.create);
router.post('/:dealId/claim', protect, ctrl.claim);

module.exports = router;
