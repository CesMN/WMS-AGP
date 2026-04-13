import express from 'express';
import { pool } from '../config/database.js';
import { authenticateToken, checkPermission } from '../middleware/auth.middleware.js';
import { buildResultadosProduccionForLote, filtrarResultadosConKgProducido } from '../utils/loteResultadosProduccion.js';
import { buildInsumosOperativosReporte } from '../utils/insumosOperativosLote.js';
import { buildConciliacionPlantillaProceso, insumosParteProduccionDesdeSeleccion } from '../utils/conciliacionEmpaqueLote.js';
import { emitirNotificacion } from '../utils/notificaciones.js';

const router = express.Router();
router.use(authenticateToken);

// ========== LOTES DE PRODUCCIÓN ==========
// Listar (rutas concretas antes de /:id)
router.get('/lotes/list', async (req, res) => {
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
      `SELECT COUNT(*) AS total FROM lotes_produccion ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.total, 10) || 0;
    const result = await pool.query(
      `SELECT id, codigo, estado, fecha_creacion, fecha_inicio, fecha_terminado, observaciones, created_at, updated_at
       FROM lotes_produccion ${where}
       ORDER BY fecha_creacion DESC, created_at DESC
       LIMIT $${n} OFFSET $${n + 1}`,
      [...params, limitNum, offsetNum]
    );
    res.json({ data: result.rows, total });
  } catch (error) {
    console.error('Error listando lotes producción:', error);
    res.status(500).json({ message: 'Error al listar lotes de producción' });
  }
});

router.post('/lotes', async (req, res) => {
  try {
    const { codigo, estado, fecha_creacion, observaciones } = req.body;
    if (!codigo || !codigo.trim()) {
      return res.status(400).json({ message: 'El código del lote es requerido' });
    }
    const result = await pool.query(
      `INSERT INTO lotes_produccion (codigo, estado, fecha_creacion, observaciones)
       VALUES ($1, COALESCE($2, 'Registrado'), COALESCE($3::date, CURRENT_DATE), $4)
       RETURNING id, codigo, estado, fecha_creacion, fecha_inicio, fecha_terminado, observaciones, created_at`,
      [codigo.trim(), estado, fecha_creacion || null, observaciones?.trim() || null]
    );
    try {
      await emitirNotificacion(pool, {
        tipo: 'lote_creado',
        modulo: 'Ingresos MP',
        severidad: 'info',
        titulo: `Lote creado: ${result.rows[0].codigo}`,
        mensaje: `Estado inicial: ${result.rows[0].estado}.`,
        origen_tabla: 'lotes_produccion',
        origen_id: result.rows[0].id,
        metadata: { lote_id: result.rows[0].id, codigo: result.rows[0].codigo, usuario_id: req.user?.id || null },
      });
    } catch (eNotif) {
      console.warn('Notificación lote_creado:', eNotif.message);
    }
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creando lote:', error);
    if (error.code === '23505') return res.status(400).json({ message: 'Ya existe un lote con ese código' });
    res.status(500).json({ message: 'Error al crear lote' });
  }
});

async function ensureLoteBunkerGalonesColumn() {
  await pool.query(
    `ALTER TABLE lotes_produccion ADD COLUMN IF NOT EXISTS operativo_bunker_galones NUMERIC(14, 3)`
  );
}

/** Galones de bunker por lote (resumen insumos operativos). */
router.patch('/lotes/:id/operativos-bunker-galones', async (req, res) => {
  try {
    await ensureLoteBunkerGalonesColumn();
    const { id } = req.params;
    let { operativo_bunker_galones } = req.body || {};
    if (operativo_bunker_galones === '' || operativo_bunker_galones === undefined) {
      operativo_bunker_galones = null;
    } else {
      const n = Number(operativo_bunker_galones);
      if (!Number.isFinite(n) || n < 0) {
        return res.status(400).json({ message: 'Los galones deben ser un número mayor o igual a 0, o vacío para borrar' });
      }
      operativo_bunker_galones = n;
    }
    const result = await pool.query(
      `UPDATE lotes_produccion SET operativo_bunker_galones = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, operativo_bunker_galones`,
      [operativo_bunker_galones, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Lote no encontrado' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error guardando galones bunker:', error);
    res.status(500).json({ message: 'Error al guardar galones de bunker' });
  }
});

router.put('/lotes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { codigo, estado, fecha_inicio, fecha_terminado, observaciones } = req.body;
    const updates = [];
    const values = [];
    let n = 1;
    if (codigo !== undefined) { updates.push(`codigo = $${n}`); values.push(codigo); n++; }
    if (estado !== undefined) { updates.push(`estado = $${n}`); values.push(estado); n++; }
    if (fecha_inicio !== undefined) { updates.push(`fecha_inicio = $${n}`); values.push(fecha_inicio); n++; }
    if (fecha_terminado !== undefined) { updates.push(`fecha_terminado = $${n}`); values.push(fecha_terminado); n++; }
    if (observaciones !== undefined) { updates.push(`observaciones = $${n}`); values.push(observaciones); n++; }
    if (estado === 'Iniciado' && fecha_inicio === undefined) updates.push(`fecha_inicio = COALESCE(fecha_inicio, CURRENT_TIMESTAMP)`);
    if (estado === 'Terminado' && fecha_terminado === undefined) updates.push(`fecha_terminado = CURRENT_TIMESTAMP`);
    if (updates.length === 0) {
      const row = await pool.query('SELECT * FROM lotes_produccion WHERE id = $1', [id]);
      if (row.rows.length === 0) return res.status(404).json({ message: 'Lote no encontrado' });
      return res.json(row.rows[0]);
    }
    values.push(id);
    const result = await pool.query(
      `UPDATE lotes_produccion SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${n} RETURNING *`,
      values
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Lote no encontrado' });
    try {
      const row = result.rows[0];
      const estadoNorm = String(row.estado || '').trim();
      const tipo = estadoNorm === 'Terminado' ? 'lote_terminado' : estadoNorm === 'Iniciado' || estadoNorm === 'En proceso' ? 'lote_iniciado' : 'lote_actualizado';
      const sev = estadoNorm === 'Terminado' ? 'success' : 'info';
      await emitirNotificacion(pool, {
        tipo,
        modulo: 'Ingresos MP',
        severidad: sev,
        titulo: `Lote actualizado: ${row.codigo}`,
        mensaje: `Estado actual: ${row.estado || '—'}.`,
        origen_tabla: 'lotes_produccion',
        origen_id: row.id,
        metadata: { lote_id: row.id, codigo: row.codigo, estado: row.estado, usuario_id: req.user?.id || null },
      });
    } catch (eNotif) {
      console.warn('Notificación lote_actualizado:', eNotif.message);
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error actualizando lote:', error);
    res.status(500).json({ message: 'Error al actualizar lote' });
  }
});

router.get('/lotes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM lotes_produccion WHERE id = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Lote no encontrado' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error obteniendo lote:', error);
    res.status(500).json({ message: 'Error al obtener lote' });
  }
});

// Cancelar procesos de producción del lote (solo Admin): elimina registros de envasado, congelado y empaque para poder eliminar el lote
router.post('/lotes/:id/cancelar-procesos', checkPermission('ingresos_mp.lotes', 'operate'), async (req, res) => {
  try {
    const { id } = req.params;
    const lote = await pool.query('SELECT id FROM lotes_produccion WHERE id = $1', [id]);
    if (lote.rows.length === 0) return res.status(404).json({ message: 'Lote no encontrado' });

    const [delEmpaque, delCongelado, delEnvasado] = await Promise.all([
      pool.query('DELETE FROM empaque WHERE lote_id = $1 RETURNING id', [id]),
      pool.query('DELETE FROM congelado WHERE lote_id = $1 RETURNING id', [id]),
      pool.query('DELETE FROM envasado WHERE lote_id = $1 RETURNING id', [id]),
    ]);
    const eliminados = (delEmpaque.rows?.length || 0) + (delCongelado.rows?.length || 0) + (delEnvasado.rows?.length || 0);

    return res.status(200).json({
      message: eliminados > 0 ? 'Procesos (envasado, congelado, empaque) cancelados correctamente' : 'No había registros de envasado, congelado o empaque para este lote',
      eliminados,
    });
  } catch (error) {
    console.error('Error cancelando procesos del lote:', error);
    res.status(500).json({ message: 'Error al cancelar procesos' });
  }
});

// Eliminar lote (solo Admin, solo si no tiene datos en la secuencia: vehículos, envasado, congelado, empaque, parihuelas)
router.delete('/lotes/:id', checkPermission('ingresos_mp.lotes', 'operate'), async (req, res) => {
  try {
    const { id } = req.params;
    const lote = await pool.query('SELECT id FROM lotes_produccion WHERE id = $1', [id]);
    if (lote.rows.length === 0) return res.status(404).json({ message: 'Lote no encontrado' });

    const [veh, env, con, emp, par] = await Promise.all([
      pool.query('SELECT COUNT(*)::INT AS c FROM vehiculos_lote WHERE lote_produccion_id = $1', [id]),
      pool.query('SELECT COUNT(*)::INT AS c FROM envasado WHERE lote_id = $1', [id]),
      pool.query('SELECT COUNT(*)::INT AS c FROM congelado WHERE lote_id = $1', [id]),
      pool.query('SELECT COUNT(*)::INT AS c FROM empaque WHERE lote_id = $1', [id]),
      pool.query('SELECT COUNT(*)::INT AS c FROM parihuelas_produccion WHERE lote_id = $1', [id]),
    ]);
    if ((veh.rows[0]?.c || 0) > 0) {
      return res.status(400).json({ message: 'No se puede eliminar: el lote tiene vehículos registrados. Elimine primero los vehículos.' });
    }
    if ((env.rows[0]?.c || 0) > 0 || (con.rows[0]?.c || 0) > 0 || (emp.rows[0]?.c || 0) > 0) {
      return res.status(400).json({ message: 'No se puede eliminar: el lote tiene registros de envasado, congelado o empaque.' });
    }
    if ((par.rows[0]?.c || 0) > 0) {
      return res.status(400).json({ message: 'No se puede eliminar: el lote tiene parihuelas asociadas.' });
    }

    await pool.query('DELETE FROM lotes_produccion WHERE id = $1', [id]);
    return res.status(200).json({ message: 'Lote eliminado correctamente' });
  } catch (error) {
    console.error('Error eliminando lote:', error);
    res.status(500).json({ message: 'Error al eliminar lote' });
  }
});

// Resumen del lote: recepción MP (vehículos, descargas, winchas), producción, insumos y despachos
router.get('/lotes/:id/resumen', async (req, res) => {
  try {
    const { id } = req.params;
    const loteResult = await pool.query('SELECT * FROM lotes_produccion WHERE id = $1', [id]);
    if (loteResult.rows.length === 0) return res.status(404).json({ message: 'Lote no encontrado' });
    const lote = loteResult.rows[0];

    const [vehiculosResult, descargasResult] = await Promise.all([
      pool.query(
        `SELECT vl.id, vl.numero_orden, vl.placas, vl.proveedor_nombre, vl.cantidad_aproximada, vl.created_at,
                e.nombre AS especie_nombre, c.nombre AS cliente_nombre
         FROM vehiculos_lote vl
         LEFT JOIN especies e ON e.id = vl.especie_id
         LEFT JOIN clientes c ON c.id = vl.cliente_id
         WHERE vl.lote_produccion_id = $1 ORDER BY vl.numero_orden, vl.created_at`,
        [id]
      ),
      pool.query(
        `SELECT d.id, d.numero_guia_interna, d.fecha_descarga, d.estado, d.placas_vehiculo, d.proveedor_razon_social,
                vl.numero_orden, esp.nombre AS especie_nombre, cli.nombre AS cliente_nombre,
                (SELECT COALESCE(SUM(w.peso_kg), 0) FROM descarga_winchas w WHERE w.descarga_id = d.id) AS total_kg
         FROM descargas_materia_prima d
         JOIN vehiculos_lote vl ON vl.id = d.vehiculo_lote_id
         LEFT JOIN especies esp ON esp.id = d.especie_id
         LEFT JOIN clientes cli ON cli.id = d.cliente_id
         WHERE vl.lote_produccion_id = $1 ORDER BY d.fecha_descarga, d.created_at`,
        [id]
      ),
    ]);

    const descargaIds = (descargasResult.rows || []).map((d) => d.id);
    let winchas = [];
    if (descargaIds.length > 0) {
      const winchasResult = await pool.query(
        `SELECT w.id, w.descarga_id, w.numero_wincha, w.numero_guia_remitente, w.nombre_embarcacion, w.matricula_embarcacion,
                w.peso_kg, w.cajas, w.hora_inicio, w.hora_final
         FROM descarga_winchas w
         WHERE w.descarga_id = ANY($1::uuid[]) ORDER BY w.descarga_id, w.created_at`,
        [descargaIds]
      );
      winchas = winchasResult.rows || [];
    }

    const totalKgWinchas = winchas.reduce((s, w) => s + (Number(w.peso_kg) || 0), 0);
    const totalCajasWinchas = winchas.reduce((s, w) => s + (Number(w.cajas) || 0), 0);

    let produccion_resumen = {
      lineas: [],
      total_bultos_empaque: 0,
      total_kg_empaque: 0,
      total_kg_procesos: 0,
    };
    try {
      const rawProd = await buildResultadosProduccionForLote(pool, id);
      const filas = filtrarResultadosConKgProducido(rawProd);
      produccion_resumen = {
        lineas: filas,
        total_bultos_empaque: filas.reduce((s, p) => s + (Number(p.empaque_bultos) || 0), 0),
        total_kg_empaque: Number(filas.reduce((s, p) => s + (Number(p.empaque_kg) || 0), 0).toFixed(2)),
        total_kg_procesos: Number(
          filas
            .reduce(
              (s, p) =>
                s + (Number(p.empaque_kg) || 0) + (Number(p.envasado_kg) || 0) + (Number(p.congelado_kg) || 0),
              0
            )
            .toFixed(2)
        ),
      };
    } catch (e) {
      console.warn('Resumen lote: producción empaque/env/cong:', e.message);
    }

    const etiquetaEstadoModulo = (valorDb) => {
      if (valorDb == null || valorDb === '') return 'No iniciado';
      const v = String(valorDb).toLowerCase();
      if (v === 'en_proceso') return 'En proceso';
      if (v === 'finalizado') return 'Finalizado';
      return String(valorDb);
    };

    let procesos_lote = [];
    try {
      const [envasadoQ, congeladoQ, empaqueQ] = await Promise.all([
        pool.query('SELECT id, estado FROM envasado WHERE lote_id = $1 LIMIT 1', [id]),
        pool.query('SELECT id, estado FROM congelado WHERE lote_id = $1 LIMIT 1', [id]),
        pool.query('SELECT id, estado FROM empaque WHERE lote_id = $1 LIMIT 1', [id]),
      ]);
      let controlEstado = 'No aplicado';
      try {
        const ctrlAplicacionQ = await pool.query(
          'SELECT aplicado_at FROM control_produccion_aplicacion WHERE lote_id = $1 LIMIT 1',
          [id]
        );
        if (ctrlAplicacionQ.rows[0]?.aplicado_at) controlEstado = 'Aplicado';
      } catch (eCtrl) {
        console.warn('Resumen lote: control_produccion_aplicacion:', eCtrl.message);
      }
      procesos_lote = [
        { proceso: 'Envasado', estado: etiquetaEstadoModulo(envasadoQ.rows[0]?.estado ?? null) },
        { proceso: 'Congelado', estado: etiquetaEstadoModulo(congeladoQ.rows[0]?.estado ?? null) },
        { proceso: 'Empaque', estado: etiquetaEstadoModulo(empaqueQ.rows[0]?.estado ?? null) },
        { proceso: 'Control de producción', estado: controlEstado },
      ];
    } catch (e) {
      console.warn('Resumen lote: estados de procesos:', e.message);
    }

    let insumos = [];
    const insumos_resumen = {
      estado: 'sin_datos',
      leyenda: 'Sin datos de insumos de empaque para este lote.',
    };
    let insumos_operativos = [];
    try {
      await pool.query(`ALTER TABLE empaque ADD COLUMN IF NOT EXISTS seleccion_reporte JSONB`);
      await pool.query(`ALTER TABLE empaque ADD COLUMN IF NOT EXISTS insumos_operativos_snapshot JSONB`);
    } catch (_) {
      /* empaque puede no existir */
    }
    try {
      const empaqueQ = await pool.query(
        `SELECT plantilla_id, seleccion_reporte, insumos_operativos_snapshot FROM empaque WHERE lote_id = $1 LIMIT 1`,
        [id]
      );
      const em = empaqueQ.rows[0];
      const plantillaId = em?.plantilla_id || null;
      const seleccion = em?.seleccion_reporte || null;
      const hasSeleccion =
        seleccion &&
        ((Array.isArray(seleccion.calculado) && seleccion.calculado.length > 0) ||
          (Array.isArray(seleccion.real) && seleccion.real.length > 0));
      const snap = em?.insumos_operativos_snapshot;
      const tmMpResumen = totalKgWinchas > 0 ? totalKgWinchas / 1000 : 0;
      if (plantillaId) {
        const { data: concRows } = await buildConciliacionPlantillaProceso(pool, id, plantillaId);
        if (hasSeleccion) {
          insumos = insumosParteProduccionDesdeSeleccion(concRows, seleccion, tmMpResumen);
          insumos_resumen.estado = 'agregados';
          insumos_resumen.leyenda = 'Insumos de empaque agregados a producción (según selección guardada).';
        } else {
          insumos = (concRows || [])
            .map((r) => ({
              codigo: r.insumo_codigo || '',
              descripcion: r.insumo_nombre || '',
              cantidad: Number(r.esperado || 0),
              unidad_medida: r.insumo_unidad || '',
              ratio_tm: tmMpResumen > 0 ? Number((Number(r.esperado || 0) / tmMpResumen).toFixed(6)) : null,
            }))
            .sort((a, b) => `${a.descripcion || ''}`.localeCompare(`${b.descripcion || ''}`, 'es'));
          insumos_resumen.estado = 'completos';
          insumos_resumen.leyenda = 'Insumos completos calculados por plantilla (aún sin selección/agregado explícito).';
        }
      }
      if (snap != null && Array.isArray(snap)) {
        insumos_operativos = snap;
      } else if (plantillaId) {
        insumos_operativos = await buildInsumosOperativosReporte(pool, id, plantillaId, tmMpResumen);
      } else {
        insumos_operativos = await buildInsumosOperativosReporte(pool, id, null, tmMpResumen);
      }
    } catch (eOp) {
      console.warn('Resumen lote: insumos operativos:', eOp?.message || eOp);
    }

    const despachosQ = await pool.query(
      `SELECT d.id, d.tipo_salida, d.estado, d.fecha_salida,
              COALESCE(
                CASE
                  WHEN d.movimiento_id IS NOT NULL
                    THEN (SELECT COALESCE(SUM(md.total_kg), 0)::numeric FROM movimiento_detalles md WHERE md.movimiento_id = d.movimiento_id)
                  ELSE (SELECT COALESCE(SUM(dd.total_kg), 0)::numeric FROM despacho_detalles dd WHERE dd.despacho_id = d.id)
                END,
                0
              )::numeric AS total_kg
       FROM despachos d
       WHERE LOWER(TRIM(COALESCE(d.estado, ''))) IN ('finalizado', 'despachado')
         AND (
           EXISTS (
             SELECT 1
             FROM movimiento_detalles md
             JOIN stock_posiciones sp ON sp.id = md.stock_posicion_id
             WHERE md.movimiento_id = d.movimiento_id
               AND TRIM(COALESCE(sp.lote, '')) = TRIM($1)
           )
           OR EXISTS (
             SELECT 1
             FROM despacho_detalles dd
             JOIN stock_posiciones sp ON sp.id = dd.stock_posicion_id
             WHERE dd.despacho_id = d.id
               AND TRIM(COALESCE(sp.lote, '')) = TRIM($1)
           )
         )
       ORDER BY d.fecha_salida DESC NULLS LAST, d.created_at DESC`,
      [lote.codigo]
    );
    const despachos = despachosQ.rows.map((r) => ({
      id: r.id,
      tipo_salida: r.tipo_salida,
      estado: r.estado,
      fecha_salida: r.fecha_salida,
      total_kg: Number(r.total_kg) || 0,
    }));
    const totalKgDespachado = Number(despachos.reduce((s, d) => s + (Number(d.total_kg) || 0), 0).toFixed(2));
    const stockLoteQ = await pool.query(
      `SELECT COALESCE(SUM(COALESCE(s.total_kg, 0) + COALESCE(s.peso_adicional, 0)), 0)::numeric AS total_kg
       FROM stock_posiciones s
       WHERE TRIM(COALESCE(s.lote, '')) = TRIM($1)`,
      [lote.codigo]
    );
    const totalKgRestante = Number(stockLoteQ.rows[0]?.total_kg) || 0;
    const despachos_resumen = {
      total_kg_ingresado_producto_terminado: Number(produccion_resumen.total_kg_empaque || 0),
      total_kg_despachado_exportado: totalKgDespachado,
      total_kg_restante_producto_terminado: Number(totalKgRestante.toFixed(2)),
      leyenda:
        totalKgRestante < 0
          ? 'Revisar: el restante calculado es negativo.'
          : 'Restante calculado según stock actual del lote.',
    };

    res.json({
      lote: {
        id: lote.id,
        codigo: lote.codigo,
        estado: lote.estado,
        fecha_creacion: lote.fecha_creacion,
        fecha_inicio: lote.fecha_inicio,
        fecha_terminado: lote.fecha_terminado,
        observaciones: lote.observaciones,
      },
      recepcion_mp: {
        vehiculos: vehiculosResult.rows || [],
        descargas: descargasResult.rows || [],
        winchas,
        resumen: {
          total_vehiculos: (vehiculosResult.rows || []).length,
          total_descargas: (descargasResult.rows || []).length,
          total_kg: totalKgWinchas,
          total_cajas: totalCajasWinchas,
        },
      },
      produccion_resumen,
      procesos_lote,
      produccion: [],
      insumos,
      insumos_resumen,
      insumos_operativos,
      despachos,
      despachos_resumen,
    });
  } catch (error) {
    console.error('Error obteniendo resumen del lote:', error);
    res.status(500).json({ message: 'Error al obtener resumen del lote' });
  }
});

// ========== PROVEEDORES MATERIA PRIMA ==========
router.get('/proveedores/list', async (req, res) => {
  try {
    const { limit = 100, offset = 0, q } = req.query;
    const limitNum = Math.min(parseInt(limit, 10) || 100, 500);
    const offsetNum = Math.max(0, parseInt(offset, 10) || 0);
    let where = 'WHERE 1=1';
    const params = [];
    let n = 1;
    if (q && q.trim()) {
      where += ` AND (razon_social ILIKE $${n} OR ruc ILIKE $${n})`;
      params.push(`%${q.trim()}%`);
      n++;
    }
    const countResult = await pool.query(
      `SELECT COUNT(*) AS total FROM proveedores_materia_prima ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.total, 10) || 0;
    const result = await pool.query(
      `SELECT id, razon_social, ruc, contacto, direccion, created_at FROM proveedores_materia_prima ${where}
       ORDER BY razon_social LIMIT $${n} OFFSET $${n + 1}`,
      [...params, limitNum, offsetNum]
    );
    res.json({ data: result.rows, total });
  } catch (error) {
    console.error('Error listando proveedores MP:', error);
    res.status(500).json({ message: 'Error al listar proveedores' });
  }
});

