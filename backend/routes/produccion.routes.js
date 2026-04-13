import express from 'express';
import { pool } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.middleware.js';

const router = express.Router();
router.use(authenticateToken);

router.get('/', async (req, res) => {
  try {
    const { limit = 50, offset = 0, estado } = req.query;
    const limitNum = Math.min(parseInt(limit, 10) || 50, 500);
    const offsetNum = Math.max(0, parseInt(offset, 10) || 0);

    let where = 'WHERE 1=1';
    const params = [];
    let n = 1;
    if (estado) {
      where += ` AND po.estado = $${n}`;
      params.push(estado);
      n++;
    }

    const countResult = await pool.query(
      `SELECT COUNT(*) AS total FROM produccion_ordenes po ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.total, 10) || 0;

    const result = await pool.query(
      `SELECT po.id, po.lote_mp_id, po.producto_final_id, po.cantidad_producida, po.operario_id, po.fecha_orden, po.estado, po.created_at,
              pf.codigo AS producto_final_codigo, pf.producto AS producto_final_nombre,
              u.nombre AS operario_nombre,
              l.producto_id AS lote_producto_id, p.codigo AS lote_producto_codigo
       FROM produccion_ordenes po
       JOIN productos pf ON pf.id = po.producto_final_id
       JOIN usuarios u ON u.id = po.operario_id
       JOIN lotes l ON l.id = po.lote_mp_id
       JOIN productos p ON p.id = l.producto_id
       ${where}
       ORDER BY po.fecha_orden DESC
       LIMIT $${n} OFFSET $${n + 1}`,
      [...params, limitNum, offsetNum]
    );

    res.json({ data: result.rows, total });
  } catch (error) {
    console.error('Error listando órdenes de producción:', error);
    res.status(500).json({ message: 'Error al listar órdenes de producción' });
  }
});

// Entradas pendientes (rutas antes de /:id)
router.get('/entradas-pendientes/list', async (req, res) => {
  try {
    const { estado = 'Pendiente', limit = 100, offset = 0 } = req.query;
    const limitNum = Math.min(parseInt(limit, 10) || 100, 500);
    const offsetNum = Math.max(0, parseInt(offset, 10) || 0);

    const countResult = await pool.query(
      'SELECT COUNT(*) AS total FROM entradas_pendientes WHERE estado = $1',
      [estado]
    );
    const total = parseInt(countResult.rows[0]?.total, 10) || 0;

    const result = await pool.query(
      `SELECT ep.id, ep.produccion_orden_id, ep.producto_id, ep.cantidad, ep.estado, ep.movimiento_id, ep.created_at,
              p.codigo AS producto_codigo, p.producto AS producto_nombre,
              po.fecha_orden, u.nombre AS operario_nombre
       FROM entradas_pendientes ep
       JOIN productos p ON p.id = ep.producto_id
       JOIN produccion_ordenes po ON po.id = ep.produccion_orden_id
       JOIN usuarios u ON u.id = po.operario_id
       WHERE ep.estado = $1
       ORDER BY ep.created_at
       LIMIT $2 OFFSET $3`,
      [estado, limitNum, offsetNum]
    );

    res.json({ data: result.rows, total });
  } catch (error) {
    console.error('Error listando entradas pendientes:', error);
    res.status(500).json({ message: 'Error al listar entradas pendientes' });
  }
});

router.put('/entradas-pendientes/:id/convertido', async (req, res) => {
  try {
    const { id } = req.params;
    const { movimiento_id } = req.body;
    const result = await pool.query(
      `UPDATE entradas_pendientes SET estado = 'Convertido', movimiento_id = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND estado = 'Pendiente'
       RETURNING id, estado, movimiento_id`,
      [movimiento_id || null, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Entrada pendiente no encontrada o ya convertida' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error marcando entrada pendiente:', error);
    res.status(500).json({ message: 'Error al actualizar entrada pendiente' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT po.id, po.lote_mp_id, po.producto_final_id, po.cantidad_producida, po.operario_id, po.fecha_orden, po.estado, po.created_at,
              pf.codigo AS producto_final_codigo, pf.producto AS producto_final_nombre,
              u.nombre AS operario_nombre
       FROM produccion_ordenes po
       JOIN productos pf ON pf.id = po.producto_final_id
       JOIN usuarios u ON u.id = po.operario_id
       WHERE po.id = $1`,
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Orden de producción no encontrada' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error obteniendo orden de producción:', error);
    res.status(500).json({ message: 'Error al obtener orden de producción' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { lote_mp_id, producto_final_id, cantidad_producida, operario_id, estado } = req.body;
    if (!lote_mp_id || !producto_final_id || cantidad_producida == null || !operario_id) {
      return res.status(400).json({ message: 'lote_mp_id, producto_final_id, cantidad_producida y operario_id son requeridos' });
    }
    const cantidad = Number(cantidad_producida);
    if (cantidad <= 0) return res.status(400).json({ message: 'cantidad_producida debe ser mayor a 0' });

    const result = await pool.query(
      `INSERT INTO produccion_ordenes (lote_mp_id, producto_final_id, cantidad_producida, operario_id, estado)
       VALUES ($1, $2, $3, $4, COALESCE($5, 'Pendiente'))
       RETURNING id, lote_mp_id, producto_final_id, cantidad_producida, operario_id, fecha_orden, estado, created_at`,
      [lote_mp_id, producto_final_id, cantidad, operario_id, estado]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creando orden de producción:', error);
    res.status(500).json({ message: 'Error al crear orden de producción' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { estado, cantidad_producida } = req.body;
    const existing = await pool.query('SELECT id, estado FROM produccion_ordenes WHERE id = $1', [id]);
    if (existing.rows.length === 0) return res.status(404).json({ message: 'Orden de producción no encontrada' });

    const updates = ['updated_at = CURRENT_TIMESTAMP'];
    const params = [];
    let n = 1;
    if (estado) {
      updates.push(`estado = $${n}`);
      params.push(estado);
      n++;
    }
    if (cantidad_producida != null) {
      updates.push(`cantidad_producida = $${n}`);
      params.push(Number(cantidad_producida));
      n++;
    }
    params.push(id);

    const result = await pool.query(
      `UPDATE produccion_ordenes SET ${updates.join(', ')} WHERE id = $${n} RETURNING id, estado, cantidad_producida, updated_at`,
      params
    );
    const row = result.rows[0];

    if (estado === 'Completado') {
      const ordenPrev = existing.rows[0]
      if (ordenPrev.estado !== 'Completado') {
        const ordenFull = await pool.query(
          'SELECT producto_final_id, cantidad_producida FROM produccion_ordenes WHERE id = $1',
          [id]
        );
        if (ordenFull.rows.length > 0) {
          const { producto_final_id, cantidad_producida: cant } = ordenFull.rows[0];
          await pool.query(
            `INSERT INTO entradas_pendientes (produccion_orden_id, producto_id, cantidad, estado)
             VALUES ($1, $2, $3, 'Pendiente')`,
            [id, producto_final_id, cant]
          );
        }
      }
    }

    res.json(row);
  } catch (error) {
    console.error('Error actualizando orden de producción:', error);
    res.status(500).json({ message: 'Error al actualizar orden de producción' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM produccion_ordenes WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Orden de producción no encontrada' });
    res.json({ message: 'Orden de producción eliminada correctamente' });
  } catch (error) {
    console.error('Error eliminando orden de producción:', error);
    if (error.code === '23503') {
      return res.status(400).json({ message: 'No se puede eliminar: tiene entradas pendientes asociadas' });
    }
    res.status(500).json({ message: 'Error al eliminar orden de producción' });
  }
});

export default router;
