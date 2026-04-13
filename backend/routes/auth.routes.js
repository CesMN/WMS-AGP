import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import { pool } from '../config/database.js';
import { normalizeRole, resolveUserPermissions } from '../utils/rbac.js';

const router = express.Router();

// Login
router.post('/login', 
  [
    body('email').isEmail().withMessage('Email inválido'),
    body('password').notEmpty().withMessage('Contraseña requerida')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password } = req.body;

      // Buscar usuario
      const result = await pool.query(
        'SELECT id, nombre, email, password_hash, rol, activo FROM usuarios WHERE email = $1',
        [email]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ message: 'Credenciales inválidas' });
      }

      const user = result.rows[0];

      if (!user.activo) {
        return res.status(401).json({ message: 'Usuario inactivo' });
      }

      // Verificar contraseña
      const isValidPassword = await bcrypt.compare(password, user.password_hash);
      if (!isValidPassword) {
        return res.status(401).json({ message: 'Credenciales inválidas' });
      }

      const normalizedRole = normalizeRole(user.rol);
      const resolvedPermissions = await resolveUserPermissions(user.id, normalizedRole);

      // Generar token
      const token = jwt.sign(
        { 
          id: user.id, 
          email: user.email, 
          rol: resolvedPermissions.role 
        },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );

      res.json({
        token,
        user: {
          id: user.id,
          nombre: user.nombre,
          email: user.email,
          rol: resolvedPermissions.role,
          permissions: resolvedPermissions.permissions
        },
      });
    } catch (error) {
      console.error('Error en login:', error);
      const message = process.env.NODE_ENV === 'development' 
        ? (error.message || 'Error interno del servidor')
        : 'Error interno del servidor';
      res.status(500).json({ message });
    }
  }
);

// Verificar token
router.get('/verify', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ message: 'Token no proporcionado' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Obtener datos actualizados del usuario
    const result = await pool.query(
      'SELECT id, nombre, email, rol, activo FROM usuarios WHERE id = $1',
      [decoded.id]
    );

    if (result.rows.length === 0 || !result.rows[0].activo) {
      return res.status(401).json({ message: 'Usuario no encontrado o inactivo' });
    }

    const normalizedRole = normalizeRole(result.rows[0].rol);
    const resolvedPermissions = await resolveUserPermissions(result.rows[0].id, normalizedRole);
    res.json({
      user: {
        ...result.rows[0],
        rol: resolvedPermissions.role,
        permissions: resolvedPermissions.permissions,
      }
    });
  } catch (error) {
    res.status(401).json({ message: 'Token inválido' });
  }
});

export default router;
