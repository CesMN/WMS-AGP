import jwt from 'jsonwebtoken';
import { isAdminRole, resolveUserPermissions } from '../utils/rbac.js';

export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Token de acceso requerido' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Token inválido o expirado' });
    }
    req.user = user;
    next();
  });
};

export const checkRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Usuario no autenticado' });
    }
    
    const currentRole = String(req.user.rol || '').trim().toLowerCase();
    const allowed = roles.some((r) => String(r || '').trim().toLowerCase() === currentRole);
    if (!allowed && !isAdminRole(req.user.rol)) {
      return res.status(403).json({ message: 'No tienes permisos para esta acción' });
    }
    
    next();
  };
};

export const checkPermission = (resource, action = 'view') => {
  return async (req, res, next) => {
    try {
      if (!req.user) return res.status(401).json({ message: 'Usuario no autenticado' });
      if (isAdminRole(req.user.rol)) return next();
      const targetAction = action === 'operate' ? 'operate' : 'view';
      if (!req.user.permissions || !req.user.permissions[resource]) {
        const resolved = await resolveUserPermissions(req.user.id, req.user.rol);
        req.user.rol = resolved.role;
        req.user.permissions = resolved.permissions;
      }
      const permission = req.user.permissions?.[resource] || { view: false, operate: false };
      const allowed = targetAction === 'operate' ? permission.operate : permission.view;
      if (!allowed) {
        return res.status(403).json({ message: 'No tienes permisos para esta acción' });
      }
      return next();
    } catch (error) {
      console.error('Error verificando permisos:', error);
      return res.status(500).json({ message: 'Error verificando permisos' });
    }
  };
};
