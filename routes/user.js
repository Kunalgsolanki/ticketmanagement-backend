const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticate, requireAdmin, requirePermission } = require('../middleware/auth');

// POST /user/signup  — public
router.post('/signup', userController.signup);

// POST /user/login  — public (sends 6-digit OTP to email)
router.post('/login', userController.login);

// POST /user/verify-otp  — public (validates OTP & issues session token)
router.post('/verify-otp', userController.verifyOtp);

// POST /user/resend-otp  — public (resends new OTP to email)
router.post('/resend-otp', userController.resendOtp);

// POST /user/admin/create  — Admin / user:manage creates user
router.post('/admin/create', authenticate, requirePermission('user:manage'), userController.adminCreateUser);

// GET /user  → list all users (public for assignee dropdowns)
router.get('/', userController.getAllUsers);

// GET /user/:id
router.get('/:id', userController.getUserById);

// PATCH /user/:id/role  → Update role (requires role:manage)
router.patch('/:id/role', authenticate, requirePermission('role:manage'), userController.updateUserRole);

// PATCH /user/:id/permissions  → Update user-specific custom permissions (requires role:manage)
router.patch('/:id/permissions', authenticate, requirePermission('role:manage'), userController.updateUserPermissions);

// PATCH /user/:id  → update own profile (name/email/password)
router.patch('/:id', authenticate, userController.updateUser);

// DELETE /user/:id  → Delete user (requires user:manage)
router.delete('/:id', authenticate, requirePermission('user:manage'), userController.deleteUser);

module.exports = router;