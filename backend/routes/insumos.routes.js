import express from 'express';
import { pool } from '../config/database.js';
import { authenticateToken, checkPermission } from '../middleware/auth.middleware.js';
import { emitirBajoMinimoInsumos, emitirNotificacion } from '../utils/notificaciones.js';
import { ensureInsumosModuleSchema } from '../utils/ensureInsumosModule.js';

const router = express.Router();
router.use(authenticateToken);
router.use(async (req, res, next) => {
  try {
    await ensureInsumosModuleSchema();
    next();
  } catch (err) {
    console.error('Módulo insumos (esquema):', err);
    res.status(500).json({
      message:
        process.env.NODE_ENV === 'development'
          ? err.message || 'Error al preparar tablas de insumos'
          : 'Error al inicializar módulo de insumos. Revise la base de datos.',
    });
  }
});

const devErr = (err, fallback) =>
  process.env.NODE_ENV === 'development' && err?.message ? err.message : fallback;

// --- Proveedores de insumos ---
router.get('/proveedores', async (req, res) => {
  try {
    const { q, limit = 200, incluir_inactivos } = req.query;
    const lim = Math.min(parseInt(limit, 10) || 200, 500);
    const todos = incluir_inactivos === '1' || incluir_inactivos === 'true';
    let sql = `SELECT id, razon_social, ruc, contacto, direccion, activo, created_at, updated_at
               FROM proveedores_insumos`;
    if (!todos) sql += ' WHERE activo = TRUE';
    const params = [];
    if (q && q.trim()) {
      sql += todos ? ` WHERE (razon_social ILIKE $1 OR ruc ILIKE $1)` : ` AND (razon_social ILIKE $1 OR ruc ILIKE $1)`;
      params.push(`%${q.trim()}%`);
    }
    sql += ` ORDER BY razon_social LIMIT ${lim}`;
    const result = await pool.query(sql, params);
    res.json({ data: result.rows });
  } catch (error) {
    console.error('Error listando proveedores insumos:', error);
    res.status(500).json({ message: 'Error al listar proveedores' });
  }
});

