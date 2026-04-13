import express from 'express';
import { pool } from '../config/database.js';
import { authenticateToken, checkPermission } from '../middleware/auth.middleware.js';

const router = express.Router();
router.use(authenticateToken);
router.use(checkPermission('admin.registro_actividad', 'view'));

async function loadTableFlags() {
  const meta = await pool.query(`
    SELECT to_regclass('public.insumo_movimiento_documentos') AS ins_doc,
           to_regclass('public.registro_actividad_app') AS app_log
  `);
  return {
    hasInsDoc: !!meta.rows[0]?.ins_doc,
    hasAppLog: !!meta.rows[0]?.app_log,
  };
}

function buildUnionParts({ hasInsDoc, hasAppLog }) {
  const parts = [];

  parts.push(`
      SELECT
        'mov:' || m.id::text AS event_id,
        m.fecha_hora AS fecha,
        'Almacén'::text AS modulo,
        'Stock físico'::text AS area,
        m.tipo_movimiento::text AS tipo_evento,
        COALESCE(m.motivo, '')::text AS descripcion,
        u.nombre AS usuario_nombre,
        m.usuario_id,
        u.rol::text AS usuario_rol,
        u.email::text AS usuario_email,
        (SELECT COUNT(*)::int FROM movimiento_detalles md WHERE md.movimiento_id = m.id) AS lineas,
        CASE
          WHEN m.tipo_movimiento = 'Ingreso' THEN COALESCE(NULLIF(TRIM(m.numero_guia), ''), '-')
          WHEN m.tipo_movimiento = 'Salida' THEN TRIM(CONCAT(COALESCE(ld.cliente_origen_nombre, ''), CASE WHEN ld.cliente_origen_nombre IS NOT NULL AND ld.cliente_destino IS NOT NULL THEN ' → ' ELSE '' END, COALESCE(ld.cliente_destino, '')))
          ELSE '-'
        END AS referencia_resumen,
        'movimiento'::text AS origen_tabla,
        m.id::text AS origen_id,
        (SELECT COALESCE(SUM(md.cantidad_bultos), 0)::numeric(14,2) FROM movimiento_detalles md WHERE md.movimiento_id = m.id) AS total_bultos,
        (SELECT COALESCE(SUM(md.total_kg), 0)::numeric(14,2) FROM movimiento_detalles md WHERE md.movimiento_id = m.id) AS total_kg,
        (SELECT COUNT(DISTINCT md.producto_id)::int FROM movimiento_detalles md WHERE md.movimiento_id = m.id AND md.producto_id IS NOT NULL) AS productos_distintos,
        (SELECT LEFT(string_agg(DISTINCT p.codigo, ', ' ORDER BY p.codigo), 500) FROM movimiento_detalles md LEFT JOIN productos p ON p.id = md.producto_id WHERE md.movimiento_id = m.id) AS productos_codigos,
        jsonb_build_object(
          'fuente', 'movimiento',
          'movimiento_id', m.id,
          'tipo_movimiento', m.tipo_movimiento,
          'numero_guia', m.numero_guia,
          'motivo', LEFT(COALESCE(m.motivo, ''), 2000)
        ) AS metadata
      FROM movimientos m
      JOIN usuarios u ON u.id = m.usuario_id
      LEFT JOIN LATERAL (
        SELECT d_inner.cliente_destino, c_o.nombre AS cliente_origen_nombre
        FROM despachos d_inner
        LEFT JOIN clientes c_o ON c_o.id = d_inner.cliente_origen_id
        WHERE d_inner.movimiento_id = m.id
        ORDER BY d_inner.created_at DESC NULLS LAST
        LIMIT 1
      ) ld ON true
  `);

  parts.push(`
      SELECT
        'desp:' || d.id::text AS event_id,
        COALESCE(d.updated_at, d.created_at) AS fecha,
        'Despachos'::text AS modulo,
        'Salidas / logística'::text AS area,
        (COALESCE(d.tipo_salida, '') || ' · ' || COALESCE(d.estado, ''))::text AS tipo_evento,
        COALESCE(NULLIF(TRIM(d.observaciones), ''), TRIM(CONCAT(COALESCE(d.cliente_destino, ''), ' ', COALESCE(d.guia_salida, ''))))::text AS descripcion,
        u.nombre AS usuario_nombre,
        d.usuario_id,
        u.rol::text AS usuario_rol,
        u.email::text AS usuario_email,
        (SELECT COUNT(*)::int FROM despacho_detalles dd WHERE dd.despacho_id = d.id) AS lineas,
        COALESCE(NULLIF(TRIM(d.guia_salida), ''), NULLIF(TRIM(d.cliente_destino), ''), '-')::text AS referencia_resumen,
        'despacho'::text AS origen_tabla,
        d.id::text AS origen_id,
        (SELECT COALESCE(SUM(dd.cantidad_bultos), 0)::numeric(14,2) FROM despacho_detalles dd WHERE dd.despacho_id = d.id) AS total_bultos,
        (SELECT COALESCE(SUM(dd.total_kg), 0)::numeric(14,2) FROM despacho_detalles dd WHERE dd.despacho_id = d.id) AS total_kg,
        (SELECT COUNT(DISTINCT sp.producto_id)::int
         FROM despacho_detalles dd
         JOIN stock_posiciones sp ON sp.id = dd.stock_posicion_id
         WHERE dd.despacho_id = d.id) AS productos_distintos,
        (SELECT LEFT(string_agg(DISTINCT p.codigo, ', ' ORDER BY p.codigo), 500)
         FROM despacho_detalles dd
         JOIN stock_posiciones sp ON sp.id = dd.stock_posicion_id
         JOIN productos p ON p.id = sp.producto_id
         WHERE dd.despacho_id = d.id) AS productos_codigos,
        jsonb_build_object(
          'fuente', 'despacho',
          'despacho_id', d.id,
          'estado', d.estado,
          'tipo_salida', d.tipo_salida,
          'guia_salida', d.guia_salida,
          'cliente_destino', d.cliente_destino,
          'destino', d.destino,
          'orden_produccion', d.orden_produccion,
          'contenedor', d.contenedor
        ) AS metadata
      FROM despachos d
      JOIN usuarios u ON u.id = d.usuario_id
  `);

  if (hasInsDoc) {
    parts.push(`
      SELECT
        'ins_doc:' || d.id::text AS event_id,
        COALESCE(d.created_at, d.fecha_movimiento::timestamp) AS fecha,
        'Insumos'::text AS modulo,
        'Documentos de movimiento'::text AS area,
        (d.tipo::text || ' · documento')::text AS tipo_evento,
        COALESCE(NULLIF(TRIM(d.observaciones), ''), NULLIF(TRIM(d.referencia), ''), '(sin texto)')::text AS descripcion,
        u.nombre AS usuario_nombre,
        d.usuario_id,
        u.rol::text AS usuario_rol,
        u.email::text AS usuario_email,
        (SELECT COUNT(*)::int FROM insumo_movimientos m WHERE m.documento_id = d.id) AS lineas,
        COALESCE(NULLIF(TRIM(d.referencia), ''), '-')::text AS referencia_resumen,
        'insumo_documento'::text AS origen_tabla,
        d.id::text AS origen_id,
        (SELECT COALESCE(SUM(m.cantidad), 0)::numeric(14,3) FROM insumo_movimientos m WHERE m.documento_id = d.id) AS total_bultos,
        NULL::numeric(14,2) AS total_kg,
        (SELECT COUNT(DISTINCT m.insumo_id)::int FROM insumo_movimientos m WHERE m.documento_id = d.id) AS productos_distintos,
        (SELECT LEFT(string_agg(DISTINCT i.nombre, ', ' ORDER BY i.nombre), 500)
         FROM insumo_movimientos m
         JOIN insumos i ON i.id = m.insumo_id
         WHERE m.documento_id = d.id) AS productos_codigos,
        jsonb_build_object(
          'fuente', 'insumo_documento',
          'documento_id', d.id,
          'tipo', d.tipo,
          'referencia', d.referencia,
          'fecha_movimiento', d.fecha_movimiento
        ) AS metadata
      FROM insumo_movimiento_documentos d
      JOIN usuarios u ON u.id = d.usuario_id
    `);
  }

  if (hasAppLog) {
    parts.push(`
      SELECT
        'log:' || r.id::text AS event_id,
        r.created_at AS fecha,
        r.modulo::text AS modulo,
        COALESCE(r.area, 'Sistema')::text AS area,
        COALESCE(r.tipo_evento, 'Evento')::text AS tipo_evento,
        COALESCE(r.descripcion, '')::text AS descripcion,
        u.nombre AS usuario_nombre,
        r.usuario_id,
        u.rol::text AS usuario_rol,
        u.email::text AS usuario_email,
        0::int AS lineas,
        COALESCE(r.referencia_resumen, '-')::text AS referencia_resumen,
        COALESCE(r.origen_tabla, 'app_log')::text AS origen_tabla,
        COALESCE(r.origen_id, r.id::text)::text AS origen_id,
        NULL::numeric(14,2) AS total_bultos,
        NULL::numeric(14,2) AS total_kg,
        0::int AS productos_distintos,
        NULL::text AS productos_codigos,
        COALESCE(r.metadata, '{}'::jsonb) || jsonb_build_object('fuente', 'app_log', 'registro_id', r.id) AS metadata
      FROM registro_actividad_app r
      LEFT JOIN usuarios u ON u.id = r.usuario_id
    `);
  }

  return parts.join(' UNION ALL ');
}

