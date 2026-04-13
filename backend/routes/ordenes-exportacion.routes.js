import express from 'express';
import { pool } from '../config/database.js';
import { authenticateToken, checkPermission, checkRole } from '../middleware/auth.middleware.js';
import { emitirNotificacion } from '../utils/notificaciones.js';

const router = express.Router();
router.use(authenticateToken);

/** Índice 1-based → A, B, … Z, AA, AB (estilo Excel). */
function indexToLetter(i) {
  let n = Math.max(1, Math.floor(Number(i) || 1));
  let s = '';
  while (n > 0) {
    n -= 1;
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
}

/** Suma en contenedores = cantidad solicitada por línea (solo totales por producto, sin lotes). */
/**
 * Fragmento SQL (requiere alias `oe`, `c` y `rl.referencia_linea` en el FROM) que evalúa si ya existe
 * un despacho Embarque en estado Despachado vinculado a la OP y a la referencia en observaciones
 * (mismo criterio que «Generado desde Listos para despacho. Referencia: …»).
 */
function sqlEmbarqueDespachoFisicoCerrado() {
  return `EXISTS (
    SELECT 1 FROM despachos d
    WHERE d.tipo_salida = 'Embarque'
      AND TRIM(COALESCE(d.orden_produccion, '')) = TRIM(COALESCE(oe.numero_op::text, ''))
      AND TRIM(COALESCE(d.estado, '')) = 'Despachado'
      AND TRIM(COALESCE(
        NULLIF(TRIM(oe.referencia_exportacion), ''),
        NULLIF(TRIM(c.referencia_exportacion), ''),
        rl.referencia_linea,
        oe.numero_op::text
      )) <> ''
      AND COALESCE(d.observaciones, '') ILIKE ('%Referencia: ' || TRIM(COALESCE(
        NULLIF(TRIM(oe.referencia_exportacion), ''),
        NULLIF(TRIM(c.referencia_exportacion), ''),
        rl.referencia_linea,
        oe.numero_op::text
      )) || '%')
  )`;
}

/** Condición sobre fila contenedor + oe + rl: no desvincular asignaciones de stock si ya hay referencia / listos / despacho cerrado. */
function sqlContenedorBloqueaDesvinculacionAsignaciones() {
  return `(c.despachado_at IS NOT NULL OR c.listo_para_exportar = TRUE OR (${sqlEmbarqueDespachoFisicoCerrado()}))`;
}

async function computeDistribucionBalanceOk(pool, ordenId) {
  const lineas = await pool.query(
    `SELECT oel.id, oel.cantidad_solicitada
     FROM ordenes_exportacion_lineas oel
     WHERE oel.orden_exportacion_id = $1`,
    [ordenId]
  );
  if (lineas.rows.length === 0) return false;

  const eps = 1e-6;
  for (const ln of lineas.rows) {
    const sumQ = await pool.query(
      `SELECT COALESCE(SUM(cc.cantidad_bultos), 0)::NUMERIC AS s
       FROM ordenes_exportacion_contenedor_contenido cc
       JOIN ordenes_exportacion_contenedores c ON c.id = cc.contenedor_id
       WHERE c.orden_exportacion_id = $1 AND cc.linea_id = $2 AND cc.asignacion_id IS NULL`,
      [ordenId, ln.id]
    );
    const s = Number(sumQ.rows[0]?.s) || 0;
    const sol = Number(ln.cantidad_solicitada) || 0;
    if (Math.abs(s - sol) > eps) return false;
  }
  return true;
}

/** Líneas de un despacho (misma lógica que GET /api/despachos/:id) para resumen de embarque. */
async function fetchDespachoLineasEmbarque(pool, despachoId, movimientoId) {
  let lineas = [];
  let total_bultos_despacho = null;
  let total_kg_despacho = null;
  let total_adicional_despacho = null;
  const FACTOR_LB_A_KG = 2.2046;
  if (movimientoId) {
    const totalesMov = await pool.query(
      `SELECT COALESCE(SUM(md.cantidad_bultos), 0)::NUMERIC(14, 2) AS total_bultos,
              COALESCE(SUM(md.total_kg), 0)::NUMERIC(12,2) AS total_kg,
              COALESCE(SUM(md.peso_adicional), 0)::NUMERIC(12,2) AS total_adicional
       FROM movimiento_detalles md WHERE md.movimiento_id = $1`,
      [movimientoId]
    );
    total_bultos_despacho = Number(totalesMov.rows[0]?.total_bultos) || 0;
    total_kg_despacho = Number(totalesMov.rows[0]?.total_kg) || 0;
    total_adicional_despacho = Number(totalesMov.rows[0]?.total_adicional) || 0;
    const movDet = await pool.query(
      `SELECT md.id, md.producto_id, md.cantidad_bultos, md.total_kg, md.peso_adicional,
              p.codigo AS producto_codigo, p.producto AS producto_nombre, p.descripcion AS producto_descripcion, p.presentacion AS producto_presentacion,
              p.formato AS formato_producto, p.unidad_medida AS unidad_medida_producto,
              a.nombre AS almacen_nombre, c.nombre AS carril_nombre, n.numero_nivel, pos.numero_posicion,
              sp.lote
       FROM movimiento_detalles md
       JOIN productos p ON p.id = md.producto_id
       LEFT JOIN stock_posiciones sp ON sp.id = md.stock_posicion_id
       LEFT JOIN almacenes a ON a.id = md.almacen_id
       LEFT JOIN carriles c ON c.id = md.carril_id
       LEFT JOIN niveles n ON n.id = md.nivel_id
       LEFT JOIN posiciones pos ON pos.id = md.posicion_id
       WHERE md.movimiento_id = $1 ORDER BY md.id`,
      [movimientoId]
    );
    lineas = movDet.rows.map((r) => {
      const bultos = Number(r.cantidad_bultos) || 0;
      const adicional = Number(r.peso_adicional) || 0;
      const formato = parseFloat(r.formato_producto != null ? r.formato_producto : r.formato) || 0;
      const rawUnidad = r.unidad_medida_producto != null ? r.unidad_medida_producto : (r.unidad_medida || 'KG');
      const unidadMedida = String(rawUnidad).toUpperCase();
      let kgBultos = bultos * formato;
      if (unidadMedida === 'LB') kgBultos = kgBultos / FACTOR_LB_A_KG;
      const totalKgLinea = Math.round((kgBultos + adicional) * 100) / 100;
      return {
        id: r.id,
        cantidad_bultos: bultos,
        total_kg: totalKgLinea,
        peso_adicional: adicional,
        formato,
        unidad_medida: unidadMedida,
        producto_codigo: r.producto_codigo,
        producto_nombre: r.producto_nombre,
        producto_descripcion: r.producto_descripcion || '',
        producto_presentacion: r.producto_presentacion || '',
        ubicacion: r.almacen_nombre ? `${r.almacen_nombre} → ${r.carril_nombre} → N${r.numero_nivel} → P${r.numero_posicion}` : '-',
        lote: r.lote || '',
      };
    });
  } else {
    const dd = await pool.query(
      `SELECT dd.id, dd.stock_posicion_id, dd.cantidad_bultos, dd.total_kg, dd.peso_adicional,
              s.cantidad_bultos AS stock_cantidad_bultos, s.total_kg AS stock_total_kg, s.lote,
              p.codigo AS producto_codigo, p.producto AS producto_nombre, p.descripcion AS producto_descripcion,
              p.formato, p.unidad_medida,
              a.nombre AS almacen_nombre, c.nombre AS carril_nombre, n.numero_nivel, pos.numero_posicion
       FROM despacho_detalles dd
       JOIN stock_posiciones s ON s.id = dd.stock_posicion_id
       JOIN productos p ON p.id = s.producto_id
       JOIN posiciones pos ON pos.id = s.posicion_id
       JOIN niveles n ON n.id = pos.nivel_id
       JOIN carriles c ON c.id = n.carril_id
       JOIN almacenes a ON a.id = c.almacen_id
       WHERE dd.despacho_id = $1 ORDER BY dd.id`,
      [despachoId]
    );
    lineas = dd.rows.map((r) => ({
      id: r.id,
      stock_posicion_id: r.stock_posicion_id,
      cantidad_bultos: Number(r.cantidad_bultos),
      total_kg: Number(r.total_kg),
      peso_adicional: Number(r.peso_adicional) || 0,
      stock_cantidad_bultos: r.stock_cantidad_bultos != null ? Number(r.stock_cantidad_bultos) : null,
      stock_total_kg: r.stock_total_kg != null ? Number(r.stock_total_kg) : null,
      lote: r.lote || '',
      formato: Number(r.formato),
      unidad_medida: r.unidad_medida || 'KG',
      producto_codigo: r.producto_codigo,
      producto_nombre: r.producto_nombre,
      producto_descripcion: r.producto_descripcion || '',
      ubicacion: `${r.almacen_nombre} → ${r.carril_nombre} → N${r.numero_nivel} → P${r.numero_posicion}`,
    }));
  }
  return { lineas, total_bultos_despacho, total_kg_despacho, total_adicional_despacho };
}

function limpiarPrefijoReferenciaLinea(s) {
  if (s == null) return null;
  const raw = String(s).trim();
  if (!raw) return null;
  const firstSeg = raw.split(';').map((x) => x.trim()).find(Boolean) || '';
  if (!firstSeg) return null;
  return firstSeg.replace(/\s+[A-Za-z]{1,3}\s*$/i, '').trim() || null;
}

function extraerReferenciaDesdeObservacionesDespacho(obs) {
  if (obs == null) return null;
  const m = String(obs).match(/Referencia:\s*([A-Za-z0-9](?:[A-Za-z0-9\-]*[A-Za-z0-9])?)/i);
  return m ? m[1].trim() : null;
}

async function resolverReferenciasVisiblesEmbarque(pool, ordenId, orden, despachosOrdenados) {
  let refEmbarque = orden.referencia_embarque != null ? String(orden.referencia_embarque).trim() : '';
  let refExport = orden.referencia_exportacion != null ? String(orden.referencia_exportacion).trim() : '';

  if (!refEmbarque) {
    const lr = await pool.query(
      `SELECT oel.referencia_embarque FROM ordenes_exportacion_lineas oel WHERE oel.orden_exportacion_id = $1`,
      [ordenId]
    );
    for (const r of lr.rows) {
      const x = limpiarPrefijoReferenciaLinea(r.referencia_embarque);
      if (x) {
        refEmbarque = x;
        break;
      }
    }
  }
  if (!refEmbarque && despachosOrdenados.length) {
    for (const d of despachosOrdenados) {
      const x = extraerReferenciaDesdeObservacionesDespacho(d.observaciones);
      if (x) {
        refEmbarque = x;
        break;
      }
    }
  }

  if (!refExport) {
    const cr = await pool.query(
      `SELECT NULLIF(TRIM(MIN(c.referencia_exportacion)), '') AS r
       FROM ordenes_exportacion_contenedores c
       WHERE c.orden_exportacion_id = $1 AND TRIM(COALESCE(c.referencia_exportacion, '')) <> ''`,
      [ordenId]
    );
    if (cr.rows[0]?.r) refExport = String(cr.rows[0].r).trim();
  }
  if (!refExport && refEmbarque) refExport = refEmbarque;

  return {
    referencia_embarque_resuelta: refEmbarque || null,
    referencia_exportacion_resuelta: refExport || null,
  };
}

async function syncContenedoresForOrden(client, ordenId, cantidadContenedores) {
  const c = Math.min(702, Math.max(1, parseInt(cantidadContenedores, 10) || 1));
  await client.query(
    `DELETE FROM ordenes_exportacion_contenedor_contenido WHERE contenedor_id IN (
       SELECT id FROM ordenes_exportacion_contenedores WHERE orden_exportacion_id = $1 AND indice > $2
     )`,
    [ordenId, c]
  );
  await client.query(
    `DELETE FROM ordenes_exportacion_contenedores WHERE orden_exportacion_id = $1 AND indice > $2`,
    [ordenId, c]
  );
  const existing = await client.query(
    `SELECT id, indice FROM ordenes_exportacion_contenedores WHERE orden_exportacion_id = $1 ORDER BY indice`,
    [ordenId]
  );
  const byIdx = new Map(existing.rows.map((r) => [r.indice, r.id]));
  for (let i = 1; i <= c; i += 1) {
    if (!byIdx.has(i)) {
      const letra = indexToLetter(i);
      await client.query(
        `INSERT INTO ordenes_exportacion_contenedores (orden_exportacion_id, indice, letra) VALUES ($1, $2, $3)`,
        [ordenId, i, letra]
      );
    }
  }
}

// Crear tablas si no existen (clientes_exportacion; orden con cliente exportación, cliente producción, especie)
const initTables = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS clientes_exportacion (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      nombre VARCHAR(255) NOT NULL,
      descripcion TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ordenes_exportacion (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      numero_op VARCHAR(80) UNIQUE NOT NULL,
      fecha_envio_op DATE NOT NULL,
      prioridad INTEGER NOT NULL DEFAULT 1,
      cliente_exportacion_id UUID REFERENCES clientes_exportacion(id),
      cliente_id UUID REFERENCES clientes(id),
      especie_id UUID REFERENCES especies(id),
      destino VARCHAR(255),
      estado VARCHAR(40) DEFAULT 'Pendiente',
      referencia_embarque VARCHAR(120),
      notificado_at TIMESTAMP,
      usuario_id UUID REFERENCES usuarios(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  const cols = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ordenes_exportacion'`);
  const names = (cols.rows || []).map((r) => r.column_name);
  if (!names.includes('cliente_exportacion_id')) {
    await pool.query('ALTER TABLE ordenes_exportacion ADD COLUMN cliente_exportacion_id UUID REFERENCES clientes_exportacion(id)').catch(() => {});
  }
  if (!names.includes('especie_id')) {
    await pool.query('ALTER TABLE ordenes_exportacion ADD COLUMN especie_id UUID REFERENCES especies(id)').catch(() => {});
  }
  if (!names.includes('prioridad')) {
    await pool.query('ALTER TABLE ordenes_exportacion ADD COLUMN prioridad INTEGER NOT NULL DEFAULT 1').catch(() => {});
  }
  await pool.query(`ALTER TABLE ordenes_exportacion ALTER COLUMN prioridad SET DEFAULT 1`).catch(() => {});
  await pool.query(`UPDATE ordenes_exportacion SET prioridad = 1 WHERE prioridad IS NULL OR prioridad < 1`).catch(() => {});

  const oeCols2 = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ordenes_exportacion'`);
  const oeNames2 = (oeCols2.rows || []).map((r) => r.column_name);
  if (!oeNames2.includes('cantidad_contenedores')) {
    await pool.query(
      'ALTER TABLE ordenes_exportacion ADD COLUMN cantidad_contenedores INTEGER NOT NULL DEFAULT 1'
    ).catch(() => {});
  }
  if (!oeNames2.includes('referencia_exportacion')) {
    await pool.query('ALTER TABLE ordenes_exportacion ADD COLUMN referencia_exportacion VARCHAR(120)').catch(() => {});
  }
  const oeColsFecha = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ordenes_exportacion'`
  );
  const oeNamesFecha = (oeColsFecha.rows || []).map((r) => r.column_name);
  if (!oeNamesFecha.includes('fecha_probable_embarque')) {
    await pool.query('ALTER TABLE ordenes_exportacion ADD COLUMN fecha_probable_embarque DATE').catch(() => {});
  }
  await pool.query(`UPDATE ordenes_exportacion SET cantidad_contenedores = 1 WHERE cantidad_contenedores IS NULL OR cantidad_contenedores < 1`).catch(() => {});

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ordenes_exportacion_contenedores (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      orden_exportacion_id UUID NOT NULL REFERENCES ordenes_exportacion(id) ON DELETE CASCADE,
      indice INTEGER NOT NULL CHECK (indice >= 1),
      letra VARCHAR(8) NOT NULL,
      listo_para_exportar BOOLEAN NOT NULL DEFAULT FALSE,
      despachado_at TIMESTAMP,
      referencia_exportacion VARCHAR(120),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (orden_exportacion_id, indice)
    )
  `);
  const contColsMeta = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ordenes_exportacion_contenedores'`
  );
  const contColNames = (contColsMeta.rows || []).map((r) => r.column_name);
  if (!contColNames.includes('referencia_exportacion')) {
    await pool.query('ALTER TABLE ordenes_exportacion_contenedores ADD COLUMN referencia_exportacion VARCHAR(120)').catch(() => {});
  }
  if (!contColNames.includes('exportado_at')) {
    await pool.query('ALTER TABLE ordenes_exportacion_contenedores ADD COLUMN exportado_at TIMESTAMP').catch(() => {});
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ordenes_exportacion_contenedor_contenido (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      contenedor_id UUID NOT NULL REFERENCES ordenes_exportacion_contenedores(id) ON DELETE CASCADE,
      linea_id UUID NOT NULL REFERENCES ordenes_exportacion_lineas(id) ON DELETE CASCADE,
      asignacion_id UUID REFERENCES ordenes_exportacion_linea_asignaciones(id) ON DELETE CASCADE,
      cantidad_bultos NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (cantidad_bultos >= 0)
    )
  `);
  const ccMeta = await pool.query(
    `SELECT is_nullable FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'ordenes_exportacion_contenedor_contenido' AND column_name = 'asignacion_id'`
  );
  if (ccMeta.rows[0]?.is_nullable === 'NO') {
    await pool
      .query(
        `ALTER TABLE ordenes_exportacion_contenedor_contenido DROP CONSTRAINT IF EXISTS ordenes_exportacion_contenedor_contenido_contenedor_id_asignacion_id_key`
      )
      .catch(() => {});
    await pool
      .query(
        `ALTER TABLE ordenes_exportacion_contenedor_contenido DROP CONSTRAINT IF EXISTS ordenes_exportacion_contenedor_contenido_asignacion_id_fkey`
      )
      .catch(() => {});
    await pool.query(`ALTER TABLE ordenes_exportacion_contenedor_contenido ALTER COLUMN asignacion_id DROP NOT NULL`).catch(() => {});
    await pool
      .query(
        `ALTER TABLE ordenes_exportacion_contenedor_contenido ADD CONSTRAINT ordenes_exportacion_contenedor_contenido_asignacion_id_fkey
         FOREIGN KEY (asignacion_id) REFERENCES ordenes_exportacion_linea_asignaciones(id) ON DELETE CASCADE`
      )
      .catch(() => {});
  }
  await pool
    .query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_oe_contenido_cont_asig
       ON ordenes_exportacion_contenedor_contenido (contenedor_id, asignacion_id)
       WHERE asignacion_id IS NOT NULL`
    )
    .catch(() => {});
  await pool
    .query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_oe_contenido_cont_linea_sin_asig
       ON ordenes_exportacion_contenedor_contenido (contenedor_id, linea_id)
       WHERE asignacion_id IS NULL`
    )
    .catch(() => {});
  const ccStockCol = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'ordenes_exportacion_contenedor_contenido' AND column_name = 'cantidad_bultos_stock'`
  );
  if (ccStockCol.rows.length === 0) {
    await pool
      .query(
        `ALTER TABLE ordenes_exportacion_contenedor_contenido
         ADD COLUMN cantidad_bultos_stock NUMERIC(12, 2) NOT NULL DEFAULT 0
         CHECK (cantidad_bultos_stock >= 0)`
      )
      .catch(() => {});
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ordenes_exportacion_lineas (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      orden_exportacion_id UUID NOT NULL REFERENCES ordenes_exportacion(id) ON DELETE CASCADE,
      producto_id UUID NOT NULL REFERENCES productos(id),
      cantidad_solicitada NUMERIC(12,2) NOT NULL DEFAULT 0,
      cantidad_cargada NUMERIC(12,2) NOT NULL DEFAULT 0,
      referencia_embarque VARCHAR(120),
      completado_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(orden_exportacion_id, producto_id)
    )
  `);
  const lineasCols = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ordenes_exportacion_lineas'`);
  const lineasNames = (lineasCols.rows || []).map((r) => r.column_name);
  if (!lineasNames.includes('referencia_embarque')) {
    await pool.query('ALTER TABLE ordenes_exportacion_lineas ADD COLUMN referencia_embarque VARCHAR(120)').catch(() => {});
  }
  if (!lineasNames.includes('completado_at')) {
    await pool.query('ALTER TABLE ordenes_exportacion_lineas ADD COLUMN completado_at TIMESTAMP').catch(() => {});
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ordenes_exportacion_linea_asignaciones (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      linea_id UUID NOT NULL REFERENCES ordenes_exportacion_lineas(id) ON DELETE CASCADE,
      lote VARCHAR(255),
      cantidad_bultos NUMERIC(12,2) NOT NULL DEFAULT 0,
      origen VARCHAR(40) NOT NULL DEFAULT 'stock',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  const asigLpCol = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'ordenes_exportacion_linea_asignaciones' AND column_name = 'lote_produccion_id'`
  );
  if (asigLpCol.rows.length === 0) {
    await pool
      .query(
        `ALTER TABLE ordenes_exportacion_linea_asignaciones
         ADD COLUMN lote_produccion_id UUID REFERENCES lotes_produccion(id) ON DELETE SET NULL`
      )
      .catch(() => {});
  }
  await pool.query(`UPDATE ordenes_exportacion SET estado = 'En producción' WHERE estado = 'En carga'`).catch(() => {});
};

function esOrigenProduccion(origen) {
  const o = String(origen || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return o === 'produccion' || o === 'produccion_op' || o === 'desde_produccion' || o.startsWith('prod_');
}

/** Tras exportar o revertir contenedor: actualiza completado_at y referencia_embarque por línea según bultos exportados vs solicitados. */
async function syncLineasEstadoPorExportacion(pool, ordenId) {
  const lineas = await pool.query(
    `SELECT id, cantidad_solicitada FROM ordenes_exportacion_lineas WHERE orden_exportacion_id = $1`,
    [ordenId]
  );
  const eps = 0.01;
  for (const ln of lineas.rows) {
    const sumQ = await pool.query(
      `SELECT COALESCE(SUM(cc.cantidad_bultos), 0)::NUMERIC AS bultos
       FROM ordenes_exportacion_contenedor_contenido cc
       JOIN ordenes_exportacion_contenedores c ON c.id = cc.contenedor_id
       WHERE c.orden_exportacion_id = $1 AND cc.linea_id = $2 AND cc.asignacion_id IS NULL AND c.despachado_at IS NOT NULL`,
      [ordenId, ln.id]
    );
    const bultos = Number(sumQ.rows[0]?.bultos) || 0;
    const sol = Number(ln.cantidad_solicitada) || 0;
    const refsQ = await pool.query(
      `SELECT DISTINCT
         CASE
           WHEN TRIM(COALESCE(c.referencia_exportacion, '')) <> '' THEN TRIM(c.referencia_exportacion) || ' ' || c.letra
           WHEN TRIM(COALESCE(oe.referencia_exportacion, '')) <> '' THEN TRIM(oe.referencia_exportacion) || ' ' || c.letra
           ELSE NULL
         END AS codigo_exp
       FROM ordenes_exportacion_contenedor_contenido cc
       JOIN ordenes_exportacion_contenedores c ON c.id = cc.contenedor_id
       JOIN ordenes_exportacion oe ON oe.id = c.orden_exportacion_id
       WHERE c.orden_exportacion_id = $1 AND cc.linea_id = $2 AND cc.asignacion_id IS NULL AND c.despachado_at IS NOT NULL`,
      [ordenId, ln.id]
    );
    const refSet = new Set();
    for (const r of refsQ.rows) {
      const v = r.codigo_exp != null ? String(r.codigo_exp).trim() : '';
      if (v) refSet.add(v);
    }
    const refsStr = refSet.size ? [...refSet].join('; ') : null;
    const completado = bultos + eps >= sol && sol > 0;
    await pool.query(
      `UPDATE ordenes_exportacion_lineas
       SET completado_at = CASE WHEN $1 THEN COALESCE(completado_at, CURRENT_TIMESTAMP) ELSE NULL END,
           referencia_embarque = $2
       WHERE id = $3`,
      [completado, refsStr, ln.id]
    );
  }

  const cntQ = await pool.query(
    `SELECT COALESCE(oe.cantidad_contenedores, 1)::INT AS requeridos,
            COUNT(*) FILTER (WHERE c.despachado_at IS NOT NULL)::INT AS completados
     FROM ordenes_exportacion oe
     LEFT JOIN ordenes_exportacion_contenedores c ON c.orden_exportacion_id = oe.id
     WHERE oe.id = $1
     GROUP BY oe.id, oe.cantidad_contenedores`,
    [ordenId]
  );
  const req = Number(cntQ.rows[0]?.requeridos) || 1;
  const comp = Number(cntQ.rows[0]?.completados) || 0;
  const estadoObjetivo = comp >= req ? 'Completo' : 'En producción';
  await pool.query(
    `UPDATE ordenes_exportacion
     SET estado = $1::varchar,
         notificado_at = CASE WHEN $1::varchar = 'Completo' THEN COALESCE(notificado_at, CURRENT_TIMESTAMP) ELSE NULL END,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $2
       AND estado <> 'Embarcado'`,
    [estadoObjetivo, ordenId]
  );
}

// Listar órdenes de exportación
router.get('/', async (req, res) => {
  try {
    await initTables();
    const { limit = 50, offset = 0, estado, cliente_exportacion_id, cliente_id, especie_id } = req.query;
    const limitNum = Math.min(parseInt(limit, 10) || 50, 500);
    const offsetNum = Math.max(0, parseInt(offset, 10) || 0);

    let where = 'WHERE 1=1';
    const params = [];
    let n = 1;
    if (estado) { where += ` AND oe.estado = $${n}`; params.push(estado); n++; }
    if (cliente_exportacion_id) { where += ` AND oe.cliente_exportacion_id = $${n}`; params.push(cliente_exportacion_id); n++; }
    if (cliente_id) { where += ` AND oe.cliente_id = $${n}`; params.push(cliente_id); n++; }
    if (especie_id) { where += ` AND oe.especie_id = $${n}`; params.push(especie_id); n++; }

    const countResult = await pool.query(
      `SELECT COUNT(*) AS total FROM ordenes_exportacion oe ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.total, 10) || 0;

    const result = await pool.query(
      `SELECT oe.id, oe.numero_op, oe.fecha_envio_op, oe.prioridad, oe.cliente_exportacion_id, oe.cliente_id, oe.especie_id, oe.destino, oe.estado,
              oe.referencia_embarque, oe.referencia_exportacion, oe.cantidad_contenedores, oe.notificado_at, oe.usuario_id, oe.created_at,
              ce.nombre AS cliente_exportacion_nombre,
              c.nombre AS cliente_produccion_nombre,
              e.nombre AS especie_nombre,
              u.nombre AS usuario_nombre,
              COALESCE(prod.productos_op, '') AS productos_op,
              COALESCE(cnt.contenedores_despachados, 0)::INT AS contenedores_despachados,
              COALESCE(cnt.contenedores_exportados, 0)::INT AS contenedores_exportados,
              COALESCE(cnt.contenedores_listos_exportar, 0)::INT AS contenedores_listos_exportar,
              COALESCE(dsp_emb.n, 0)::INT AS despachos_embarque
       FROM ordenes_exportacion oe
       LEFT JOIN clientes_exportacion ce ON ce.id = oe.cliente_exportacion_id
       LEFT JOIN clientes c ON c.id = oe.cliente_id
       LEFT JOIN especies e ON e.id = oe.especie_id
       LEFT JOIN usuarios u ON u.id = oe.usuario_id
       LEFT JOIN LATERAL (
         SELECT string_agg(DISTINCT p.producto, ', ' ORDER BY p.producto) AS productos_op
         FROM ordenes_exportacion_lineas oel
         JOIN productos p ON p.id = oel.producto_id
         WHERE oel.orden_exportacion_id = oe.id
       ) prod ON true
       LEFT JOIN LATERAL (
         SELECT COUNT(*) FILTER (WHERE c2.despachado_at IS NOT NULL)::INT AS contenedores_despachados,
                COUNT(*) FILTER (WHERE c2.exportado_at IS NOT NULL)::INT AS contenedores_exportados,
                COUNT(*) FILTER (WHERE c2.listo_para_exportar = TRUE AND c2.despachado_at IS NULL)::INT AS contenedores_listos_exportar
         FROM ordenes_exportacion_contenedores c2
         WHERE c2.orden_exportacion_id = oe.id
       ) cnt ON true
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::INT AS n
         FROM despachos d
         WHERE d.tipo_salida = 'Embarque'
           AND TRIM(COALESCE(d.orden_produccion, '')) = TRIM(COALESCE(oe.numero_op::text, ''))
       ) dsp_emb ON true
       ${where}
       ORDER BY oe.prioridad DESC, oe.fecha_envio_op DESC, oe.created_at DESC
       LIMIT $${n} OFFSET $${n + 1}`,
      [...params, limitNum, offsetNum]
    );

    res.json({ data: result.rows, total });
  } catch (error) {
    console.error('Error listando órdenes de exportación:', error);
    res.status(500).json({ message: 'Error al listar órdenes de exportación' });
  }
});

