const express = require('express');
const ctrl = require('../controllers/meta.controller');

const router = express.Router();
router.get('/categories', ctrl.listCategories);
router.get('/zones', ctrl.listZones);

module.exports = router;
