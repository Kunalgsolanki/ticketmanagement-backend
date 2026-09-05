const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const prisma = require('../prisma/client');
const { resolveUserPermissions, safeParseJson } = require('./roleController');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const SALT_ROUNDS = 10;

// Helper to strip password before sending user back
async function sanitizeUser(user, explicitPerms = null) {
  const { password, ...safeUser } = user;
  const permissions = explicitPerms || (await resolveUserPermissions(user));
  return {
    ...safeUser,
    displayRole: user.customRole || user.role || 'USER',
    role: user.customRole || user.role || 'USER',
    baseRole: user.role,
    customRole: user.customRole || null,
    permissions,
  };
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

// SIGNUP
async function signup(req, res) {
  const { name, password, role } = req.body;
  const normalizedEmail = normalizeEmail(req.body.email);

  if (!name || !normalizedEmail || !password) {
    return res.status(400).json({ error: 'name, email and password are required' });
  }

  try {
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      return res.status(409).json({ error: 'Email already in use' });
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    const isSystemAdmin = role === 'ADMIN';
    const newUser = await prisma.user.create({
      data: {
        name,
        email: normalizedEmail,
        password: hashedPassword,
        role: isSystemAdmin ? 'ADMIN' : 'USER',
        ...(role && role !== 'ADMIN' && role !== 'USER' && { customRole: role }),
      },
    });

    const permissions = await resolveUserPermissions(newUser);
    const sanitized = await sanitizeUser(newUser, permissions);

    const token = jwt.sign(
      { userId: newUser.id, role: sanitized.role, permissions },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({ user: sanitized, token });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'An error occurred while creating the user' });
  }
}

// LOGIN
async function login(req, res) {
  const { password } = req.body;
  const normalizedEmail = normalizeEmail(req.body.email);

  if (!normalizedEmail || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const permissions = await resolveUserPermissions(user);
    const sanitized = await sanitizeUser(user, permissions);

    const token = jwt.sign(
      { userId: user.id, role: sanitized.role, permissions },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.json({ user: sanitized, token });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message || 'An error occurred while logging in' });
  }
}

// LIST ALL
async function getAllUsers(req, res) {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        customRole: true,
        permissions: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Format users with resolved permissions
    const formatted = await Promise.all(
      users.map(async (u) => {
        const perms = await resolveUserPermissions(u);
        return {
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.customRole || u.role,
          baseRole: u.role,
          customRole: u.customRole,
          permissions: perms,
          createdAt: u.createdAt,
          updatedAt: u.updatedAt,
        };
      })
    );

    res.json(formatted);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'An error occurred while fetching users' });
  }
}

// GET ONE
async function getUserById(req, res) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: Number(req.params.id) },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        ticketsCreated: true,
        ticketsAssigned: true,
      },
    });

    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'An error occurred while fetching the user' });
  }
}

// UPDATE
async function updateUser(req, res) {
  const { name, email, role, password } = req.body;

  try {
    const data = {
      ...(name !== undefined && { name }),
      ...(email !== undefined && { email }),
      ...(role !== undefined && { role }),
    };

    if (password) {
      data.password = await bcrypt.hash(password, SALT_ROUNDS);
    }

    const updatedUser = await prisma.user.update({
      where: { id: Number(req.params.id) },
      data,
    });

    const safe = await sanitizeUser(updatedUser);
    res.json(safe);
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'User not found' });
    }
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Email already in use' });
    }
    console.error(error);
    res.status(500).json({ error: 'An error occurred while updating the user' });
  }
}

// DELETE
async function deleteUser(req, res) {
  try {
    await prisma.user.delete({
      where: { id: Number(req.params.id) },
    });
    res.status(204).send();
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'User not found' });
    }
    console.error(error);
    res.status(500).json({ error: 'An error occurred while deleting the user' });
  }
}

// ADMIN CREATE USER (admin sets role or custom role explicitly)
async function adminCreateUser(req, res) {
  const { name, password, role, permissions } = req.body;
  const normalizedEmail = normalizeEmail(req.body.email);

  if (!name || !normalizedEmail || !password) {
    return res.status(400).json({ error: 'name, email and password are required' });
  }

  const roleStr = String(role || 'USER').trim().toUpperCase();
  const isSystemAdmin = roleStr === 'ADMIN';
  const customRole = !isSystemAdmin && roleStr !== 'USER' ? roleStr : null;

  try {
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      return res.status(409).json({ error: 'Email already in use' });
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    const newUser = await prisma.user.create({
      data: {
        name,
        email: normalizedEmail,
        password: hashedPassword,
        role: isSystemAdmin ? 'ADMIN' : 'USER',
        customRole,
        ...(Array.isArray(permissions) && { permissions: JSON.stringify(permissions) }),
      },
    });

    const safe = await sanitizeUser(newUser);
    res.status(201).json(safe);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'An error occurred while creating the user' });
  }
}

// UPDATE ROLE (Admin only or role:manage)
async function updateUserRole(req, res) {
  const { role } = req.body;
  const userId = Number(req.params.id);

  if (!role) {
    return res.status(400).json({ error: 'role is required' });
  }

  const normalizedRole = String(role).trim().toUpperCase();
  const isSystemAdmin = normalizedRole === 'ADMIN';
  const isStandardUser = normalizedRole === 'USER';

  try {
    const data = {
      role: isSystemAdmin ? 'ADMIN' : 'USER',
      customRole: !isSystemAdmin && !isStandardUser ? normalizedRole : null,
    };

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data,
    });

    const safe = await sanitizeUser(updatedUser);
    res.json(safe);
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'User not found' });
    }
    console.error(error);
    res.status(500).json({ error: 'An error occurred while updating the role' });
  }
}

// UPDATE USER PERMISSIONS (Admin only)
async function updateUserPermissions(req, res) {
  const { permissions } = req.body;
  const userId = Number(req.params.id);

  if (!Array.isArray(permissions)) {
    return res.status(400).json({ error: 'permissions must be an array of permission strings' });
  }

  try {
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        permissions: JSON.stringify(permissions),
      },
    });

    const safe = await sanitizeUser(updatedUser);
    res.json(safe);
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'User not found' });
    }
    console.error(error);
    res.status(500).json({ error: 'An error occurred while updating user permissions' });
  }
}

module.exports = {
  signup,
  login,
  getAllUsers,
  getUserById,
  updateUser,
  updateUserRole,
  updateUserPermissions,
  adminCreateUser,
  deleteUser,
};