// Pedidos listos para exportar (líneas con completado_at)
router.get('/pedidos-listos', async (req, res) => {
  try {
    await initTables();
    const { limit = 100, offset = 0 } = req.query;
    const limitNum = Math.min(parseInt(limit, 10) || 100, 500);
    const offsetNum = Math.max(0, parseInt(offset, 10) || 0);

    const countResult = await pool.query(
      `SELECT COUNT(*) AS total FROM ordenes_exportacion_lineas oel
       WHERE oel.completado_at IS NOT NULL`
    );
    const total = parseInt(countResult.rows[0]?.total, 10) || 0;

    const result = await pool.query(
      `SELECT oel.id, oel.orden_exportacion_id, oel.producto_id, oel.cantidad_solicitada, oel.cantidad_cargada,
              oel.referencia_embarque, oel.completado_at,
              p.codigo AS producto_codigo, p.producto AS producto_nombre, p.descripcion AS producto_descripcion, p.presentacion AS producto_presentacion,
              oe.numero_op, oe.fecha_envio_op, oe.destino, oe.estado AS orden_estado,
              ce.nombre AS cliente_exportacion_nombre, c.nombre AS cliente_produccion_nombre
       FROM ordenes_exportacion_lineas oel
       JOIN productos p ON p.id = oel.producto_id
       JOIN ordenes_exportacion oe ON oe.id = oel.orden_exportacion_id
       LEFT JOIN clientes_exportacion ce ON ce.id = oe.cliente_exportacion_id
       LEFT JOIN clientes c ON c.id = oe.cliente_id
       WHERE oel.completado_at IS NOT NULL
       ORDER BY oel.completado_at DESC
       LIMIT $1 OFFSET $2`,
      [limitNum, offsetNum]
    );
    res.json({ data: result.rows, total });
  } catch (error) {
    console.error('Error listando pedidos listos:', error);
    res.status(500).json({ message: 'Error al listar pedidos listos' });
  }
});

