import express from 'express';
import { pool } from '../config/database.js';
import { authenticateToken, checkPermission, checkRole } from '../middleware/auth.middleware.js';
import { ensureInsumosModuleSchema } from '../utils/ensureInsumosModule.js';
import { buildConciliacionPlantillaProceso } from '../utils/conciliacionEmpaqueLote.js';
import { getTotalKgMateriaPrimaLote, buildInsumosOperativosReporte } from '../utils/insumosOperativosLote.js';

const router = express.Router();
router.use(authenticateToken);
router.use(async (_req, _res, next) => {
  try {
    await ensureInsumosModuleSchema();
    next();
  } catch (err) {
    console.error('Error preparando esquema de empaque:', err);
    next(err);
  }
});

const validStr = (v) => (typeof v === 'string' ? v.trim() : '');
const normalizeBool = (v, def = false) => (typeof v === 'boolean' ? v : def);
const normalizeNum = (v, def = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};
const CATS = ['PRIMARIO', 'SECUNDARIO', 'OTROS'];

async function ensureEmpaqueTables(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS empaque (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      lote_id UUID NOT NULL REFERENCES lotes_produccion(id) ON DELETE CASCADE,
      plantilla_id UUID NOT NULL REFERENCES plantillas_proceso(id) ON DELETE RESTRICT,
      estado VARCHAR(20) NOT NULL DEFAULT 'en_proceso',
      finalizado_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS empaque_detalle (
      empaque_id UUID NOT NULL REFERENCES empaque(id) ON DELETE CASCADE,
      producto_id UUID NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
      datos_horas JSONB NOT NULL DEFAULT '{}',
      PRIMARY KEY (empaque_id, producto_id)
    )
  `);
  await client.query(`ALTER TABLE empaque ADD COLUMN IF NOT EXISTS seleccion_reporte JSONB`);
  await client.query(`ALTER TABLE empaque ADD COLUMN IF NOT EXISTS insumos_operativos_snapshot JSONB`);
}

async function validatePlantillaPrincipalRules(client, items) {
  const ids = [...new Set(items.map((it) => it.componente_id).filter(Boolean))];
  if (ids.length === 0) return { ok: false, message: 'La plantilla debe tener componentes' };
  const compRows = await client.query(
    `SELECT id, categoria, tipo
     FROM empaque_componentes
     WHERE id = ANY($1::uuid[])`,
    [ids]
  );
  const byId = new Map(compRows.rows.map((r) => [r.id, r]));
  const basePrincipal = [];
  for (const item of items) {
    const comp = byId.get(item.componente_id);
    if (!comp) continue;
    const esBase = (item.condicion || 'DEFECTO') === 'DEFECTO' && item.obligatorio === true;
    if (comp.categoria === 'PRINCIPAL' && esBase) basePrincipal.push(comp.tipo);
  }
  const hasSacoRafia = basePrincipal.includes('SACO') && basePrincipal.includes('RAFIA');
  const hasCajaCinta = basePrincipal.includes('CAJA') && basePrincipal.includes('CINTA');
  if (!hasSacoRafia && !hasCajaCinta) {
    return {
      ok: false,
      message:
        'Regla principal: la base DEFECTO obligatoria debe incluir SACO+RAFIA o CAJA+CINTA',
    };
  }
  return { ok: true };
}

async function getProduccionUnidadesLote(client, loteId) {
  const q = await client.query(
    `SELECT
        COALESCE(SUM(CASE WHEN UPPER(COALESCE(pp.unidad_parihuela, 'BULTOS')) = 'CAJAS' THEN pp.cantidad ELSE 0 END), 0)::numeric AS cajas,
        COALESCE(SUM(CASE WHEN UPPER(COALESCE(pp.unidad_parihuela, 'BULTOS')) <> 'CAJAS' THEN pp.cantidad ELSE 0 END), 0)::numeric AS bultos
     FROM parihuelas_produccion pp
     WHERE pp.lote_id = $1`,
    [loteId]
  );
  return {
    cajas: Number(q.rows[0]?.cajas) || 0,
    bultos: Number(q.rows[0]?.bultos) || 0,
  };
}

async function resolveEspecieLote(client, loteId) {
  const q = await client.query(
    `SELECT p.especie_id, SUM(pp.cantidad) AS total
     FROM parihuelas_produccion pp
     JOIN productos p ON p.id = pp.producto_id
     WHERE pp.lote_id = $1
     GROUP BY p.especie_id
     ORDER BY SUM(pp.cantidad) DESC`,
    [loteId]
  );
  return q.rows[0]?.especie_id || null;
}

// -------- Práctico: plantilla de proceso -> insumos por producto (primario/secundario/otros) --------
router.get('/proceso-plantillas', async (_req, res) => {
  try {
    const r = await pool.query(
      `SELECT pp.id, pp.cliente_id, pp.especie_id, pp.titulo, pp.es_predeterminada,
              c.nombre AS cliente_nombre, e.nombre AS especie_nombre,
              (SELECT COUNT(*)::int FROM plantillas_proceso_productos ppp WHERE ppp.plantilla_id = pp.id) AS productos_count,
              (SELECT COUNT(*)::int FROM empaque_plantilla_proceso_items epi WHERE epi.plantilla_proceso_id = pp.id) AS insumos_count
       FROM plantillas_proceso pp
       JOIN clientes c ON c.id = pp.cliente_id
       JOIN especies e ON e.id = pp.especie_id
       ORDER BY c.nombre, e.nombre, pp.titulo`
    );
    res.json({ data: r.rows });
  } catch (error) {
    console.error('Error listando plantillas de proceso para empaque:', error);
    res.status(500).json({ message: 'Error al listar plantillas de proceso' });
  }
});

router.get('/proceso-plantillas/:id/detalle', async (req, res) => {
  try {
    const { id } = req.params;
    const tpl = await pool.query(
      `SELECT pp.id, pp.titulo, pp.cliente_id, pp.especie_id, c.nombre AS cliente_nombre, e.nombre AS especie_nombre
       FROM plantillas_proceso pp
       JOIN clientes c ON c.id = pp.cliente_id
       JOIN especies e ON e.id = pp.especie_id
       WHERE pp.id = $1`,
      [id]
    );
    if (tpl.rows.length === 0) return res.status(404).json({ message: 'Plantilla de proceso no encontrada' });

    const prods = await pool.query(
      `SELECT p.id, p.codigo, p.producto, p.descripcion, p.presentacion
       FROM plantillas_proceso_productos ppp
       JOIN productos p ON p.id = ppp.producto_id
       WHERE ppp.plantilla_id = $1
       ORDER BY ppp.orden, p.codigo`,
      [id]
    );
    const items = await pool.query(
      `SELECT epi.id, epi.producto_id, epi.categoria, epi.insumo_id, epi.cantidad_por_unidad, epi.unidad_base,
              i.nombre AS insumo_nombre, i.unidad_medida AS insumo_unidad, i.codigo AS insumo_codigo
       FROM empaque_plantilla_proceso_items epi
       JOIN insumos i ON i.id = epi.insumo_id
       WHERE epi.plantilla_proceso_id = $1
       ORDER BY epi.producto_id, epi.categoria, i.nombre`,
      [id]
    );
    const byProd = new Map();
    for (const p of prods.rows) {
      byProd.set(p.id, { ...p, primario: [], secundario: [], otros: [] });
    }
    for (const it of items.rows) {
      const row = byProd.get(it.producto_id);
      if (!row) continue;
      if (it.categoria === 'PRIMARIO') row.primario.push(it);
      else if (it.categoria === 'SECUNDARIO') row.secundario.push(it);
      else row.otros.push(it);
    }
    res.json({ ...tpl.rows[0], productos: [...byProd.values()] });
  } catch (error) {
    console.error('Error obteniendo detalle de plantilla de proceso empaque:', error);
    res.status(500).json({ message: 'Error al obtener detalle' });
  }
});

router.put('/proceso-plantillas/:id/detalle', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { items } = req.body || {};
    if (!Array.isArray(items)) return res.status(400).json({ message: 'items debe ser un array' });
    const tpl = await client.query('SELECT id FROM plantillas_proceso WHERE id = $1', [id]);
    if (tpl.rows.length === 0) return res.status(404).json({ message: 'Plantilla de proceso no encontrada' });

    await client.query('BEGIN');
    await client.query('DELETE FROM empaque_plantilla_proceso_items WHERE plantilla_proceso_id = $1', [id]);
    for (const it of items) {
      const categoria = validStr(it.categoria).toUpperCase();
      const cantidad = Number(it.cantidad_por_unidad);
      if (!it.producto_id || !it.insumo_id || !CATS.includes(categoria) || !Number.isFinite(cantidad) || cantidad < 0) continue;
      await client.query(
        `INSERT INTO empaque_plantilla_proceso_items
          (plantilla_proceso_id, producto_id, categoria, insumo_id, cantidad_por_unidad, unidad_base)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, it.producto_id, categoria, it.insumo_id, cantidad, validStr(it.unidad_base).toUpperCase() === 'CAJA' ? 'CAJA' : 'BULTO']
      );
    }
    await client.query('COMMIT');
    res.json({ message: 'Detalle de empaque guardado' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error guardando detalle práctico de empaque:', error);
    res.status(500).json({ message: 'Error al guardar detalle' });
  } finally {
    client.release();
  }
});

