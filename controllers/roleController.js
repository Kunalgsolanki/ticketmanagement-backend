const prisma = require('../prisma/client');

// Available system permissions
const SYSTEM_PERMISSIONS = [
  { id: 'ticket:create', label: 'Create Tickets', description: 'Can create new tickets', category: 'Tickets' },
  { id: 'ticket:edit', label: 'Edit Tickets', description: 'Can edit ticket details and priority', category: 'Tickets' },
  { id: 'ticket:delete', label: 'Delete Tickets', description: 'Can delete tickets from the system', category: 'Tickets' },
  { id: 'ticket:assign', label: 'Assign Tickets', description: 'Can assign or reassign tickets to users', category: 'Tickets' },
  { id: 'ticket:change_status', label: 'Change Status', description: 'Can transition ticket status (Open, In Progress, Resolved, Closed)', category: 'Tickets' },
  { id: 'ticket:view_all', label: 'View All Tickets', description: 'Can view all tickets instead of only own created/assigned', category: 'Tickets' },
  { id: 'user:manage', label: 'User Management', description: 'Can create, view, edit, and delete users', category: 'Administration' },
  { id: 'role:manage', label: 'Role & Permission Management', description: 'Can create roles and configure permissions', category: 'Administration' },
];

const DEFAULT_ROLES = [
  {
    name: 'ADMIN',
    description: 'Full system administrator with unrestricted access',
    permissions: [
      'ticket:create',
      'ticket:edit',
      'ticket:delete',
      'ticket:assign',
      'ticket:change_status',
      'ticket:view_all',
      'user:manage',
      'role:manage',
    ],
  },
  {
    name: 'MANAGER',
    description: 'Can manage tickets, assignments, and team members',
    permissions: [
      'ticket:create',
      'ticket:edit',
      'ticket:assign',
      'ticket:change_status',
      'ticket:view_all',
      'user:manage',
    ],
  },
  {
    name: 'SUPPORT_AGENT',
    description: 'Handles support requests and ticket resolution',
    permissions: [
      'ticket:create',
      'ticket:edit',
      'ticket:change_status',
      'ticket:view_all',
    ],
  },
  {
    name: 'USER',
    description: 'Standard user who can create and manage their own tickets',
    permissions: [
      'ticket:create',
      'ticket:edit',
      'ticket:change_status',
    ],
  },
];

// Helper to seed initial default roles if they don't exist
async function seedDefaultRoles() {
  try {
    for (const def of DEFAULT_ROLES) {
      const existing = await prisma.role.findUnique({ where: { name: def.name } });
      if (!existing) {
        await prisma.role.create({
          data: {
            name: def.name,
            description: def.description,
            permissions: JSON.stringify(def.permissions),
          },
        });
        console.log(`[RBAC] Seeded role: ${def.name}`);
      }
    }
  } catch (error) {
    console.error('[RBAC] Error seeding default roles:', error.message);
  }
}

// GET /role/permissions — Get system permission catalogue
async function getAvailablePermissions(req, res) {
  return res.json(SYSTEM_PERMISSIONS);
}

// GET /role — List all roles
async function getAllRoles(req, res) {
  try {
    const roles = await prisma.role.findMany({
      orderBy: { id: 'asc' },
    });

    const formatted = roles.map((r) => ({
      ...r,
      permissions: safeParseJson(r.permissions, []),
    }));

    return res.json(formatted);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to fetch roles' });
  }
}

// GET /role/:id
async function getRoleById(req, res) {
  try {
    const role = await prisma.role.findUnique({
      where: { id: Number(req.params.id) },
    });
    if (!role) return res.status(404).json({ error: 'Role not found' });

    return res.json({
      ...role,
      permissions: safeParseJson(role.permissions, []),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to fetch role' });
  }
}

// POST /role — Admin creates a new custom role with permissions
async function createRole(req, res) {
  const { name, description, permissions } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Role name is required' });
  }

  const normalizedName = name.trim().toUpperCase().replace(/\s+/g, '_');

  try {
    const existing = await prisma.role.findUnique({ where: { name: normalizedName } });
    if (existing) {
      return res.status(409).json({ error: `Role '${normalizedName}' already exists` });
    }

    const permsArray = Array.isArray(permissions) ? permissions : [];

    const newRole = await prisma.role.create({
      data: {
        name: normalizedName,
        description: description || '',
        permissions: JSON.stringify(permsArray),
      },
    });

    return res.status(201).json({
      ...newRole,
      permissions: permsArray,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to create role' });
  }
}

// PATCH /role/:id — Update role name, description, or permissions
async function updateRole(req, res) {
  const { name, description, permissions } = req.body;
  const roleId = Number(req.params.id);

  try {
    const existing = await prisma.role.findUnique({ where: { id: roleId } });
    if (!existing) {
      return res.status(404).json({ error: 'Role not found' });
    }

    const data = {};
    if (description !== undefined) data.description = description;
    if (name && existing.name !== 'ADMIN' && existing.name !== 'USER') {
      data.name = name.trim().toUpperCase().replace(/\s+/g, '_');
    }
    if (permissions !== undefined) {
      data.permissions = JSON.stringify(Array.isArray(permissions) ? permissions : []);
    }

    const updated = await prisma.role.update({
      where: { id: roleId },
      data,
    });

    return res.json({
      ...updated,
      permissions: safeParseJson(updated.permissions, []),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to update role' });
  }
}

// DELETE /role/:id — Delete a role (cannot delete core ADMIN or USER roles)
async function deleteRole(req, res) {
  const roleId = Number(req.params.id);

  try {
    const role = await prisma.role.findUnique({ where: { id: roleId } });
    if (!role) {
      return res.status(404).json({ error: 'Role not found' });
    }

    if (role.name === 'ADMIN' || role.name === 'USER') {
      return res.status(400).json({ error: `Cannot delete default core role '${role.name}'` });
    }

    // Reset any users who had this custom role back to 'USER'
    await prisma.user.updateMany({
      where: { customRole: role.name },
      data: { customRole: null },
    });

    await prisma.role.delete({ where: { id: roleId } });

    return res.status(204).send();
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to delete role' });
  }
}

// Helper: Safely parse JSON
function safeParseJson(raw, fallback) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

// Helper to resolve all effective permissions for a user
async function resolveUserPermissions(user) {
  if (!user) return [];

  // Admins always have all permissions
  if (user.role === 'ADMIN' || user.customRole === 'ADMIN') {
    return SYSTEM_PERMISSIONS.map((p) => p.id);
  }

  // Determine active role name: customRole taking precedence if set, otherwise user.role
  const roleName = user.customRole || user.role || 'USER';

  // Find role in DB
  const roleRecord = await prisma.role.findUnique({ where: { name: roleName } });
  const rolePerms = roleRecord ? safeParseJson(roleRecord.permissions, []) : [];

  // If user has custom override permissions, combine or override
  const userCustomPerms = safeParseJson(user.permissions, null);

  if (Array.isArray(userCustomPerms) && userCustomPerms.length > 0) {
    return Array.from(new Set([...rolePerms, ...userCustomPerms]));
  }

  return rolePerms;
}

module.exports = {
  SYSTEM_PERMISSIONS,
  DEFAULT_ROLES,
  seedDefaultRoles,
  getAvailablePermissions,
  getAllRoles,
  getRoleById,
  createRole,
  updateRole,
  deleteRole,
  resolveUserPermissions,
  safeParseJson,
};
