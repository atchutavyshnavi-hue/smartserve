const express = require('express');
const ctrl = require('../controllers/eta.controller');

const router = express.Router();
router.get('/:restaurantId', ctrl.getETA);

module.exports = router;
