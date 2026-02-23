import express from 'express';
import { pool } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.middleware.js';

const router = express.Router();
router.use(authenticateToken);

// Listar todas las especies (con paginación)
router.get('/', async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const limitNum = Math.min(parseInt(limit, 10) || 50, 500);
    const offsetNum = Math.max(0, parseInt(offset, 10) || 0);

    const countResult = await pool.query('SELECT COUNT(*) AS total FROM especies');
    const total = parseInt(countResult.rows[0]?.total, 10) || 0;

    const result = await pool.query(
      'SELECT id, nombre, observaciones, created_at FROM especies ORDER BY nombre LIMIT $1 OFFSET $2',
      [limitNum, offsetNum]
    );
    res.json({ data: result.rows, total });
  } catch (error) {
    console.error('Error listando especies:', error);
    res.status(500).json({ message: 'Error al listar especies' });
  }
});

// Obtener una especie por ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT id, nombre, observaciones FROM especies WHERE id = $1',
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Especie no encontrada' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error obteniendo especie:', error);
    res.status(500).json({ message: 'Error al obtener especie' });
  }
});

// Crear especie
router.post('/', async (req, res) => {
  try {
    const { nombre, observaciones } = req.body;
    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ message: 'El nombre es requerido' });
    }

    const existing = await pool.query('SELECT id FROM especies WHERE LOWER(nombre) = LOWER($1)', [nombre.trim()]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ message: 'Ya existe una especie con ese nombre' });
    }

    const result = await pool.query(
      `INSERT INTO especies (nombre, observaciones)
       VALUES ($1, $2)
       RETURNING id, nombre, observaciones, created_at`,
      [nombre.trim(), observaciones ? observaciones.trim() : null]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creando especie:', error);
    res.status(500).json({ message: 'Error al crear especie' });
  }
});

// Actualizar especie
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, observaciones } = req.body;
    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ message: 'El nombre es requerido' });
    }

    const existing = await pool.query('SELECT id FROM especies WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ message: 'Especie no encontrada' });
    }

    const nameCheck = await pool.query('SELECT id FROM especies WHERE LOWER(nombre) = LOWER($1) AND id != $2', [nombre.trim(), id]);
    if (nameCheck.rows.length > 0) {
      return res.status(400).json({ message: 'Ya existe otra especie con ese nombre' });
    }

    const result = await pool.query(
      `UPDATE especies SET nombre = $1, observaciones = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 RETURNING id, nombre, observaciones, updated_at`,
      [nombre.trim(), observaciones ? observaciones.trim() : null, id]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error actualizando especie:', error);
    res.status(500).json({ message: 'Error al actualizar especie' });
  }
});

// Eliminar especie
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM especies WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Especie no encontrada' });
    }
    res.json({ message: 'Especie eliminada correctamente' });
  } catch (error) {
    console.error('Error eliminando especie:', error);
    if (error.code === '23503') {
      return res.status(400).json({ message: 'No se puede eliminar: hay productos o clientes que usan esta especie' });
    }
    res.status(500).json({ message: 'Error al eliminar especie' });
  }
});

export default router;