function appendFilters(where, params, query) {
  let n = params.length + 1;
  const { moduloFilter, q, fecha_desde, fecha_hasta, usuario_id, usuario_rol, origen_tabla } = query;

  if (moduloFilter) {
    where.push(`uni.modulo = $${n}`);
    params.push(moduloFilter);
    n++;
  }
  if (fecha_desde) {
    where.push(`uni.fecha::date >= $${n}`);
    params.push(fecha_desde);
    n++;
  }
  if (fecha_hasta) {
    where.push(`uni.fecha::date <= $${n}`);
    params.push(fecha_hasta);
    n++;
  }
  if (usuario_id) {
    where.push(`uni.usuario_id = $${n}`);
    params.push(usuario_id);
    n++;
  }
  if (usuario_rol) {
    where.push(`uni.usuario_rol = $${n}`);
    params.push(usuario_rol);
    n++;
  }
  if (origen_tabla) {
    where.push(`uni.origen_tabla = $${n}`);
    params.push(origen_tabla);
    n++;
  }
  if (q) {
    where.push(`(
      uni.descripcion ILIKE $${n} OR uni.tipo_evento ILIKE $${n}
      OR uni.referencia_resumen ILIKE $${n} OR uni.area ILIKE $${n}
      OR uni.modulo ILIKE $${n} OR uni.usuario_nombre ILIKE $${n}
      OR uni.usuario_email ILIKE $${n} OR uni.productos_codigos ILIKE $${n}
    )`);
    params.push(`%${q}%`);
    n++;
  }
  return n;
}

