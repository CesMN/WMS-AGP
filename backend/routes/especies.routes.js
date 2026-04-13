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

    let result;
    try {
      result = await pool.query(
        'SELECT id, nombre, observaciones, COALESCE(tipo_descarga, \'normal\') AS tipo_descarga, created_at FROM especies ORDER BY nombre LIMIT $1 OFFSET $2',
        [limitNum, offsetNum]
      );
    } catch (err) {
      if (err.code === '42703') {
        result = await pool.query(
          'SELECT id, nombre, observaciones, created_at FROM especies ORDER BY nombre LIMIT $1 OFFSET $2',
          [limitNum, offsetNum]
        );
        result.rows = result.rows.map((r) => ({ ...r, tipo_descarga: 'normal' }));
      } else throw err;
    }
    res.json({ data: result.rows, total });
  } catch (error) {
    console.error('Error listando especies:', error);
    res.status(500).json({ message: 'Error al listar especies' });
  }
});

// Listar clasificaciones de una especie (rutas antes de /:id)
router.get('/:id/clasificaciones', async (req, res) => {
  try {
    const { id } = req.params;
    const esp = await pool.query('SELECT id FROM especies WHERE id = $1', [id]);
    if (esp.rows.length === 0) return res.status(404).json({ message: 'Especie no encontrada' });
    const result = await pool.query(
      'SELECT id, especie_id, codigo, nombre, orden, created_at FROM especie_clasificaciones WHERE especie_id = $1 ORDER BY orden, codigo',
      [id]
    );
    res.json(result.rows || []);
  } catch (error) {
    console.error('Error listando clasificaciones:', error);
    if (error.code === '42P01') return res.json([]);
    res.status(500).json({ message: 'Error al listar clasificaciones' });
  }
});

router.post('/:id/clasificaciones', async (req, res) => {
  try {
    const { id } = req.params;
    const { codigo, nombre, orden } = req.body;
    if (!codigo || !String(codigo).trim()) {
      return res.status(400).json({ message: 'El código de clasificación es requerido' });
    }
    const esp = await pool.query('SELECT id FROM especies WHERE id = $1', [id]);
    if (esp.rows.length === 0) return res.status(404).json({ message: 'Especie no encontrada' });
    const result = await pool.query(
      `INSERT INTO especie_clasificaciones (especie_id, codigo, nombre, orden)
       VALUES ($1, $2, $3, $4)
       RETURNING id, especie_id, codigo, nombre, orden, created_at`,
      [id, String(codigo).trim(), nombre ? String(nombre).trim() : null, orden != null ? parseInt(orden, 10) : 0]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creando clasificación:', error);
    if (error.code === '42P01') return res.status(500).json({ message: 'Tabla especie_clasificaciones no existe. Ejecute la migración 006.' });
    res.status(500).json({ message: 'Error al crear clasificación' });
  }
});

router.put('/clasificaciones/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { codigo, nombre, orden } = req.body;
    const updates = [];
    const values = [];
    let n = 1;
    if (codigo !== undefined) { updates.push(`codigo = $${n}`); values.push(String(codigo).trim()); n++; }
    if (nombre !== undefined) { updates.push(`nombre = $${n}`); values.push(nombre ? String(nombre).trim() : null); n++; }
    if (orden !== undefined) { updates.push(`orden = $${n}`); values.push(parseInt(orden, 10)); n++; }
    if (updates.length === 0) {
      const row = await pool.query('SELECT * FROM especie_clasificaciones WHERE id = $1', [id]);
      if (row.rows.length === 0) return res.status(404).json({ message: 'Clasificación no encontrada' });
      return res.json(row.rows[0]);
    }
    values.push(id);
    const result = await pool.query(
      `UPDATE especie_clasificaciones SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${n} RETURNING *`,
      values
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Clasificación no encontrada' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error actualizando clasificación:', error);
    res.status(500).json({ message: 'Error al actualizar clasificación' });
  }
});

router.delete('/clasificaciones/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM especie_clasificaciones WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Clasificación no encontrada' });
    res.json({ message: 'Clasificación eliminada' });
  } catch (error) {
    console.error('Error eliminando clasificación:', error);
    res.status(500).json({ message: 'Error al eliminar clasificación' });
  }
});

// Obtener una especie por ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    let result;
    try {
      result = await pool.query(
        'SELECT id, nombre, observaciones, COALESCE(tipo_descarga, \'normal\') AS tipo_descarga FROM especies WHERE id = $1',
        [id]
      );
    } catch (err) {
      if (err.code === '42703') {
        result = await pool.query('SELECT id, nombre, observaciones FROM especies WHERE id = $1', [id]);
        if (result.rows.length > 0) result.rows[0].tipo_descarga = 'normal';
      } else throw err;
    }
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
    const { nombre, observaciones, tipo_descarga } = req.body;
    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ message: 'El nombre es requerido' });
    }

    const existing = await pool.query('SELECT id FROM especies WHERE LOWER(nombre) = LOWER($1)', [nombre.trim()]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ message: 'Ya existe una especie con ese nombre' });
    }

    const tipo = tipo_descarga === 'clasificacion' ? 'clasificacion' : 'normal';
    let result;
    try {
      result = await pool.query(
        `INSERT INTO especies (nombre, observaciones, tipo_descarga)
         VALUES ($1, $2, $3)
         RETURNING id, nombre, observaciones, tipo_descarga, created_at`,
        [nombre.trim(), observaciones ? observaciones.trim() : null, tipo]
      );
    } catch (err) {
      if (err.code === '42703') {
        result = await pool.query(
          `INSERT INTO especies (nombre, observaciones)
           VALUES ($1, $2)
           RETURNING id, nombre, observaciones, created_at`,
          [nombre.trim(), observaciones ? observaciones.trim() : null]
        );
        result.rows[0].tipo_descarga = 'normal';
      } else throw err;
    }
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
    const { nombre, observaciones, tipo_descarga } = req.body;
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

    const tipo = tipo_descarga === 'clasificacion' ? 'clasificacion' : 'normal';
    let result;
    try {
      result = await pool.query(
        `UPDATE especies SET nombre = $1, observaciones = $2, tipo_descarga = $3, updated_at = CURRENT_TIMESTAMP
         WHERE id = $4 RETURNING id, nombre, observaciones, tipo_descarga, updated_at`,
        [nombre.trim(), observaciones ? observaciones.trim() : null, tipo, id]
      );
    } catch (err) {
      if (err.code === '42703') {
        result = await pool.query(
          `UPDATE especies SET nombre = $1, observaciones = $2, updated_at = CURRENT_TIMESTAMP
           WHERE id = $3 RETURNING id, nombre, observaciones, updated_at`,
          [nombre.trim(), observaciones ? observaciones.trim() : null, id]
        );
        result.rows[0].tipo_descarga = 'normal';
      } else throw err;
    }
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