router.post('/proveedores', async (req, res) => {
  try {
    const { razon_social, ruc, contacto, direccion } = req.body;
    if (!razon_social || !razon_social.trim()) {
      return res.status(400).json({ message: 'La razón social es requerida' });
    }
    const result = await pool.query(
      `INSERT INTO proveedores_materia_prima (razon_social, ruc, contacto, direccion)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [razon_social.trim(), ruc?.trim() || null, contacto?.trim() || null, direccion?.trim() || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creando proveedor:', error);
    res.status(500).json({ message: 'Error al crear proveedor' });
  }
});

router.put('/proveedores/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { razon_social, ruc, contacto, direccion } = req.body;
    const result = await pool.query(
      `UPDATE proveedores_materia_prima SET
         razon_social = COALESCE($1, razon_social),
         ruc = $2,
         contacto = $3,
         direccion = $4,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $5 RETURNING *`,
      [razon_social?.trim(), ruc?.trim() ?? null, contacto?.trim() ?? null, direccion?.trim() ?? null, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Proveedor no encontrado' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error actualizando proveedor:', error);
    res.status(500).json({ message: 'Error al actualizar proveedor' });
  }
});

router.get('/proveedores/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const prov = await pool.query('SELECT * FROM proveedores_materia_prima WHERE id = $1', [id]);
    if (prov.rows.length === 0) return res.status(404).json({ message: 'Proveedor no encontrado' });
    const descargas = await pool.query(
      `SELECT d.id, d.numero_guia_interna, d.fecha_descarga, d.estado, d.placas_vehiculo, d.proveedor_razon_social,
              vl.numero_orden, lp.codigo AS lote_codigo
       FROM descargas_materia_prima d
       JOIN vehiculos_lote vl ON vl.id = d.vehiculo_lote_id
       JOIN lotes_produccion lp ON lp.id = vl.lote_produccion_id
       WHERE vl.proveedor_id = $1
       ORDER BY d.fecha_descarga DESC, d.created_at DESC
       LIMIT 200`,
      [id]
    );
    const data = { ...prov.rows[0], historial_descargas: descargas.rows };
    res.json(data);
  } catch (error) {
    console.error('Error obteniendo proveedor:', error);
    res.status(500).json({ message: 'Error al obtener proveedor' });
  }
});

// ========== VEHÍCULOS POR LOTE (solo lotes Iniciado o En proceso) ==========
router.get('/vehiculos/list', async (req, res) => {
  try {
    const { lote_produccion_id, limit = 100, offset = 0 } = req.query;
    const limitNum = Math.min(parseInt(limit, 10) || 100, 500);
    const offsetNum = Math.max(0, parseInt(offset, 10) || 0);
    let where = 'WHERE 1=1';
    const params = [];
    let n = 1;
    if (lote_produccion_id) {
      where += ` AND vl.lote_produccion_id = $${n}`;
      params.push(lote_produccion_id);
      n++;
    }
    const countResult = await pool.query(
      `SELECT COUNT(*) AS total FROM vehiculos_lote vl ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.total, 10) || 0;
    const result = await pool.query(
      `SELECT vl.id, vl.lote_produccion_id, vl.numero_orden, vl.proveedor_id, vl.proveedor_nombre, vl.placas,
              vl.cantidad_aproximada, vl.especie_id, vl.cliente_id, vl.origen, vl.created_at,
              lp.codigo AS lote_codigo, lp.estado AS lote_estado,
              e.nombre AS especie_nombre,
              c.nombre AS cliente_nombre,
              p.ruc AS proveedor_ruc,
              d_ultima.id AS descarga_id,
              d_ultima.estado AS descarga_estado
       FROM vehiculos_lote vl
       JOIN lotes_produccion lp ON lp.id = vl.lote_produccion_id
       LEFT JOIN especies e ON e.id = vl.especie_id
       LEFT JOIN clientes c ON c.id = vl.cliente_id
       LEFT JOIN proveedores_materia_prima p ON p.id = vl.proveedor_id
       LEFT JOIN LATERAL (
         SELECT id, estado FROM descargas_materia_prima
         WHERE vehiculo_lote_id = vl.id
         ORDER BY created_at DESC
         LIMIT 1
       ) d_ultima ON true
       ${where}
       ORDER BY vl.created_at DESC
       LIMIT $${n} OFFSET $${n + 1}`,
      [...params, limitNum, offsetNum]
    );
    res.json({ data: result.rows, total });
  } catch (error) {
    console.error('Error listando vehículos:', error);
    res.status(500).json({ message: 'Error al listar vehículos' });
  }
});