/**
 * GET /api/admin/actividad
 */
router.get('/', async (req, res) => {
  try {
    const {
      modulo: moduloFilter,
      q: qRaw,
      fecha_desde,
      fecha_hasta,
      usuario_id,
      usuario_rol: usuarioRolQ,
      origen_tabla: origenTablaQ,
      limit = 50,
      offset = 0,
      orden = 'desc',
    } = req.query;
    const limitNum = Math.min(parseInt(limit, 10) || 50, 500);
    const offsetNum = Math.max(0, parseInt(offset, 10) || 0);
    const q = qRaw != null ? String(qRaw).trim() : '';
    const modF = moduloFilter != null ? String(moduloFilter).trim() : '';
    const ordenSql = String(orden).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    const { hasInsDoc, hasAppLog } = await loadTableFlags();
    const unionSql = buildUnionParts({ hasInsDoc, hasAppLog });

    const params = [];
    const where = ['1=1'];
    appendFilters(where, params, {
      moduloFilter: modF,
      q,
      fecha_desde,
      fecha_hasta,
      usuario_id,
      usuario_rol: usuarioRolQ,
      origen_tabla: origenTablaQ,
    });

    const whereSql = where.join(' AND ');
    const baseFrom = `FROM (${unionSql}) AS uni`;

    const countQ = await pool.query(`SELECT COUNT(*)::int AS total ${baseFrom} WHERE ${whereSql}`, params);
    const total = parseInt(countQ.rows[0]?.total, 10) || 0;

    const limIdx = params.length + 1;
    const offIdx = params.length + 2;
    const listParams = [...params, limitNum, offsetNum];

    const result = await pool.query(
      `SELECT uni.event_id, uni.fecha, uni.modulo, uni.area, uni.tipo_evento, uni.descripcion,
              uni.usuario_nombre, uni.usuario_id, uni.usuario_rol, uni.usuario_email,
              uni.lineas, uni.referencia_resumen, uni.origen_tabla, uni.origen_id,
              uni.total_bultos, uni.total_kg, uni.productos_distintos, uni.productos_codigos,
              uni.metadata
       ${baseFrom}
       WHERE ${whereSql}
       ORDER BY uni.fecha ${ordenSql}
       LIMIT $${limIdx} OFFSET $${offIdx}`,
      listParams
    );

    const modulos = ['Almacén', 'Despachos', 'Insumos', 'Sistema'].filter((label) => {
      if (label === 'Insumos' && !hasInsDoc) return false;
      if (label === 'Sistema' && !hasAppLog) return false;
      return true;
    });

    res.json({
      data: result.rows,
      total,
      modulos,
      origenes: [
        { value: 'movimiento', label: 'Movimiento stock' },
        { value: 'despacho', label: 'Despacho' },
        ...(hasInsDoc ? [{ value: 'insumo_documento', label: 'Documento insumos' }] : []),
        ...(hasAppLog ? [{ value: 'app_log', label: 'Registro sistema' }] : []),
      ],
    });
  } catch (error) {
    console.error('Error listando actividad global:', error);
    res.status(500).json({ message: 'Error al cargar el registro de actividad' });
  }
});

