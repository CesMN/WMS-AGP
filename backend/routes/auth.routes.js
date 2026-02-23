import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import { pool } from '../config/database.js';

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

      // Generar token
      const token = jwt.sign(
        { 
          id: user.id, 
          email: user.email, 
          rol: user.rol 
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
          rol: user.rol
        }
      });
    } catch (error) {
      console.error('Error en login:', error);
      res.status(500).json({ message: 'Error interno del servidor' });
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

    res.json({
      user: result.rows[0]
    });
  } catch (error) {
    res.status(401).json({ message: 'Token inválido' });
  }
});

export default router;