router.post('/vehiculos', async (req, res) => {
  try {
    const { lote_produccion_id, numero_orden, proveedor_id, proveedor_nombre, placas, cantidad_aproximada, especie_id, cliente_id, origen } = req.body;
    if (!lote_produccion_id || !numero_orden?.trim() || !placas?.trim()) {
      return res.status(400).json({ message: 'Lote, número de orden y placas son requeridos' });
    }
    const lote = await pool.query(
      'SELECT estado FROM lotes_produccion WHERE id = $1',
      [lote_produccion_id]
    );
    if (lote.rows.length === 0) return res.status(404).json({ message: 'Lote no encontrado' });
    const estado = lote.rows[0].estado;
    if (estado !== 'Iniciado' && estado !== 'En proceso') {
      return res.status(400).json({ message: 'Solo se pueden agregar vehículos a lotes en estado Iniciado o En proceso' });
    }
    const result = await pool.query(
      `INSERT INTO vehiculos_lote (lote_produccion_id, numero_orden, proveedor_id, proveedor_nombre, placas, cantidad_aproximada, especie_id, cliente_id, origen)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [
        lote_produccion_id,
        numero_orden.trim(),
        proveedor_id || null,
        proveedor_nombre?.trim() || null,
        placas.trim(),
        cantidad_aproximada != null ? Number(cantidad_aproximada) : null,
        especie_id || null,
        cliente_id || null,
        origen?.trim() || null
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creando vehículo:', error);
    res.status(500).json({ message: 'Error al crear vehículo' });
  }
});

router.put('/vehiculos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { numero_orden, proveedor_id, proveedor_nombre, placas, cantidad_aproximada, especie_id, cliente_id, origen } = req.body;
    const result = await pool.query(
      `UPDATE vehiculos_lote SET
         numero_orden = COALESCE($1, numero_orden),
         proveedor_id = $2,
         proveedor_nombre = $3,
         placas = COALESCE($4, placas),
         cantidad_aproximada = $5,
         especie_id = $6,
         cliente_id = $7,
         origen = $8,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $9 RETURNING *`,
      [
        numero_orden?.trim(),
        proveedor_id ?? null,
        proveedor_nombre?.trim() ?? null,
        placas?.trim(),
        cantidad_aproximada != null ? Number(cantidad_aproximada) : null,
        especie_id ?? null,
        cliente_id ?? null,
        origen?.trim() ?? null,
        id
      ]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Vehículo no encontrado' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error actualizando vehículo:', error);
    res.status(500).json({ message: 'Error al actualizar vehículo' });
  }
});

router.get('/vehiculos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT vl.*, lp.codigo AS lote_codigo, lp.estado AS lote_estado,
              e.nombre AS especie_nombre, c.nombre AS cliente_nombre,
              p.ruc AS proveedor_ruc
       FROM vehiculos_lote vl
       JOIN lotes_produccion lp ON lp.id = vl.lote_produccion_id
       LEFT JOIN especies e ON e.id = vl.especie_id
       LEFT JOIN clientes c ON c.id = vl.cliente_id
       LEFT JOIN proveedores_materia_prima p ON p.id = vl.proveedor_id
       WHERE vl.id = $1`,
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Vehículo no encontrado' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error obteniendo vehículo:', error);
    res.status(500).json({ message: 'Error al obtener vehículo' });
  }
});

