import express from 'express';
import { pool } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.middleware.js';

const router = express.Router();
router.use(authenticateToken);

// Listar todos los clientes (con especies asignadas y paginación)
router.get('/', async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const limitNum = Math.min(parseInt(limit, 10) || 50, 500);
    const offsetNum = Math.max(0, parseInt(offset, 10) || 0);

    const countResult = await pool.query('SELECT COUNT(*) AS total FROM clientes');
    const total = parseInt(countResult.rows[0]?.total, 10) || 0;

    const result = await pool.query(
      'SELECT id, nombre, descripcion, created_at FROM clientes ORDER BY nombre LIMIT $1 OFFSET $2',
      [limitNum, offsetNum]
    );
    const clientes = result.rows;

    for (const c of clientes) {
      const especiesResult = await pool.query(
        `SELECT e.id, e.nombre FROM especies e
         JOIN cliente_especies ce ON ce.especie_id = e.id
         WHERE ce.cliente_id = $1
         ORDER BY e.nombre`,
        [c.id]
      );
      c.especies = especiesResult.rows;
    }

    res.json({ data: clientes, total });
  } catch (error) {
    console.error('Error listando clientes:', error);
    res.status(500).json({ message: 'Error al listar clientes' });
  }
});

// Obtener un cliente por ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT id, nombre, descripcion FROM clientes WHERE id = $1',
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Cliente no encontrado' });
    }
    const cliente = result.rows[0];
    const especiesResult = await pool.query(
      `SELECT e.id, e.nombre FROM especies e
       JOIN cliente_especies ce ON ce.especie_id = e.id
       WHERE ce.cliente_id = $1 ORDER BY e.nombre`,
      [id]
    );
    cliente.especies = especiesResult.rows;
    cliente.especie_ids = especiesResult.rows.map((r) => r.id);
    res.json(cliente);
  } catch (error) {
    console.error('Error obteniendo cliente:', error);
    res.status(500).json({ message: 'Error al obtener cliente' });
  }
});

// Crear cliente
router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    const { nombre, descripcion, especie_ids } = req.body;
    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ message: 'El nombre es requerido' });
    }

    await client.query('BEGIN');

    const insResult = await client.query(
      `INSERT INTO clientes (nombre, descripcion)
       VALUES ($1, $2)
       RETURNING id, nombre, descripcion, created_at`,
      [nombre.trim(), descripcion ? descripcion.trim() : null]
    );
    const cliente = insResult.rows[0];

    if (especie_ids && Array.isArray(especie_ids) && especie_ids.length > 0) {
      for (const especieId of especie_ids) {
        await client.query(
          'INSERT INTO cliente_especies (cliente_id, especie_id) VALUES ($1, $2)',
          [cliente.id, especieId]
        );
      }
    }

    await client.query('COMMIT');

    const especiesResult = await pool.query(
      `SELECT e.id, e.nombre FROM especies e
       JOIN cliente_especies ce ON ce.especie_id = e.id
       WHERE ce.cliente_id = $1 ORDER BY e.nombre`,
      [cliente.id]
    );
    cliente.especies = especiesResult.rows;

    res.status(201).json(cliente);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creando cliente:', error);
    res.status(500).json({ message: 'Error al crear cliente' });
  } finally {
    client.release();
  }
});

// Actualizar cliente
router.put('/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { nombre, descripcion, especie_ids } = req.body;
    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ message: 'El nombre es requerido' });
    }

    const existing = await client.query('SELECT id FROM clientes WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ message: 'Cliente no encontrado' });
    }

    await client.query('BEGIN');

    await client.query(
      `UPDATE clientes SET nombre = $1, descripcion = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
      [nombre.trim(), descripcion ? descripcion.trim() : null, id]
    );

    await client.query('DELETE FROM cliente_especies WHERE cliente_id = $1', [id]);

    if (especie_ids && Array.isArray(especie_ids) && especie_ids.length > 0) {
      for (const especieId of especie_ids) {
        await client.query(
          'INSERT INTO cliente_especies (cliente_id, especie_id) VALUES ($1, $2)',
          [id, especieId]
        );
      }
    }

    await client.query('COMMIT');

    const result = await pool.query(
      'SELECT id, nombre, descripcion, updated_at FROM clientes WHERE id = $1',
      [id]
    );
    const cliente = result.rows[0];
    const especiesResult = await pool.query(
      `SELECT e.id, e.nombre FROM especies e
       JOIN cliente_especies ce ON ce.especie_id = e.id
       WHERE ce.cliente_id = $1 ORDER BY e.nombre`,
      [id]
    );
    cliente.especies = especiesResult.rows;

    res.json(cliente);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error actualizando cliente:', error);
    res.status(500).json({ message: 'Error al actualizar cliente' });
  } finally {
    client.release();
  }
});

// Eliminar cliente
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM clientes WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Cliente no encontrado' });
    }
    res.json({ message: 'Cliente eliminado correctamente' });
  } catch (error) {
    console.error('Error eliminando cliente:', error);
    if (error.code === '23503') {
      return res.status(400).json({ message: 'No se puede eliminar: hay productos asociados a este cliente' });
    }
    res.status(500).json({ message: 'Error al eliminar cliente' });
  }
});

export default router;