// Contenedores listos para exportar (no despachados)
router.get('/contenedores-listos-exportacion', async (req, res) => {
  try {
    await initTables();
    const { limit = 100, offset = 0 } = req.query;
    const limitNum = Math.min(parseInt(limit, 10) || 100, 500);
    const offsetNum = Math.max(0, parseInt(offset, 10) || 0);

    const countResult = await pool.query(
      `SELECT COUNT(*)::INT AS total
       FROM ordenes_exportacion_contenedores c
       JOIN ordenes_exportacion oe ON oe.id = c.orden_exportacion_id
       WHERE c.despachado_at IS NOT NULL`
    );
    const total = parseInt(countResult.rows[0]?.total, 10) || 0;

    const result = await pool.query(
      `SELECT c.id AS contenedor_id, c.indice, c.letra, c.listo_para_exportar, c.despachado_at,
              oe.id AS orden_id, oe.numero_op, oe.referencia_exportacion, oe.fecha_envio_op, oe.destino, oe.estado,
              TRIM(oe.numero_op) || ' ' || c.letra AS codigo_interno,
              CASE
                WHEN TRIM(COALESCE(c.referencia_exportacion, '')) <> '' THEN TRIM(c.referencia_exportacion) || ' ' || c.letra
                WHEN TRIM(COALESCE(oe.referencia_exportacion, '')) <> '' THEN TRIM(oe.referencia_exportacion) || ' ' || c.letra
                ELSE NULL
              END AS codigo_exportacion,
              ce.nombre AS cliente_exportacion_nombre,
              cl.nombre AS cliente_produccion_nombre
       FROM ordenes_exportacion_contenedores c
       JOIN ordenes_exportacion oe ON oe.id = c.orden_exportacion_id
       LEFT JOIN clientes_exportacion ce ON ce.id = oe.cliente_exportacion_id
       LEFT JOIN clientes cl ON cl.id = oe.cliente_id
       WHERE c.despachado_at IS NOT NULL
       ORDER BY oe.prioridad DESC, oe.fecha_envio_op DESC, c.indice
       LIMIT $1 OFFSET $2`,
      [limitNum, offsetNum]
    );
    res.json({ data: result.rows, total });
  } catch (error) {
    console.error('Error listando contenedores listos:', error);
    res.status(500).json({ message: 'Error al listar contenedores listos' });
  }
});

/** Listos para despacho agrupados por referencia (prefijo OP / exportación), una fila por grupo. */
router.get('/listos-despacho-grupos', async (req, res) => {
  try {
    await initTables();
    const { limit = 100, offset = 0 } = req.query;
    const limitNum = Math.min(parseInt(limit, 10) || 100, 500);
    const offsetNum = Math.max(0, parseInt(offset, 10) || 0);

    const countQ = await pool.query(`
      WITH base AS (
        SELECT
          oe.id AS orden_id,
          TRIM(COALESCE(
            NULLIF(TRIM(oe.referencia_exportacion), ''),
            NULLIF(TRIM(c.referencia_exportacion), ''),
            rl.referencia_linea,
            oe.numero_op::text
          )) AS referencia
        FROM ordenes_exportacion_contenedores c
        JOIN ordenes_exportacion oe ON oe.id = c.orden_exportacion_id
        LEFT JOIN LATERAL (
          SELECT NULLIF(
                   TRIM(
                     regexp_replace(
                       split_part(COALESCE(MIN(NULLIF(TRIM(oel.referencia_embarque), '')), ''), ';', 1),
                       '\s+[A-Z]+$',
                       ''
                     )
                   ),
                   ''
                 ) AS referencia_linea
          FROM ordenes_exportacion_lineas oel
          WHERE oel.orden_exportacion_id = oe.id
        ) rl ON true
        WHERE c.despachado_at IS NOT NULL
          AND NOT (${sqlEmbarqueDespachoFisicoCerrado()})
      )
      SELECT COUNT(*)::INT AS total FROM (SELECT DISTINCT orden_id, referencia FROM base) g
    `);
    const total = parseInt(countQ.rows[0]?.total, 10) || 0;

    const result = await pool.query(
      `
      WITH base AS (
        SELECT
          c.id AS contenedor_id,
          oe.id AS orden_id,
          TRIM(COALESCE(
            NULLIF(TRIM(oe.referencia_exportacion), ''),
            NULLIF(TRIM(c.referencia_exportacion), ''),
            rl.referencia_linea,
            oe.numero_op::text
          )) AS referencia
        FROM ordenes_exportacion_contenedores c
        JOIN ordenes_exportacion oe ON oe.id = c.orden_exportacion_id
        LEFT JOIN LATERAL (
          SELECT NULLIF(
                   TRIM(
                     regexp_replace(
                       split_part(COALESCE(MIN(NULLIF(TRIM(oel.referencia_embarque), '')), ''), ';', 1),
                       '\s+[A-Z]+$',
                       ''
                     )
                   ),
                   ''
                 ) AS referencia_linea
          FROM ordenes_exportacion_lineas oel
          WHERE oel.orden_exportacion_id = oe.id
        ) rl ON true
        WHERE c.despachado_at IS NOT NULL
          AND NOT (${sqlEmbarqueDespachoFisicoCerrado()})
      ),
      grupos AS (
        SELECT orden_id, referencia, array_agg(contenedor_id ORDER BY contenedor_id) AS contenedor_ids
        FROM base
        GROUP BY orden_id, referencia
      )
      SELECT g.orden_id,
             g.referencia,
             g.contenedor_ids,
             oe.fecha_probable_embarque,
             oe.fecha_envio_op,
             oe.numero_op,
             oe.cliente_id AS cliente_origen_id,
             oe.destino,
             oe.prioridad,
             ce.nombre AS cliente_exportacion_nombre,
             cl.nombre AS cliente_produccion_nombre,
             COALESCE(pj.productos, '[]'::json) AS productos
      FROM grupos g
      JOIN ordenes_exportacion oe ON oe.id = g.orden_id
      LEFT JOIN clientes_exportacion ce ON ce.id = oe.cliente_exportacion_id
      LEFT JOIN clientes cl ON cl.id = oe.cliente_id
      LEFT JOIN LATERAL (
        SELECT json_agg(
          json_build_object(
            'producto_codigo', sq.producto_codigo,
            'producto_descripcion', sq.producto_descripcion,
            'total_bultos', sq.total_bultos
          ) ORDER BY sq.producto_codigo
        ) AS productos
        FROM (
          SELECT p.codigo AS producto_codigo,
                 COALESCE(NULLIF(TRIM(COALESCE(p.descripcion, '')), ''), p.producto, p.codigo) AS producto_descripcion,
                 COALESCE(NULLIF(SUM(COALESCE(cc.cantidad_bultos_stock, 0))::numeric, 0), SUM(cc.cantidad_bultos)::numeric) AS total_bultos
          FROM ordenes_exportacion_contenedor_contenido cc
          JOIN ordenes_exportacion_lineas oel ON oel.id = cc.linea_id
          JOIN productos p ON p.id = oel.producto_id
          WHERE cc.contenedor_id = ANY(g.contenedor_ids) AND cc.asignacion_id IS NULL
          GROUP BY p.codigo, p.descripcion, p.producto
        ) sq
      ) pj ON true
      ORDER BY oe.prioridad DESC, g.referencia
      LIMIT $1 OFFSET $2
      `,
      [limitNum, offsetNum]
    );

    res.json({ data: result.rows, total });
  } catch (error) {
    console.error('Error listando grupos listos despacho:', error);
    res.status(500).json({ message: 'Error al listar listos para despacho' });
  }
});

/** Detalle de un grupo (referencia + OP) para modal listos para despacho. */
router.get('/listos-despacho-grupo-detalle', async (req, res) => {
  try {
    await initTables();
    const ordenId = String(req.query.orden_id || '').trim();
    const referencia = String(req.query.referencia ?? '').trim();
    if (!ordenId || !referencia) {
      return res.status(400).json({ message: 'orden_id y referencia son requeridos' });
    }

    const ordenQ = await pool.query(
      `SELECT oe.id, oe.numero_op, oe.fecha_envio_op, oe.fecha_probable_embarque, oe.destino, oe.estado, oe.referencia_exportacion,
              ce.nombre AS cliente_exportacion_nombre,
              cl.nombre AS cliente_produccion_nombre,
              e.nombre AS especie_nombre
       FROM ordenes_exportacion oe
       LEFT JOIN clientes_exportacion ce ON ce.id = oe.cliente_exportacion_id
       LEFT JOIN clientes cl ON cl.id = oe.cliente_id
       LEFT JOIN especies e ON e.id = oe.especie_id
       WHERE oe.id = $1`,
      [ordenId]
    );
    if (ordenQ.rows.length === 0) return res.status(404).json({ message: 'Orden no encontrada' });
    const orden = ordenQ.rows[0];

    const contQ = await pool.query(
      `SELECT c.id, c.indice, c.letra, c.listo_para_exportar, c.despachado_at,
              TRIM(oe.numero_op) || ' ' || c.letra AS codigo_interno,
              CASE
                WHEN TRIM(COALESCE(c.referencia_exportacion, '')) <> '' THEN TRIM(c.referencia_exportacion) || ' ' || c.letra
                WHEN TRIM(COALESCE(oe.referencia_exportacion, '')) <> '' THEN TRIM(oe.referencia_exportacion) || ' ' || c.letra
                ELSE NULL
              END AS codigo_exportacion
       FROM ordenes_exportacion_contenedores c
       JOIN ordenes_exportacion oe ON oe.id = c.orden_exportacion_id
       LEFT JOIN LATERAL (
         SELECT NULLIF(
                  TRIM(
                    regexp_replace(
                      split_part(COALESCE(MIN(NULLIF(TRIM(oel.referencia_embarque), '')), ''), ';', 1),
                      '\s+[A-Z]+$',
                      ''
                    )
                  ),
                  ''
                ) AS referencia_linea
         FROM ordenes_exportacion_lineas oel
         WHERE oel.orden_exportacion_id = oe.id
       ) rl ON true
       WHERE c.orden_exportacion_id = $1
         AND c.despachado_at IS NOT NULL
         AND TRIM(COALESCE(
           NULLIF(TRIM(oe.referencia_exportacion), ''),
           NULLIF(TRIM(c.referencia_exportacion), ''),
           rl.referencia_linea,
           oe.numero_op::text
         )) = $2
         AND NOT (
           $3 <> ''
           AND EXISTS (
             SELECT 1 FROM despachos d
             WHERE d.tipo_salida = 'Embarque'
               AND TRIM(COALESCE(d.orden_produccion, '')) = TRIM(COALESCE(oe.numero_op::text, ''))
               AND TRIM(COALESCE(d.estado, '')) = 'Despachado'
               AND COALESCE(d.observaciones, '') ILIKE ('%Referencia: ' || $3 || '%')
           )
         )
       ORDER BY c.indice`,
      [ordenId, referencia, referencia]
    );

    const contenedores = [];
    for (const row of contQ.rows) {
      const contenido = await pool.query(
        `SELECT p.codigo AS producto_codigo,
                COALESCE(NULLIF(TRIM(COALESCE(p.descripcion, '')), ''), p.producto, p.codigo) AS producto_descripcion,
                cc.cantidad_bultos::numeric AS cantidad_bultos,
                COALESCE(cc.cantidad_bultos_stock, 0)::numeric AS cantidad_bultos_stock,
                p.formato AS producto_formato,
                p.unidad_medida AS producto_unidad_medida,
                (
                  COALESCE(NULLIF(cc.cantidad_bultos_stock, 0), cc.cantidad_bultos)::numeric
                  * CASE
                      WHEN UPPER(COALESCE(p.unidad_medida, '')) = 'KG' AND COALESCE(p.formato, 0) > 0
                        THEN p.formato::numeric
                      ELSE 0::numeric
                    END
                )::numeric(14, 2) AS total_kg
         FROM ordenes_exportacion_contenedor_contenido cc
         JOIN ordenes_exportacion_lineas oel ON oel.id = cc.linea_id
         JOIN productos p ON p.id = oel.producto_id
         WHERE cc.contenedor_id = $1 AND cc.asignacion_id IS NULL
         ORDER BY p.codigo`,
        [row.id]
      );
      contenedores.push({ ...row, lineas: contenido.rows });
    }

    if (contenedores.length === 0) {
      return res.status(404).json({
        message:
          'No hay contenedores en «listos para despacho» para esta referencia (p. ej. el embarque ya consta como despachado).',
      });
    }

    const sumQ = await pool.query(
      `SELECT p.codigo AS producto_codigo,
              COALESCE(NULLIF(TRIM(COALESCE(p.descripcion, '')), ''), p.producto, p.codigo) AS producto_descripcion,
              COALESCE(NULLIF(SUM(COALESCE(cc.cantidad_bultos_stock, 0))::numeric, 0), SUM(cc.cantidad_bultos)::numeric) AS total_bultos,
              SUM(
                COALESCE(NULLIF(cc.cantidad_bultos_stock, 0), cc.cantidad_bultos)::numeric
                * CASE
                    WHEN UPPER(COALESCE(p.unidad_medida, '')) = 'KG' AND COALESCE(p.formato, 0) > 0
                      THEN p.formato::numeric
                    ELSE 0::numeric
                  END
              )::numeric(14, 2) AS total_kg
       FROM ordenes_exportacion_contenedor_contenido cc
       JOIN ordenes_exportacion_contenedores c ON c.id = cc.contenedor_id
       JOIN ordenes_exportacion oe ON oe.id = c.orden_exportacion_id
       LEFT JOIN LATERAL (
         SELECT NULLIF(
                  TRIM(
                    regexp_replace(
                      split_part(COALESCE(MIN(NULLIF(TRIM(oel2.referencia_embarque), '')), ''), ';', 1),
                      '\s+[A-Z]+$',
                      ''
                    )
                  ),
                  ''
                ) AS referencia_linea
         FROM ordenes_exportacion_lineas oel2
         WHERE oel2.orden_exportacion_id = oe.id
       ) rl ON true
       JOIN ordenes_exportacion_lineas oel ON oel.id = cc.linea_id
       JOIN productos p ON p.id = oel.producto_id
       WHERE c.orden_exportacion_id = $1
         AND c.despachado_at IS NOT NULL
         AND TRIM(COALESCE(
           NULLIF(TRIM(oe.referencia_exportacion), ''),
           NULLIF(TRIM(c.referencia_exportacion), ''),
           rl.referencia_linea,
           oe.numero_op::text
         )) = $2
         AND cc.asignacion_id IS NULL
         AND NOT (
           $3 <> ''
           AND EXISTS (
             SELECT 1 FROM despachos d
             WHERE d.tipo_salida = 'Embarque'
               AND TRIM(COALESCE(d.orden_produccion, '')) = TRIM(COALESCE(oe.numero_op::text, ''))
               AND TRIM(COALESCE(d.estado, '')) = 'Despachado'
               AND COALESCE(d.observaciones, '') ILIKE ('%Referencia: ' || $3 || '%')
           )
         )
       GROUP BY p.codigo, p.descripcion, p.producto
       ORDER BY p.codigo`,
      [ordenId, referencia, referencia]
    );

    res.json({
      referencia,
      orden,
      contenedores,
      productos_totales: sumQ.rows,
    });
  } catch (error) {
    console.error('Error detalle grupo listos despacho:', error);
    res.status(500).json({ message: 'Error al cargar detalle' });
  }
});

/** Detalle de embarque: despachos vinculados a la OP, líneas de salida, contenedores y lotes asignados.
 *  Disponible si ya hay al menos un contenedor despachado físicamente o un despacho Embarque vinculado al N° OP. */
