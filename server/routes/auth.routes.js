const express = require('express');
const ctrl = require('../controllers/auth.controller');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.post('/register', ctrl.register);
router.post('/login', ctrl.login);
router.post('/logout', ctrl.logout);
router.post('/forgot-password', ctrl.forgotPassword);
router.post('/reset-password/:token', ctrl.resetPassword);

router.use(protect); // everything below requires a valid JWT
router.get('/me', ctrl.getMe);
router.patch('/change-password', ctrl.changePassword);
router.patch('/profile', ctrl.updateProfile);

module.exports = router;
