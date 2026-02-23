import express from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../config/database.js';
import { authenticateToken, checkRole } from '../middleware/auth.middleware.js';

const router = express.Router();
router.use(authenticateToken);

// Listar todos los usuarios (con paginación)
router.get('/', checkRole('Admin'), async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const limitNum = Math.min(parseInt(limit, 10) || 50, 500);
    const offsetNum = Math.max(0, parseInt(offset, 10) || 0);

    const countResult = await pool.query('SELECT COUNT(*) AS total FROM usuarios');
    const total = parseInt(countResult.rows[0]?.total, 10) || 0;

    const result = await pool.query(
      'SELECT id, nombre, email, rol, activo, created_at FROM usuarios ORDER BY nombre LIMIT $1 OFFSET $2',
      [limitNum, offsetNum]
    );
    res.json({ data: result.rows, total });
  } catch (error) {
    console.error('Error listando usuarios:', error);
    res.status(500).json({ message: 'Error al listar usuarios' });
  }
});

// Obtener usuario actual
router.get('/me', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, nombre, email, rol FROM usuarios WHERE id = $1',
      [req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error al obtener usuario:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// Obtener un usuario por ID
router.get('/:id', checkRole('Admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT id, nombre, email, rol, activo FROM usuarios WHERE id = $1',
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error obteniendo usuario:', error);
    res.status(500).json({ message: 'Error al obtener usuario' });
  }
});

// Crear usuario
router.post('/', checkRole('Admin'), async (req, res) => {
  try {
    const { nombre, email, password, rol } = req.body;
    if (!nombre || !email || !password || !rol) {
      return res.status(400).json({ message: 'Faltan campos requeridos: nombre, email, contraseña, rol' });
    }
    if (!['Admin', 'Usuario', 'Visitante'].includes(rol)) {
      return res.status(400).json({ message: 'Rol inválido' });
    }

    const existing = await pool.query('SELECT id FROM usuarios WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ message: 'Ya existe un usuario con ese email' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO usuarios (nombre, email, password_hash, rol)
       VALUES ($1, $2, $3, $4)
       RETURNING id, nombre, email, rol, activo, created_at`,
      [nombre.trim(), email.trim().toLowerCase(), passwordHash, rol]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creando usuario:', error);
    res.status(500).json({ message: 'Error al crear usuario' });
  }
});

// Actualizar usuario
router.put('/:id', checkRole('Admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, email, password, rol } = req.body;
    if (!nombre || !email || !rol) {
      return res.status(400).json({ message: 'Faltan campos requeridos: nombre, email, rol' });
    }
    if (!['Admin', 'Usuario', 'Visitante'].includes(rol)) {
      return res.status(400).json({ message: 'Rol inválido' });
    }

    const existing = await pool.query('SELECT id FROM usuarios WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    const emailCheck = await pool.query('SELECT id FROM usuarios WHERE email = $1 AND id != $2', [email.trim().toLowerCase(), id]);
    if (emailCheck.rows.length > 0) {
      return res.status(400).json({ message: 'Ya existe otro usuario con ese email' });
    }

    if (password && password.length >= 6) {
      const passwordHash = await bcrypt.hash(password, 10);
      const result = await pool.query(
        `UPDATE usuarios SET nombre = $1, email = $2, password_hash = $3, rol = $4, updated_at = CURRENT_TIMESTAMP WHERE id = $5 RETURNING id, nombre, email, rol, activo`,
        [nombre.trim(), email.trim().toLowerCase(), passwordHash, rol, id]
      );
      return res.json(result.rows[0]);
    }

    const result = await pool.query(
      `UPDATE usuarios SET nombre = $1, email = $2, rol = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4 RETURNING id, nombre, email, rol, activo`,
      [nombre.trim(), email.trim().toLowerCase(), rol, id]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error actualizando usuario:', error);
    res.status(500).json({ message: 'Error al actualizar usuario' });
  }
});

// Eliminar usuario
router.delete('/:id', checkRole('Admin'), async (req, res) => {
  try {
    const { id } = req.params;
    if (id === req.user.id) {
      return res.status(400).json({ message: 'No puede eliminarse a sí mismo' });
    }
    const result = await pool.query('DELETE FROM usuarios WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }
    res.json({ message: 'Usuario eliminado correctamente' });
  } catch (error) {
    console.error('Error eliminando usuario:', error);
    res.status(500).json({ message: 'Error al eliminar usuario' });
  }
});

export default router;