router.get('/:id/embarque-detalle', async (req, res) => {
  try {
    await initTables();
    const { id } = req.params;
    const ordenQ = await pool.query(
      `SELECT oe.id, oe.numero_op, oe.estado, oe.referencia_exportacion, oe.referencia_embarque, oe.destino,
              oe.fecha_envio_op, oe.fecha_probable_embarque, oe.cantidad_contenedores,
              ce.nombre AS cliente_exportacion_nombre, c.nombre AS cliente_produccion_nombre, e.nombre AS especie_nombre
       FROM ordenes_exportacion oe
       LEFT JOIN clientes_exportacion ce ON ce.id = oe.cliente_exportacion_id
       LEFT JOIN clientes c ON c.id = oe.cliente_id
       LEFT JOIN especies e ON e.id = oe.especie_id
       WHERE oe.id = $1`,
      [id]
    );
    if (ordenQ.rows.length === 0) return res.status(404).json({ message: 'Orden no encontrada' });
    const orden = ordenQ.rows[0];

    const accesoQ = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM ordenes_exportacion_contenedores c
          WHERE c.orden_exportacion_id = $1 AND c.despachado_at IS NOT NULL) AS contenedores_despachados,
         (SELECT COUNT(*)::int FROM despachos d
          WHERE d.tipo_salida = 'Embarque'
            AND TRIM(COALESCE(d.orden_produccion, '')) = TRIM(COALESCE((SELECT numero_op::text FROM ordenes_exportacion WHERE id = $1), ''))
         ) AS despachos_embarque`,
      [id]
    );
    const contDesp = Number(accesoQ.rows[0]?.contenedores_despachados) || 0;
    const nDesp = Number(accesoQ.rows[0]?.despachos_embarque) || 0;
    if (contDesp === 0 && nDesp === 0) {
      return res.status(400).json({
        message:
          'Aún no hay embarque registrado para esta OP (no hay contenedor marcado como despachado ni despacho de embarque vinculado al N° OP).',
      });
    }

    const despachosQ = await pool.query(
      `SELECT d.id, d.tipo_salida, d.fecha_salida, d.orden_produccion, d.cliente_destino, d.pais_destino, d.destino,
              d.contenedor, d.guia_salida, d.observaciones, d.estado, d.movimiento_id, d.created_at, d.updated_at,
              u.nombre AS usuario_nombre, c_origen.nombre AS cliente_origen_nombre
       FROM despachos d
       JOIN usuarios u ON u.id = d.usuario_id
       LEFT JOIN clientes c_origen ON c_origen.id = d.cliente_origen_id
       WHERE d.tipo_salida = 'Embarque'
         AND TRIM(COALESCE(d.orden_produccion, '')) = TRIM(COALESCE($1::text, ''))
       ORDER BY d.fecha_salida DESC NULLS LAST, d.created_at DESC`,
      [orden.numero_op]
    );

    const despachos = [];
    for (const row of despachosQ.rows) {
      const lp = await fetchDespachoLineasEmbarque(pool, row.id, row.movimiento_id);
      despachos.push({
        ...row,
        lineas: lp.lineas,
        total_bultos_despacho: lp.total_bultos_despacho,
        total_kg_despacho: lp.total_kg_despacho,
        total_adicional_despacho: lp.total_adicional_despacho,
      });
    }

    const contRows = await pool.query(
      `SELECT c.id, c.indice, c.letra, c.despachado_at, c.exportado_at, c.listo_para_exportar,
              c.referencia_exportacion AS contenedor_referencia_exportacion,
              TRIM(COALESCE(oe.numero_op::text, '')) || ' ' || c.letra AS codigo_interno,
              CASE
                WHEN TRIM(COALESCE(c.referencia_exportacion, '')) <> '' THEN TRIM(c.referencia_exportacion) || ' ' || c.letra
                WHEN TRIM(COALESCE(oe.referencia_exportacion, '')) <> '' THEN TRIM(oe.referencia_exportacion) || ' ' || c.letra
                ELSE NULL
              END AS codigo_exportacion
       FROM ordenes_exportacion_contenedores c
       JOIN ordenes_exportacion oe ON oe.id = c.orden_exportacion_id
       WHERE c.orden_exportacion_id = $1
       ORDER BY c.indice`,
      [id]
    );
    const contenedores = [];
    for (const c of contRows.rows) {
      const contenido = await pool.query(
        `SELECT cc.cantidad_bultos, COALESCE(cc.cantidad_bultos_stock, 0)::NUMERIC AS cantidad_bultos_stock,
                oel.id AS linea_id,
                p.codigo AS producto_codigo, p.producto AS producto_nombre, p.descripcion AS producto_descripcion
         FROM ordenes_exportacion_contenedor_contenido cc
         JOIN ordenes_exportacion_lineas oel ON oel.id = cc.linea_id
         JOIN productos p ON p.id = oel.producto_id
         WHERE cc.contenedor_id = $1 AND cc.asignacion_id IS NULL
         ORDER BY p.codigo`,
        [c.id]
      );
      contenedores.push({ ...c, contenido: contenido.rows });
    }

    const lotesAsignadosQ = await pool.query(
      `SELECT a.lote, a.cantidad_bultos, a.origen,
              p.codigo AS producto_codigo, p.producto AS producto_nombre, lp.codigo AS lote_produccion_codigo
       FROM ordenes_exportacion_linea_asignaciones a
       JOIN ordenes_exportacion_lineas oel ON oel.id = a.linea_id
       JOIN productos p ON p.id = oel.producto_id
       LEFT JOIN lotes_produccion lp ON lp.id = a.lote_produccion_id
       WHERE oel.orden_exportacion_id = $1
       ORDER BY p.codigo, COALESCE(TRIM(a.lote), '')`,
      [id]
    );

    const refs = await resolverReferenciasVisiblesEmbarque(pool, id, orden, despachos);
    Object.assign(orden, refs);

    const resumenQ = await pool.query(
      `SELECT COALESCE(oe.cantidad_contenedores, 1)::int AS requeridos,
              COUNT(*) FILTER (WHERE c.despachado_at IS NOT NULL)::int AS despachados,
              GREATEST(
                0,
                COALESCE(oe.cantidad_contenedores, 1) - COUNT(*) FILTER (WHERE c.despachado_at IS NOT NULL)
              )::int AS pendientes
       FROM ordenes_exportacion oe
       LEFT JOIN ordenes_exportacion_contenedores c ON c.orden_exportacion_id = oe.id
       WHERE oe.id = $1
       GROUP BY oe.id, oe.cantidad_contenedores`,
      [id]
    );
    const resumenEmb = resumenQ.rows[0] || { requeridos: 1, despachados: 0, pendientes: 0 };

    res.json({
      orden,
      contenedores,
      despachos,
      lotes_asignados_op: lotesAsignadosQ.rows,
      resumen_embarque_op: {
        contenedores_requeridos: Number(resumenEmb.requeridos) || 1,
        contenedores_despachados: Number(resumenEmb.despachados) || 0,
        contenedores_pendientes: Number(resumenEmb.pendientes) || 0,
      },
    });
  } catch (error) {
    console.error('Error embarque detalle OP:', error);
    res.status(500).json({ message: 'Error al cargar detalle de embarque' });
  }
});

// Obtener una orden con sus líneas
router.get('/:id', async (req, res) => {
  try {
    await initTables();
    const { id } = req.params;
    const ordenResult = await pool.query(
      `SELECT oe.id, oe.numero_op, oe.fecha_envio_op, oe.fecha_probable_embarque, oe.prioridad, oe.cliente_exportacion_id, oe.cliente_id, oe.especie_id, oe.destino, oe.estado,
              oe.referencia_embarque, oe.referencia_exportacion, oe.cantidad_contenedores, oe.notificado_at, oe.usuario_id, oe.created_at, oe.updated_at,
              ce.nombre AS cliente_exportacion_nombre,
              c.nombre AS cliente_produccion_nombre,
              e.nombre AS especie_nombre,
              u.nombre AS usuario_nombre
       FROM ordenes_exportacion oe
       LEFT JOIN clientes_exportacion ce ON ce.id = oe.cliente_exportacion_id
       LEFT JOIN clientes c ON c.id = oe.cliente_id
       LEFT JOIN especies e ON e.id = oe.especie_id
       LEFT JOIN usuarios u ON u.id = oe.usuario_id
       WHERE oe.id = $1`,
      [id]
    );
    if (ordenResult.rows.length === 0) return res.status(404).json({ message: 'Orden no encontrada' });
    const orden = ordenResult.rows[0];

    const cc = Math.min(702, Math.max(1, parseInt(orden.cantidad_contenedores, 10) || 1));
    await syncContenedoresForOrden(pool, orden.id, cc);

    const lineasResult = await pool.query(
      `SELECT oel.id, oel.producto_id, oel.cantidad_solicitada, oel.cantidad_cargada,
              oel.referencia_embarque, oel.completado_at,
              (SELECT COALESCE(SUM(COALESCE(cc.cantidad_bultos_stock, 0)), 0)::NUMERIC
               FROM ordenes_exportacion_contenedor_contenido cc
               JOIN ordenes_exportacion_contenedores c ON c.id = cc.contenedor_id
               WHERE c.orden_exportacion_id = oel.orden_exportacion_id
                 AND cc.linea_id = oel.id
                 AND cc.asignacion_id IS NULL
              ) AS bultos_asignados_stock_op,
              (SELECT COALESCE(SUM(cc.cantidad_bultos), 0)::NUMERIC
               FROM ordenes_exportacion_contenedor_contenido cc
               JOIN ordenes_exportacion_contenedores c ON c.id = cc.contenedor_id
               WHERE c.orden_exportacion_id = oel.orden_exportacion_id
                 AND cc.linea_id = oel.id
                 AND cc.asignacion_id IS NULL
                 AND c.despachado_at IS NOT NULL
              ) AS bultos_despachados,
              (SELECT COALESCE(SUM(cc.cantidad_bultos), 0)::NUMERIC
               FROM ordenes_exportacion_contenedor_contenido cc
               JOIN ordenes_exportacion_contenedores c ON c.id = cc.contenedor_id
               WHERE c.orden_exportacion_id = oel.orden_exportacion_id
                 AND cc.linea_id = oel.id
                 AND cc.asignacion_id IS NULL
                 AND c.exportado_at IS NOT NULL
              ) AS bultos_exportados,
              p.codigo AS producto_codigo, p.producto AS producto_nombre, p.descripcion AS producto_descripcion, p.presentacion AS producto_presentacion,
              p.formato AS producto_formato, p.unidad_medida AS producto_unidad_medida
       FROM ordenes_exportacion_lineas oel
       JOIN productos p ON p.id = oel.producto_id
       WHERE oel.orden_exportacion_id = $1
       ORDER BY p.codigo`,
      [id]
    );
    orden.lineas = lineasResult.rows;

    const asigOrdenRes = await pool.query(
      `SELECT a.id AS asignacion_id, a.linea_id, a.lote, a.cantidad_bultos AS cantidad_total, a.origen,
              a.lote_produccion_id,
              lp.estado AS lote_produccion_estado,
              p.codigo AS producto_codigo, p.descripcion AS producto_descripcion, p.producto AS producto_nombre
       FROM ordenes_exportacion_linea_asignaciones a
       JOIN ordenes_exportacion_lineas oel ON oel.id = a.linea_id
       JOIN productos p ON p.id = oel.producto_id
       LEFT JOIN lotes_produccion lp ON lp.id = a.lote_produccion_id
       WHERE oel.orden_exportacion_id = $1
       ORDER BY p.codigo, COALESCE(TRIM(a.lote), '')`,
      [id]
    );
    orden.asignaciones_orden = asigOrdenRes.rows;

    const contRows = await pool.query(
      `SELECT c.id, c.indice, c.letra, c.listo_para_exportar, c.despachado_at, c.exportado_at,
              c.referencia_exportacion AS contenedor_referencia_exportacion,
              TRIM(COALESCE(oe.numero_op::text, '')) || ' ' || c.letra AS codigo_interno,
              CASE
                WHEN TRIM(COALESCE(c.referencia_exportacion, '')) <> '' THEN TRIM(c.referencia_exportacion) || ' ' || c.letra
                WHEN TRIM(COALESCE(oe.referencia_exportacion, '')) <> '' THEN TRIM(oe.referencia_exportacion) || ' ' || c.letra
                ELSE NULL
              END AS codigo_exportacion,
              COALESCE(em.embarque_despacho_cerrado, FALSE) AS embarque_despacho_cerrado
       FROM ordenes_exportacion_contenedores c
       JOIN ordenes_exportacion oe ON oe.id = c.orden_exportacion_id
       LEFT JOIN LATERAL (
         SELECT NULLIF(
                  TRIM(
                    regexp_replace(
                      split_part(COALESCE(MIN(NULLIF(TRIM(oel.referencia_embarque), '')), ''), ';', 1),
                      '\s+[A-Z]+$',
                      ''
                    )
                  ),
                  ''
                ) AS referencia_linea
         FROM ordenes_exportacion_lineas oel
         WHERE oel.orden_exportacion_id = oe.id
       ) rl ON true
       LEFT JOIN LATERAL (
         SELECT ${sqlEmbarqueDespachoFisicoCerrado()} AS embarque_despacho_cerrado
       ) em ON true
       WHERE c.orden_exportacion_id = $1
       ORDER BY c.indice`,
      [id]
    );
    const contenedores = [];
    for (const row of contRows.rows) {
      const contenido = await pool.query(
        `SELECT cc.id, cc.linea_id, cc.asignacion_id, cc.cantidad_bultos,
                COALESCE(cc.cantidad_bultos_stock, 0)::NUMERIC AS cantidad_bultos_stock,
                oel.cantidad_solicitada AS linea_solicitada
         FROM ordenes_exportacion_contenedor_contenido cc
         JOIN ordenes_exportacion_lineas oel ON oel.id = cc.linea_id
         WHERE cc.contenedor_id = $1 AND cc.asignacion_id IS NULL
         ORDER BY oel.id`,
        [row.id]
      );
      contenedores.push({ ...row, contenido: contenido.rows });
    }
    orden.contenedores = contenedores;

    orden.distribucion_balance_ok = await computeDistribucionBalanceOk(pool, id);

    orden.distribucion_por_asignacion = [];

    const distLineaQ = await pool.query(
      `SELECT oel.id AS linea_id, oel.cantidad_solicitada AS total_solicitado,
              COALESCE(SUM(cc.cantidad_bultos), 0)::NUMERIC AS suma_en_contenedores
       FROM ordenes_exportacion_lineas oel
       LEFT JOIN ordenes_exportacion_contenedor_contenido cc
         ON cc.linea_id = oel.id AND cc.asignacion_id IS NULL
       LEFT JOIN ordenes_exportacion_contenedores c ON c.id = cc.contenedor_id AND c.orden_exportacion_id = oel.orden_exportacion_id
       WHERE oel.orden_exportacion_id = $1
       GROUP BY oel.id, oel.cantidad_solicitada`,
      [id]
    );
    orden.distribucion_por_linea = distLineaQ.rows || [];

    res.json(orden);
  } catch (error) {
    console.error('Error obteniendo orden de exportación:', error);
    res.status(500).json({ message: 'Error al obtener orden' });
  }
});

// Crear orden con líneas
router.post('/', async (req, res) => {
  try {
    await initTables();
    const {
      numero_op, fecha_envio_op, prioridad, cliente_exportacion_id, cliente_id, especie_id, destino, estado,
      lineas, cantidad_contenedores, referencia_exportacion,
    } = req.body;
    const usuario_id = req.user?.id;
    if (!usuario_id) return res.status(401).json({ message: 'Usuario no autenticado' });
    if (!numero_op || !numero_op.trim()) return res.status(400).json({ message: 'N° OP es requerido' });
    if (!fecha_envio_op) return res.status(400).json({ message: 'Fecha envío OP es requerida' });
    const cc = Math.min(702, Math.max(1, parseInt(cantidad_contenedores, 10) || 1));
    const refEx = referencia_exportacion != null ? String(referencia_exportacion).trim() : '';

    const insertOrden = await pool.query(
      `INSERT INTO ordenes_exportacion (numero_op, fecha_envio_op, prioridad, cliente_exportacion_id, cliente_id, especie_id, destino, estado, cantidad_contenedores, referencia_exportacion, usuario_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, 'Pendiente'), $9, NULLIF($10, ''), $11)
       RETURNING id, numero_op, fecha_envio_op, prioridad, cliente_exportacion_id, cliente_id, especie_id, destino, estado, cantidad_contenedores, referencia_exportacion, usuario_id, created_at`,
      [
        numero_op.trim(),
        fecha_envio_op,
        Math.max(1, parseInt(prioridad, 10) || 1),
        cliente_exportacion_id || null,
        cliente_id || null,
        especie_id || null,
        destino?.trim() || null,
        estado,
        cc,
        refEx || null,
        usuario_id,
      ]
    );
    const orden = insertOrden.rows[0];
    await syncContenedoresForOrden(pool, orden.id, cc);

    const lineasArray = Array.isArray(lineas) ? lineas : [];
    for (const lin of lineasArray) {
      const producto_id = lin.producto_id;
      const cantidad_solicitada = Number(lin.cantidad_solicitada) || 0;
      if (!producto_id || cantidad_solicitada <= 0) continue;
      await pool.query(
        `INSERT INTO ordenes_exportacion_lineas (orden_exportacion_id, producto_id, cantidad_solicitada)
         VALUES ($1, $2, $3)`,
        [orden.id, producto_id, cantidad_solicitada]
      );
    }

    const full = await pool.query(
      `SELECT oe.id, oe.numero_op, oe.fecha_envio_op, oe.prioridad, oe.cliente_exportacion_id, oe.cliente_id, oe.especie_id, oe.destino, oe.estado,
              oe.cantidad_contenedores, oe.referencia_exportacion, oe.created_at,
              ce.nombre AS cliente_exportacion_nombre, c.nombre AS cliente_produccion_nombre, e.nombre AS especie_nombre
       FROM ordenes_exportacion oe
       LEFT JOIN clientes_exportacion ce ON ce.id = oe.cliente_exportacion_id
       LEFT JOIN clientes c ON c.id = oe.cliente_id
       LEFT JOIN especies e ON e.id = oe.especie_id
       WHERE oe.id = $1`,
      [orden.id]
    );
    const withLineas = full.rows[0];
    const lineasRes = await pool.query(
      `SELECT oel.id, oel.producto_id, oel.cantidad_solicitada, oel.cantidad_cargada,
              oel.referencia_embarque, oel.completado_at,
              p.codigo AS producto_codigo, p.producto AS producto_nombre, p.descripcion AS producto_descripcion, p.presentacion AS producto_presentacion,
              p.formato AS producto_formato, p.unidad_medida AS producto_unidad_medida
       FROM ordenes_exportacion_lineas oel JOIN productos p ON p.id = oel.producto_id
       WHERE oel.orden_exportacion_id = $1 ORDER BY p.codigo`,
      [orden.id]
    );
    withLineas.lineas = lineasRes.rows;
    try {
      await emitirNotificacion(pool, {
        tipo: 'op_exportacion_creada',
        modulo: 'Exportaciones',
        severidad: 'info',
        titulo: `OP creada: ${withLineas.numero_op}`,
        mensaje: `${withLineas.lineas?.length || 0} linea(s) registradas.`,
        origen_tabla: 'ordenes_exportacion',
        origen_id: withLineas.id,
        metadata: { orden_id: withLineas.id, numero_op: withLineas.numero_op, usuario_id },
      });
    } catch (eNotif) {
      console.warn('Notificación op_exportacion_creada:', eNotif.message);
    }

    res.status(201).json(withLineas);
  } catch (error) {
    if (error.code === '23505') return res.status(400).json({ message: 'Ya existe una orden con ese N° OP' });
    console.error('Error creando orden de exportación:', error);
    res.status(500).json({ message: 'Error al crear orden de exportación' });
  }
});

// Actualizar orden (cabecera y líneas)
router.put('/:id', async (req, res) => {
  try {
    await initTables();
    const { id } = req.params;
    const {
      numero_op, fecha_envio_op, prioridad, cliente_exportacion_id, cliente_id, especie_id, destino, estado,
      referencia_embarque, lineas, cantidad_contenedores, referencia_exportacion,
    } = req.body;
    const existing = await pool.query(
      `SELECT oe.id,
              GREATEST(1, COALESCE(oe.cantidad_contenedores, 1))::INT AS requeridos,
              (
                SELECT COUNT(*)::INT
                FROM ordenes_exportacion_contenedores c
                WHERE c.orden_exportacion_id = oe.id
                  AND (c.listo_para_exportar = TRUE OR c.despachado_at IS NOT NULL)
              ) AS enviados_listos
       FROM ordenes_exportacion oe
       WHERE oe.id = $1`,
      [id]
    );
    if (existing.rows.length === 0) return res.status(404).json({ message: 'Orden no encontrada' });
    const ordenMeta = existing.rows[0];
    if (Number(ordenMeta.enviados_listos) >= Number(ordenMeta.requeridos)) {
      return res.status(400).json({
        message: 'La OP completa y enviada a Listos para despacho no se puede modificar',
      });
    }

    const ccVal = cantidad_contenedores != null ? Math.min(702, Math.max(1, parseInt(cantidad_contenedores, 10) || 1)) : null;
    const refExUp = referencia_exportacion !== undefined ? (String(referencia_exportacion || '').trim() || null) : undefined;

    await pool.query(
      `UPDATE ordenes_exportacion SET
         numero_op = COALESCE(NULLIF(TRIM($1), ''), numero_op),
         fecha_envio_op = COALESCE($2, fecha_envio_op),
         prioridad = COALESCE($3, prioridad),
         cliente_exportacion_id = $4,
         cliente_id = $5,
         especie_id = $6,
         destino = $7,
         estado = COALESCE($8, estado),
         referencia_embarque = $9,
         cantidad_contenedores = COALESCE($10, cantidad_contenedores),
         referencia_exportacion = CASE WHEN $11::boolean THEN $12 ELSE referencia_exportacion END,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $13`,
      [
        numero_op,
        fecha_envio_op,
        prioridad != null ? Math.max(1, parseInt(prioridad, 10) || 1) : null,
        cliente_exportacion_id || null,
        cliente_id || null,
        especie_id || null,
        destino?.trim() ?? null,
        estado,
        referencia_embarque?.trim() || null,
        ccVal,
        referencia_exportacion !== undefined,
        refExUp,
        id,
      ]
    );

    const ordenCc = await pool.query('SELECT cantidad_contenedores FROM ordenes_exportacion WHERE id = $1', [id]);
    const ccFinal = Math.min(702, Math.max(1, parseInt(ordenCc.rows[0]?.cantidad_contenedores, 10) || 1));
    await syncContenedoresForOrden(pool, id, ccFinal);

    if (Array.isArray(lineas)) {
      await pool.query('DELETE FROM ordenes_exportacion_lineas WHERE orden_exportacion_id = $1', [id]);
      for (const lin of lineas) {
        const producto_id = lin.producto_id;
        const cantidad_solicitada = Number(lin.cantidad_solicitada) || 0;
        const cantidad_cargada = Number(lin.cantidad_cargada) || 0;
        if (!producto_id) continue;
        await pool.query(
          `INSERT INTO ordenes_exportacion_lineas (orden_exportacion_id, producto_id, cantidad_solicitada, cantidad_cargada)
           VALUES ($1, $2, $3, $4)`,
          [id, producto_id, cantidad_solicitada, cantidad_cargada]
        );
      }
    }

    const full = await pool.query(
      `SELECT oe.id, oe.numero_op, oe.fecha_envio_op, oe.prioridad, oe.cliente_exportacion_id, oe.cliente_id, oe.especie_id, oe.destino, oe.estado,
              oe.referencia_embarque, oe.referencia_exportacion, oe.cantidad_contenedores, oe.notificado_at, oe.updated_at,
              ce.nombre AS cliente_exportacion_nombre, c.nombre AS cliente_produccion_nombre, e.nombre AS especie_nombre
       FROM ordenes_exportacion oe
       LEFT JOIN clientes_exportacion ce ON ce.id = oe.cliente_exportacion_id
       LEFT JOIN clientes c ON c.id = oe.cliente_id
       LEFT JOIN especies e ON e.id = oe.especie_id
       WHERE oe.id = $1`,
      [id]
    );
    const orden = full.rows[0];
    const lineasRes = await pool.query(
      `SELECT oel.id, oel.producto_id, oel.cantidad_solicitada, oel.cantidad_cargada,
              oel.referencia_embarque, oel.completado_at,
              p.codigo AS producto_codigo, p.producto AS producto_nombre, p.descripcion AS producto_descripcion, p.presentacion AS producto_presentacion,
              p.formato AS producto_formato, p.unidad_medida AS producto_unidad_medida
       FROM ordenes_exportacion_lineas oel JOIN productos p ON p.id = oel.producto_id
       WHERE oel.orden_exportacion_id = $1 ORDER BY p.codigo`,
      [id]
    );
    orden.lineas = lineasRes.rows;
    res.json(orden);
  } catch (error) {
    if (error.code === '23505') return res.status(400).json({ message: 'Ya existe una orden con ese N° OP' });
    console.error('Error actualizando orden de exportación:', error);
    res.status(500).json({ message: 'Error al actualizar orden' });
  }
});

// Marcar como completado y notificar (estado Completo + notificado_at)
router.patch('/:id/completar', async (req, res) => {
  try {
    const { id } = req.params;
    const { referencia_embarque } = req.body;
    const referencia = String(referencia_embarque || '').trim();
    if (!referencia) {
      return res.status(400).json({ message: 'La referencia de embarque es obligatoria para completar la OP' });
    }
    const lineasQ = await pool.query(
      `SELECT COUNT(*)::INT AS total,
              SUM(CASE WHEN completado_at IS NOT NULL THEN 1 ELSE 0 END)::INT AS completadas,
              SUM(CASE WHEN COALESCE(cantidad_cargada, 0) >= COALESCE(cantidad_solicitada, 0) THEN 1 ELSE 0 END)::INT AS con_cantidad_cubierta
       FROM ordenes_exportacion_lineas
       WHERE orden_exportacion_id = $1`,
      [id]
    );
    const total = Number(lineasQ.rows[0]?.total || 0);
    const completas = Number(lineasQ.rows[0]?.completadas || 0);
    const cubiertas = Number(lineasQ.rows[0]?.con_cantidad_cubierta || 0);
    if (total <= 0 || completas < total || cubiertas < total) {
      return res.status(400).json({
        message: 'Para completar la OP, todas las líneas deben estar completadas y con cantidad asignada >= solicitada',
      });
    }
    const result = await pool.query(
      `UPDATE ordenes_exportacion SET estado = 'Completo', notificado_at = CURRENT_TIMESTAMP,
         referencia_embarque = $1,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, estado, notificado_at, referencia_embarque`,
      [referencia, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Orden no encontrada' });
    try {
      await emitirNotificacion(pool, {
        tipo: 'op_exportacion_completada',
        modulo: 'Exportaciones',
        severidad: 'success',
        titulo: 'Orden de exportación completada',
        mensaje: `Referencia embarque: ${referencia}.`,
        origen_tabla: 'ordenes_exportacion',
        origen_id: id,
        metadata: { orden_id: id, referencia_embarque: referencia, usuario_id: req.user?.id || null },
      });
    } catch (eNotif) {
      console.warn('Notificación op_exportacion_completada:', eNotif.message);
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error completando orden:', error);
    res.status(500).json({ message: 'Error al completar orden' });
  }
});

/**
 * Imputar a la línea de OP cantidad ya existente en almacén (bultos), sin depender del control de lote cerrado.
 * Suma a cantidad_cargada hasta el solicitado; valida stock total del producto.
 */
router.post('/:id/lineas/:lineaId/imputar-desde-stock', async (req, res) => {
  const client = await pool.connect();
  try {
    await initTables();
    const { id: ordenId, lineaId } = req.params;
    const { cantidad_bultos, lotes: lotesBody } = req.body;

    const normalizeLote = (l) => {
      const s = String(l ?? '').trim();
      return s === '' ? 'SIN LOTE' : s;
    };

    let lotesSolicitados = null;
    if (Array.isArray(lotesBody) && lotesBody.length > 0) {
      lotesSolicitados = lotesBody
        .map((x) => ({
          lote: normalizeLote(x.lote),
          cantidad_bultos: Number(x.cantidad_bultos),
        }))
        .filter((x) => Number.isFinite(x.cantidad_bultos) && x.cantidad_bultos > 0);
      if (lotesSolicitados.length === 0) {
        return res.status(400).json({ message: 'Indique al menos un lote con cantidad mayor a 0' });
      }
    }

    const add = lotesSolicitados
      ? lotesSolicitados.reduce((s, x) => s + x.cantidad_bultos, 0)
      : Number(cantidad_bultos);
    if (!Number.isFinite(add) || add <= 0) {
      return res.status(400).json({
        message: lotesSolicitados ? 'Las cantidades por lote no son válidas' : 'cantidad_bultos debe ser un número mayor que 0',
      });
    }

    await client.query('BEGIN');

    const lineaQ = await client.query(
      `SELECT oel.id, oel.producto_id, oel.cantidad_solicitada, oel.cantidad_cargada, oel.completado_at,
              oe.id AS orden_id, oe.estado AS orden_estado, oe.cliente_id AS orden_cliente_id
       FROM ordenes_exportacion_lineas oel
       JOIN ordenes_exportacion oe ON oe.id = oel.orden_exportacion_id
       WHERE oel.id = $1 AND oel.orden_exportacion_id = $2
       FOR UPDATE`,
      [lineaId, ordenId]
    );
    if (lineaQ.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Línea no encontrada' });
    }
    const row = lineaQ.rows[0];
    if (row.completado_at) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'La línea ya está completada' });
    }
    if (row.orden_estado === 'Completo' || row.orden_estado === 'Embarcado') {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'La orden no admite cambios en este estado' });
    }

    const sol = Number(row.cantidad_solicitada) || 0;
    const carg = Number(row.cantidad_cargada) || 0;
    const faltante = Math.max(0, sol - carg);
    if (faltante <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'La línea ya tiene la cantidad cargada al día del solicitado' });
    }

    const clienteId = row.orden_cliente_id || null;
    const stockPorLoteQ = clienteId
      ? await client.query(
          `SELECT COALESCE(NULLIF(TRIM(s.lote), ''), 'SIN LOTE') AS lote,
                  COALESCE(SUM(s.cantidad_bultos), 0)::NUMERIC AS total_bultos
           FROM stock_posiciones s
           JOIN productos pr ON pr.id = s.producto_id
           WHERE s.producto_id = $1 AND pr.cliente_id = $2
           GROUP BY COALESCE(NULLIF(TRIM(s.lote), ''), 'SIN LOTE')
           ORDER BY COALESCE(NULLIF(TRIM(s.lote), ''), 'SIN LOTE')`,
          [row.producto_id, clienteId]
        )
      : await client.query(
          `SELECT COALESCE(NULLIF(TRIM(s.lote), ''), 'SIN LOTE') AS lote,
                  COALESCE(SUM(s.cantidad_bultos), 0)::NUMERIC AS total_bultos
           FROM stock_posiciones s
           WHERE s.producto_id = $1
           GROUP BY COALESCE(NULLIF(TRIM(s.lote), ''), 'SIN LOTE')
           ORDER BY COALESCE(NULLIF(TRIM(s.lote), ''), 'SIN LOTE')`,
          [row.producto_id]
        );
    const stockBultos = stockPorLoteQ.rows.reduce((s, r) => s + (Number(r.total_bultos) || 0), 0);
    if (stockBultos <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'No hay stock en almacén para este producto' });
    }

    const reservadoPorLoteQ = clienteId
      ? await client.query(
          `SELECT COALESCE(NULLIF(TRIM(a.lote), ''), 'SIN LOTE') AS lote,
                  COALESCE(SUM(a.cantidad_bultos), 0)::NUMERIC AS reservado_bultos
           FROM ordenes_exportacion_linea_asignaciones a
           JOIN ordenes_exportacion_lineas oel ON oel.id = a.linea_id
           JOIN ordenes_exportacion oe ON oe.id = oel.orden_exportacion_id
           JOIN productos pr ON pr.id = oel.producto_id
           WHERE oel.producto_id = $1
             AND oe.estado IN ('Pendiente', 'En producción', 'Completo')
             AND pr.cliente_id = $2
           GROUP BY COALESCE(NULLIF(TRIM(a.lote), ''), 'SIN LOTE')`,
          [row.producto_id, clienteId]
        )
      : await client.query(
          `SELECT COALESCE(NULLIF(TRIM(a.lote), ''), 'SIN LOTE') AS lote,
                  COALESCE(SUM(a.cantidad_bultos), 0)::NUMERIC AS reservado_bultos
           FROM ordenes_exportacion_linea_asignaciones a
           JOIN ordenes_exportacion_lineas oel ON oel.id = a.linea_id
           JOIN ordenes_exportacion oe ON oe.id = oel.orden_exportacion_id
           WHERE oel.producto_id = $1
             AND oe.estado IN ('Pendiente', 'En producción', 'Completo')
           GROUP BY COALESCE(NULLIF(TRIM(a.lote), ''), 'SIN LOTE')`,
          [row.producto_id]
        );

    const reservadoByLote = new Map(
      reservadoPorLoteQ.rows.map((r) => [String(r.lote), Number(r.reservado_bultos) || 0])
    );
    const lotesDisponibles = stockPorLoteQ.rows
      .map((r) => {
        const lote = String(r.lote);
        const total = Number(r.total_bultos) || 0;
        const reservado = reservadoByLote.get(lote) || 0;
        const disponible = Math.max(0, total - reservado);
        return { lote, total, reservado, disponible };
      })
      .filter((x) => x.disponible > 0);

    const stockDisponible = lotesDisponibles.reduce((s, x) => s + x.disponible, 0);
    const reservadoBultos = Math.max(0, stockBultos - stockDisponible);
    const dispByLote = new Map(lotesDisponibles.map((x) => [x.lote, x]));

    let aplicar;
    if (lotesSolicitados) {
      const sumReq = lotesSolicitados.reduce((s, x) => s + x.cantidad_bultos, 0);
      if (sumReq > faltante + 1e-6) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          message: `La suma por lotes (${sumReq}) supera el faltante en la línea (${faltante} bultos)`,
        });
      }
      for (const req of lotesSolicitados) {
        const d = dispByLote.get(req.lote);
        if (!d || d.disponible + 1e-9 < req.cantidad_bultos) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            message: `Lote "${req.lote}": no hay suficiente disponible (máx. ${d ? Number(d.disponible).toFixed(2) : 0} bultos)`,
          });
        }
      }
      aplicar = sumReq;
    } else {
      aplicar = Math.min(add, faltante, stockDisponible);
    }

    if (aplicar <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: 'No se puede imputar: ese stock ya está reservado/cargado en OP activas o no hay disponible',
        faltante_bultos: faltante,
        stock_bultos_disponible: stockDisponible,
        stock_bultos_total: stockBultos,
        stock_bultos_reservado: reservadoBultos,
      });
    }

    const upd = await client.query(
      `UPDATE ordenes_exportacion_lineas
       SET cantidad_cargada = LEAST(cantidad_solicitada, cantidad_cargada + $1), created_at = created_at
       WHERE id = $2 AND orden_exportacion_id = $3
       RETURNING id, producto_id, cantidad_solicitada, cantidad_cargada`,
      [aplicar, lineaId, ordenId]
    );

    const asignaciones = [];
    if (lotesSolicitados) {
      for (const req of lotesSolicitados) {
        const insAsig = await client.query(
          `INSERT INTO ordenes_exportacion_linea_asignaciones (linea_id, lote, cantidad_bultos, origen)
           VALUES ($1, $2, $3, 'stock')
           RETURNING id, linea_id, lote, cantidad_bultos, origen, created_at`,
          [lineaId, req.lote, req.cantidad_bultos]
        );
        asignaciones.push(insAsig.rows[0]);
      }
    } else {
      let restante = aplicar;
      for (const l of lotesDisponibles) {
        if (restante <= 0) break;
        const take = Math.min(restante, l.disponible);
        if (take <= 0) continue;
        const insAsig = await client.query(
          `INSERT INTO ordenes_exportacion_linea_asignaciones (linea_id, lote, cantidad_bultos, origen)
           VALUES ($1, $2, $3, 'stock')
           RETURNING id, linea_id, lote, cantidad_bultos, origen, created_at`,
          [lineaId, l.lote, take]
        );
        asignaciones.push(insAsig.rows[0]);
        restante -= take;
      }
    }

    await client.query(
      `UPDATE ordenes_exportacion SET estado = CASE WHEN estado = 'Pendiente' THEN 'En producción' ELSE estado END,
         updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND estado = 'Pendiente'`,
      [ordenId]
    );

    await client.query('COMMIT');
    res.json({
      linea: upd.rows[0],
      asignaciones,
      imputado_bultos: aplicar,
      solicitado: add,
      stock_bultos_disponible: stockDisponible,
      stock_bultos_total: stockBultos,
      stock_bultos_reservado: reservadoBultos,
      mensaje: lotesSolicitados
        ? `Se imputaron ${aplicar} bultos desde los lotes seleccionados.`
        : aplicar < add
          ? `Se imputaron ${aplicar} bultos (límite por faltante o stock disponible no reservado).`
          : `Se imputaron ${aplicar} bultos desde stock de almacén.`,
    });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('Error imputando desde stock:', error);
    res.status(500).json({ message: 'Error al imputar desde stock' });
  } finally {
    client.release();
  }
});

// Guardar distribución del contenedor (reemplaza filas del contenedor). Solo totales por línea de producto (bultos), sin lotes.
router.put('/:id/contenedores/:contenedorId/distribucion', async (req, res) => {
  const client = await pool.connect();
  try {
    await initTables();
    const { id: ordenId, contenedorId } = req.params;
    const { items } = req.body;
    if (!Array.isArray(items)) {
      return res.status(400).json({
        message: 'items debe ser un arreglo de { linea_id, cantidad_bultos [, cantidad_bultos_stock] }',
      });
    }

    await client.query('BEGIN');

    const contQ = await client.query(
      `SELECT c.id, c.orden_exportacion_id, oe.estado AS orden_estado
       FROM ordenes_exportacion_contenedores c
       JOIN ordenes_exportacion oe ON oe.id = c.orden_exportacion_id
       WHERE c.id = $1 AND c.orden_exportacion_id = $2
       FOR UPDATE`,
      [contenedorId, ordenId]
    );
    if (contQ.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Contenedor no encontrado' });
    }
    if (contQ.rows[0].orden_estado === 'Embarcado') {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'La orden no admite cambios en este estado' });
    }

    await client.query('DELETE FROM ordenes_exportacion_contenedor_contenido WHERE contenedor_id = $1', [contenedorId]);

    for (const it of items) {
      const lineaId = it.linea_id;
      const cb = Number(it.cantidad_bultos);
      if (!lineaId || !Number.isFinite(cb) || cb <= 0) continue;

      const csRaw = it.cantidad_bultos_stock;
      const cs = Number.isFinite(Number(csRaw)) ? Number(csRaw) : 0;

      const lineaQ = await client.query(
        `SELECT oel.id, oel.cantidad_solicitada, oel.cantidad_cargada, oel.orden_exportacion_id
         FROM ordenes_exportacion_lineas oel
         WHERE oel.id = $1 AND oel.orden_exportacion_id = $2`,
        [lineaId, ordenId]
      );
      if (lineaQ.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Línea no pertenece a esta orden' });
      }
      const lineaRow = lineaQ.rows[0];
      if (cb > Number(lineaRow.cantidad_solicitada) + 1e-9) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Cantidad mayor que lo solicitado en la línea' });
      }
      if (cs < -1e-9) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'cantidad_bultos_stock no puede ser negativa' });
      }
      if (cs > cb + 1e-6) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          message: 'Los bultos desde stock en un contenedor no pueden superar los bultos de requerimiento en esa celda',
        });
      }
      const cargada = Number(lineaRow.cantidad_cargada) || 0;
      if (cs > cargada + 1e-6) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          message: 'Los bultos desde stock no pueden superar lo imputado a la línea en almacén',
        });
      }
      await client.query(
        `INSERT INTO ordenes_exportacion_contenedor_contenido (contenedor_id, linea_id, asignacion_id, cantidad_bultos, cantidad_bultos_stock)
         VALUES ($1, $2, NULL, $3, $4)`,
        [contenedorId, lineaId, cb, cs]
      );
    }

    const lineasQ = await client.query(
      `SELECT oel.id, oel.cantidad_solicitada
       FROM ordenes_exportacion_lineas oel
       WHERE oel.orden_exportacion_id = $1`,
      [ordenId]
    );
    for (const lr of lineasQ.rows) {
      const sumQ = await client.query(
        `SELECT COALESCE(SUM(cc.cantidad_bultos), 0)::NUMERIC AS s
         FROM ordenes_exportacion_contenedor_contenido cc
         JOIN ordenes_exportacion_contenedores c ON c.id = cc.contenedor_id
         WHERE c.orden_exportacion_id = $1 AND cc.linea_id = $2 AND cc.asignacion_id IS NULL`,
        [ordenId, lr.id]
      );
      const suma = Number(sumQ.rows[0]?.s) || 0;
      const sol = Number(lr.cantidad_solicitada) || 0;
      if (suma > sol + 1e-6) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          message: `La suma en contenedores (${suma}) supera lo solicitado (${sol} bultos) en una línea`,
        });
      }
    }

    const lineasStockQ = await client.query(
      `SELECT oel.id, oel.cantidad_cargada
       FROM ordenes_exportacion_lineas oel
       WHERE oel.orden_exportacion_id = $1`,
      [ordenId]
    );
    for (const lr of lineasStockQ.rows) {
      const sumStockQ = await client.query(
        `SELECT COALESCE(SUM(cc.cantidad_bultos_stock), 0)::NUMERIC AS s
         FROM ordenes_exportacion_contenedor_contenido cc
         JOIN ordenes_exportacion_contenedores c ON c.id = cc.contenedor_id
         WHERE c.orden_exportacion_id = $1 AND cc.linea_id = $2 AND cc.asignacion_id IS NULL`,
        [ordenId, lr.id]
      );
      const sumaS = Number(sumStockQ.rows[0]?.s) || 0;
      const carg = Number(lr.cantidad_cargada) || 0;
      if (sumaS > carg + 1e-6) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          message: `La suma de bultos desde stock en contenedores (${sumaS}) supera lo imputado en almacén (${carg}) en una línea`,
        });
      }
    }

    await client.query(
      `UPDATE ordenes_exportacion_contenedores SET listo_para_exportar = FALSE WHERE id = $1`,
      [contenedorId]
    );

    await client.query('COMMIT');
    res.json({ message: 'Distribución del contenedor guardada' });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('Error guardando distribución contenedor:', error);
    res.status(500).json({ message: 'Error al guardar distribución' });
  } finally {
    client.release();
  }
});

// Referencia de exportación (prefijo sin letra), p. ej. SVF001-26 → códigos SVF001-26 A, B…
router.patch('/:id/referencia-exportacion', async (req, res) => {
  try {
    await initTables();
    const { id } = req.params;
    const ref = String(req.body?.referencia_exportacion ?? '').trim();
    if (!ref) {
      return res.status(400).json({ message: 'referencia_exportacion es obligatoria' });
    }
    const result = await pool.query(
      `UPDATE ordenes_exportacion SET referencia_exportacion = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, referencia_exportacion`,
      [ref, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Orden no encontrada' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error actualizando referencia exportación:', error);
    res.status(500).json({ message: 'Error al actualizar referencia' });
  }
});

router.patch('/:id/fecha-probable-embarque', async (req, res) => {
  try {
    await initTables();
    const { id } = req.params;
    const raw = req.body?.fecha_probable_embarque;
    let fecha = null;
    if (raw != null && String(raw).trim() !== '') {
      const s = String(raw).trim().slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        return res.status(400).json({ message: 'fecha_probable_embarque debe ser YYYY-MM-DD' });
      }
      fecha = s;
    }
    const result = await pool.query(
      `UPDATE ordenes_exportacion SET fecha_probable_embarque = $1::date, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, fecha_probable_embarque`,
      [fecha, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Orden no encontrada' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error actualizando fecha probable embarque:', error);
    res.status(500).json({ message: 'Error al guardar fecha probable de embarque' });
  }
});

// Marcar contenedor listo para exportar
router.patch('/:id/contenedores/:contenedorId/listo-exportar', async (req, res) => {
  const client = await pool.connect();
  try {
    await initTables();
    const { id: ordenId, contenedorId } = req.params;
    const listo = req.body?.listo !== false;

    await client.query('BEGIN');

    const lineasQ = await client.query(
      `SELECT oel.id, oel.cantidad_solicitada
       FROM ordenes_exportacion_lineas oel
       WHERE oel.orden_exportacion_id = $1`,
      [ordenId]
    );
    for (const lr of lineasQ.rows) {
      const sumQ = await client.query(
        `SELECT COALESCE(SUM(cc.cantidad_bultos), 0)::NUMERIC AS s
         FROM ordenes_exportacion_contenedor_contenido cc
         JOIN ordenes_exportacion_contenedores c ON c.id = cc.contenedor_id
         WHERE c.orden_exportacion_id = $1 AND cc.linea_id = $2 AND cc.asignacion_id IS NULL`,
        [ordenId, lr.id]
      );
      const suma = Number(sumQ.rows[0]?.s) || 0;
      const sol = Number(lr.cantidad_solicitada) || 0;
      if (suma > sol + 1e-6) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          message: 'La suma en contenedores supera lo solicitado en al menos un producto',
        });
      }
    }
    if (listo) {
      const contSum = await client.query(
        `SELECT COALESCE(SUM(cantidad_bultos), 0)::NUMERIC AS s
         FROM ordenes_exportacion_contenedor_contenido WHERE contenedor_id = $1`,
        [contenedorId]
      );
      const s = Number(contSum.rows[0]?.s) || 0;
      if (s <= 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          message: 'Asigne al menos una cantidad en este contenedor antes de marcarlo listo',
        });
      }
    }

    await client.query(
      `UPDATE ordenes_exportacion_contenedores c SET listo_para_exportar = $1
       FROM ordenes_exportacion oe
       WHERE c.id = $2 AND c.orden_exportacion_id = oe.id AND oe.id = $3`,
      [listo, contenedorId, ordenId]
    );

    await client.query('COMMIT');
    try {
      await emitirNotificacion(pool, {
        tipo: listo ? 'contenedor_listo' : 'contenedor_no_listo',
        modulo: 'Exportaciones',
        severidad: listo ? 'info' : 'warning',
        titulo: listo ? 'Contenedor listo para despacho' : 'Contenedor desmarcado de listo',
        mensaje: `Orden ${ordenId}.`,
        origen_tabla: 'ordenes_exportacion_contenedores',
        origen_id: contenedorId,
        metadata: { orden_id: ordenId, contenedor_id: contenedorId, listo, usuario_id: req.user?.id || null },
      });
    } catch (eNotif) {
      console.warn('Notificación contenedor_listo:', eNotif.message);
    }
    res.json({ message: listo ? 'Contenedor marcado listo para despacho' : 'Marcado revertido', listo_para_exportar: listo });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('Error marcando listo exportar:', error);
    res.status(500).json({ message: 'Error al actualizar contenedor' });
  } finally {
    client.release();
  }
});

// Confirmar despacho del contenedor: referencia obligatoria (sin letra), marca despachado_at (no exportado_at)
router.patch('/:id/contenedores/:contenedorId/completar-exportar', async (req, res) => {
  try {
    await initTables();
    const { id: ordenId, contenedorId } = req.params;
    const ref = String(req.body?.referencia_exportacion ?? '').trim();
    if (!ref) {
      return res.status(400).json({ message: 'La referencia de embarque es obligatoria' });
    }

    const balanceOk = await computeDistribucionBalanceOk(pool, ordenId);
    if (!balanceOk) {
      return res.status(400).json({
        message:
          'Guarde la distribución completa: la suma por producto en contenedores debe coincidir con lo solicitado en la OP.',
      });
    }

    const sumCont = await pool.query(
      `SELECT COALESCE(SUM(cc.cantidad_bultos), 0)::NUMERIC AS s
       FROM ordenes_exportacion_contenedor_contenido cc
       WHERE cc.contenedor_id = $1`,
      [contenedorId]
    );
    const s = Number(sumCont.rows[0]?.s) || 0;
    if (s <= 0) {
      return res.status(400).json({ message: 'Este contenedor no tiene carga distribuida' });
    }

    const filasContQ = await pool.query(
      `SELECT cc.cantidad_bultos::NUMERIC AS req, COALESCE(cc.cantidad_bultos_stock, 0)::NUMERIC AS st
       FROM ordenes_exportacion_contenedor_contenido cc
       WHERE cc.contenedor_id = $1 AND cc.asignacion_id IS NULL`,
      [contenedorId]
    );
    const eps = 0.01;
    for (const fr of filasContQ.rows) {
      const req = Number(fr.req) || 0;
      const st = Number(fr.st) || 0;
      if (Math.abs(req - st) > eps) {
        return res.status(400).json({
          message:
            'No se puede confirmar el despacho: en cada fila del contenedor los bultos de requisito deben coincidir con los bultos desde stock (real). Ajuste la distribución o el reparto de stock.',
        });
      }
    }

    const result = await pool.query(
      `UPDATE ordenes_exportacion_contenedores c SET
         referencia_exportacion = $1,
         despachado_at = CURRENT_TIMESTAMP,
         listo_para_exportar = FALSE
       FROM ordenes_exportacion oe
       WHERE c.id = $2 AND c.orden_exportacion_id = oe.id AND oe.id = $3
         AND c.despachado_at IS NULL
       RETURNING c.id, c.despachado_at, c.referencia_exportacion, c.letra`,
      [ref, contenedorId, ordenId]
    );
    if (result.rows.length === 0) {
      return res.status(400).json({ message: 'Contenedor no encontrado o ya despachado' });
    }
    const row = result.rows[0];
    const codigo = `${ref} ${row.letra}`.trim();

    await syncLineasEstadoPorExportacion(pool, ordenId);
    try {
      await emitirNotificacion(pool, {
        tipo: 'contenedor_despachado_op',
        modulo: 'Exportaciones',
        severidad: 'success',
        titulo: `Contenedor despachado: ${codigo}`,
        mensaje: 'Despacho físico confirmado para contenedor.',
        origen_tabla: 'ordenes_exportacion_contenedores',
        origen_id: contenedorId,
        metadata: { orden_id: ordenId, contenedor_id: contenedorId, codigo_exportacion: codigo, usuario_id: req.user?.id || null },
      });
    } catch (eNotif) {
      console.warn('Notificación contenedor_despachado_op:', eNotif.message);
    }

    res.json({
      message: 'Despacho del contenedor confirmado (referencia registrada). La exportación formal se marca al cerrar documentación.',
      codigo_exportacion: codigo,
      contenedor: row,
    });
  } catch (error) {
    console.error('Error completando exportación contenedor:', error);
    res.status(500).json({ message: 'Error al confirmar despacho del contenedor' });
  }
});

/** Documentación / exportación formal (etapa final, tras despacho físico). */
router.patch('/:id/contenedores/:contenedorId/marcar-exportado', async (req, res) => {
  try {
    await initTables();
    const { id: ordenId, contenedorId } = req.params;
    const result = await pool.query(
      `UPDATE ordenes_exportacion_contenedores c SET exportado_at = CURRENT_TIMESTAMP
       FROM ordenes_exportacion oe
       WHERE c.id = $1 AND c.orden_exportacion_id = oe.id AND oe.id = $2
         AND c.despachado_at IS NOT NULL
         AND c.exportado_at IS NULL
       RETURNING c.id, c.exportado_at, c.letra`,
      [contenedorId, ordenId]
    );
    if (result.rows.length === 0) {
      return res.status(400).json({
        message: 'Contenedor no encontrado, sin despacho previo o ya marcado como exportado',
      });
    }
    try {
      await emitirNotificacion(pool, {
        tipo: 'contenedor_exportado',
        modulo: 'Exportaciones',
        severidad: 'success',
        titulo: 'Contenedor marcado exportado',
        mensaje: 'Exportación documental confirmada.',
        origen_tabla: 'ordenes_exportacion_contenedores',
        origen_id: contenedorId,
        metadata: { orden_id: ordenId, contenedor_id: contenedorId, usuario_id: req.user?.id || null },
      });
    } catch (eNotif) {
      console.warn('Notificación contenedor_exportado:', eNotif.message);
    }
    res.json({ message: 'Contenedor marcado como exportado (documentación)', contenedor: result.rows[0] });
  } catch (error) {
    console.error('Error marcando exportado contenedor:', error);
    res.status(500).json({ message: 'Error al marcar exportado' });
  }
});

/** Quitar despacho (solo Admin): permite corregir distribución. */
router.patch('/:id/contenedores/:contenedorId/revertir-exportacion', checkPermission('exportaciones.ordenes', 'operate'), async (req, res) => {
  const client = await pool.connect();
  try {
    await initTables();
    const { id: ordenId, contenedorId } = req.params;
    await client.query('BEGIN');

    const contInfo = await client.query(
      `SELECT c.id, c.letra, c.referencia_exportacion, oe.numero_op,
              TRIM(COALESCE(
                NULLIF(TRIM(oe.referencia_exportacion), ''),
                NULLIF(TRIM(c.referencia_exportacion), ''),
                rl.referencia_linea,
                oe.numero_op::text
              )) AS referencia_grupo
       FROM ordenes_exportacion_contenedores c
       JOIN ordenes_exportacion oe ON oe.id = c.orden_exportacion_id
       LEFT JOIN LATERAL (
         SELECT NULLIF(
                  TRIM(
                    regexp_replace(
                      split_part(COALESCE(MIN(NULLIF(TRIM(oel.referencia_embarque), '')), ''), ';', 1),
                      '\s+[A-Z]+$',
                      ''
                    )
                  ),
                  ''
                ) AS referencia_linea
         FROM ordenes_exportacion_lineas oel
         WHERE oel.orden_exportacion_id = oe.id
       ) rl ON true
       WHERE c.id = $1 AND oe.id = $2
       FOR UPDATE`,
      [contenedorId, ordenId]
    );
    if (contInfo.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Contenedor no encontrado' });
    }
    const referenciaGrupo = String(contInfo.rows[0].referencia_grupo || '').trim();
    const numeroOp = String(contInfo.rows[0].numero_op || '').trim();

    if (numeroOp && referenciaGrupo) {
      const embCerrado = await client.query(
        `SELECT 1 FROM despachos d
         WHERE d.tipo_salida = 'Embarque'
           AND TRIM(COALESCE(d.orden_produccion, '')) = $1
           AND TRIM(COALESCE(d.estado, '')) = 'Despachado'
           AND COALESCE(d.observaciones, '') ILIKE ('%Referencia: ' || $2 || '%')
         LIMIT 1`,
        [numeroOp, referenciaGrupo]
      );
      if (embCerrado.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          message:
            'Este embarque ya consta como despachado. Debe revertir o reabrir el despacho en el módulo Despachos antes de poder revertir la referencia aquí.',
        });
      }
    }

    const result = await client.query(
      `UPDATE ordenes_exportacion_contenedores c SET
         despachado_at = NULL,
         exportado_at = NULL,
         referencia_exportacion = NULL,
         listo_para_exportar = FALSE
       FROM ordenes_exportacion oe
       WHERE c.id = $1 AND c.orden_exportacion_id = oe.id AND oe.id = $2
         AND c.despachado_at IS NOT NULL
       RETURNING c.id, c.indice, c.letra`,
      [contenedorId, ordenId]
    );
    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Contenedor no encontrado o no estaba despachado' });
    }

    // Despachos «Embarque» pendientes (no cerrados) generados desde Listos para despacho: se eliminan al revertir referencia.
    // Los despachos ya en estado Despachado no se tocan aquí (el usuario debe revertirlos antes en Despachos).
    if (numeroOp && referenciaGrupo) {
      const despachosQ = await client.query(
        `SELECT id FROM despachos
         WHERE tipo_salida = 'Embarque'
           AND TRIM(COALESCE(orden_produccion, '')) = $1
           AND COALESCE(observaciones, '') ILIKE $2
           AND TRIM(COALESCE(estado, '')) <> 'Despachado'`,
        [numeroOp, `%Referencia: ${referenciaGrupo}%`]
      );

      for (const d of despachosQ.rows) {
        await client.query('DELETE FROM despachos WHERE id = $1', [d.id]);
      }
    }

    await syncLineasEstadoPorExportacion(client, ordenId);
    await client.query('COMMIT');
    try {
      await emitirNotificacion(pool, {
        tipo: 'contenedor_revertido',
        modulo: 'Exportaciones',
        severidad: 'warning',
        titulo: 'Referencia de contenedor revertida',
        mensaje: 'Se revirtió un despacho/referencia de contenedor.',
        origen_tabla: 'ordenes_exportacion_contenedores',
        origen_id: contenedorId,
        metadata: { orden_id: ordenId, contenedor_id: contenedorId, usuario_id: req.user?.id || null },
      });
    } catch (eNotif) {
      console.warn('Notificación contenedor_revertido:', eNotif.message);
    }
    res.json({
      message:
        'Referencia revertida. Si había un despacho de embarque pendiente (no cerrado) vinculado a esta referencia, fue eliminado.',
      contenedor: result.rows[0],
    });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('Error revirtiendo exportación contenedor:', error);
    res.status(500).json({ message: 'Error al revertir despacho' });
  } finally {
    client.release();
  }
});

// Marcar contenedor como despachado (sin referencia; flujo alternativo)
router.patch('/:id/contenedores/:contenedorId/despachar', async (req, res) => {
  try {
    await initTables();
    const { id: ordenId, contenedorId } = req.params;
    const result = await pool.query(
      `UPDATE ordenes_exportacion_contenedores c SET despachado_at = CURRENT_TIMESTAMP, listo_para_exportar = FALSE
       FROM ordenes_exportacion oe
       WHERE c.id = $1 AND c.orden_exportacion_id = oe.id AND oe.id = $2
         AND c.despachado_at IS NULL AND c.listo_para_exportar = TRUE
       RETURNING c.id, c.despachado_at`,
      [contenedorId, ordenId]
    );
    if (result.rows.length === 0) {
      return res.status(400).json({
        message: 'Contenedor no encontrado, ya despachado o no está listo para despacho',
      });
    }
    await syncLineasEstadoPorExportacion(pool, ordenId);
    try {
      await emitirNotificacion(pool, {
        tipo: 'contenedor_despachado_op',
        modulo: 'Exportaciones',
        severidad: 'success',
        titulo: 'Contenedor despachado',
        mensaje: 'Contenedor marcado como despachado.',
        origen_tabla: 'ordenes_exportacion_contenedores',
        origen_id: contenedorId,
        metadata: { orden_id: ordenId, contenedor_id: contenedorId, usuario_id: req.user?.id || null },
      });
    } catch (eNotif) {
      console.warn('Notificación contenedor_despachado_op alt:', eNotif.message);
    }
    res.json({ message: 'Contenedor marcado como despachado', contenedor: result.rows[0] });
  } catch (error) {
    console.error('Error despachando contenedor:', error);
    res.status(500).json({ message: 'Error al marcar despacho' });
  }
});

// Ver detalle de lotes asignados a una línea y disponibilidad restante por lote para ese producto
router.get('/:id/lineas/:lineaId/detalle-lotes', async (req, res) => {
  try {
    await initTables();
    const { id: ordenId, lineaId } = req.params;
    const lineaQ = await pool.query(
      `SELECT oel.id, oel.producto_id, oel.cantidad_solicitada, oel.cantidad_cargada,
              oe.cliente_id AS orden_cliente_id, oe.estado AS orden_estado
       FROM ordenes_exportacion_lineas oel
       JOIN ordenes_exportacion oe ON oe.id = oel.orden_exportacion_id
       WHERE oel.id = $1 AND oel.orden_exportacion_id = $2`,
      [lineaId, ordenId]
    );
    if (lineaQ.rows.length === 0) return res.status(404).json({ message: 'Línea no encontrada' });
    const linea = lineaQ.rows[0];
    const clienteId = linea.orden_cliente_id || null;

    const asignQ = await pool.query(
      `SELECT a.id, a.linea_id, a.lote, a.cantidad_bultos, a.origen, a.created_at
       FROM ordenes_exportacion_linea_asignaciones a
       WHERE a.linea_id = $1
       ORDER BY a.created_at DESC`,
      [lineaId]
    );

    const stockPorLoteQ = clienteId
      ? await pool.query(
          `SELECT COALESCE(NULLIF(TRIM(s.lote), ''), 'SIN LOTE') AS lote,
                  COALESCE(SUM(s.cantidad_bultos), 0)::NUMERIC AS total_bultos
           FROM stock_posiciones s
           JOIN productos pr ON pr.id = s.producto_id
           WHERE s.producto_id = $1 AND pr.cliente_id = $2
           GROUP BY COALESCE(NULLIF(TRIM(s.lote), ''), 'SIN LOTE')`,
          [linea.producto_id, clienteId]
        )
      : await pool.query(
          `SELECT COALESCE(NULLIF(TRIM(s.lote), ''), 'SIN LOTE') AS lote,
                  COALESCE(SUM(s.cantidad_bultos), 0)::NUMERIC AS total_bultos
           FROM stock_posiciones s
           WHERE s.producto_id = $1
           GROUP BY COALESCE(NULLIF(TRIM(s.lote), ''), 'SIN LOTE')`,
          [linea.producto_id]
        );

    const reservadoPorLoteQ = clienteId
      ? await pool.query(
          `SELECT COALESCE(NULLIF(TRIM(a.lote), ''), 'SIN LOTE') AS lote,
                  COALESCE(SUM(a.cantidad_bultos), 0)::NUMERIC AS reservado_bultos
           FROM ordenes_exportacion_linea_asignaciones a
           JOIN ordenes_exportacion_lineas oel ON oel.id = a.linea_id
           JOIN ordenes_exportacion oe ON oe.id = oel.orden_exportacion_id
           JOIN productos pr ON pr.id = oel.producto_id
           WHERE oel.producto_id = $1
             AND oe.estado IN ('Pendiente', 'En producción', 'Completo')
             AND pr.cliente_id = $2
           GROUP BY COALESCE(NULLIF(TRIM(a.lote), ''), 'SIN LOTE')`,
          [linea.producto_id, clienteId]
        )
      : await pool.query(
          `SELECT COALESCE(NULLIF(TRIM(a.lote), ''), 'SIN LOTE') AS lote,
                  COALESCE(SUM(a.cantidad_bultos), 0)::NUMERIC AS reservado_bultos
           FROM ordenes_exportacion_linea_asignaciones a
           JOIN ordenes_exportacion_lineas oel ON oel.id = a.linea_id
           JOIN ordenes_exportacion oe ON oe.id = oel.orden_exportacion_id
           WHERE oel.producto_id = $1
             AND oe.estado IN ('Pendiente', 'En producción', 'Completo')
           GROUP BY COALESCE(NULLIF(TRIM(a.lote), ''), 'SIN LOTE')`,
          [linea.producto_id]
        );
    const reservadoByLote = new Map(
      reservadoPorLoteQ.rows.map((r) => [String(r.lote), Number(r.reservado_bultos) || 0])
    );
    const disponibles = stockPorLoteQ.rows.map((r) => {
      const lote = String(r.lote);
      const total = Number(r.total_bultos) || 0;
      const reservado = reservadoByLote.get(lote) || 0;
      return { lote, total_bultos: total, reservado_bultos: reservado, disponible_bultos: Math.max(0, total - reservado) };
    });

    res.json({ linea, asignaciones: asignQ.rows, disponibles });
  } catch (error) {
    console.error('Error detalle lotes OP:', error);
    res.status(500).json({ message: 'Error al obtener detalle de lotes' });
  }
});

// Disponibilidad real por producto para esta OP (stock - reservado en OP activas)
router.get('/:id/disponibilidad-productos', async (req, res) => {
  try {
    await initTables();
    const { id: ordenId } = req.params;
    const ordenQ = await pool.query('SELECT id, cliente_id FROM ordenes_exportacion WHERE id = $1', [ordenId]);
    if (ordenQ.rows.length === 0) return res.status(404).json({ message: 'Orden no encontrada' });
    const clienteId = ordenQ.rows[0].cliente_id || null;
    const lineasQ = await pool.query(
      'SELECT DISTINCT producto_id FROM ordenes_exportacion_lineas WHERE orden_exportacion_id = $1',
      [ordenId]
    );
    const productoIds = lineasQ.rows.map((r) => r.producto_id);
    if (productoIds.length === 0) return res.json({ data: [] });

    const stockQ = clienteId
      ? await pool.query(
          `SELECT s.producto_id, COALESCE(SUM(s.cantidad_bultos), 0)::NUMERIC AS total_bultos
           FROM stock_posiciones s
           JOIN productos pr ON pr.id = s.producto_id
           WHERE s.producto_id = ANY($1::uuid[]) AND pr.cliente_id = $2
           GROUP BY s.producto_id`,
          [productoIds, clienteId]
        )
      : await pool.query(
          `SELECT s.producto_id, COALESCE(SUM(s.cantidad_bultos), 0)::NUMERIC AS total_bultos
           FROM stock_posiciones s
           WHERE s.producto_id = ANY($1::uuid[])
           GROUP BY s.producto_id`,
          [productoIds]
        );
    const stockByProducto = new Map(stockQ.rows.map((r) => [String(r.producto_id), Number(r.total_bultos) || 0]));

    const reservadoQ = clienteId
      ? await pool.query(
          `SELECT oel.producto_id, COALESCE(SUM(a.cantidad_bultos), 0)::NUMERIC AS reservado_bultos
           FROM ordenes_exportacion_linea_asignaciones a
           JOIN ordenes_exportacion_lineas oel ON oel.id = a.linea_id
           JOIN ordenes_exportacion oe ON oe.id = oel.orden_exportacion_id
           JOIN productos pr ON pr.id = oel.producto_id
           WHERE oel.producto_id = ANY($1::uuid[])
             AND oe.estado IN ('Pendiente', 'En producción', 'Completo')
             AND pr.cliente_id = $2
           GROUP BY oel.producto_id`,
          [productoIds, clienteId]
        )
      : await pool.query(
          `SELECT oel.producto_id, COALESCE(SUM(a.cantidad_bultos), 0)::NUMERIC AS reservado_bultos
           FROM ordenes_exportacion_linea_asignaciones a
           JOIN ordenes_exportacion_lineas oel ON oel.id = a.linea_id
           JOIN ordenes_exportacion oe ON oe.id = oel.orden_exportacion_id
           WHERE oel.producto_id = ANY($1::uuid[])
             AND oe.estado IN ('Pendiente', 'En producción', 'Completo')
           GROUP BY oel.producto_id`,
          [productoIds]
        );
    const reservadoByProducto = new Map(
      reservadoQ.rows.map((r) => [String(r.producto_id), Number(r.reservado_bultos) || 0])
    );

    const data = productoIds.map((pid) => {
      const total = stockByProducto.get(String(pid)) || 0;
      const reservado = reservadoByProducto.get(String(pid)) || 0;
      return {
        producto_id: pid,
        stock_bultos_total: total,
        reservado_bultos: reservado,
        disponible_bultos: Math.max(0, total - reservado),
      };
    });
    res.json({ data });
  } catch (error) {
    console.error('Error disponibilidad productos OP:', error);
    res.status(500).json({ message: 'Error al obtener disponibilidad' });
  }
});

// Desvincular una asignación de lote de la OP (resta de cantidad cargada en la línea)
router.delete('/:id/lineas/:lineaId/asignaciones/:asignacionId', async (req, res) => {
  const client = await pool.connect();
  try {
    await initTables();
    const { id: ordenId, lineaId, asignacionId } = req.params;
    await client.query('BEGIN');
    const lineaQ = await client.query(
      `SELECT oel.id, oel.cantidad_cargada, oel.completado_at, oe.estado AS orden_estado
       FROM ordenes_exportacion_lineas oel
       JOIN ordenes_exportacion oe ON oe.id = oel.orden_exportacion_id
       WHERE oel.id = $1 AND oel.orden_exportacion_id = $2
       FOR UPDATE`,
      [lineaId, ordenId]
    );
    if (lineaQ.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Línea no encontrada' });
    }
    const linea = lineaQ.rows[0];
    if (linea.completado_at) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'No se puede desvincular: la línea está completada' });
    }
    if (linea.orden_estado === 'Completo' || linea.orden_estado === 'Embarcado') {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'No se puede desvincular en una OP completa/embarcada' });
    }

    const bloqueoEmb = await client.query(
      `SELECT 1
       FROM ordenes_exportacion_contenedores c
       JOIN ordenes_exportacion oe ON oe.id = c.orden_exportacion_id
       LEFT JOIN LATERAL (
         SELECT NULLIF(
                  TRIM(
                    regexp_replace(
                      split_part(COALESCE(MIN(NULLIF(TRIM(oel.referencia_embarque), '')), ''), ';', 1),
                      '\s+[A-Z]+$',
                      ''
                    )
                  ),
                  ''
                ) AS referencia_linea
         FROM ordenes_exportacion_lineas oel
         WHERE oel.orden_exportacion_id = oe.id
       ) rl ON true
       WHERE c.orden_exportacion_id = $1
         AND ${sqlContenedorBloqueaDesvinculacionAsignaciones()}
       LIMIT 1`,
      [ordenId]
    );
    if (bloqueoEmb.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message:
          'No se puede desvincular: hay contenedores en «listos para despacho», con referencia registrada o con embarque ya despachado. Revierta primero en Despachos o la referencia del contenedor.',
      });
    }

    const asigQ = await client.query(
      `SELECT a.id, a.cantidad_bultos, a.origen, a.lote_produccion_id, lp.estado AS lote_produccion_estado
       FROM ordenes_exportacion_linea_asignaciones a
       LEFT JOIN lotes_produccion lp ON lp.id = a.lote_produccion_id
       WHERE a.id = $1 AND a.linea_id = $2`,
      [asignacionId, lineaId]
    );
    if (asigQ.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Asignación no encontrada' });
    }
    const asigRow = asigQ.rows[0];
    if (esOrigenProduccion(asigRow.origen)) {
      if (req.user?.rol !== 'Admin') {
        await client.query('ROLLBACK');
        return res.status(403).json({
          message:
            'Solo un administrador puede desvincular la carga imputada desde producción (módulo de control).',
        });
      }
      if (!asigRow.lote_produccion_id) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          message: 'Esta asignación de producción no tiene lote vinculado; no se puede desvincular de forma segura.',
        });
      }
      const est = String(asigRow.lote_produccion_estado || '').trim();
      if (est === 'Terminado') {
        await client.query('ROLLBACK');
        return res.status(400).json({
          message:
            'No se puede desvincular: el lote de producción está terminado (cerrado). Solo es posible con el lote abierto (no terminado).',
        });
      }
    }
    const b = Number(asigRow.cantidad_bultos) || 0;
    await client.query('DELETE FROM ordenes_exportacion_linea_asignaciones WHERE id = $1', [asignacionId]);
    const upd = await client.query(
      `UPDATE ordenes_exportacion_lineas
       SET cantidad_cargada = GREATEST(0, cantidad_cargada - $1), completado_at = NULL
       WHERE id = $2
       RETURNING id, cantidad_solicitada, cantidad_cargada, completado_at`,
      [b, lineaId]
    );
    await client.query(
      `UPDATE ordenes_exportacion SET estado = CASE WHEN estado = 'Completo' THEN 'En producción' ELSE estado END,
         notificado_at = CASE WHEN estado = 'Completo' THEN NULL ELSE notificado_at END,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [ordenId]
    );
    await client.query('COMMIT');
    res.json({ message: 'Lote desvinculado de la OP', linea: upd.rows[0], bultos_desvinculados: b });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('Error desvinculando asignación OP:', error);
    res.status(500).json({ message: 'Error al desvincular lote' });
  } finally {
    client.release();
  }
});

