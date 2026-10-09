const express = require('express');
const ctrl = require('../controllers/pricing.controller');

const router = express.Router();
router.get('/delivery-fee', ctrl.deliveryFee);

module.exports = router;