// Eliminar vehículo (solo Admin, solo si no tiene descargas asociadas)
router.delete('/vehiculos/:id', checkPermission('ingresos_mp.vehiculos', 'operate'), async (req, res) => {
  try {
    const { id } = req.params;
    const vl = await pool.query('SELECT id FROM vehiculos_lote WHERE id = $1', [id]);
    if (vl.rows.length === 0) return res.status(404).json({ message: 'Vehículo no encontrado' });

    const desc = await pool.query('SELECT COUNT(*)::INT AS c FROM descargas_materia_prima WHERE vehiculo_lote_id = $1', [id]);
    if ((desc.rows[0]?.c || 0) > 0) {
      return res.status(400).json({ message: 'No se puede eliminar: el vehículo tiene descargas registradas.' });
    }

    await pool.query('DELETE FROM vehiculos_lote WHERE id = $1', [id]);
    return res.status(200).json({ message: 'Vehículo eliminado correctamente' });
  } catch (error) {
    console.error('Error eliminando vehículo:', error);
    res.status(500).json({ message: 'Error al eliminar vehículo' });
  }
});

// ========== DESCARGA MATERIA PRIMA (fase 1 + fase 2 winchas) ==========
router.get('/descargas/list', async (req, res) => {
  try {
    const { vehiculo_lote_id, estado, limit = 50, offset = 0 } = req.query;
    const limitNum = Math.min(parseInt(limit, 10) || 50, 500);
    const offsetNum = Math.max(0, parseInt(offset, 10) || 0);
    let where = 'WHERE 1=1';
    const params = [];
    let n = 1;
    if (vehiculo_lote_id) { where += ` AND d.vehiculo_lote_id = $${n}`; params.push(vehiculo_lote_id); n++; }
    if (estado) { where += ` AND d.estado = $${n}`; params.push(estado); n++; }
    const countResult = await pool.query(
      `SELECT COUNT(*) AS total FROM descargas_materia_prima d ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.total, 10) || 0;
    const result = await pool.query(
      `SELECT d.id, d.vehiculo_lote_id, d.numero_guia_interna, d.fecha_descarga::date AS fecha_descarga, d.estado,
              d.placas_vehiculo, d.proveedor_razon_social, d.ruc_proveedor, d.validated_at, d.validated_by,
              vl.numero_orden, vl.placas AS vehiculo_placas, lp.codigo AS lote_codigo,
              COALESCE(cli.nombre, '') AS cliente_nombre,
              COALESCE(esp.nombre, '') AS especie_nombre,
              COALESCE((SELECT SUM(w.peso_kg) FROM descarga_winchas w WHERE w.descarga_id = d.id), 0) AS total_descargado
       FROM descargas_materia_prima d
       JOIN vehiculos_lote vl ON vl.id = d.vehiculo_lote_id
       JOIN lotes_produccion lp ON lp.id = vl.lote_produccion_id
       LEFT JOIN clientes cli ON cli.id = d.cliente_id
       LEFT JOIN especies esp ON esp.id = d.especie_id
       ${where}
       ORDER BY d.fecha_descarga DESC, d.created_at DESC
       LIMIT $${n} OFFSET $${n + 1}`,
      [...params, limitNum, offsetNum]
    );
    res.json({ data: result.rows, total });
  } catch (error) {
    console.error('Error listando descargas:', error);
    res.status(500).json({ message: 'Error al listar descargas' });
  }
});

router.post('/descargas', async (req, res) => {
  try {
    const {
      vehiculo_lote_id,
      numero_guia_interna,
      fecha_descarga,
      especie_id,
      cliente_id,
      ruc_proveedor,
      proveedor_razon_social,
      desembarcadero,
      origen,
      placas_vehiculo,
      ruc_transportista,
      datos_chofer
    } = req.body;
    if (!vehiculo_lote_id || !fecha_descarga) {
      return res.status(400).json({ message: 'Vehículo y fecha de descarga son requeridos' });
    }
    const result = await pool.query(
      `INSERT INTO descargas_materia_prima (
         vehiculo_lote_id, numero_guia_interna, fecha_descarga, especie_id, cliente_id,
         ruc_proveedor, proveedor_razon_social, desembarcadero, origen,
         placas_vehiculo, ruc_transportista, datos_chofer, estado
       ) VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'Descargando')
       RETURNING *`,
      [
        vehiculo_lote_id,
        numero_guia_interna?.trim() || null,
        fecha_descarga,
        especie_id || null,
        cliente_id || null,
        ruc_proveedor?.trim() || null,
        proveedor_razon_social?.trim() || null,
        desembarcadero?.trim() || null,
        origen?.trim() || null,
        placas_vehiculo?.trim() || null,
        ruc_transportista?.trim() || null,
        datos_chofer?.trim() || null
      ]
    );
    const lote = await pool.query(
      'SELECT lote_produccion_id FROM vehiculos_lote WHERE id = $1',
      [vehiculo_lote_id]
    );
    if (lote.rows.length > 0) {
      await pool.query(
        `UPDATE lotes_produccion SET estado = 'En proceso', fecha_inicio = COALESCE(fecha_inicio, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND estado IN ('Registrado', 'Iniciado')`,
        [lote.rows[0].lote_produccion_id]
      );
    }
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creando descarga:', error);
    res.status(500).json({ message: 'Error al crear descarga' });
  }
});

router.put('/descargas/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body;
    const fields = [
      'numero_guia_interna', 'fecha_descarga', 'especie_id', 'cliente_id',
      'ruc_proveedor', 'proveedor_razon_social', 'desembarcadero', 'origen', 'placas_vehiculo',
      'ruc_transportista', 'datos_chofer', 'estado'
    ];
    const updates = [];
    const values = [];
    let n = 1;
    for (const f of fields) {
      if (body[f] === undefined) continue;
      if (f === 'fecha_descarga') {
        updates.push(`${f} = $${n}::date`);
        values.push(body[f]);
      } else if (f === 'especie_id' || f === 'cliente_id') {
        updates.push(`${f} = $${n}`);
        values.push(body[f] || null);
      } else {
        updates.push(`${f} = $${n}`);
        values.push(typeof body[f] === 'string' ? body[f].trim() : body[f]);
      }
      n++;
    }
    if (updates.length === 0) {
      const row = await pool.query('SELECT * FROM descargas_materia_prima WHERE id = $1', [id]);
      if (row.rows.length === 0) return res.status(404).json({ message: 'Descarga no encontrada' });
      return res.json(row.rows[0]);
    }
    values.push(id);
    const result = await pool.query(
      `UPDATE descargas_materia_prima SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${n} RETURNING *`,
      values
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Descarga no encontrada' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error actualizando descarga:', error);
    res.status(500).json({ message: 'Error al actualizar descarga' });
  }
});

router.get('/descargas/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const desc = await pool.query(
      `SELECT d.*, vl.numero_orden, vl.placas AS vehiculo_placas, vl.lote_produccion_id,
              lp.codigo AS lote_codigo,
              cli.nombre AS cliente_nombre, esp.nombre AS especie_nombre,
              COALESCE(esp.tipo_descarga, 'normal') AS especie_tipo_descarga
       FROM descargas_materia_prima d
       JOIN vehiculos_lote vl ON vl.id = d.vehiculo_lote_id
       JOIN lotes_produccion lp ON lp.id = vl.lote_produccion_id
       LEFT JOIN clientes cli ON cli.id = d.cliente_id
       LEFT JOIN especies esp ON esp.id = d.especie_id
       WHERE d.id = $1`,
      [id]
    );
    if (desc.rows.length === 0) return res.status(404).json({ message: 'Descarga no encontrada' });
    const row = desc.rows[0];
    const especieId = row.especie_id;
    let especieClasificaciones = [];
    if (especieId) {
      const clasif = await pool.query(
        'SELECT id, especie_id, codigo, nombre, orden FROM especie_clasificaciones WHERE especie_id = $1 ORDER BY orden, codigo',
        [especieId]
      );
      especieClasificaciones = clasif.rows || [];
    }
    const winchasResult = await pool.query(
      'SELECT * FROM descarga_winchas WHERE descarga_id = $1 ORDER BY created_at',
      [id]
    );
    const winchas = winchasResult.rows || [];
    const winchaIds = winchas.map((w) => w.id);
    let pesosByWincha = {};
    if (winchaIds.length > 0) {
      const pesos = await pool.query(
        `SELECT wpc.wincha_id, wpc.clasificacion_id, wpc.peso_kg, ec.codigo AS clasificacion_codigo, ec.nombre AS clasificacion_nombre
         FROM descarga_wincha_pesos_clasificacion wpc
         JOIN especie_clasificaciones ec ON ec.id = wpc.clasificacion_id
         WHERE wpc.wincha_id = ANY($1::uuid[])`,
        [winchaIds]
      );
      for (const p of pesos.rows || []) {
        if (!pesosByWincha[p.wincha_id]) pesosByWincha[p.wincha_id] = [];
        pesosByWincha[p.wincha_id].push({
          clasificacion_id: p.clasificacion_id,
          clasificacion_codigo: p.clasificacion_codigo,
          clasificacion_nombre: p.clasificacion_nombre,
          peso_kg: p.peso_kg,
        });
      }
    }
    const winchasConPesos = winchas.map((w) => ({
      ...w,
      pesos_clasificacion: pesosByWincha[w.id] || [],
    }));
    res.json({
      ...row,
      especie_clasificaciones: especieClasificaciones,
      winchas: winchasConPesos,
    });
  } catch (error) {
    console.error('Error obteniendo descarga:', error);
    res.status(500).json({ message: 'Error al obtener descarga' });
  }
});

router.delete('/descargas/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM descargas_materia_prima WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Descarga no encontrada' });
    res.json({ message: 'Descarga eliminada' });
  } catch (error) {
    console.error('Error eliminando descarga:', error);
    if (error.code === '23503') return res.status(400).json({ message: 'No se puede eliminar: tiene datos asociados' });
    res.status(500).json({ message: 'Error al eliminar descarga' });
  }
});

// Winchas (fase 2)
router.post('/descargas/:id/winchas', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      numero_wincha,
      numero_guia_remitente,
      hora_inicio,
      hora_final,
      matricula_embarcacion,
      nombre_embarcacion,
      peso_kg,
      peso_por_caja,
      cajas,
      pesos_clasificacion,
    } = req.body;
    const desc = await pool.query('SELECT id FROM descargas_materia_prima WHERE id = $1', [id]);
    if (desc.rows.length === 0) return res.status(404).json({ message: 'Descarga no encontrada' });
    const result = await pool.query(
      `INSERT INTO descarga_winchas (descarga_id, numero_wincha, numero_guia_remitente, hora_inicio, hora_final, matricula_embarcacion, nombre_embarcacion, peso_kg, peso_por_caja, cajas)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [
        id,
        numero_wincha?.trim() || null,
        numero_guia_remitente?.trim() || null,
        hora_inicio || null,
        hora_final || null,
        matricula_embarcacion?.trim() || null,
        nombre_embarcacion?.trim() || null,
        peso_kg != null ? Number(peso_kg) : null,
        peso_por_caja != null ? Number(peso_por_caja) : null,
        cajas != null ? parseInt(cajas, 10) : null
      ]
    );
    const wincha = result.rows[0];
    const winchaId = wincha.id;
    if (Array.isArray(pesos_clasificacion) && pesos_clasificacion.length > 0) {
      for (const pc of pesos_clasificacion) {
        const clasifId = pc.clasificacion_id;
        const peso = pc.peso_kg != null ? Number(pc.peso_kg) : 0;
        if (clasifId && peso >= 0) {
          await pool.query(
            `INSERT INTO descarga_wincha_pesos_clasificacion (wincha_id, clasificacion_id, peso_kg) VALUES ($1, $2, $3)
             ON CONFLICT (wincha_id, clasificacion_id) DO UPDATE SET peso_kg = $3`,
            [winchaId, clasifId, peso]
          );
        }
      }
    }
    const pesosResp = await pool.query(
      `SELECT wpc.clasificacion_id, wpc.peso_kg, ec.codigo AS clasificacion_codigo, ec.nombre AS clasificacion_nombre
       FROM descarga_wincha_pesos_clasificacion wpc JOIN especie_clasificaciones ec ON ec.id = wpc.clasificacion_id WHERE wpc.wincha_id = $1`,
      [winchaId]
    );
    res.status(201).json({ ...wincha, pesos_clasificacion: pesosResp.rows || [] });
  } catch (error) {
    console.error('Error creando wincha:', error);
    res.status(500).json({ message: 'Error al crear wincha' });
  }
});