// Actualizar cantidad cargada en una línea
router.patch('/:id/lineas/:lineaId', async (req, res) => {
  try {
    const { id, lineaId } = req.params;
    const { cantidad_cargada } = req.body;
    const check = await pool.query(
      'SELECT id FROM ordenes_exportacion_lineas WHERE id = $1 AND orden_exportacion_id = $2',
      [lineaId, id]
    );
    if (check.rows.length === 0) return res.status(404).json({ message: 'Línea no encontrada' });

    const result = await pool.query(
      `UPDATE ordenes_exportacion_lineas SET cantidad_cargada = COALESCE($1, cantidad_cargada), created_at = created_at
       WHERE id = $2 AND orden_exportacion_id = $3
       RETURNING id, producto_id, cantidad_solicitada, cantidad_cargada`,
      [Number(cantidad_cargada), lineaId, id]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error actualizando línea:', error);
    res.status(500).json({ message: 'Error al actualizar línea' });
  }
});

// Completar una línea (marcar validada para cierre OP)
router.patch('/:id/lineas/:lineaId/completar', async (req, res) => {
  try {
    const { id, lineaId } = req.params;
    const check = await pool.query(
      'SELECT id FROM ordenes_exportacion_lineas WHERE id = $1 AND orden_exportacion_id = $2',
      [lineaId, id]
    );
    if (check.rows.length === 0) return res.status(404).json({ message: 'Línea no encontrada' });
    const linea = await pool.query(
      'SELECT oel.* FROM ordenes_exportacion_lineas oel WHERE oel.id = $1 AND oel.orden_exportacion_id = $2',
      [lineaId, id]
    );
    if (linea.rows.length === 0) return res.status(404).json({ message: 'Línea no encontrada' });
    const solBultos = Number(linea.rows[0].cantidad_solicitada) || 0;
    const cargBultos = Number(linea.rows[0].cantidad_cargada) || 0;
    if (cargBultos < solBultos) {
      return res.status(400).json({
        message: 'No se puede completar la línea: la cantidad asignada a la OP es menor que la solicitada',
      });
    }

    await pool.query(
      `UPDATE ordenes_exportacion_lineas SET completado_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND orden_exportacion_id = $2`,
      [lineaId, id]
    );

    const updated = await pool.query(
      `SELECT oel.id, oel.completado_at
       FROM ordenes_exportacion_lineas oel WHERE oel.id = $1 AND oel.orden_exportacion_id = $2`,
      [lineaId, id]
    );
    res.json(updated.rows[0]);
  } catch (error) {
    console.error('Error completando línea:', error);
    res.status(500).json({ message: 'Error al completar línea' });
  }
});

// Reabrir una línea (completado_at a null); si orden estaba Completo, vuelve a Pendiente
router.patch('/:id/lineas/:lineaId/reabrir', async (req, res) => {
  try {
    const { id, lineaId } = req.params;
    const check = await pool.query(
      'SELECT id FROM ordenes_exportacion_lineas WHERE id = $1 AND orden_exportacion_id = $2',
      [lineaId, id]
    );
    if (check.rows.length === 0) return res.status(404).json({ message: 'Línea no encontrada' });

    await pool.query(
      `UPDATE ordenes_exportacion_lineas SET completado_at = NULL, referencia_embarque = NULL
       WHERE id = $1 AND orden_exportacion_id = $2`,
      [lineaId, id]
    );

    const orden = await pool.query('SELECT estado FROM ordenes_exportacion WHERE id = $1', [id]);
    if (orden.rows[0]?.estado === 'Completo') {
      await pool.query(
        `UPDATE ordenes_exportacion SET estado = 'En producción', notificado_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [id]
      );
    }

    const updated = await pool.query(
      `SELECT oel.id, oel.completado_at
       FROM ordenes_exportacion_lineas oel WHERE oel.id = $1 AND oel.orden_exportacion_id = $2`,
      [lineaId, id]
    );
    res.json(updated.rows[0]);
  } catch (error) {
    console.error('Error reabriendo línea:', error);
    res.status(500).json({ message: 'Error al reabrir línea' });
  }
});

// Eliminar orden
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const lockQ = await pool.query(
      `SELECT oe.id,
              GREATEST(1, COALESCE(oe.cantidad_contenedores, 1))::INT AS requeridos,
              (
                SELECT COUNT(*)::INT
                FROM ordenes_exportacion_contenedores c
                WHERE c.orden_exportacion_id = oe.id
                  AND (c.listo_para_exportar = TRUE OR c.despachado_at IS NOT NULL)
              ) AS enviados_listos
       FROM ordenes_exportacion oe
       WHERE oe.id = $1`,
      [id]
    );
    if (lockQ.rows.length === 0) return res.status(404).json({ message: 'Orden no encontrada' });
    const lock = lockQ.rows[0];
    if (Number(lock.enviados_listos) >= Number(lock.requeridos)) {
      return res.status(400).json({
        message: 'La OP completa y enviada a Listos para despacho no se puede eliminar',
      });
    }
    const result = await pool.query('DELETE FROM ordenes_exportacion WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Orden no encontrada' });
    res.json({ message: 'Orden eliminada correctamente' });
  } catch (error) {
    console.error('Error eliminando orden:', error);
    res.status(500).json({ message: 'Error al eliminar orden' });
  }
});

export default router;
