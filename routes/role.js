const express = require('express');
const router = express.Router();
const roleController = require('../controllers/roleController');
const { authenticate, requirePermission } = require('../middleware/auth');

// GET /role/permissions — Get system available permissions
router.get('/permissions', authenticate, roleController.getAvailablePermissions);

// GET /role — List all roles
router.get('/', authenticate, roleController.getAllRoles);

// GET /role/:id — Get role by id
router.get('/:id', authenticate, roleController.getRoleById);

// POST /role — Create custom role with permissions (Admin / role:manage)
router.post('/', authenticate, requirePermission('role:manage'), roleController.createRole);

// PATCH /role/:id — Update role details and permissions (Admin / role:manage)
router.patch('/:id', authenticate, requirePermission('role:manage'), roleController.updateRole);

// DELETE /role/:id — Delete custom role (Admin / role:manage)
router.delete('/:id', authenticate, requirePermission('role:manage'), roleController.deleteRole);

module.exports = router;
