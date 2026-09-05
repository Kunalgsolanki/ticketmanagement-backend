const jwt = require('jsonwebtoken');
const prisma = require('../prisma/client');
const { resolveUserPermissions } = require('../controllers/roleController');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { userId, role }
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

function requirePermission(permission) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (req.user.role === 'ADMIN') {
      return next();
    }

    try {
      const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
      if (!user) return res.status(401).json({ error: 'User not found' });
      if (user.role === 'ADMIN' || user.customRole === 'ADMIN') return next();

      const permissions = await resolveUserPermissions(user);
      if (permissions.includes(permission)) {
        req.userPermissions = permissions;
        return next();
      }

      return res.status(403).json({
        error: `Access denied. Required permission: '${permission}'`,
      });
    } catch (err) {
      console.error('Permission check error:', err);
      return res.status(500).json({ error: 'Permission verification failed' });
    }
  };
}

module.exports = { authenticate, requireAdmin, requirePermission };