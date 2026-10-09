const express = require('express');
const ctrl = require('../controllers/notification.controller');
const { protect } = require('../middleware/auth');

const router = express.Router();
router.use(protect);

router.get('/', ctrl.list);
router.patch('/:id/read', ctrl.markRead);
router.patch('/read-all', ctrl.markAllRead);

module.exports = router;
