/**
 * Resultados de producción por lote (plantilla + envasado / congelado / empaque).
 * Usado por reportes-producción y resumen de lote (ingresos-mp).
 */

import { parsePlantillaSnapshot } from './plantillaProcesoSnapshot.js';

const LB_A_KG = 2.2046;

export const bultosToKg = (bultos, formato, unidadMedida) => {
  const b = Number(bultos) || 0;
  const f = Number(formato) || 0;
  const um = (unidadMedida || 'KG').toUpperCase();
  if (f <= 0) return 0;
  if (um === 'LB') return (b * f) / LB_A_KG;
  return b * f;
};

const pesoBandeja = (f) => {
  const x = Number(f);
  if (x === 20) return 10;
  if (x === 15) return 7.5;
  return x > 0 ? x / 2 : 0;
};

/**
 * @returns {Promise<string|null>} plantilla_id UUID o null
 */
export async function resolvePlantillaIdForLote(pool, lote_id) {
  const vlRow = await pool.query(
    'SELECT cliente_id, especie_id FROM vehiculos_lote WHERE lote_produccion_id = $1 LIMIT 1',
    [lote_id]
  );
  let plantilla_id = null;
  if (vlRow.rows[0]?.cliente_id && vlRow.rows[0]?.especie_id) {
    const pp = await pool.query(
      'SELECT id FROM plantillas_proceso WHERE cliente_id = $1 AND especie_id = $2 AND es_predeterminada = TRUE LIMIT 1',
      [vlRow.rows[0].cliente_id, vlRow.rows[0].especie_id]
    );
    plantilla_id = pp.rows[0]?.id || null;
  }
  if (!plantilla_id) {
    const empaqueRow = await pool.query('SELECT plantilla_id FROM empaque WHERE lote_id = $1 LIMIT 1', [lote_id]);
    plantilla_id = empaqueRow.rows[0]?.plantilla_id || null;
  }
  return plantilla_id;
}

/**
 * Misma estructura que `resultados_produccion` en GET /reporte-lote.
 * @param {string|null} [plantillaIdOpt] - Si se pasa, no se vuelve a resolver la plantilla.
 * @returns {Promise<Array<Object>>}
 */
export async function buildResultadosProduccionForLote(pool, lote_id, plantillaIdOpt = null) {
  const plantilla_id = plantillaIdOpt || (await resolvePlantillaIdForLote(pool, lote_id));
  if (!plantilla_id) return [];

  const empaque = await pool.query(
    'SELECT id, plantilla_snapshot FROM empaque WHERE lote_id = $1 LIMIT 1',
    [lote_id]
  );
  const snap = parsePlantillaSnapshot(empaque.rows[0]?.plantilla_snapshot);

  let filasProducto = [];
  if (snap?.productos?.length) {
    const ids = snap.productos.map((x) => x.producto_id).filter(Boolean);
    if (ids.length > 0) {
      const meta = await pool.query(
        `SELECT p.id AS producto_id, p.codigo, p.producto, p.descripcion, p.presentacion, p.formato, p.unidad_medida
         FROM productos p WHERE p.id = ANY($1::uuid[])`,
        [ids]
      );
      const byId = new Map(meta.rows.map((r) => [String(r.producto_id), r]));
      for (const pid of ids) {
        const row = byId.get(String(pid));
        if (row) filasProducto.push(row);
      }
    }
  }
  if (filasProducto.length === 0) {
    const productosPlantilla = await pool.query(
      `SELECT pp.producto_id, p.codigo, p.producto, p.descripcion, p.presentacion, p.formato, p.unidad_medida
       FROM plantillas_proceso_productos pp
       JOIN productos p ON p.id = pp.producto_id
       WHERE pp.plantilla_id = $1 ORDER BY pp.orden, p.codigo`,
      [plantilla_id]
    );
    filasProducto = productosPlantilla.rows;
  }

  const envasado = await pool.query('SELECT id FROM envasado WHERE lote_id = $1 LIMIT 1', [lote_id]);
  const congelado = await pool.query('SELECT id FROM congelado WHERE lote_id = $1 LIMIT 1', [lote_id]);

  const resultados_produccion = [];
  let ordenIdx = 0;
  for (const row of filasProducto) {
    let env_bandejas = 0;
    let con_bandejas = 0;
    let emp_bultos = 0;
    if (envasado.rows[0]?.id) {
      const ed = await pool.query(
        'SELECT datos_horas FROM envasado_detalle WHERE envasado_id = $1 AND producto_id = $2',
        [envasado.rows[0].id, row.producto_id]
      );
      if (ed.rows[0]) {
        const o = typeof ed.rows[0].datos_horas === 'string' ? JSON.parse(ed.rows[0].datos_horas || '{}') : ed.rows[0].datos_horas || {};
        env_bandejas = Object.values(o).reduce((s, v) => s + (Number(v) || 0), 0);
      }
    }
    if (congelado.rows[0]?.id) {
      const cd = await pool.query(
        'SELECT datos_columnas FROM congelado_detalle WHERE congelado_id = $1 AND producto_id = $2',
        [congelado.rows[0].id, row.producto_id]
      );
      if (cd.rows[0]) {
        const o = typeof cd.rows[0].datos_columnas === 'string' ? JSON.parse(cd.rows[0].datos_columnas || '{}') : cd.rows[0].datos_columnas || {};
        con_bandejas = Object.values(o).reduce((s, v) => s + (Number(v) || 0), 0);
      }
    }
    if (empaque.rows[0]?.id) {
      const emp = await pool.query(
        'SELECT datos_horas FROM empaque_detalle WHERE empaque_id = $1 AND producto_id = $2',
        [empaque.rows[0].id, row.producto_id]
      );
      if (emp.rows[0]) {
        const o = typeof emp.rows[0].datos_horas === 'string' ? JSON.parse(emp.rows[0].datos_horas || '{}') : emp.rows[0].datos_horas || {};
        emp_bultos = Object.values(o).reduce((s, v) => s + (Number(v) || 0), 0);
      }
    }
    const env_kg = env_bandejas * pesoBandeja(row.formato);
    const con_kg = con_bandejas * pesoBandeja(row.formato);
    const emp_kg = bultosToKg(emp_bultos, row.formato, row.unidad_medida);
    const um = (row.unidad_medida || 'KG').toUpperCase();
    const formatoLabel = `${row.formato || ''} ${um}`.trim();
    resultados_produccion.push({
      producto_id: row.producto_id,
      codigo: row.codigo,
      producto: row.producto,
      descripcion: row.descripcion,
      presentacion: row.presentacion,
      formato: row.formato,
      formato_label: formatoLabel,
      orden_plantilla: ordenIdx,
      envasado_bandejas: env_bandejas,
      envasado_kg: Number(env_kg.toFixed(2)),
      congelado_bandejas: con_bandejas,
      congelado_kg: Number(con_kg.toFixed(2)),
      empaque_bultos: emp_bultos,
      empaque_kg: Number(emp_kg.toFixed(2)),
    });
    ordenIdx += 1;
  }
  return resultados_produccion;
}

/** Excluye líneas sin kg registrados en ningún proceso (empaque / envasado / congelado). */
export function filtrarResultadosConKgProducido(resultados) {
  return (resultados || []).filter((p) => {
    const k = (Number(p.empaque_kg) || 0) + (Number(p.envasado_kg) || 0) + (Number(p.congelado_kg) || 0);
    return k > 0.00001;
  });
}
