import express from 'express';
import { pool } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import {
  resolvePlantillaIdForLote,
  buildResultadosProduccionForLote,
  filtrarResultadosConKgProducido,
} from '../utils/loteResultadosProduccion.js';
import {
  buildConciliacionPlantillaProceso,
  insumosParteProduccionDesdeSeleccion,
} from '../utils/conciliacionEmpaqueLote.js';
import { buildInsumosOperativosReporte } from '../utils/insumosOperativosLote.js';

const router = express.Router();
router.use(authenticateToken);

/**
 * GET /api/reportes-produccion/reporte-lote?lote_id=xxx
 * Reporte de producción del lote: recepción MP, resultados producción (envasado/congelado/empaque), stock en almacén, rendimiento.
 */
router.get('/reporte-lote', async (req, res) => {
  try {
    const { lote_id } = req.query;
    if (!lote_id) return res.status(400).json({ message: 'lote_id es requerido' });

    const loteRow = await pool.query(
      `SELECT lp.id, lp.codigo, lp.estado, lp.fecha_creacion, lp.fecha_inicio, lp.fecha_terminado, lp.observaciones,
              c.nombre AS cliente_nombre, e.nombre AS especie_nombre
       FROM lotes_produccion lp
       LEFT JOIN LATERAL (SELECT cliente_id, especie_id FROM vehiculos_lote WHERE lote_produccion_id = lp.id LIMIT 1) vl ON true
       LEFT JOIN clientes c ON c.id = vl.cliente_id
       LEFT JOIN especies e ON e.id = vl.especie_id
       WHERE lp.id = $1`,
      [lote_id]
    );
    if (loteRow.rows.length === 0) return res.status(404).json({ message: 'Lote no encontrado' });
    const lote = loteRow.rows[0];
    const codigoLote = lote.codigo;

    const descargasResult = await pool.query(
      `SELECT d.id, d.numero_guia_interna, d.fecha_descarga, d.estado, d.placas_vehiculo, d.proveedor_razon_social,
              d.desembarcadero, d.origen,
              (SELECT COALESCE(SUM(w.peso_kg), 0) FROM descarga_winchas w WHERE w.descarga_id = d.id) AS total_kg
       FROM descargas_materia_prima d
       JOIN vehiculos_lote vl ON vl.id = d.vehiculo_lote_id
       WHERE vl.lote_produccion_id = $1 ORDER BY d.fecha_descarga, d.created_at`,
      [lote_id]
    );
    const winchasResult = await pool.query(
      `SELECT w.id, w.descarga_id, w.numero_wincha, w.numero_guia_remitente, w.hora_inicio, w.hora_final,
              w.matricula_embarcacion, w.nombre_embarcacion, w.peso_kg, w.cajas,
              d.numero_guia_interna, d.proveedor_razon_social, d.desembarcadero, d.origen, d.placas_vehiculo
       FROM descarga_winchas w
       JOIN descargas_materia_prima d ON d.id = w.descarga_id
       JOIN vehiculos_lote vl ON vl.id = d.vehiculo_lote_id
       WHERE vl.lote_produccion_id = $1 ORDER BY d.fecha_descarga, w.created_at`,
      [lote_id]
    );

    const total_kg_mp = (winchasResult.rows || []).reduce((s, w) => s + (Number(w.peso_kg) || 0), 0);
    const total_cajas_mp = (winchasResult.rows || []).reduce((s, w) => s + (Number(w.cajas) || 0), 0);
    const winchas = (winchasResult.rows || []).map((w) => ({
      n_guia: w.numero_guia_interna || '',
      proveedor: w.proveedor_razon_social || '',
      muelle: w.desembarcadero || '',
      origen_mp: w.origen || '',
      placa_vehiculo: w.placas_vehiculo || '',
      n_wincha: w.numero_wincha || '',
      h_inicio: w.hora_inicio || '',
      h_final: w.hora_final || '',
      matricula_ep: w.matricula_embarcacion || '',
      nombre_ep: w.nombre_embarcacion || '',
      cantidad_kg_wincha: Number(w.peso_kg) || 0,
      descuento_pct: 0,
      cantidad_con_desc: Number(w.peso_kg) || 0,
    }));
    const recepcion_mp = {
      descargas: descargasResult.rows || [],
      winchas,
      resumen: {
        total_descargas: (descargasResult.rows || []).length,
        total_kg: Number(total_kg_mp.toFixed(2)),
        total_cajas: total_cajas_mp,
      },
    };

    const plantilla_id = await resolvePlantillaIdForLote(pool, lote_id);

    let resultados_produccion = [];
    let stock_almacen = { total_bultos: 0, total_kg: 0 };
    let rendimiento_pct = null;

    if (plantilla_id) {
      const rawResultados = await buildResultadosProduccionForLote(pool, lote_id, plantilla_id);
      resultados_produccion = filtrarResultadosConKgProducido(rawResultados);

      const stockRows = await pool.query(
        `SELECT COALESCE(SUM(s.cantidad_bultos), 0)::NUMERIC AS total_bultos, COALESCE(SUM(s.total_kg), 0)::NUMERIC AS total_kg
         FROM stock_posiciones s WHERE TRIM(COALESCE(s.lote, '')) = TRIM($1)`,
        [codigoLote]
      );
      if (stockRows.rows[0]) {
        stock_almacen.total_bultos = Number(stockRows.rows[0].total_bultos) || 0;
        stock_almacen.total_kg = Number(stockRows.rows[0].total_kg) || 0;
      }

      const total_kg_producido = resultados_produccion.reduce((s, p) => s + (p.empaque_kg || 0), 0);
      if (total_kg_mp > 0) rendimiento_pct = Number(((total_kg_producido / total_kg_mp) * 100).toFixed(2));
    }

    const cantidadTmMp = total_kg_mp > 0 ? total_kg_mp / 1000 : 0;
    let insumos = [];
    let empaqueSnapOperativos = null;
    try {
      await pool.query(`ALTER TABLE empaque ADD COLUMN IF NOT EXISTS seleccion_reporte JSONB`);
      await pool.query(`ALTER TABLE empaque ADD COLUMN IF NOT EXISTS insumos_operativos_snapshot JSONB`);
    } catch (_) {
      /* tabla empaque puede no existir en instalaciones mínimas */
    }
    try {
      const empaqueMeta = await pool.query(
        `SELECT plantilla_id, seleccion_reporte, insumos_operativos_snapshot FROM empaque WHERE lote_id = $1 LIMIT 1`,
        [lote_id]
      );
      const emRow = empaqueMeta.rows[0];
      empaqueSnapOperativos = emRow?.insumos_operativos_snapshot ?? null;
      const sel = emRow?.seleccion_reporte;
      const hasSel =
        sel &&
        ((Array.isArray(sel.calculado) && sel.calculado.length > 0) ||
          (Array.isArray(sel.real) && sel.real.length > 0));
      if (emRow?.plantilla_id && hasSel) {
        const client = await pool.connect();
        try {
          const { data } = await buildConciliacionPlantillaProceso(client, lote_id, emRow.plantilla_id);
          insumos = insumosParteProduccionDesdeSeleccion(data, sel, cantidadTmMp);
        } finally {
          client.release();
        }
      }
    } catch (insErr) {
      console.warn('Reporte lote: insumos (conciliación / selección):', insErr?.message || insErr);
    }

    let insumos_operativos = [];
    try {
      if (empaqueSnapOperativos != null && Array.isArray(empaqueSnapOperativos)) {
        insumos_operativos = empaqueSnapOperativos;
      } else {
        insumos_operativos = await buildInsumosOperativosReporte(pool, lote_id, plantilla_id || null, cantidadTmMp);
      }
    } catch (eOp) {
      console.warn('Reporte lote: insumos operativos:', eOp?.message || eOp);
    }

    res.json({
      lote: {
        id: lote.id,
        codigo: lote.codigo,
        estado: lote.estado,
        fecha_creacion: lote.fecha_creacion,
        fecha_inicio: lote.fecha_inicio,
        fecha_terminado: lote.fecha_terminado,
        observaciones: lote.observaciones || '',
        cliente_nombre: lote.cliente_nombre,
        especie_nombre: lote.especie_nombre,
      },
      recepcion_mp,
      resultados_produccion,
      stock_almacen: { total_bultos: stock_almacen.total_bultos, total_kg: Number(stock_almacen.total_kg.toFixed(2)) },
      rendimiento_pct,
      insumos,
      insumos_operativos,
    });
  } catch (error) {
    console.error('Error reporte producción:', error);
    res.status(500).json({ message: 'Error al generar reporte de producción' });
  }
});

/**
 * GET /api/reportes-produccion/lotes
 * Lista lotes para selector en reportes (con fecha y estado).
 */
router.get('/lotes', async (req, res) => {
  try {
    const { limit = 100 } = req.query;
    const result = await pool.query(
      `SELECT lp.id, lp.codigo, lp.estado, lp.fecha_creacion, lp.fecha_inicio, lp.fecha_terminado,
              c.nombre AS cliente_nombre, e.nombre AS especie_nombre
       FROM lotes_produccion lp
       LEFT JOIN LATERAL (SELECT cliente_id, especie_id FROM vehiculos_lote WHERE lote_produccion_id = lp.id LIMIT 1) vl ON true
       LEFT JOIN clientes c ON c.id = vl.cliente_id
       LEFT JOIN especies e ON e.id = vl.especie_id
       ORDER BY lp.fecha_creacion DESC NULLS LAST, lp.codigo
       LIMIT $1`,
      [Math.min(parseInt(limit, 10) || 100, 500)]
    );
    res.json({ data: result.rows });
  } catch (error) {
    console.error('Error listando lotes reportes:', error);
    res.status(500).json({ message: 'Error al listar lotes' });
  }
});

export default router;
