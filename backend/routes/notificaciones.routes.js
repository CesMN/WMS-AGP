import express from 'express';
import { pool } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { addSseClient, ensureNotificacionesTables, prepararSse, removeSseClient, verifyTokenFromRequest } from '../utils/notificaciones.js';

const router = express.Router();

router.get('/stream', (req, res) => {
  const user = verifyTokenFromRequest(req);
  if (!user?.id) {
    return res.status(401).json({ message: 'Token inválido para stream' });
  }
  const userId = String(user.id);
  prepararSse(res);
  addSseClient(userId, res);
  const ping = setInterval(() => {
    res.write(`event: ping\ndata: {"ts":${Date.now()}}\n\n`);
  }, 25000);
  req.on('close', () => {
    clearInterval(ping);
    removeSseClient(userId, res);
  });
});

router.use(authenticateToken);

router.get('/', async (req, res) => {
  try {
    await ensureNotificacionesTables(pool);
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'No autenticado' });
    const { estado, modulo, limit = 20, offset = 0 } = req.query;
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 20));
    const offsetNum = Math.max(0, parseInt(offset, 10) || 0);
    const params = [userId];
    const where = ['nu.usuario_id = $1', 'nu.descartada_at IS NULL'];
    let n = 2;
    if (modulo && String(modulo).trim()) {
      where.push(`n.modulo = $${n++}`);
      params.push(String(modulo).trim());
    }
    if (estado === 'unread') where.push('nu.leida_at IS NULL');
    if (estado === 'read') where.push('nu.leida_at IS NOT NULL');
    params.push(limitNum, offsetNum);
    const q = await pool.query(
      `SELECT n.id, n.created_at, n.tipo, n.modulo, n.severidad, n.titulo, n.mensaje,
              n.origen_tabla, n.origen_id, n.metadata, nu.leida_at
       FROM notificaciones n
       JOIN notificaciones_usuarios nu ON nu.notificacion_id = n.id
       WHERE ${where.join(' AND ')}
       ORDER BY n.created_at DESC
       LIMIT $${n++} OFFSET $${n++}`,
      params
    );
    const totalQ = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM notificaciones n
       JOIN notificaciones_usuarios nu ON nu.notificacion_id = n.id
       WHERE ${where.join(' AND ')}`,
      params.slice(0, n - 3)
    );
    res.json({ data: q.rows, total: totalQ.rows[0]?.total || 0 });
  } catch (error) {
    console.error('Error listando notificaciones:', error);
    res.status(500).json({ message: 'Error al listar notificaciones' });
  }
});

router.get('/resumen', async (req, res) => {
  try {
    await ensureNotificacionesTables(pool);
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'No autenticado' });
    const base = await pool.query(
      `SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE nu.leida_at IS NULL)::int AS unread
       FROM notificaciones_usuarios nu
       JOIN notificaciones n ON n.id = nu.notificacion_id
       WHERE nu.usuario_id = $1 AND nu.descartada_at IS NULL`,
      [userId]
    );
    const mod = await pool.query(
      `SELECT n.modulo, COUNT(*)::int AS n
       FROM notificaciones_usuarios nu
       JOIN notificaciones n ON n.id = nu.notificacion_id
       WHERE nu.usuario_id = $1 AND nu.descartada_at IS NULL
       GROUP BY n.modulo
       ORDER BY n DESC, n.modulo ASC`,
      [userId]
    );
    res.json({
      total: base.rows[0]?.total || 0,
      unread: base.rows[0]?.unread || 0,
      por_modulo: mod.rows || [],
    });
  } catch (error) {
    console.error('Error resumen notificaciones:', error);
    res.status(500).json({ message: 'Error al obtener resumen de notificaciones' });
  }
});

router.patch('/:id/leida', async (req, res) => {
  try {
    await ensureNotificacionesTables(pool);
    const userId = req.user?.id;
    const { id } = req.params;
    await pool.query(
      `UPDATE notificaciones_usuarios
       SET leida_at = COALESCE(leida_at, CURRENT_TIMESTAMP)
       WHERE usuario_id = $1 AND notificacion_id = $2`,
      [userId, id]
    );
    res.json({ ok: true });
  } catch (error) {
    console.error('Error marcando notificación leída:', error);
    res.status(500).json({ message: 'Error al marcar como leída' });
  }
});

router.patch('/marcar-todas-leidas', async (req, res) => {
  try {
    await ensureNotificacionesTables(pool);
    const userId = req.user?.id;
    await pool.query(
      `UPDATE notificaciones_usuarios
       SET leida_at = COALESCE(leida_at, CURRENT_TIMESTAMP)
       WHERE usuario_id = $1 AND descartada_at IS NULL`,
      [userId]
    );
    res.json({ ok: true });
  } catch (error) {
    console.error('Error marcando todas leídas:', error);
    res.status(500).json({ message: 'Error al marcar todas como leídas' });
  }
});

router.patch('/:id/descartar', async (req, res) => {
  try {
    await ensureNotificacionesTables(pool);
    const userId = req.user?.id;
    const { id } = req.params;
    await pool.query(
      `UPDATE notificaciones_usuarios
       SET descartada_at = COALESCE(descartada_at, CURRENT_TIMESTAMP)
       WHERE usuario_id = $1 AND notificacion_id = $2`,
      [userId, id]
    );
    res.json({ ok: true });
  } catch (error) {
    console.error('Error descartando notificación:', error);
    res.status(500).json({ message: 'Error al descartar notificación' });
  }
});

router.patch('/descartar-todas', async (req, res) => {
  try {
    await ensureNotificacionesTables(pool);
    const userId = req.user?.id;
    await pool.query(
      `UPDATE notificaciones_usuarios
       SET descartada_at = COALESCE(descartada_at, CURRENT_TIMESTAMP)
       WHERE usuario_id = $1 AND descartada_at IS NULL`,
      [userId]
    );
    res.json({ ok: true });
  } catch (error) {
    console.error('Error descartando todas las notificaciones:', error);
    res.status(500).json({ message: 'Error al descartar todas las notificaciones' });
  }
});

export default router;
