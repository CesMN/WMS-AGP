import jwt from 'jsonwebtoken';

const sseClientsByUser = new Map(); // userId -> Set(res)
let ensurePromise = null;

function writeSse(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

export function addSseClient(userId, res) {
  const key = String(userId || '').trim();
  if (!key) return;
  if (!sseClientsByUser.has(key)) sseClientsByUser.set(key, new Set());
  sseClientsByUser.get(key).add(res);
}

export function removeSseClient(userId, res) {
  const key = String(userId || '').trim();
  const set = sseClientsByUser.get(key);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) sseClientsByUser.delete(key);
}

export function broadcastToUsers(userIds, payload) {
  const ids = Array.isArray(userIds) ? userIds : [];
  for (const uid of ids) {
    const set = sseClientsByUser.get(String(uid));
    if (!set || set.size === 0) continue;
    for (const res of set) {
      writeSse(res, 'notification', payload);
    }
  }
}

export function verifyTokenFromRequest(req) {
  const authHeader = req.headers.authorization || '';
  const headerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const queryToken = String(req.query?.token || '').trim();
  const token = headerToken || queryToken;
  if (!token) return null;
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
}

export async function ensureNotificacionesTables(clientOrPool) {
  if (!ensurePromise) {
    const client = clientOrPool;
    ensurePromise = (async () => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS notificaciones (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          tipo VARCHAR(120) NOT NULL,
          modulo VARCHAR(120) NOT NULL,
          severidad VARCHAR(20) NOT NULL DEFAULT 'info'
            CHECK (severidad IN ('info', 'success', 'warning', 'error')),
          titulo VARCHAR(255) NOT NULL,
          mensaje TEXT,
          origen_tabla VARCHAR(80),
          origen_id VARCHAR(80),
          metadata JSONB NOT NULL DEFAULT '{}'::jsonb
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS notificaciones_usuarios (
          notificacion_id UUID NOT NULL REFERENCES notificaciones(id) ON DELETE CASCADE,
          usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
          leida_at TIMESTAMPTZ,
          descartada_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (notificacion_id, usuario_id)
        )
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_notificaciones_fecha ON notificaciones (created_at DESC)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_notificaciones_modulo ON notificaciones (modulo)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_notif_usuario_estado ON notificaciones_usuarios (usuario_id, leida_at, descartada_at)`);
    })().catch((e) => {
      ensurePromise = null;
      throw e;
    });
  }
  return ensurePromise;
}

async function resolveTargetUserIds(client, targetUserIds) {
  if (Array.isArray(targetUserIds) && targetUserIds.length > 0) {
    return targetUserIds.map((v) => String(v)).filter(Boolean);
  }
  const u = await client.query(`SELECT id FROM usuarios WHERE activo = true`);
  return (u.rows || []).map((r) => r.id);
}

export async function emitirNotificacion(clientOrPool, payload, options = {}) {
  const client = clientOrPool;
  await ensureNotificacionesTables(client);
  const {
    tipo,
    modulo,
    severidad = 'info',
    titulo,
    mensaje = null,
    origen_tabla = null,
    origen_id = null,
    metadata = {},
  } = payload || {};
  if (!tipo || !modulo || !titulo) return null;

  const notifQ = await client.query(
    `INSERT INTO notificaciones
      (tipo, modulo, severidad, titulo, mensaje, origen_tabla, origen_id, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING id, created_at, tipo, modulo, severidad, titulo, mensaje, origen_tabla, origen_id, metadata`,
    [tipo, modulo, severidad, titulo, mensaje, origen_tabla, origen_id ? String(origen_id) : null, metadata || {}]
  );
  const notif = notifQ.rows[0];
  const targetUserIds = await resolveTargetUserIds(client, options.targetUserIds);
  if (targetUserIds.length > 0) {
    await client.query(
      `INSERT INTO notificaciones_usuarios (notificacion_id, usuario_id)
       SELECT $1::uuid, u.id
       FROM usuarios u
       WHERE u.id = ANY($2::uuid[])
       ON CONFLICT (notificacion_id, usuario_id) DO NOTHING`,
      [notif.id, targetUserIds]
    );
    broadcastToUsers(targetUserIds, { ...notif, unread_delta: 1 });
  }
  return notif;
}

export async function emitirBajoMinimoInsumos(clientOrPool, { insumoId, codigo, nombre, stockActual, stockMinimo }) {
  const client = clientOrPool;
  await ensureNotificacionesTables(client);
  if (!insumoId) return null;
  const dedupeQ = await client.query(
    `SELECT n.id
     FROM notificaciones n
     WHERE n.tipo = 'insumo_bajo_minimo'
       AND n.origen_tabla = 'insumos'
       AND n.origen_id = $1
       AND n.created_at > NOW() - INTERVAL '6 hours'
     LIMIT 1`,
    [String(insumoId)]
  );
  if (dedupeQ.rows.length > 0) return null;
  return emitirNotificacion(client, {
    tipo: 'insumo_bajo_minimo',
    modulo: 'Insumos',
    severidad: 'warning',
    titulo: `Insumo bajo minimo: ${codigo || nombre || 'Insumo'}`,
    mensaje: `Stock actual ${Number(stockActual || 0)} por debajo del minimo ${Number(stockMinimo || 0)}.`,
    origen_tabla: 'insumos',
    origen_id: String(insumoId),
    metadata: {
      insumo_id: insumoId,
      codigo: codigo || null,
      nombre: nombre || null,
      stock_actual: Number(stockActual || 0),
      stock_minimo: Number(stockMinimo || 0),
    },
  });
}

export function prepararSse(res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  writeSse(res, 'hello', { ok: true, ts: Date.now() });
}