router.post('/proveedores', async (req, res) => {
  try {
    const { razon_social, ruc, contacto, direccion } = req.body;
    if (!razon_social || !String(razon_social).trim()) {
      return res.status(400).json({ message: 'Razón social es requerida' });
    }
    const result = await pool.query(
      `INSERT INTO proveedores_insumos (razon_social, ruc, contacto, direccion)
       VALUES ($1, $2, $3, $4)
       RETURNING id, razon_social, ruc, contacto, direccion, activo, created_at`,
      [razon_social.trim(), ruc?.trim() || null, contacto?.trim() || null, direccion?.trim() || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creando proveedor insumos:', error);
    res.status(500).json({ message: devErr(error, 'Error al crear proveedor') });
  }
});

router.get('/proveedores/:proveedorId', async (req, res) => {
  try {
    const { proveedorId } = req.params;
    const result = await pool.query(
      `SELECT id, razon_social, ruc, contacto, direccion, activo, created_at, updated_at
       FROM proveedores_insumos WHERE id = $1`,
      [proveedorId]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Proveedor no encontrado' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error obteniendo proveedor insumos:', error);
    res.status(500).json({ message: devErr(error, 'Error al obtener proveedor') });
  }
});

router.put('/proveedores/:proveedorId', async (req, res) => {
  try {
    const { proveedorId } = req.params;
    const { razon_social, ruc, contacto, direccion, activo } = req.body;
    const result = await pool.query(
      `UPDATE proveedores_insumos SET
         razon_social = COALESCE(NULLIF(TRIM($1), ''), razon_social),
         ruc = NULLIF(TRIM($2), ''),
         contacto = NULLIF(TRIM($3), ''),
         direccion = NULLIF(TRIM($4), ''),
         activo = COALESCE($5, activo),
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING id, razon_social, ruc, contacto, direccion, activo`,
      [
        razon_social ?? null,
        ruc ?? null,
        contacto ?? null,
        direccion ?? null,
        typeof activo === 'boolean' ? activo : null,
        proveedorId,
      ]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Proveedor no encontrado' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error actualizando proveedor insumos:', error);
    res.status(500).json({ message: devErr(error, 'Error al actualizar proveedor') });
  }
});

router.delete('/proveedores/:proveedorId', async (req, res) => {
  try {
    const { proveedorId } = req.params;
    const usados = await pool.query('SELECT 1 FROM insumos WHERE proveedor_id = $1 LIMIT 1', [proveedorId]);
    if (usados.rows.length > 0) {
      await pool.query(
        'UPDATE proveedores_insumos SET activo = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [proveedorId]
      );
      return res.json({ message: 'Proveedor desactivado (hay insumos que lo usan)' });
    }
    const del = await pool.query('DELETE FROM proveedores_insumos WHERE id = $1 RETURNING id', [proveedorId]);
    if (del.rows.length === 0) return res.status(404).json({ message: 'Proveedor no encontrado' });
    res.json({ message: 'Proveedor eliminado' });
  } catch (error) {
    console.error('Error eliminando proveedor insumos:', error);
    res.status(500).json({ message: devErr(error, 'Error al eliminar proveedor') });
  }
});

// --- Lotes producción (selector salidas) ---
router.get('/meta/lotes-produccion', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, codigo, estado, fecha_creacion
       FROM lotes_produccion
       ORDER BY fecha_creacion DESC NULLS LAST, codigo
       LIMIT 300`
    );
    res.json({ data: result.rows });
  } catch (error) {
    console.error('Error listando lotes para insumos:', error);
    res.status(500).json({ message: 'Error al listar lotes' });
  }
});

// --- Movimientos ---
router.get('/movimientos', async (req, res) => {
  try {
    const { tipo, lote_produccion_id, insumo_id, limit = 80, offset = 0 } = req.query;
    const limitNum = Math.min(parseInt(limit, 10) || 80, 500);
    const offsetNum = Math.max(0, parseInt(offset, 10) || 0);
    let where = 'WHERE 1=1';
    const params = [];
    let n = 1;
    if (tipo === 'INGRESO' || tipo === 'SALIDA') {
      where += ` AND m.tipo = $${n}`;
      params.push(tipo);
      n++;
    }
    if (lote_produccion_id) {
      where += ` AND m.lote_produccion_id = $${n}`;
      params.push(lote_produccion_id);
      n++;
    }
    if (insumo_id) {
      where += ` AND m.insumo_id = $${n}`;
      params.push(insumo_id);
      n++;
    }
    const countQ = await pool.query(
      `SELECT COUNT(*)::INT AS total FROM insumo_movimientos m ${where}`,
      params
    );
    const total = countQ.rows[0]?.total || 0;
    const result = await pool.query(
      `SELECT m.id, m.tipo, m.cantidad, m.referencia, m.observaciones, m.created_at,
              m.insumo_id, i.nombre AS insumo_nombre, i.unidad_medida AS insumo_unidad,
              m.lote_produccion_id, lp.codigo AS lote_codigo,
              u.nombre AS usuario_nombre
       FROM insumo_movimientos m
       JOIN insumos i ON i.id = m.insumo_id
       LEFT JOIN lotes_produccion lp ON lp.id = m.lote_produccion_id
       JOIN usuarios u ON u.id = m.usuario_id
       ${where}
       ORDER BY m.created_at DESC
       LIMIT $${n} OFFSET $${n + 1}`,
      [...params, limitNum, offsetNum]
    );
    res.json({ data: result.rows, total });
  } catch (error) {
    console.error('Error listando movimientos insumo:', error);
    res.status(500).json({ message: 'Error al listar movimientos' });
  }
});

/** Listado de documentos (encabezado) de ingreso/salida por fecha */
router.get('/movimientos/documentos', async (req, res) => {
  try {
    const { tipo, limit = 80 } = req.query;
    const lim = Math.min(parseInt(limit, 10) || 80, 200);
    const params = [];
    let where = 'WHERE 1=1';
    if (tipo === 'INGRESO' || tipo === 'SALIDA') {
      where += ` AND d.tipo = $1`;
      params.push(tipo);
    }
    const result = await pool.query(
      `SELECT d.id, d.tipo, d.fecha_movimiento, d.referencia, d.observaciones, d.created_at,
              d.lote_produccion_id, lp.codigo AS lote_codigo,
              d.ingreso_origen, d.proveedor_id, pr.razon_social AS proveedor_nombre,
              u.nombre AS usuario_nombre,
              (SELECT COUNT(*)::int FROM insumo_movimientos m WHERE m.documento_id = d.id) AS lineas_count
       FROM insumo_movimiento_documentos d
       LEFT JOIN lotes_produccion lp ON lp.id = d.lote_produccion_id
       LEFT JOIN proveedores_insumos pr ON pr.id = d.proveedor_id
       JOIN usuarios u ON u.id = d.usuario_id
       ${where}
       ORDER BY d.fecha_movimiento DESC NULLS LAST, d.created_at DESC
       LIMIT $${params.length + 1}`,
      [...params, lim]
    );
    res.json({ data: result.rows });
  } catch (error) {
    console.error('Error listando documentos insumo:', error);
    res.status(500).json({ message: 'Error al listar documentos' });
  }
});

/** Detalle de un documento con sus líneas */
router.get('/movimientos/documentos/:documentoId', async (req, res) => {
  try {
    const { documentoId } = req.params;
    const cab = await pool.query(
      `SELECT d.id, d.tipo, d.fecha_movimiento, d.referencia, d.observaciones, d.created_at,
              d.lote_produccion_id, lp.codigo AS lote_codigo,
              d.ingreso_origen, d.proveedor_id, pr.razon_social AS proveedor_nombre,
              u.nombre AS usuario_nombre, u.id AS usuario_id
       FROM insumo_movimiento_documentos d
       LEFT JOIN lotes_produccion lp ON lp.id = d.lote_produccion_id
       LEFT JOIN proveedores_insumos pr ON pr.id = d.proveedor_id
       JOIN usuarios u ON u.id = d.usuario_id
       WHERE d.id = $1`,
      [documentoId]
    );
    if (cab.rows.length === 0) return res.status(404).json({ message: 'Documento no encontrado' });
    const lineas = await pool.query(
      `SELECT m.id, m.insumo_id, m.tipo, m.cantidad, m.referencia, m.observaciones, m.created_at,
              i.nombre AS insumo_nombre, i.codigo AS insumo_codigo, i.unidad_medida AS insumo_unidad
       FROM insumo_movimientos m
       JOIN insumos i ON i.id = m.insumo_id
       WHERE m.documento_id = $1
       ORDER BY i.nombre`,
      [documentoId]
    );
    res.json({ ...cab.rows[0], lineas: lineas.rows });
  } catch (error) {
    console.error('Error obteniendo documento insumo:', error);
    res.status(500).json({ message: 'Error al obtener documento' });
  }
});

/** Crear documento con varias líneas y aplicar stock en una sola transacción */
router.post('/movimientos/documento', async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      tipo,
      lote_produccion_id,
      fecha_movimiento,
      referencia,
      observaciones,
      lineas,
      ingreso_origen,
      proveedor_id,
    } = req.body || {};
    const usuarioId = req.user?.id;
    if (!usuarioId) return res.status(401).json({ message: 'Usuario no identificado' });
    if (tipo !== 'INGRESO' && tipo !== 'SALIDA') {
      return res.status(400).json({ message: 'tipo debe ser INGRESO o SALIDA' });
    }
    if (!Array.isArray(lineas) || lineas.length === 0) {
      return res.status(400).json({ message: 'Debe enviar al menos una línea de insumo' });
    }
    if (tipo === 'SALIDA' && !lote_produccion_id) {
      return res.status(400).json({ message: 'Lote de producción es obligatorio para salidas' });
    }
    if (tipo === 'INGRESO' && lote_produccion_id) {
      return res.status(400).json({ message: 'Los ingresos no llevan lote de producción' });
    }

    let origenIngreso = null;
    let proveedorIdVal = null;
    if (tipo === 'INGRESO') {
      const o = ingreso_origen === 'PROVEEDOR' ? 'PROVEEDOR' : 'PRODUCCION';
      origenIngreso = o;
      if (o === 'PROVEEDOR') {
        if (!proveedor_id) {
          return res.status(400).json({ message: 'Debe seleccionar un proveedor de insumos' });
        }
        const pv = await pool.query(
          `SELECT id FROM proveedores_insumos WHERE id = $1 AND COALESCE(activo, TRUE) = TRUE`,
          [proveedor_id]
        );
        if (pv.rows.length === 0) {
          return res.status(400).json({ message: 'Proveedor no válido o inactivo' });
        }
        proveedorIdVal = proveedor_id;
      }
    }

    const normLineas = [];
    for (const ln of lineas) {
      const insumo_id = ln.insumo_id;
      const cant = Number(ln.cantidad);
      if (!insumo_id || !Number.isFinite(cant) || cant <= 0) continue;
      normLineas.push({ insumo_id, cantidad: cant });
    }
    if (normLineas.length === 0) {
      return res.status(400).json({ message: 'Líneas inválidas: insumo y cantidad > 0' });
    }

    const fecha = fecha_movimiento ? String(fecha_movimiento).slice(0, 10) : null;
    const ref = referencia != null && String(referencia).trim() !== '' ? String(referencia).trim() : null;
    const obs = observaciones != null && String(observaciones).trim() !== '' ? String(observaciones).trim() : null;

    await client.query('BEGIN');

    let loteId = null;
    if (tipo === 'SALIDA') {
      const loteOk = await client.query('SELECT id FROM lotes_produccion WHERE id = $1', [lote_produccion_id]);
      if (loteOk.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Lote de producción no válido' });
      }
      loteId = lote_produccion_id;
    }

    const docIns = await client.query(
      `INSERT INTO insumo_movimiento_documentos
        (tipo, lote_produccion_id, fecha_movimiento, referencia, observaciones, usuario_id, ingreso_origen, proveedor_id)
       VALUES ($1, $2, COALESCE($3::date, CURRENT_DATE), $4, $5, $6, $7, $8)
       RETURNING id`,
      [tipo, loteId, fecha, ref, obs, usuarioId, origenIngreso, proveedorIdVal]
    );
    const documentoId = docIns.rows[0].id;

    for (const ln of normLineas) {
      const insOk = await client.query(
        `SELECT id, stock_actual FROM insumos WHERE id = $1 AND (activo IS NULL OR activo = TRUE) FOR UPDATE`,
        [ln.insumo_id]
      );
      if (insOk.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Insumo no encontrado o inactivo' });
      }
      if (tipo === 'SALIDA') {
        const actual = Number(insOk.rows[0].stock_actual) || 0;
        if (actual + 1e-9 < ln.cantidad) {
          await client.query('ROLLBACK');
          return res.status(400).json({ message: `Stock insuficiente para ${ln.insumo_id}` });
        }
      }
    }

    const inserted = [];
    for (const ln of normLineas) {
      const mov = await client.query(
        `INSERT INTO insumo_movimientos
          (insumo_id, tipo, cantidad, lote_produccion_id, referencia, observaciones, usuario_id, documento_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, insumo_id, cantidad, created_at`,
        [
          ln.insumo_id,
          tipo,
          ln.cantidad,
          tipo === 'INGRESO' ? null : loteId,
          ref,
          obs,
          usuarioId,
          documentoId,
        ]
      );
      if (tipo === 'INGRESO') {
        await client.query(
          `UPDATE insumos SET stock_actual = stock_actual + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
          [ln.cantidad, ln.insumo_id]
        );
      } else {
        await client.query(
          `UPDATE insumos SET stock_actual = stock_actual - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
          [ln.cantidad, ln.insumo_id]
        );
      }
      inserted.push(mov.rows[0]);
    }

    await client.query('COMMIT');
    try {
      await emitirNotificacion(pool, {
        tipo: tipo === 'INGRESO' ? 'insumo_documento_ingreso' : 'insumo_documento_salida',
        modulo: 'Insumos',
        severidad: tipo === 'INGRESO' ? 'info' : 'warning',
        titulo: `Documento de insumos registrado (${tipo})`,
        mensaje: `${normLineas.length} linea(s) procesadas.`,
        origen_tabla: 'insumo_movimiento_documentos',
        origen_id: documentoId,
        metadata: { documento_id: documentoId, tipo, lineas: normLineas.length, usuario_id: usuarioId },
      });
      const bajoMinQ = await pool.query(
        `SELECT id, codigo, nombre, stock_actual, stock_minimo
         FROM insumos
         WHERE id = ANY($1::uuid[]) AND stock_actual < stock_minimo`,
        [normLineas.map((l) => l.insumo_id)]
      );
      for (const row of bajoMinQ.rows || []) {
        await emitirBajoMinimoInsumos(pool, {
          insumoId: row.id,
          codigo: row.codigo,
          nombre: row.nombre,
          stockActual: row.stock_actual,
          stockMinimo: row.stock_minimo,
        });
      }
    } catch (eNotif) {
      console.warn('Notificaciones insumos documento:', eNotif.message);
    }
    res.status(201).json({ documento_id: documentoId, lineas: inserted, message: 'Documento registrado' });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      /* ignore */
    }
    console.error('Error creando documento insumo:', error);
    res.status(500).json({ message: devErr(error, 'Error al registrar documento') });
  } finally {
    client.release();
  }
});

/** Anula un documento completo: revierte stock y elimina líneas y encabezado (solo Admin). */
router.delete('/movimientos/documentos/:documentoId', checkPermission('insumos.salidas', 'operate'), async (req, res) => {
  const client = await pool.connect();
  try {
    const { documentoId } = req.params;
    await client.query('BEGIN');
    const movs = await client.query(
      `SELECT id, insumo_id, tipo, cantidad FROM insumo_movimientos WHERE documento_id = $1 ORDER BY created_at FOR UPDATE`,
      [documentoId]
    );
    if (movs.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Documento sin líneas o no encontrado' });
    }
    for (const m of movs.rows) {
      const qty = Number(m.cantidad);
      const tipo = m.tipo;
      if (tipo === 'INGRESO') {
        const st = await client.query('SELECT stock_actual FROM insumos WHERE id = $1 FOR UPDATE', [m.insumo_id]);
        const actual = Number(st.rows[0]?.stock_actual) || 0;
        if (actual + 1e-9 < qty) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            message: 'No se puede anular: el stock no permite revertir un ingreso del documento',
          });
        }
        await client.query(
          'UPDATE insumos SET stock_actual = stock_actual - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [qty, m.insumo_id]
        );
      } else if (tipo === 'SALIDA') {
        await client.query(
          'UPDATE insumos SET stock_actual = stock_actual + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [qty, m.insumo_id]
        );
      }
      await client.query('DELETE FROM insumo_movimientos WHERE id = $1', [m.id]);
    }
    const delDoc = await client.query('DELETE FROM insumo_movimiento_documentos WHERE id = $1 RETURNING id', [documentoId]);
    if (delDoc.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Documento no encontrado' });
    }
    await client.query('COMMIT');
    res.json({ message: 'Documento anulado y stock revertido' });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      /* ignore */
    }
    console.error('Error anulando documento insumo:', error);
    res.status(500).json({ message: devErr(error, 'Error al anular documento') });
  } finally {
    client.release();
  }
});

router.get('/movimientos/:movimientoId', async (req, res) => {
  try {
    const { movimientoId } = req.params;
    const result = await pool.query(
      `SELECT m.id, m.tipo, m.cantidad, m.referencia, m.observaciones, m.created_at,
              m.insumo_id, i.nombre AS insumo_nombre, i.unidad_medida AS insumo_unidad,
              m.lote_produccion_id, lp.codigo AS lote_codigo,
              u.nombre AS usuario_nombre, u.id AS usuario_id
       FROM insumo_movimientos m
       JOIN insumos i ON i.id = m.insumo_id
       LEFT JOIN lotes_produccion lp ON lp.id = m.lote_produccion_id
       JOIN usuarios u ON u.id = m.usuario_id
       WHERE m.id = $1`,
      [movimientoId]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Movimiento no encontrado' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error obteniendo movimiento insumo:', error);
    res.status(500).json({ message: devErr(error, 'Error al obtener movimiento') });
  }
});

/** Corrige cantidad, insumo, referencia u observaciones ajustando stock (solo Admin). */
router.put('/movimientos/:movimientoId', checkPermission('insumos.salidas', 'operate'), async (req, res) => {
  const client = await pool.connect();
  try {
    const { movimientoId } = req.params;
    const body = req.body || {};
    await client.query('BEGIN');

    const movR = await client.query(
      `SELECT id, insumo_id, tipo, cantidad, lote_produccion_id, referencia, observaciones
       FROM insumo_movimientos WHERE id = $1 FOR UPDATE`,
      [movimientoId]
    );
    if (movR.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Movimiento no encontrado' });
    }
    const mov = movR.rows[0];
    const { tipo } = mov;
    const oldInsumo = mov.insumo_id;
    const oldQty = Number(mov.cantidad);

    const newInsumo =
      body.insumo_id != null && String(body.insumo_id).trim() !== '' ? body.insumo_id : oldInsumo;
    const newQty =
      body.cantidad != null && body.cantidad !== '' ? Number(body.cantidad) : oldQty;

    if (!Number.isFinite(newQty) || newQty <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Cantidad inválida' });
    }

    let newLote = mov.lote_produccion_id;
    if (tipo === 'SALIDA' && body.lote_produccion_id !== undefined) {
      newLote = body.lote_produccion_id ? body.lote_produccion_id : null;
    }
    if (tipo === 'SALIDA' && !newLote) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'El lote de producción es obligatorio para salidas' });
    }

    let newRef = mov.referencia;
    if (body.referencia !== undefined) {
      newRef =
        body.referencia == null || body.referencia === ''
          ? null
          : String(body.referencia).trim();
    }
    let newObs = mov.observaciones;
    if (body.observaciones !== undefined) {
      newObs =
        body.observaciones == null || body.observaciones === ''
          ? null
          : String(body.observaciones).trim();
    }

    const insOk = await client.query(
      `SELECT id FROM insumos WHERE id = $1 AND (activo IS NULL OR activo = TRUE)`,
      [newInsumo]
    );
    if (insOk.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Insumo no encontrado o inactivo' });
    }

    if (tipo === 'SALIDA') {
      const lotOk = await client.query('SELECT id FROM lotes_produccion WHERE id = $1', [newLote]);
      if (lotOk.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Lote de producción no válido' });
      }
    }

    const lockIds = [...new Set([oldInsumo, newInsumo].filter(Boolean))].sort();
    for (const iid of lockIds) {
      const lk = await client.query('SELECT id FROM insumos WHERE id = $1 FOR UPDATE', [iid]);
      if (lk.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Insumo no encontrado' });
      }
    }

    if (tipo === 'INGRESO') {
      const st = await client.query('SELECT stock_actual FROM insumos WHERE id = $1', [oldInsumo]);
      const actual = Number(st.rows[0]?.stock_actual) || 0;
      if (actual + 1e-9 < oldQty) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          message: 'No se puede editar: el stock actual no permite revertir este ingreso',
        });
      }
      await client.query(
        'UPDATE insumos SET stock_actual = stock_actual - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [oldQty, oldInsumo]
      );
    } else {
      await client.query(
        'UPDATE insumos SET stock_actual = stock_actual + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [oldQty, oldInsumo]
      );
    }

    if (tipo === 'INGRESO') {
      await client.query(
        'UPDATE insumos SET stock_actual = stock_actual + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [newQty, newInsumo]
      );
    } else {
      const st = await client.query('SELECT stock_actual FROM insumos WHERE id = $1', [newInsumo]);
      const actual = Number(st.rows[0]?.stock_actual) || 0;
      if (actual + 1e-9 < newQty) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Stock insuficiente para la nueva cantidad de salida' });
      }
      await client.query(
        'UPDATE insumos SET stock_actual = stock_actual - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [newQty, newInsumo]
      );
    }

    await client.query(
      `UPDATE insumo_movimientos SET
        insumo_id = $1,
        cantidad = $2,
        referencia = $3,
        observaciones = $4,
        lote_produccion_id = $5
       WHERE id = $6`,
      [newInsumo, newQty, newRef, newObs, tipo === 'INGRESO' ? null : newLote, movimientoId]
    );

    await client.query('COMMIT');

    const result = await pool.query(
      `SELECT m.id, m.tipo, m.cantidad, m.referencia, m.observaciones, m.created_at,
              m.insumo_id, i.nombre AS insumo_nombre, i.unidad_medida AS insumo_unidad,
              m.lote_produccion_id, lp.codigo AS lote_codigo,
              u.nombre AS usuario_nombre, u.id AS usuario_id
       FROM insumo_movimientos m
       JOIN insumos i ON i.id = m.insumo_id
       LEFT JOIN lotes_produccion lp ON lp.id = m.lote_produccion_id
       JOIN usuarios u ON u.id = m.usuario_id
       WHERE m.id = $1`,
      [movimientoId]
    );
    res.json(result.rows[0]);
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      /* ignore */
    }
    console.error('Error actualizando movimiento insumo:', error);
    res.status(500).json({ message: devErr(error, 'Error al actualizar movimiento') });
  } finally {
    client.release();
  }
});

/** Anula un movimiento y revierte el stock (solo Admin). */
router.delete('/movimientos/:movimientoId', checkPermission('insumos.salidas', 'operate'), async (req, res) => {
  const client = await pool.connect();
  try {
    const { movimientoId } = req.params;
    await client.query('BEGIN');
    const row = await client.query(
      'SELECT insumo_id, tipo, cantidad FROM insumo_movimientos WHERE id = $1 FOR UPDATE',
      [movimientoId]
    );
    if (row.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Movimiento no encontrado' });
    }
    const { insumo_id, tipo, cantidad } = row.rows[0];
    const qty = Number(cantidad);
    if (tipo === 'INGRESO') {
      const st = await client.query('SELECT stock_actual FROM insumos WHERE id = $1 FOR UPDATE', [insumo_id]);
      const actual = Number(st.rows[0]?.stock_actual) || 0;
      if (actual + 1e-9 < qty) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          message: 'No se puede anular este ingreso: el stock actual es insuficiente para revertir',
        });
      }
      await client.query(
        'UPDATE insumos SET stock_actual = stock_actual - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [qty, insumo_id]
      );
    } else if (tipo === 'SALIDA') {
      await client.query(
        'UPDATE insumos SET stock_actual = stock_actual + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [qty, insumo_id]
      );
    } else {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Tipo de movimiento no soportado' });
    }
    await client.query('DELETE FROM insumo_movimientos WHERE id = $1', [movimientoId]);
    await client.query('COMMIT');
    res.json({ message: 'Movimiento anulado y stock revertido' });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (_) { /* ignore */ }
    console.error('Error anulando movimiento insumo:', error);
    res.status(500).json({ message: devErr(error, 'Error al anular movimiento') });
  } finally {
    client.release();
  }
});

router.post('/movimientos/ingreso', async (req, res) => {
  const client = await pool.connect();
  try {
    const { insumo_id, cantidad, referencia, observaciones } = req.body;
    const usuarioId = req.user?.id;
    if (!insumo_id || cantidad == null || Number(cantidad) <= 0) {
      return res.status(400).json({ message: 'Insumo y cantidad válida son requeridos' });
    }
    if (!usuarioId) return res.status(401).json({ message: 'Usuario no identificado' });
    const qty = Number(cantidad);
    await client.query('BEGIN');
    const mov = await client.query(
      `INSERT INTO insumo_movimientos (insumo_id, tipo, cantidad, lote_produccion_id, referencia, observaciones, usuario_id)
       VALUES ($1, 'INGRESO', $2, NULL, $3, $4, $5)
       RETURNING id, insumo_id, tipo, cantidad, referencia, observaciones, created_at`,
      [insumo_id, qty, referencia?.trim() || null, observaciones?.trim() || null, usuarioId]
    );
    await client.query(
      `UPDATE insumos SET stock_actual = stock_actual + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [qty, insumo_id]
    );
    await client.query('COMMIT');
    try {
      await emitirNotificacion(pool, {
        tipo: 'insumo_ingreso',
        modulo: 'Insumos',
        severidad: 'info',
        titulo: 'Ingreso de insumo registrado',
        mensaje: `Cantidad: ${qty}`,
        origen_tabla: 'insumo_movimientos',
        origen_id: mov.rows[0]?.id,
        metadata: { movimiento_id: mov.rows[0]?.id, insumo_id, cantidad: qty, usuario_id: usuarioId },
      });
      const st = await pool.query(
        `SELECT id, codigo, nombre, stock_actual, stock_minimo FROM insumos WHERE id = $1 AND stock_actual < stock_minimo`,
        [insumo_id]
      );
      if (st.rows[0]) {
        await emitirBajoMinimoInsumos(pool, {
          insumoId: st.rows[0].id,
          codigo: st.rows[0].codigo,
          nombre: st.rows[0].nombre,
          stockActual: st.rows[0].stock_actual,
          stockMinimo: st.rows[0].stock_minimo,
        });
      }
    } catch (eNotif) {
      console.warn('Notificación insumo_ingreso:', eNotif.message);
    }
    res.status(201).json(mov.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error ingreso insumo:', error);
    res.status(500).json({ message: 'Error al registrar ingreso' });
  } finally {
    client.release();
  }
});

router.post('/movimientos/salida', async (req, res) => {
  const client = await pool.connect();
  try {
    const { insumo_id, cantidad, lote_produccion_id, referencia, observaciones } = req.body;
    const usuarioId = req.user?.id;
    if (!insumo_id || cantidad == null || Number(cantidad) <= 0) {
      return res.status(400).json({ message: 'Insumo y cantidad válida son requeridos' });
    }
    if (!lote_produccion_id) {
      return res.status(400).json({ message: 'Debe seleccionar un lote de producción' });
    }
    if (!usuarioId) return res.status(401).json({ message: 'Usuario no identificado' });
    const qty = Number(cantidad);
    const loteOk = await client.query('SELECT id FROM lotes_produccion WHERE id = $1', [lote_produccion_id]);
    if (loteOk.rows.length === 0) return res.status(400).json({ message: 'Lote de producción no válido' });
    const stockRow = await client.query(
      'SELECT stock_actual FROM insumos WHERE id = $1 AND (activo IS NULL OR activo = TRUE)',
      [insumo_id]
    );
    if (stockRow.rows.length === 0) return res.status(404).json({ message: 'Insumo no encontrado' });
    const actual = Number(stockRow.rows[0].stock_actual) || 0;
    if (actual + 1e-9 < qty) {
      return res.status(400).json({ message: 'Stock insuficiente para esta salida' });
    }
    await client.query('BEGIN');
    const mov = await client.query(
      `INSERT INTO insumo_movimientos (insumo_id, tipo, cantidad, lote_produccion_id, referencia, observaciones, usuario_id)
       VALUES ($1, 'SALIDA', $2, $3, $4, $5, $6)
       RETURNING id, insumo_id, tipo, cantidad, lote_produccion_id, referencia, created_at`,
      [insumo_id, qty, lote_produccion_id, referencia?.trim() || null, observaciones?.trim() || null, usuarioId]
    );
    await client.query(
      `UPDATE insumos SET stock_actual = stock_actual - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [qty, insumo_id]
    );
    await client.query('COMMIT');
    try {
      await emitirNotificacion(pool, {
        tipo: 'insumo_salida',
        modulo: 'Insumos',
        severidad: 'warning',
        titulo: 'Salida de insumo registrada',
        mensaje: `Cantidad: ${qty}`,
        origen_tabla: 'insumo_movimientos',
        origen_id: mov.rows[0]?.id,
        metadata: { movimiento_id: mov.rows[0]?.id, insumo_id, cantidad: qty, lote_produccion_id, usuario_id: usuarioId },
      });
      const st = await pool.query(
        `SELECT id, codigo, nombre, stock_actual, stock_minimo FROM insumos WHERE id = $1 AND stock_actual < stock_minimo`,
        [insumo_id]
      );
      if (st.rows[0]) {
        await emitirBajoMinimoInsumos(pool, {
          insumoId: st.rows[0].id,
          codigo: st.rows[0].codigo,
          nombre: st.rows[0].nombre,
          stockActual: st.rows[0].stock_actual,
          stockMinimo: st.rows[0].stock_minimo,
        });
      }
    } catch (eNotif) {
      console.warn('Notificación insumo_salida:', eNotif.message);
    }
    res.status(201).json(mov.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error salida insumo:', error);
    res.status(500).json({ message: 'Error al registrar salida' });
  } finally {
    client.release();
  }
});

// --- Stock / resumen ---
router.get('/stock', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT i.id, i.nombre, i.codigo, i.stock_minimo, i.stock_actual, i.unidad_medida, i.proveedor_id,
              p.razon_social AS proveedor_nombre,
              (i.stock_actual < i.stock_minimo) AS bajo_minimo
       FROM insumos i
       LEFT JOIN proveedores_insumos p ON p.id = i.proveedor_id
       WHERE COALESCE(i.activo, TRUE) = TRUE
       ORDER BY i.nombre`
    );
    const rows = result.rows.map((r) => ({
      ...r,
      bajo_minimo: Boolean(r.bajo_minimo),
    }));
    const bajo = rows.filter((r) => r.bajo_minimo).length;
    res.json({ data: rows, resumen: { total: rows.length, bajo_minimo: bajo } });
  } catch (error) {
    console.error('Error stock insumos:', error);
    res.status(500).json({ message: 'Error al obtener stock de insumos' });
  }
});

// --- Catálogo insumos (lista paginada) ---
router.get('/', async (req, res) => {
  try {
    const { limit = 50, offset = 0, q, incluir_inactivos } = req.query;
    const limitNum = Math.min(parseInt(limit, 10) || 50, 500);
    const offsetNum = Math.max(0, parseInt(offset, 10) || 0);
    const todos = incluir_inactivos === '1' || incluir_inactivos === 'true';

    let where = todos ? 'WHERE 1=1' : 'WHERE COALESCE(i.activo, TRUE) = TRUE';
    const params = [];
    let n = 1;
    if (q && q.trim()) {
      where += ` AND (i.nombre ILIKE $${n} OR i.codigo ILIKE $${n})`;
      params.push(`%${q.trim()}%`);
      n++;
    }

    const countResult = await pool.query(
      `SELECT COUNT(*) AS total FROM insumos i ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.total, 10) || 0;

    const result = await pool.query(
      `SELECT i.id, i.nombre, i.codigo, i.stock_minimo, i.stock_actual, i.unidad_medida, i.proveedor_id, i.activo, i.created_at, i.updated_at,
              p.razon_social AS proveedor_nombre
       FROM insumos i
       LEFT JOIN proveedores_insumos p ON p.id = i.proveedor_id
       ${where}
       ORDER BY i.nombre
       LIMIT $${n} OFFSET $${n + 1}`,
      [...params, limitNum, offsetNum]
    );
    res.json({ data: result.rows, total });
  } catch (error) {
    console.error('Error listando insumos:', error);
    res.status(500).json({ message: 'Error al listar insumos' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (id === 'stock' || id === 'proveedores' || id === 'movimientos' || id === 'meta') {
      return res.status(404).json({ message: 'No encontrado' });
    }
    const result = await pool.query(
      `SELECT i.id, i.nombre, i.codigo, i.stock_minimo, i.stock_actual, i.unidad_medida, i.proveedor_id, i.activo, i.created_at, i.updated_at,
              p.razon_social AS proveedor_nombre
       FROM insumos i
       LEFT JOIN proveedores_insumos p ON p.id = i.proveedor_id
       WHERE i.id = $1`,
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Insumo no encontrado' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error obteniendo insumo:', error);
    res.status(500).json({ message: 'Error al obtener insumo' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { nombre, codigo, stock_minimo, stock_actual, unidad_medida, proveedor_id } = req.body;
    if (!nombre || !nombre.trim()) return res.status(400).json({ message: 'El nombre es requerido' });

    const result = await pool.query(
      `INSERT INTO insumos (nombre, codigo, stock_minimo, stock_actual, unidad_medida, proveedor_id)
       VALUES ($1, NULLIF(TRIM($2), ''), COALESCE($3, 0), COALESCE($4, 0), COALESCE($5, 'UN'), $6)
       RETURNING id, nombre, codigo, stock_minimo, stock_actual, unidad_medida, proveedor_id, activo, created_at, updated_at`,
      [
        nombre.trim(),
        codigo || null,
        stock_minimo != null ? Number(stock_minimo) : 0,
        stock_actual != null ? Number(stock_actual) : 0,
        (unidad_medida && unidad_medida.trim()) || 'UN',
        proveedor_id || null,
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creando insumo:', error);
    res.status(500).json({ message: 'Error al crear insumo' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, codigo, stock_minimo, stock_actual, unidad_medida, proveedor_id, activo } = req.body;
    const existing = await pool.query('SELECT id FROM insumos WHERE id = $1', [id]);
    if (existing.rows.length === 0) return res.status(404).json({ message: 'Insumo no encontrado' });

    const result = await pool.query(
      `UPDATE insumos SET
         nombre = COALESCE(NULLIF(TRIM($1), ''), nombre),
         codigo = NULLIF(TRIM($2), ''),
         stock_minimo = COALESCE($3, stock_minimo),
         stock_actual = COALESCE($4, stock_actual),
         unidad_medida = COALESCE(NULLIF(TRIM($5), ''), unidad_medida),
         proveedor_id = $6,
         activo = COALESCE($7, activo),
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $8
       RETURNING id, nombre, codigo, stock_minimo, stock_actual, unidad_medida, proveedor_id, activo, updated_at`,
      [
        nombre,
        codigo != null ? codigo : null,
        stock_minimo != null ? Number(stock_minimo) : null,
        stock_actual != null ? Number(stock_actual) : null,
        unidad_medida,
        proveedor_id === '' ? null : proveedor_id,
        typeof activo === 'boolean' ? activo : null,
        id,
      ]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error actualizando insumo:', error);
    res.status(500).json({ message: 'Error al actualizar insumo' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const mov = await pool.query('SELECT 1 FROM insumo_movimientos WHERE insumo_id = $1 LIMIT 1', [id]);
    if (mov.rows.length > 0) {
      await pool.query(
        'UPDATE insumos SET activo = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING id',
        [id]
      );
      return res.json({ message: 'Insumo desactivado (tiene movimientos registrados)' });
    }
    const result = await pool.query('DELETE FROM insumos WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Insumo no encontrado' });
    res.json({ message: 'Insumo eliminado correctamente' });
  } catch (error) {
    console.error('Error eliminando insumo:', error);
    res.status(500).json({ message: 'Error al eliminar insumo' });
  }
});

export default router;