/**
 * GET /api/admin/actividad/resumen
 * Mismos filtros que listado; devuelve agregados para panel analítico.
 */
router.get('/resumen', async (req, res) => {
  try {
    const {
      modulo: moduloFilter,
      q: qRaw,
      fecha_desde,
      fecha_hasta,
      usuario_id,
      usuario_rol: usuarioRolQ,
      origen_tabla: origenTablaQ,
    } = req.query;
    const q = qRaw != null ? String(qRaw).trim() : '';
    const modF = moduloFilter != null ? String(moduloFilter).trim() : '';

    const { hasInsDoc, hasAppLog } = await loadTableFlags();
    const unionSql = buildUnionParts({ hasInsDoc, hasAppLog });

    const params = [];
    const where = ['1=1'];
    appendFilters(where, params, {
      moduloFilter: modF,
      q,
      fecha_desde,
      fecha_hasta,
      usuario_id,
      usuario_rol: usuarioRolQ,
      origen_tabla: origenTablaQ,
    });
    const whereSql = where.join(' AND ');
    const baseFrom = `FROM (${unionSql}) AS uni WHERE ${whereSql}`;

    const [
      totalQ,
      usuariosUnicosQ,
      porModuloQ,
      porUsuarioQ,
      porDiaQ,
      porHoraQ,
      rolesQ,
    ] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS n ${baseFrom}`, params),
      pool.query(`SELECT COUNT(DISTINCT uni.usuario_id)::int AS n ${baseFrom}`, params),
      pool.query(
        `SELECT uni.modulo, COUNT(*)::int AS n
         ${baseFrom}
         GROUP BY uni.modulo
         ORDER BY n DESC`,
        params
      ),
      pool.query(
        `SELECT uni.usuario_id, uni.usuario_nombre, uni.usuario_rol, COUNT(*)::int AS n
         ${baseFrom}
         GROUP BY uni.usuario_id, uni.usuario_nombre, uni.usuario_rol
         ORDER BY n DESC
         LIMIT 25`,
        params
      ),
      pool.query(
        `SELECT uni.fecha::date AS dia, COUNT(*)::int AS n
         ${baseFrom}
         GROUP BY uni.fecha::date
         ORDER BY dia DESC
         LIMIT 21`,
        params
      ),
      pool.query(
        `SELECT EXTRACT(HOUR FROM uni.fecha)::int AS hora, COUNT(*)::int AS n
         ${baseFrom}
         GROUP BY EXTRACT(HOUR FROM uni.fecha)
         ORDER BY hora`,
        params
      ),
      pool.query(
        `SELECT uni.usuario_rol, COUNT(*)::int AS n
         ${baseFrom}
         GROUP BY uni.usuario_rol
         ORDER BY n DESC`,
        params
      ),
    ]);

    res.json({
      total_eventos: parseInt(totalQ.rows[0]?.n, 10) || 0,
      usuarios_distintos: parseInt(usuariosUnicosQ.rows[0]?.n, 10) || 0,
      por_modulo: porModuloQ.rows,
      por_usuario: porUsuarioQ.rows,
      por_dia: porDiaQ.rows,
      por_hora_utc: porHoraQ.rows,
      por_rol: rolesQ.rows,
    });
  } catch (error) {
    console.error('Error resumen actividad:', error);
    res.status(500).json({ message: 'Error al cargar el resumen de actividad' });
  }
});

export default router;