router.post('/proceso-plantillas/:id/items', async (req, res) => {
  try {
    const { id } = req.params;
    const { producto_id, categoria, insumo_id, cantidad_por_unidad, unidad_base } = req.body || {};
    const cat = validStr(categoria).toUpperCase();
    const cantidad = Number(cantidad_por_unidad);
    if (!producto_id || !insumo_id || !CATS.includes(cat) || !Number.isFinite(cantidad) || cantidad < 0) {
      return res.status(400).json({ message: 'producto_id, categoria, insumo_id y cantidad válida son requeridos' });
    }
    const r = await pool.query(
      `INSERT INTO empaque_plantilla_proceso_items
        (plantilla_proceso_id, producto_id, categoria, insumo_id, cantidad_por_unidad, unidad_base)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [id, producto_id, cat, insumo_id, cantidad, validStr(unidad_base).toUpperCase() === 'CAJA' ? 'CAJA' : 'BULTO']
    );
    res.status(201).json(r.rows[0]);
  } catch (error) {
    console.error('Error creando item práctico de empaque:', error);
    res.status(500).json({ message: 'Error al crear item' });
  }
});

router.put('/proceso-plantillas/:id/items/:itemId', async (req, res) => {
  try {
    const { id, itemId } = req.params;
    const { producto_id, categoria, insumo_id, cantidad_por_unidad, unidad_base } = req.body || {};
    const cat = categoria != null ? validStr(categoria).toUpperCase() : null;
    const cantidad = cantidad_por_unidad != null ? Number(cantidad_por_unidad) : null;
    if (cat && !CATS.includes(cat)) return res.status(400).json({ message: 'categoría inválida' });
    if (cantidad != null && (!Number.isFinite(cantidad) || cantidad < 0)) return res.status(400).json({ message: 'cantidad inválida' });
    const r = await pool.query(
      `UPDATE empaque_plantilla_proceso_items
       SET producto_id = COALESCE($1, producto_id),
           categoria = COALESCE($2, categoria),
           insumo_id = COALESCE($3, insumo_id),
           cantidad_por_unidad = COALESCE($4, cantidad_por_unidad),
           unidad_base = COALESCE($5, unidad_base),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $6 AND plantilla_proceso_id = $7
       RETURNING *`,
      [
        producto_id || null,
        cat || null,
        insumo_id || null,
        cantidad,
        unidad_base != null ? (validStr(unidad_base).toUpperCase() === 'CAJA' ? 'CAJA' : 'BULTO') : null,
        itemId,
        id,
      ]
    );
    if (r.rows.length === 0) return res.status(404).json({ message: 'Item no encontrado' });
    res.json(r.rows[0]);
  } catch (error) {
    console.error('Error actualizando item práctico de empaque:', error);
    res.status(500).json({ message: 'Error al actualizar item' });
  }
});

router.delete('/proceso-plantillas/:id/items/:itemId', async (req, res) => {
  try {
    const { id, itemId } = req.params;
    const r = await pool.query(
      'DELETE FROM empaque_plantilla_proceso_items WHERE id = $1 AND plantilla_proceso_id = $2 RETURNING id',
      [itemId, id]
    );
    if (r.rows.length === 0) return res.status(404).json({ message: 'Item no encontrado' });
    res.json({ message: 'Item eliminado' });
  } catch (error) {
    console.error('Error eliminando item práctico de empaque:', error);
    res.status(500).json({ message: 'Error al eliminar item' });
  }
});

// Componentes
router.get('/componentes', async (req, res) => {
  try {
    const { categoria, tipo, activo = 'true', q } = req.query;
    const where = [];
    const params = [];
    let n = 1;
    if (categoria) {
      where.push(`ec.categoria = $${n++}`);
      params.push(categoria);
    }
    if (tipo) {
      where.push(`ec.tipo = $${n++}`);
      params.push(tipo);
    }
    if (String(activo) !== 'all') {
      where.push(`ec.activo = $${n++}`);
      params.push(String(activo) === 'true');
    }
    if (q && validStr(q)) {
      where.push(`(i.nombre ILIKE $${n} OR COALESCE(ec.descripcion, '') ILIKE $${n})`);
      params.push(`%${validStr(q)}%`);
      n++;
    }
    const sqlWhere = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const r = await pool.query(
      `SELECT ec.*, i.nombre AS insumo_nombre, i.unidad_medida AS insumo_unidad, i.codigo AS insumo_codigo
       FROM empaque_componentes ec
       JOIN insumos i ON i.id = ec.insumo_id
       ${sqlWhere}
       ORDER BY ec.categoria, ec.tipo, i.nombre`,
      params
    );
    res.json({ data: r.rows });
  } catch (error) {
    console.error('Error listando componentes de empaque:', error);
    res.status(500).json({ message: 'Error al listar componentes' });
  }
});

router.post('/componentes', async (req, res) => {
  try {
    const { insumo_id, categoria, tipo, subtipo, con_logo, medida, descripcion, activo } = req.body || {};
    if (!insumo_id || !validStr(tipo)) {
      return res.status(400).json({ message: 'insumo_id y tipo son requeridos' });
    }
    const r = await pool.query(
      `INSERT INTO empaque_componentes
        (insumo_id, categoria, tipo, subtipo, con_logo, medida, descripcion, activo)
       VALUES
        ($1, COALESCE($2, 'PRINCIPAL'), $3, NULLIF(TRIM($4), ''), COALESCE($5, FALSE), NULLIF(TRIM($6), ''), NULLIF(TRIM($7), ''), COALESCE($8, TRUE))
       RETURNING *`,
      [
        insumo_id,
        categoria || 'PRINCIPAL',
        validStr(tipo).toUpperCase(),
        subtipo || null,
        normalizeBool(con_logo, false),
        medida || null,
        descripcion || null,
        typeof activo === 'boolean' ? activo : true,
      ]
    );
    res.status(201).json(r.rows[0]);
  } catch (error) {
    console.error('Error creando componente de empaque:', error);
    res.status(500).json({ message: 'Error al crear componente' });
  }
});

router.put('/componentes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { insumo_id, categoria, tipo, subtipo, con_logo, medida, descripcion, activo } = req.body || {};
    const r = await pool.query(
      `UPDATE empaque_componentes
       SET insumo_id = COALESCE($1, insumo_id),
           categoria = COALESCE($2, categoria),
           tipo = COALESCE($3, tipo),
           subtipo = CASE WHEN $4 IS NULL THEN subtipo ELSE NULLIF(TRIM($4), '') END,
           con_logo = COALESCE($5, con_logo),
           medida = CASE WHEN $6 IS NULL THEN medida ELSE NULLIF(TRIM($6), '') END,
           descripcion = CASE WHEN $7 IS NULL THEN descripcion ELSE NULLIF(TRIM($7), '') END,
           activo = COALESCE($8, activo),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $9
       RETURNING *`,
      [
        insumo_id || null,
        categoria || null,
        tipo ? validStr(tipo).toUpperCase() : null,
        subtipo ?? null,
        typeof con_logo === 'boolean' ? con_logo : null,
        medida ?? null,
        descripcion ?? null,
        typeof activo === 'boolean' ? activo : null,
        id,
      ]
    );
    if (r.rows.length === 0) return res.status(404).json({ message: 'Componente no encontrado' });
    res.json(r.rows[0]);
  } catch (error) {
    console.error('Error actualizando componente de empaque:', error);
    res.status(500).json({ message: 'Error al actualizar componente' });
  }
});

router.delete('/componentes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const r = await pool.query(
      `UPDATE empaque_componentes
       SET activo = FALSE, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id`,
      [id]
    );
    if (r.rows.length === 0) return res.status(404).json({ message: 'Componente no encontrado' });
    res.json({ message: 'Componente desactivado' });
  } catch (error) {
    console.error('Error eliminando componente de empaque:', error);
    res.status(500).json({ message: 'Error al eliminar componente' });
  }
});

// Plantillas
router.get('/plantillas', async (req, res) => {
  try {
    const { especie_id, activa = 'true' } = req.query;
    const where = [];
    const params = [];
    let n = 1;
    if (especie_id) {
      where.push(`ep.especie_id = $${n++}`);
      params.push(especie_id);
    }
    if (String(activa) !== 'all') {
      where.push(`ep.activa = $${n++}`);
      params.push(String(activa) === 'true');
    }
    const sqlWhere = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const r = await pool.query(
      `SELECT ep.id, ep.especie_id, ep.nombre, ep.version, ep.activa, ep.observaciones, ep.created_at, ep.updated_at,
              e.nombre AS especie_nombre,
              (SELECT COUNT(*)::int FROM especie_empaque_plantilla_items it WHERE it.plantilla_id = ep.id) AS total_items
       FROM especie_empaque_plantillas ep
       JOIN especies e ON e.id = ep.especie_id
       ${sqlWhere}
       ORDER BY e.nombre, ep.nombre, ep.version DESC`,
      params
    );
    res.json({ data: r.rows });
  } catch (error) {
    console.error('Error listando plantillas de empaque:', error);
    res.status(500).json({ message: 'Error al listar plantillas' });
  }
});

router.get('/plantillas/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const cab = await pool.query(
      `SELECT ep.*, e.nombre AS especie_nombre
       FROM especie_empaque_plantillas ep
       JOIN especies e ON e.id = ep.especie_id
       WHERE ep.id = $1`,
      [id]
    );
    if (cab.rows.length === 0) return res.status(404).json({ message: 'Plantilla no encontrada' });
    const items = await pool.query(
      `SELECT it.*, ec.tipo, ec.categoria, ec.subtipo, ec.con_logo, ec.medida, ec.descripcion AS componente_descripcion,
              i.nombre AS insumo_nombre, i.unidad_medida AS insumo_unidad, i.codigo AS insumo_codigo
       FROM especie_empaque_plantilla_items it
       JOIN empaque_componentes ec ON ec.id = it.componente_id
       JOIN insumos i ON i.id = ec.insumo_id
       WHERE it.plantilla_id = $1
       ORDER BY it.orden, ec.tipo, i.nombre`,
      [id]
    );
    res.json({ ...cab.rows[0], items: items.rows });
  } catch (error) {
    console.error('Error obteniendo plantilla de empaque:', error);
    res.status(500).json({ message: 'Error al obtener plantilla' });
  }
});

router.post('/plantillas', async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      especie_id,
      nombre,
      version,
      activa,
      observaciones,
      items = [],
    } = req.body || {};
    if (!especie_id || !validStr(nombre)) {
      return res.status(400).json({ message: 'especie_id y nombre son requeridos' });
    }
    const normItems = (Array.isArray(items) ? items : []).map((it, idx) => ({
      componente_id: it.componente_id,
      unidad_base: validStr(it.unidad_base || 'BULTO').toUpperCase(),
      cantidad_por_unidad: normalizeNum(it.cantidad_por_unidad, NaN),
      obligatorio: normalizeBool(it.obligatorio, true),
      condicion: validStr(it.condicion || 'DEFECTO').toUpperCase(),
      orden: Number.isInteger(it.orden) ? it.orden : idx + 1,
    }));
    const rules = await validatePlantillaPrincipalRules(client, normItems);
    if (!rules.ok) return res.status(400).json({ message: rules.message });

    await client.query('BEGIN');
    const cab = await client.query(
      `INSERT INTO especie_empaque_plantillas
        (especie_id, nombre, version, activa, observaciones, created_by)
       VALUES ($1, $2, COALESCE($3, 1), COALESCE($4, TRUE), NULLIF(TRIM($5), ''), $6)
       RETURNING id`,
      [
        especie_id,
        validStr(nombre),
        version != null ? Number(version) : 1,
        typeof activa === 'boolean' ? activa : true,
        observaciones || null,
        req.user?.id || null,
      ]
    );
    const plantillaId = cab.rows[0].id;
    for (const it of normItems) {
      if (!it.componente_id || !Number.isFinite(it.cantidad_por_unidad) || it.cantidad_por_unidad < 0) continue;
      await client.query(
        `INSERT INTO especie_empaque_plantilla_items
          (plantilla_id, componente_id, unidad_base, cantidad_por_unidad, obligatorio, condicion, orden)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          plantillaId,
          it.componente_id,
          it.unidad_base === 'CAJA' ? 'CAJA' : 'BULTO',
          it.cantidad_por_unidad,
          it.obligatorio,
          ['DEFECTO', 'DEFORME', 'SIN_LOGO', 'PEDIDO_ESPECIAL', 'OTRO'].includes(it.condicion) ? it.condicion : 'DEFECTO',
          it.orden,
        ]
      );
    }
    await client.query('COMMIT');
    res.status(201).json({ id: plantillaId, message: 'Plantilla creada' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creando plantilla de empaque:', error);
    res.status(500).json({ message: 'Error al crear plantilla' });
  } finally {
    client.release();
  }
});