router.put('/winchas/:winchaId', async (req, res) => {
  try {
    const { winchaId } = req.params;
    const {
      numero_wincha,
      numero_guia_remitente,
      hora_inicio,
      hora_final,
      matricula_embarcacion,
      nombre_embarcacion,
      peso_kg,
      peso_por_caja,
      cajas,
      pesos_clasificacion,
    } = req.body;
    const result = await pool.query(
      `UPDATE descarga_winchas SET
         numero_wincha = $1,
         numero_guia_remitente = $2,
         hora_inicio = $3,
         hora_final = $4,
         matricula_embarcacion = $5,
         nombre_embarcacion = $6,
         peso_kg = $7,
         peso_por_caja = $8,
         cajas = $9,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $10 RETURNING *`,
      [
        numero_wincha?.trim() ?? null,
        numero_guia_remitente?.trim() ?? null,
        hora_inicio || null,
        hora_final || null,
        matricula_embarcacion?.trim() ?? null,
        nombre_embarcacion?.trim() ?? null,
        peso_kg != null ? Number(peso_kg) : null,
        peso_por_caja != null ? Number(peso_por_caja) : null,
        cajas != null ? parseInt(cajas, 10) : null,
        winchaId
      ]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Wincha no encontrada' });
    await pool.query('DELETE FROM descarga_wincha_pesos_clasificacion WHERE wincha_id = $1', [winchaId]);
    if (Array.isArray(pesos_clasificacion) && pesos_clasificacion.length > 0) {
      for (const pc of pesos_clasificacion) {
        const clasifId = pc.clasificacion_id;
        const peso = pc.peso_kg != null ? Number(pc.peso_kg) : 0;
        if (clasifId && peso >= 0) {
          await pool.query(
            'INSERT INTO descarga_wincha_pesos_clasificacion (wincha_id, clasificacion_id, peso_kg) VALUES ($1, $2, $3)',
            [winchaId, clasifId, peso]
          );
        }
      }
    }
    const pesosResp = await pool.query(
      `SELECT wpc.clasificacion_id, wpc.peso_kg, ec.codigo AS clasificacion_codigo, ec.nombre AS clasificacion_nombre
       FROM descarga_wincha_pesos_clasificacion wpc JOIN especie_clasificaciones ec ON ec.id = wpc.clasificacion_id WHERE wpc.wincha_id = $1`,
      [winchaId]
    );
    res.json({ ...result.rows[0], pesos_clasificacion: pesosResp.rows || [] });
  } catch (error) {
    console.error('Error actualizando wincha:', error);
    res.status(500).json({ message: 'Error al actualizar wincha' });
  }
});

router.delete('/winchas/:winchaId', async (req, res) => {
  try {
    const { winchaId } = req.params;
    const result = await pool.query('DELETE FROM descarga_winchas WHERE id = $1 RETURNING id', [winchaId]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Wincha no encontrada' });
    res.json({ message: 'Wincha eliminada' });
  } catch (error) {
    console.error('Error eliminando wincha:', error);
    res.status(500).json({ message: 'Error al eliminar wincha' });
  }
});

// ========== EMBARCACIONES (registro por matrícula para autocompletar nombre) ==========
router.get('/embarcaciones/list', async (req, res) => {
  try {
    const { q, limit = 100 } = req.query;
    const limitNum = Math.min(parseInt(limit, 10) || 100, 500);
    let where = '';
    const params = [];
    if (q && q.trim()) {
      where = 'WHERE matricula ILIKE $1 OR nombre ILIKE $1';
      params.push(`%${q.trim()}%`);
    }
    const result = await pool.query(
      `SELECT id, matricula, nombre, created_at FROM embarcaciones ${where} ORDER BY matricula LIMIT $${params.length + 1}`,
      [...params, limitNum]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error listando embarcaciones:', error);
    res.status(500).json({ message: 'Error al listar embarcaciones' });
  }
});

router.get('/embarcaciones/por-matricula/:matricula', async (req, res) => {
  try {
    const { matricula } = req.params;
    const result = await pool.query(
      'SELECT id, matricula, nombre FROM embarcaciones WHERE TRIM(LOWER(matricula)) = TRIM(LOWER($1))',
      [matricula]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Embarcación no encontrada' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error buscando embarcación:', error);
    res.status(500).json({ message: 'Error al buscar embarcación' });
  }
});

router.post('/embarcaciones', async (req, res) => {
  try {
    const { matricula, nombre } = req.body;
    if (!matricula || !String(matricula).trim()) {
      return res.status(400).json({ message: 'Matrícula es requerida' });
    }
    const mat = String(matricula).trim();
    const nom = nombre != null ? String(nombre).trim() : null;
    const existing = await pool.query('SELECT id, matricula, nombre FROM embarcaciones WHERE TRIM(LOWER(matricula)) = TRIM(LOWER($1))', [mat]);
    if (existing.rows.length > 0) {
      if (nom !== null) {
        await pool.query('UPDATE embarcaciones SET nombre = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [nom || existing.rows[0].nombre, existing.rows[0].id]);
        const updated = await pool.query('SELECT id, matricula, nombre FROM embarcaciones WHERE id = $1', [existing.rows[0].id]);
        return res.json(updated.rows[0]);
      }
      return res.json(existing.rows[0]);
    }
    const result = await pool.query(
      'INSERT INTO embarcaciones (matricula, nombre) VALUES ($1, $2) RETURNING id, matricula, nombre, created_at',
      [mat, nom]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error registrando embarcación:', error);
    if (error.code === '23505') return res.status(400).json({ message: 'Ya existe una embarcación con esa matrícula' });
    res.status(500).json({ message: 'Error al registrar embarcación' });
  }
});

// ========== VALIDACIÓN DE DESCARGAS ==========
// Listar descargas para validación (incluye lote para agrupar en front)
router.get('/validacion/descargas', async (req, res) => {
  try {
    const { limit = 200, offset = 0 } = req.query;
    const limitNum = Math.min(parseInt(limit, 10) || 200, 500);
    const offsetNum = Math.max(0, parseInt(offset, 10) || 0);
    const countResult = await pool.query('SELECT COUNT(*) AS total FROM descargas_materia_prima d');
    const total = parseInt(countResult.rows[0]?.total, 10) || 0;
    const result = await pool.query(
      `SELECT d.id, d.vehiculo_lote_id, d.numero_guia_interna, d.fecha_descarga::date AS fecha_descarga, d.estado,
              d.placas_vehiculo, d.proveedor_razon_social, d.ruc_proveedor, d.desembarcadero, d.ruc_transportista,
              d.validated_at, d.validated_by,
              vl.numero_orden, lp.id AS lote_id, lp.codigo AS lote_codigo, lp.fecha_creacion AS lote_fecha,
              COALESCE(cli.nombre, '') AS cliente_nombre, COALESCE(esp.nombre, '') AS especie_nombre
       FROM descargas_materia_prima d
       JOIN vehiculos_lote vl ON vl.id = d.vehiculo_lote_id
       JOIN lotes_produccion lp ON lp.id = vl.lote_produccion_id
       LEFT JOIN clientes cli ON cli.id = d.cliente_id
       LEFT JOIN especies esp ON esp.id = d.especie_id
       ORDER BY lp.fecha_creacion DESC, d.fecha_descarga DESC, d.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limitNum, offsetNum]
    );
    res.json({ data: result.rows, total });
  } catch (error) {
    console.error('Error listando descargas para validación:', error);
    res.status(500).json({ message: 'Error al listar descargas' });
  }
});

// Documentos de validación de una descarga
router.get('/descargas/:id/documentos-validacion', async (req, res) => {
  try {
    const { id } = req.params;
    const check = await pool.query('SELECT id FROM descargas_materia_prima WHERE id = $1', [id]);
    if (check.rows.length === 0) return res.status(404).json({ message: 'Descarga no encontrada' });
    const result = await pool.query(
      `SELECT id, descarga_id, wincha_id, tipo, nombre_archivo, content_type, created_at
       FROM descarga_validacion_documentos WHERE descarga_id = $1 ORDER BY tipo, created_at`,
      [id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error listando documentos validación:', error);
    res.status(500).json({ message: 'Error al listar documentos' });
  }
});

router.get('/documentos-validacion/:docId', async (req, res) => {
  try {
    const { docId } = req.params;
    const result = await pool.query(
      'SELECT id, nombre_archivo, content_type, contenido_base64 FROM descarga_validacion_documentos WHERE id = $1',
      [docId]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Documento no encontrado' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error obteniendo documento validación:', error);
    res.status(500).json({ message: 'Error al obtener documento' });
  }
});

// Subir documento de validación (base64 en body)
router.post('/descargas/:id/documentos-validacion', async (req, res) => {
  try {
    const { id } = req.params;
    const { tipo, wincha_id, nombre_archivo, content_type, contenido_base64 } = req.body;
    const tipos = ['guia_interna', 'vehiculo', 'desembarcadero', 'transportista', 'wincha', 'guia_remitente', 'embarcacion', 'otros'];
    if (!tipo || !tipos.includes(tipo)) {
      return res.status(400).json({ message: 'Tipo de documento inválido' });
    }
    if (!nombre_archivo || !nombre_archivo.trim()) {
      return res.status(400).json({ message: 'Nombre de archivo requerido' });
    }
    const check = await pool.query('SELECT id FROM descargas_materia_prima WHERE id = $1', [id]);
    if (check.rows.length === 0) return res.status(404).json({ message: 'Descarga no encontrada' });
    const result = await pool.query(
      `INSERT INTO descarga_validacion_documentos (descarga_id, wincha_id, tipo, nombre_archivo, content_type, contenido_base64)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, descarga_id, wincha_id, tipo, nombre_archivo, content_type, created_at`,
      [id, wincha_id || null, tipo, nombre_archivo.trim(), content_type || null, contenido_base64 || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error subiendo documento validación:', error);
    res.status(500).json({ message: 'Error al subir documento' });
  }
});

// Eliminar documento de validación
router.delete('/documentos-validacion/:docId', async (req, res) => {
  try {
    const { docId } = req.params;
    const result = await pool.query('DELETE FROM descarga_validacion_documentos WHERE id = $1 RETURNING id', [docId]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Documento no encontrado' });
    res.json({ message: 'Documento eliminado' });
  } catch (error) {
    console.error('Error eliminando documento validación:', error);
    res.status(500).json({ message: 'Error al eliminar documento' });
  }
});

// Marcar descarga como validada
router.post('/descargas/:id/validar', async (req, res) => {
  try {
    const { id } = req.params;
    const validatedBy = req.user?.nombre || req.user?.email || 'Usuario';
    const check = await pool.query('SELECT id FROM descargas_materia_prima WHERE id = $1', [id]);
    if (check.rows.length === 0) return res.status(404).json({ message: 'Descarga no encontrada' });
    await pool.query(
      `UPDATE descargas_materia_prima SET validated_at = CURRENT_TIMESTAMP, validated_by = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [validatedBy, id]
    );
    const updated = await pool.query('SELECT id, validated_at, validated_by FROM descargas_materia_prima WHERE id = $1', [id]);
    res.json(updated.rows[0]);
  } catch (error) {
    console.error('Error validando descarga:', error);
    res.status(500).json({ message: 'Error al validar descarga' });
  }
});

// Reabrir validación (quitar validación) - solo uso por administrador en frontend
router.patch('/descargas/:id/reabrir-validacion', async (req, res) => {
  try {
    const { id } = req.params;
    const check = await pool.query('SELECT id FROM descargas_materia_prima WHERE id = $1', [id]);
    if (check.rows.length === 0) return res.status(404).json({ message: 'Descarga no encontrada' });
    await pool.query(
      `UPDATE descargas_materia_prima SET validated_at = NULL, validated_by = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [id]
    );
    const updated = await pool.query('SELECT id, validated_at, validated_by FROM descargas_materia_prima WHERE id = $1', [id]);
    res.json(updated.rows[0]);
  } catch (error) {
    console.error('Error reabriendo validación:', error);
    res.status(500).json({ message: 'Error al reabrir validación' });
  }
});

export default router;
