import express from 'express';
import { pool } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.middleware.js';

const router = express.Router();
router.use(authenticateToken);

// Listar recepciones con paginación
router.get('/', async (req, res) => {
  try {
    const { limit = 50, offset = 0, estado } = req.query;
    const limitNum = Math.min(parseInt(limit, 10) || 50, 500);
    const offsetNum = Math.max(0, parseInt(offset, 10) || 0);

    let where = 'WHERE 1=1';
    const params = [];
    let n = 1;
    if (estado) {
      where += ` AND estado = $${n}`;
      params.push(estado);
      n++;
    }

    const countResult = await pool.query(
      `SELECT COUNT(*) AS total FROM recepciones ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.total, 10) || 0;

    const result = await pool.query(
      `SELECT id, proveedor, fecha, guia_remision, estado, created_at
       FROM recepciones ${where}
       ORDER BY fecha DESC, created_at DESC
       LIMIT $${n} OFFSET $${n + 1}`,
      [...params, limitNum, offsetNum]
    );

    res.json({ data: result.rows, total });
  } catch (error) {
    console.error('Error listando recepciones:', error);
    res.status(500).json({ message: 'Error al listar recepciones' });
  }
});

// --- Lotes (rutas antes de /:id para que no capturen "lotes" como id) ---
router.get('/lotes/list', async (req, res) => {
  try {
    const { recepcion_id, limit = 100, offset = 0 } = req.query;
    const limitNum = Math.min(parseInt(limit, 10) || 100, 500);
    const offsetNum = Math.max(0, parseInt(offset, 10) || 0);

    let where = 'WHERE 1=1';
    const params = [];
    let n = 1;
    if (recepcion_id) {
      where += ` AND l.recepcion_id = $${n}`;
      params.push(recepcion_id);
      n++;
    }

    const countResult = await pool.query(
      `SELECT COUNT(*) AS total FROM lotes l ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.total, 10) || 0;

    const result = await pool.query(
      `SELECT l.id, l.recepcion_id, l.producto_id, l.cantidad_inicial, l.cantidad_actual, l.fecha_vencimiento, l.created_at,
              p.codigo AS producto_codigo, p.producto AS producto_nombre, p.formato, p.unidad_medida,
              r.proveedor, r.fecha AS recepcion_fecha
       FROM lotes l
       JOIN productos p ON p.id = l.producto_id
       JOIN recepciones r ON r.id = l.recepcion_id
       ${where}
       ORDER BY l.created_at DESC
       LIMIT $${n} OFFSET $${n + 1}`,
      [...params, limitNum, offsetNum]
    );

    res.json({ data: result.rows, total });
  } catch (error) {
    console.error('Error listando lotes:', error);
    res.status(500).json({ message: 'Error al listar lotes' });
  }
});

router.post('/lotes', async (req, res) => {
  try {
    const { recepcion_id, producto_id, cantidad_inicial, cantidad_actual, fecha_vencimiento } = req.body;
    if (!recepcion_id || !producto_id) {
      return res.status(400).json({ message: 'recepcion_id y producto_id son requeridos' });
    }
    const cant = cantidad_inicial != null ? Number(cantidad_inicial) : Number(cantidad_actual) ?? 0;
    const cantActual = cantidad_actual != null ? Number(cantidad_actual) : cant;

    const result = await pool.query(
      `INSERT INTO lotes (recepcion_id, producto_id, cantidad_inicial, cantidad_actual, fecha_vencimiento)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, recepcion_id, producto_id, cantidad_inicial, cantidad_actual, fecha_vencimiento, created_at`,
      [recepcion_id, producto_id, cant, cantActual, fecha_vencimiento || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creando lote:', error);
    res.status(500).json({ message: 'Error al crear lote' });
  }
});

router.put('/lotes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { cantidad_actual, fecha_vencimiento } = req.body;
    const result = await pool.query(
      `UPDATE lotes SET
         cantidad_actual = COALESCE($1, cantidad_actual),
         fecha_vencimiento = $2,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING id, recepcion_id, producto_id, cantidad_inicial, cantidad_actual, fecha_vencimiento, updated_at`,
      [cantidad_actual != null ? Number(cantidad_actual) : null, fecha_vencimiento ?? null, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Lote no encontrado' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error actualizando lote:', error);
    res.status(500).json({ message: 'Error al actualizar lote' });
  }
});

// Obtener una recepción por ID (con lotes)
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const rec = await pool.query(
      'SELECT id, proveedor, fecha, guia_remision, estado, created_at FROM recepciones WHERE id = $1',
      [id]
    );
    if (rec.rows.length === 0) {
      return res.status(404).json({ message: 'Recepción no encontrada' });
    }
    const recepcion = rec.rows[0];
    const lotes = await pool.query(
      `SELECT l.id, l.recepcion_id, l.producto_id, l.cantidad_inicial, l.cantidad_actual, l.fecha_vencimiento, l.created_at,
              p.codigo AS producto_codigo, p.producto AS producto_nombre
       FROM lotes l
       JOIN productos p ON p.id = l.producto_id
       WHERE l.recepcion_id = $1
       ORDER BY l.created_at`,
      [id]
    );
    recepcion.lotes = lotes.rows;
    res.json(recepcion);
  } catch (error) {
    console.error('Error obteniendo recepción:', error);
    res.status(500).json({ message: 'Error al obtener recepción' });
  }
});

// Crear recepción
router.post('/', async (req, res) => {
  try {
    const { proveedor, fecha, guia_remision, estado } = req.body;
    if (!proveedor || !proveedor.trim()) {
      return res.status(400).json({ message: 'El proveedor es requerido' });
    }
    if (!fecha) {
      return res.status(400).json({ message: 'La fecha es requerida' });
    }

    const result = await pool.query(
      `INSERT INTO recepciones (proveedor, fecha, guia_remision, estado)
       VALUES ($1, $2, $3, COALESCE($4, 'Pendiente'))
       RETURNING id, proveedor, fecha, guia_remision, estado, created_at`,
      [proveedor.trim(), fecha, guia_remision?.trim() || null, estado]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creando recepción:', error);
    res.status(500).json({ message: 'Error al crear recepción' });
  }
});

// Actualizar recepción
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { proveedor, fecha, guia_remision, estado } = req.body;
    const existing = await pool.query('SELECT id FROM recepciones WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ message: 'Recepción no encontrada' });
    }

    const result = await pool.query(
      `UPDATE recepciones SET
         proveedor = COALESCE($1, proveedor),
         fecha = COALESCE($2, fecha),
         guia_remision = $3,
         estado = COALESCE($4, estado),
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $5
       RETURNING id, proveedor, fecha, guia_remision, estado, updated_at`,
      [proveedor?.trim(), fecha, guia_remision?.trim() ?? null, estado, id]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error actualizando recepción:', error);
    res.status(500).json({ message: 'Error al actualizar recepción' });
  }
});

// Eliminar recepción
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM recepciones WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Recepción no encontrada' });
    }
    res.json({ message: 'Recepción eliminada correctamente' });
  } catch (error) {
    console.error('Error eliminando recepción:', error);
    if (error.code === '23503') {
      return res.status(400).json({ message: 'No se puede eliminar: tiene lotes asociados' });
    }
    res.status(500).json({ message: 'Error al eliminar recepción' });
  }
});

export default router;