router.put('/plantillas/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { especie_id, nombre, version, activa, observaciones, items = [] } = req.body || {};
    const normItems = (Array.isArray(items) ? items : []).map((it, idx) => ({
      componente_id: it.componente_id,
      unidad_base: validStr(it.unidad_base || 'BULTO').toUpperCase(),
      cantidad_por_unidad: normalizeNum(it.cantidad_por_unidad, NaN),
      obligatorio: normalizeBool(it.obligatorio, true),
      condicion: validStr(it.condicion || 'DEFECTO').toUpperCase(),
      orden: Number.isInteger(it.orden) ? it.orden : idx + 1,
    }));
    const rules = await validatePlantillaPrincipalRules(client, normItems);
    if (!rules.ok) return res.status(400).json({ message: rules.message });

    await client.query('BEGIN');
    const cab = await client.query(
      `UPDATE especie_empaque_plantillas
       SET especie_id = COALESCE($1, especie_id),
           nombre = COALESCE(NULLIF(TRIM($2), ''), nombre),
           version = COALESCE($3, version),
           activa = COALESCE($4, activa),
           observaciones = CASE WHEN $5 IS NULL THEN observaciones ELSE NULLIF(TRIM($5), '') END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING id`,
      [
        especie_id || null,
        nombre || null,
        version != null ? Number(version) : null,
        typeof activa === 'boolean' ? activa : null,
        observaciones ?? null,
        id,
      ]
    );
    if (cab.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Plantilla no encontrada' });
    }

    await client.query('DELETE FROM especie_empaque_plantilla_items WHERE plantilla_id = $1', [id]);
    for (const it of normItems) {
      if (!it.componente_id || !Number.isFinite(it.cantidad_por_unidad) || it.cantidad_por_unidad < 0) continue;
      await client.query(
        `INSERT INTO especie_empaque_plantilla_items
          (plantilla_id, componente_id, unidad_base, cantidad_por_unidad, obligatorio, condicion, orden)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          id,
          it.componente_id,
          it.unidad_base === 'CAJA' ? 'CAJA' : 'BULTO',
          it.cantidad_por_unidad,
          it.obligatorio,
          ['DEFECTO', 'DEFORME', 'SIN_LOGO', 'PEDIDO_ESPECIAL', 'OTRO'].includes(it.condicion) ? it.condicion : 'DEFECTO',
          it.orden,
        ]
      );
    }
    await client.query('COMMIT');
    res.json({ message: 'Plantilla actualizada' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error actualizando plantilla de empaque:', error);
    res.status(500).json({ message: 'Error al actualizar plantilla' });
  } finally {
    client.release();
  }
});

router.delete('/plantillas/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const r = await pool.query(
      `UPDATE especie_empaque_plantillas
       SET activa = FALSE, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id`,
      [id]
    );
    if (r.rows.length === 0) return res.status(404).json({ message: 'Plantilla no encontrada' });
    res.json({ message: 'Plantilla desactivada' });
  } catch (error) {
    console.error('Error eliminando plantilla de empaque:', error);
    res.status(500).json({ message: 'Error al eliminar plantilla' });
  }
});

// Ajustes por lote
router.get('/lotes/:loteId/ajustes', async (req, res) => {
  try {
    const { loteId } = req.params;
    const r = await pool.query(
      `SELECT a.*, ec.tipo, ec.categoria, i.nombre AS insumo_nombre, i.unidad_medida AS insumo_unidad, u.nombre AS usuario_nombre
       FROM lote_empaque_ajustes a
       JOIN empaque_componentes ec ON ec.id = a.componente_id
       JOIN insumos i ON i.id = ec.insumo_id
       JOIN usuarios u ON u.id = a.usuario_id
       WHERE a.lote_produccion_id = $1
       ORDER BY a.created_at DESC`,
      [loteId]
    );
    res.json({ data: r.rows });
  } catch (error) {
    console.error('Error listando ajustes de empaque:', error);
    res.status(500).json({ message: 'Error al listar ajustes' });
  }
});

router.post('/lotes/:loteId/ajustes', async (req, res) => {
  try {
    const { loteId } = req.params;
    const { item_plantilla_id, componente_id, unidad_base, cantidad_por_unidad, obligatorio, motivo, observaciones } = req.body || {};
    if (!componente_id || !motivo || cantidad_por_unidad == null) {
      return res.status(400).json({ message: 'componente_id, cantidad_por_unidad y motivo son requeridos' });
    }
    const r = await pool.query(
      `INSERT INTO lote_empaque_ajustes
        (lote_produccion_id, item_plantilla_id, componente_id, unidad_base, cantidad_por_unidad, obligatorio, motivo, observaciones, usuario_id)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, FALSE), $7, NULLIF(TRIM($8), ''), $9)
       RETURNING *`,
      [
        loteId,
        item_plantilla_id || null,
        componente_id,
        validStr(unidad_base || 'BULTO').toUpperCase() === 'CAJA' ? 'CAJA' : 'BULTO',
        Number(cantidad_por_unidad),
        typeof obligatorio === 'boolean' ? obligatorio : false,
        validStr(motivo).toUpperCase(),
        observaciones || null,
        req.user?.id,
      ]
    );
    res.status(201).json(r.rows[0]);
  } catch (error) {
    console.error('Error creando ajuste de empaque:', error);
    res.status(500).json({ message: 'Error al crear ajuste' });
  }
});

router.delete('/lotes/:loteId/ajustes/:id', checkPermission('produccion.empaque', 'operate'), async (req, res) => {
  try {
    const { id, loteId } = req.params;
    const r = await pool.query('DELETE FROM lote_empaque_ajustes WHERE id = $1 AND lote_produccion_id = $2 RETURNING id', [id, loteId]);
    if (r.rows.length === 0) return res.status(404).json({ message: 'Ajuste no encontrado' });
    res.json({ message: 'Ajuste eliminado' });
  } catch (error) {
    console.error('Error eliminando ajuste de empaque:', error);
    res.status(500).json({ message: 'Error al eliminar ajuste' });
  }
});

router.post('/lotes/:loteId/agregar-a-produccion', async (req, res) => {
  const client = await pool.connect();
  try {
    const { loteId } = req.params;
    const { plantilla_proceso_id, seleccion_reporte } = req.body || {};
    if (!plantilla_proceso_id) {
      return res.status(400).json({ message: 'plantilla_proceso_id es requerido' });
    }

    const seleccionJson =
      seleccion_reporte && typeof seleccion_reporte === 'object'
        ? {
            calculado: Array.isArray(seleccion_reporte.calculado) ? seleccion_reporte.calculado : [],
            real: Array.isArray(seleccion_reporte.real) ? seleccion_reporte.real : [],
          }
        : null;

    await ensureEmpaqueTables(client);
    await client.query('BEGIN');

    const lote = await client.query(
      'SELECT id, codigo FROM lotes_produccion WHERE id = $1',
      [loteId]
    );
    if (lote.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Lote no encontrado' });
    }

    const plantilla = await client.query(
      'SELECT id FROM plantillas_proceso WHERE id = $1',
      [plantilla_proceso_id]
    );
    if (plantilla.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Plantilla de proceso no encontrada' });
    }

    const totalKgMpAgregar = await getTotalKgMateriaPrimaLote(client, loteId);
    const cantidadTmMpAgregar = totalKgMpAgregar > 0 ? totalKgMpAgregar / 1000 : 0;
    let insumosOperativosSnap = [];
    try {
      insumosOperativosSnap = await buildInsumosOperativosReporte(
        client,
        loteId,
        plantilla_proceso_id,
        cantidadTmMpAgregar
      );
    } catch (eOp) {
      console.warn('agregar-a-produccion: insumos operativos:', eOp?.message || eOp);
    }

    const existingEmpaque = await client.query(
      'SELECT id, estado FROM empaque WHERE lote_id = $1 LIMIT 1',
      [loteId]
    );
    let empaqueId = existingEmpaque.rows[0]?.id || null;
    if (existingEmpaque.rows[0]?.estado === 'finalizado') {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'El empaque del lote ya está finalizado, no se puede sobrescribir' });
    }

    if (!empaqueId) {
      const ins = await client.query(
        `INSERT INTO empaque (lote_id, plantilla_id, estado, seleccion_reporte, insumos_operativos_snapshot)
         VALUES ($1, $2, 'en_proceso', $3::jsonb, $4::jsonb)
         RETURNING id`,
        [
          loteId,
          plantilla_proceso_id,
          seleccion_reporte !== undefined ? seleccionJson : null,
          JSON.stringify(insumosOperativosSnap),
        ]
      );
      empaqueId = ins.rows[0].id;
    } else if (seleccion_reporte !== undefined) {
      await client.query(
        `UPDATE empaque
         SET plantilla_id = $1,
             seleccion_reporte = $3::jsonb,
             insumos_operativos_snapshot = $4::jsonb,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [plantilla_proceso_id, empaqueId, seleccionJson, JSON.stringify(insumosOperativosSnap)]
      );
    } else {
      await client.query(
        `UPDATE empaque
         SET plantilla_id = $1,
             insumos_operativos_snapshot = $3::jsonb,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [plantilla_proceso_id, empaqueId, JSON.stringify(insumosOperativosSnap)]
      );
    }

    const productosPlantilla = await client.query(
      `SELECT ppp.producto_id
       FROM plantillas_proceso_productos ppp
       WHERE ppp.plantilla_id = $1
       ORDER BY ppp.orden, ppp.producto_id`,
      [plantilla_proceso_id]
    );
    const productoIds = productosPlantilla.rows.map((r) => r.producto_id);
    if (productoIds.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'La plantilla no tiene productos' });
    }

    const prodAgg = await client.query(
      `SELECT pp.producto_id, COALESCE(SUM(pp.cantidad), 0)::numeric AS total
       FROM parihuelas_produccion pp
       WHERE pp.lote_id = $1 AND pp.producto_id = ANY($2::uuid[])
       GROUP BY pp.producto_id`,
      [loteId, productoIds]
    );
    const mapTotales = new Map(prodAgg.rows.map((r) => [r.producto_id, Number(r.total) || 0]));

    for (const productoId of productoIds) {
      const total = Number((mapTotales.get(productoId) || 0).toFixed(6));
      await client.query(
        `INSERT INTO empaque_detalle (empaque_id, producto_id, datos_horas)
         VALUES ($1, $2, jsonb_build_object('AUTO_CONCILIACION', $3::numeric))
         ON CONFLICT (empaque_id, producto_id)
         DO UPDATE SET datos_horas = jsonb_build_object('AUTO_CONCILIACION', $3::numeric)`,
        [empaqueId, productoId, total]
      );
    }

    await client.query('COMMIT');
    res.json({
      message: 'Datos agregados a producción correctamente',
      data: {
        lote_id: loteId,
        empaque_id: empaqueId,
        plantilla_proceso_id,
        productos_actualizados: productoIds.length,
        insumos_operativos: insumosOperativosSnap,
      },
    });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('Error agregando conciliación a producción:', error);
    res.status(500).json({ message: 'Error al agregar a producción' });
  } finally {
    client.release();
  }
});

// Simulación / conciliación
router.get('/conciliacion', async (req, res) => {
  const client = await pool.connect();
  try {
    const { lote_produccion_id, especie_id, plantilla_id, plantilla_proceso_id } = req.query;
    if (!lote_produccion_id && !especie_id && !plantilla_id && !plantilla_proceso_id) {
      return res.status(400).json({ message: 'Debe enviar lote_produccion_id, especie_id, plantilla_id o plantilla_proceso_id' });
    }

    if (plantilla_proceso_id) {
      if (!lote_produccion_id) {
        return res.status(400).json({ message: 'Con plantilla_proceso_id también debe enviar lote_produccion_id' });
      }
      await ensureEmpaqueTables(client);
      const { data, resumen } = await buildConciliacionPlantillaProceso(client, lote_produccion_id, plantilla_proceso_id);
      const agregadoQ = await client.query(
        `SELECT EXISTS (
           SELECT 1
           FROM empaque e
           INNER JOIN empaque_detalle ed ON ed.empaque_id = e.id
           WHERE e.lote_id = $1::uuid
             AND e.plantilla_id = $2::uuid
             AND ed.datos_horas ? 'AUTO_CONCILIACION'
         ) AS ya_agregado`,
        [lote_produccion_id, plantilla_proceso_id]
      );
      const ya_agregado_a_produccion = Boolean(agregadoQ.rows[0]?.ya_agregado);
      const selQ = await client.query(
        `SELECT seleccion_reporte FROM empaque WHERE lote_id = $1::uuid AND plantilla_id = $2::uuid LIMIT 1`,
        [lote_produccion_id, plantilla_proceso_id]
      );
      const seleccion_reporte = selQ.rows[0]?.seleccion_reporte || null;
      const totalKgMp = await getTotalKgMateriaPrimaLote(client, lote_produccion_id);
      const cantidadTmMpOp = totalKgMp > 0 ? totalKgMp / 1000 : 0;
      let insumos_operativos = [];
      try {
        insumos_operativos = await buildInsumosOperativosReporte(
          client,
          lote_produccion_id,
          plantilla_proceso_id,
          cantidadTmMpOp
        );
      } catch (eOp) {
        console.warn('Conciliación: insumos operativos:', eOp?.message || eOp);
      }
      let operativo_bunker_galones = null;
      try {
        const lg = await client.query(
          'SELECT operativo_bunker_galones FROM lotes_produccion WHERE id = $1',
          [lote_produccion_id]
        );
        operativo_bunker_galones = lg.rows[0]?.operativo_bunker_galones ?? null;
      } catch (_) {
        /* columna opcional */
      }
      return res.json({
        data,
        resumen,
        ya_agregado_a_produccion,
        seleccion_reporte,
        insumos_operativos,
        operativo_bunker_galones,
      });
    }

    let especieId = especie_id || null;
    if (!especieId && lote_produccion_id) {
      especieId = await resolveEspecieLote(client, lote_produccion_id);
    }

    let plantillaId = plantilla_id || null;
    if (!plantillaId && especieId) {
      const p = await client.query(
        `SELECT id
         FROM especie_empaque_plantillas
         WHERE especie_id = $1 AND activa = TRUE
         ORDER BY version DESC, updated_at DESC
         LIMIT 1`,
        [especieId]
      );
      plantillaId = p.rows[0]?.id || null;
    }
    if (!plantillaId) {
      return res.status(404).json({ message: 'No hay plantilla activa para la especie/lote indicado' });
    }

    const unidades = lote_produccion_id
      ? await getProduccionUnidadesLote(client, lote_produccion_id)
      : { bultos: 0, cajas: 0 };

    const baseRows = await client.query(
      `SELECT it.id AS item_id, it.componente_id, it.unidad_base, it.cantidad_por_unidad, it.obligatorio, it.condicion,
              ec.tipo, ec.categoria, ec.insumo_id,
              i.nombre AS insumo_nombre, i.unidad_medida AS insumo_unidad
       FROM especie_empaque_plantilla_items it
       JOIN empaque_componentes ec ON ec.id = it.componente_id
       JOIN insumos i ON i.id = ec.insumo_id
       WHERE it.plantilla_id = $1`,
      [plantillaId]
    );

    const rows = baseRows.rows.map((r) => {
      const factor = r.unidad_base === 'CAJA' ? unidades.cajas : unidades.bultos;
      return {
        source: 'BASE',
        item_id: r.item_id,
        componente_id: r.componente_id,
        tipo: r.tipo,
        categoria: r.categoria,
        insumo_id: r.insumo_id,
        insumo_nombre: r.insumo_nombre,
        insumo_unidad: r.insumo_unidad,
        unidad_base: r.unidad_base,
        cantidad_por_unidad: Number(r.cantidad_por_unidad) || 0,
        esperado: Number((Number(r.cantidad_por_unidad || 0) * factor).toFixed(6)),
        obligatorio: Boolean(r.obligatorio),
        condicion: r.condicion,
        motivo: null,
      };
    });

    if (lote_produccion_id) {
      const adjRows = await client.query(
        `SELECT a.id, a.item_plantilla_id, a.componente_id, a.unidad_base, a.cantidad_por_unidad, a.obligatorio, a.motivo, a.observaciones,
                ec.tipo, ec.categoria, ec.insumo_id,
                i.nombre AS insumo_nombre, i.unidad_medida AS insumo_unidad
         FROM lote_empaque_ajustes a
         JOIN empaque_componentes ec ON ec.id = a.componente_id
         JOIN insumos i ON i.id = ec.insumo_id
         WHERE a.lote_produccion_id = $1`,
        [lote_produccion_id]
      );

      for (const a of adjRows.rows) {
        const factor = a.unidad_base === 'CAJA' ? unidades.cajas : unidades.bultos;
        const sign = String(a.observaciones || '').includes('__REEMPLAZO_ORIGEN__') ? -1 : 1;
        const esperado = Number((Number(a.cantidad_por_unidad || 0) * factor * sign).toFixed(6));
        if (a.item_plantilla_id) {
          const idx = rows.findIndex((r) => r.item_id === a.item_plantilla_id);
          if (idx >= 0) {
            rows[idx] = {
              ...rows[idx],
              source: 'AJUSTE_REEMPLAZO',
              componente_id: a.componente_id,
              tipo: a.tipo,
              categoria: a.categoria,
              insumo_id: a.insumo_id,
              insumo_nombre: a.insumo_nombre,
              insumo_unidad: a.insumo_unidad,
              unidad_base: a.unidad_base,
              cantidad_por_unidad: Number(a.cantidad_por_unidad) || 0,
              esperado,
              obligatorio: Boolean(a.obligatorio),
              motivo: a.motivo,
            };
            continue;
          }
        }
        rows.push({
          source: 'AJUSTE_EXTRA',
          item_id: null,
          componente_id: a.componente_id,
          tipo: a.tipo,
          categoria: a.categoria,
          insumo_id: a.insumo_id,
          insumo_nombre: a.insumo_nombre,
          insumo_unidad: a.insumo_unidad,
          unidad_base: a.unidad_base,
          cantidad_por_unidad: Number(a.cantidad_por_unidad) || 0,
          esperado,
          obligatorio: Boolean(a.obligatorio),
          condicion: 'OTRO',
          motivo: a.motivo,
        });
      }
    }

    const realMap = new Map();
    if (lote_produccion_id) {
      const real = await client.query(
        `SELECT m.insumo_id, COALESCE(SUM(m.cantidad), 0)::numeric AS total
         FROM insumo_movimientos m
         WHERE m.lote_produccion_id = $1 AND m.tipo = 'SALIDA' AND m.documento_id IS NOT NULL
         GROUP BY m.insumo_id`,
        [lote_produccion_id]
      );
      for (const r of real.rows) realMap.set(r.insumo_id, Number(r.total) || 0);
    }

    const data = rows.map((r) => {
      const real = realMap.get(r.insumo_id) || 0;
      return {
        ...r,
        real,
        desviacion: Number((real - r.esperado).toFixed(6)),
      };
    });
    const resumen = {
      total_items: data.length,
      total_esperado: Number(data.reduce((s, r) => s + (r.esperado || 0), 0).toFixed(6)),
      total_real: Number(data.reduce((s, r) => s + (r.real || 0), 0).toFixed(6)),
      total_desviacion: Number(data.reduce((s, r) => s + (r.desviacion || 0), 0).toFixed(6)),
      unidades,
      especie_id: especieId,
      plantilla_id: plantillaId,
      lote_produccion_id: lote_produccion_id || null,
    };
    res.json({ data, resumen });
  } catch (error) {
    console.error('Error calculando conciliación de empaque:', error);
    res.status(500).json({ message: 'Error al calcular conciliación' });
  } finally {
    client.release();
  }
});

export default router;

