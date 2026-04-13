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
      where += ` AND s.estado = $${n}`;
      params.push(estado);
      n++;
    }

    const countResult = await pool.query(
      `SELECT COUNT(*) AS total FROM salidas s ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.total, 10) || 0;

    const result = await pool.query(
      `SELECT s.id, s.cliente_destino, s.destino, s.fecha_despacho, s.estado, s.usuario_id, s.created_at,
              u.nombre AS usuario_nombre
       FROM salidas s
       LEFT JOIN usuarios u ON u.id = s.usuario_id
       ${where}
       ORDER BY s.fecha_despacho DESC, s.created_at DESC
       LIMIT $${n} OFFSET $${n + 1}`,
      [...params, limitNum, offsetNum]
    );

    res.json({ data: result.rows, total });
  } catch (error) {
    console.error('Error listando salidas:', error);
    res.status(500).json({ message: 'Error al listar salidas' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT s.id, s.cliente_destino, s.destino, s.fecha_despacho, s.estado, s.usuario_id, s.created_at, s.updated_at,
              u.nombre AS usuario_nombre
       FROM salidas s
       LEFT JOIN usuarios u ON u.id = s.usuario_id
       WHERE s.id = $1`,
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Salida no encontrada' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error obteniendo salida:', error);
    res.status(500).json({ message: 'Error al obtener salida' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { cliente_destino, destino, fecha_despacho, estado } = req.body;
    const usuario_id = req.user?.id;
    if (!usuario_id) return res.status(401).json({ message: 'Usuario no autenticado' });
    if (!cliente_destino || !cliente_destino.trim()) return res.status(400).json({ message: 'El cliente destino es requerido' });
    if (!fecha_despacho) return res.status(400).json({ message: 'La fecha de despacho es requerida' });

    const result = await pool.query(
      `INSERT INTO salidas (cliente_destino, destino, fecha_despacho, estado, usuario_id)
       VALUES ($1, $2, $3, COALESCE($4, 'Registrado'), $5)
       RETURNING id, cliente_destino, destino, fecha_despacho, estado, usuario_id, created_at`,
      [cliente_destino.trim(), destino?.trim() || null, fecha_despacho, estado, usuario_id]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creando salida:', error);
    res.status(500).json({ message: 'Error al crear salida' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { cliente_destino, destino, fecha_despacho, estado } = req.body;
    const existing = await pool.query('SELECT id FROM salidas WHERE id = $1', [id]);
    if (existing.rows.length === 0) return res.status(404).json({ message: 'Salida no encontrada' });

    const result = await pool.query(
      `UPDATE salidas SET
         cliente_destino = COALESCE(NULLIF(TRIM($1), ''), cliente_destino),
         destino = $2,
         fecha_despacho = COALESCE($3, fecha_despacho),
         estado = COALESCE($4, estado),
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $5
       RETURNING id, cliente_destino, destino, fecha_despacho, estado, usuario_id, updated_at`,
      [cliente_destino, destino?.trim() ?? null, fecha_despacho, estado, id]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error actualizando salida:', error);
    res.status(500).json({ message: 'Error al actualizar salida' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM salidas WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Salida no encontrada' });
    res.json({ message: 'Salida eliminada correctamente' });
  } catch (error) {
    console.error('Error eliminando salida:', error);
    res.status(500).json({ message: 'Error al eliminar salida' });
  }
});

export default router;
