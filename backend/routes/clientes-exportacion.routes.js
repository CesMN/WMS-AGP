import express from 'express';
import { pool } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.middleware.js';

const router = express.Router();
router.use(authenticateToken);

const initTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS clientes_exportacion (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      nombre VARCHAR(255) NOT NULL,
      descripcion TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
};

router.get('/', async (req, res) => {
  try {
    await initTable();
    const { limit = 100, offset = 0 } = req.query;
    const limitNum = Math.min(parseInt(limit, 10) || 100, 500);
    const offsetNum = Math.max(0, parseInt(offset, 10) || 0);

    const countResult = await pool.query('SELECT COUNT(*) AS total FROM clientes_exportacion');
    const total = parseInt(countResult.rows[0]?.total, 10) || 0;

    const result = await pool.query(
      `SELECT id, nombre, descripcion, created_at FROM clientes_exportacion
       ORDER BY nombre
       LIMIT $1 OFFSET $2`,
      [limitNum, offsetNum]
    );
    res.json({ data: result.rows, total });
  } catch (error) {
    console.error('Error listando clientes de exportación:', error);
    res.status(500).json({ message: 'Error al listar clientes de exportación' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT id, nombre, descripcion, created_at, updated_at FROM clientes_exportacion WHERE id = $1',
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Cliente no encontrado' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error obteniendo cliente exportación:', error);
    res.status(500).json({ message: 'Error al obtener cliente' });
  }
});

router.post('/', async (req, res) => {
  try {
    await initTable();
    const { nombre, descripcion } = req.body;
    if (!nombre || !nombre.trim()) return res.status(400).json({ message: 'El nombre es requerido' });

    const result = await pool.query(
      `INSERT INTO clientes_exportacion (nombre, descripcion)
       VALUES ($1, $2)
       RETURNING id, nombre, descripcion, created_at`,
      [nombre.trim(), descripcion?.trim() || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creando cliente exportación:', error);
    res.status(500).json({ message: 'Error al crear cliente' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, descripcion } = req.body;
    const existing = await pool.query('SELECT id FROM clientes_exportacion WHERE id = $1', [id]);
    if (existing.rows.length === 0) return res.status(404).json({ message: 'Cliente no encontrado' });

    const result = await pool.query(
      `UPDATE clientes_exportacion SET
         nombre = COALESCE(NULLIF(TRIM($1), ''), nombre),
         descripcion = $2,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING id, nombre, descripcion, updated_at`,
      [nombre, descripcion?.trim() ?? null, id]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error actualizando cliente exportación:', error);
    res.status(500).json({ message: 'Error al actualizar cliente' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM clientes_exportacion WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Cliente no encontrado' });
    res.json({ message: 'Cliente eliminado correctamente' });
  } catch (error) {
    console.error('Error eliminando cliente exportación:', error);
    if (error.code === '23503') return res.status(400).json({ message: 'No se puede eliminar: tiene órdenes asociadas' });
    res.status(500).json({ message: 'Error al eliminar cliente' });
  }
});

export default router;
