/**
 * Conciliación empaque por plantilla de proceso + lote (misma lógica que GET /empaque-especificaciones/conciliacion).
 */

export async function aggregateLoteProductos(client, loteId) {
  const q = await client.query(
    `SELECT pp.producto_id,
            COALESCE(SUM(CASE WHEN UPPER(COALESCE(pp.unidad_parihuela, 'BULTOS')) = 'CAJAS' THEN pp.cantidad ELSE 0 END), 0)::numeric AS cajas,
            COALESCE(SUM(CASE WHEN UPPER(COALESCE(pp.unidad_parihuela, 'BULTOS')) <> 'CAJAS' THEN pp.cantidad ELSE 0 END), 0)::numeric AS bultos
     FROM parihuelas_produccion pp
     WHERE pp.lote_id = $1
     GROUP BY pp.producto_id`,
    [loteId]
  );
  return q.rows;
}

/**
 * @returns {Promise<{ data: Array<object>, resumen: object }>}
 */
export async function buildConciliacionPlantillaProceso(client, lote_produccion_id, plantilla_proceso_id) {
  const prodAgg = await aggregateLoteProductos(client, lote_produccion_id);
  const unidades = {
    bultos: Number(prodAgg.reduce((s, r) => s + (Number(r.bultos) || 0), 0)) || 0,
    cajas: Number(prodAgg.reduce((s, r) => s + (Number(r.cajas) || 0), 0)) || 0,
  };
  const mapProd = new Map(prodAgg.map((r) => [r.producto_id, { bultos: Number(r.bultos) || 0, cajas: Number(r.cajas) || 0 }]));
  const baseRows = await client.query(
    `SELECT epi.id, epi.producto_id, epi.categoria, epi.insumo_id, epi.cantidad_por_unidad, epi.unidad_base, ec.id AS componente_id,
            p.codigo AS producto_codigo, p.producto AS producto_nombre,
            i.nombre AS insumo_nombre, i.unidad_medida AS insumo_unidad, i.codigo AS insumo_codigo
     FROM empaque_plantilla_proceso_items epi
     JOIN productos p ON p.id = epi.producto_id
     JOIN insumos i ON i.id = epi.insumo_id
     LEFT JOIN LATERAL (
       SELECT c.id
       FROM empaque_componentes c
       WHERE c.insumo_id = epi.insumo_id
         AND c.categoria = CASE WHEN epi.categoria = 'PRIMARIO' THEN 'PRINCIPAL' ELSE epi.categoria END
       ORDER BY c.activo DESC, c.updated_at DESC NULLS LAST, c.created_at DESC NULLS LAST
       LIMIT 1
     ) ec ON TRUE
     WHERE epi.plantilla_proceso_id = $1`,
    [plantilla_proceso_id]
  );
  const baseKeys = new Set(baseRows.rows.map((r) => `${r.insumo_id}|${r.categoria}`));

  const byProductoInsumo = new Map();
  for (const r of baseRows.rows) {
    const qty = mapProd.get(r.producto_id) || { bultos: 0, cajas: 0 };
    const factor = r.unidad_base === 'CAJA' ? qty.cajas : qty.bultos;
    const esperadoRaw = Number((Number(r.cantidad_por_unidad || 0) * factor).toFixed(6));
    const key = `${r.producto_id}|${r.insumo_id}|${r.categoria}|${r.unidad_base}`;
    const prev = byProductoInsumo.get(key) || {
      producto_id: r.producto_id,
      componente_id: r.componente_id || null,
      insumo_id: r.insumo_id,
      insumo_nombre: r.insumo_nombre,
      insumo_unidad: r.insumo_unidad,
      insumo_codigo: r.insumo_codigo || '',
      categoria: r.categoria,
      unidad_base: r.unidad_base,
      esperado_raw: 0,
    };
    prev.esperado_raw = Number((prev.esperado_raw + esperadoRaw).toFixed(6));
    byProductoInsumo.set(key, prev);
  }

  const grouped = new Map();
  for (const row of byProductoInsumo.values()) {
    const esperado =
      row.unidad_base === 'BULTO' && (row.insumo_unidad || '').toUpperCase() !== 'KG'
        ? Math.ceil(Number(row.esperado_raw || 0))
        : Number(Number(row.esperado_raw || 0).toFixed(6));
    const key = `${row.insumo_id}|${row.categoria}`;
    const prev = grouped.get(key) || {
      componente_id: row.componente_id || null,
      insumo_id: row.insumo_id,
      insumo_nombre: row.insumo_nombre,
      insumo_unidad: row.insumo_unidad,
      insumo_codigo: row.insumo_codigo || '',
      categoria: row.categoria,
      unidad_base: row.unidad_base,
      esperado: 0,
    };
    prev.esperado = Number((prev.esperado + esperado).toFixed(6));
    if (!prev.insumo_codigo && row.insumo_codigo) prev.insumo_codigo = row.insumo_codigo;
    grouped.set(key, prev);
  }

  const adjRows = await client.query(
    `SELECT a.id, a.unidad_base, a.cantidad_por_unidad, a.motivo, a.observaciones, ec.id AS componente_id,
            ec.categoria AS categoria_componente, i.id AS insumo_id, i.nombre AS insumo_nombre, i.unidad_medida AS insumo_unidad, i.codigo AS insumo_codigo
     FROM lote_empaque_ajustes a
     JOIN empaque_componentes ec ON ec.id = a.componente_id
     JOIN insumos i ON i.id = ec.insumo_id
     WHERE a.lote_produccion_id = $1`,
    [lote_produccion_id]
  );
  for (const a of adjRows.rows) {
    const cat = a.categoria_componente === 'PRINCIPAL' ? 'PRIMARIO' : a.categoria_componente;
    const sign = String(a.observaciones || '').includes('__REEMPLAZO_ORIGEN__') ? -1 : 1;
    const delta = Number((Number(a.cantidad_por_unidad || 0) * sign).toFixed(6));
    const key = `${a.insumo_id}|${cat}`;
    const prev = grouped.get(key) || {
      componente_id: a.componente_id || null,
      insumo_id: a.insumo_id,
      insumo_nombre: a.insumo_nombre,
      insumo_unidad: a.insumo_unidad,
      insumo_codigo: a.insumo_codigo || '',
      categoria: cat,
      unidad_base: a.unidad_base,
      esperado: 0,
      motivo: a.motivo || null,
    };
    prev.esperado = Number((prev.esperado + delta).toFixed(6));
    if (!prev.motivo && a.motivo) prev.motivo = a.motivo;
    if (!prev.insumo_codigo && a.insumo_codigo) prev.insumo_codigo = a.insumo_codigo;
    grouped.set(key, prev);
  }

  const real = await client.query(
    `SELECT m.insumo_id, COALESCE(SUM(m.cantidad), 0)::numeric AS total
     FROM insumo_movimientos m
     WHERE m.lote_produccion_id = $1 AND m.tipo = 'SALIDA' AND m.documento_id IS NOT NULL
     GROUP BY m.insumo_id`,
    [lote_produccion_id]
  );
  const realMap = new Map(real.rows.map((r) => [r.insumo_id, Number(r.total) || 0]));
  const rowsArray = [...grouped.values()];
  const byInsumo = new Map();
  for (const r of rowsArray) {
    if (!byInsumo.has(r.insumo_id)) byInsumo.set(r.insumo_id, []);
    byInsumo.get(r.insumo_id).push(r);
  }
  const allocatedReal = new Map();
  for (const [insumoId, rows] of byInsumo) {
    const T = Number(realMap.get(insumoId) || 0);
    const sumW = rows.reduce((s, row) => s + Math.max(0, Number(row.esperado) || 0), 0);
    if (rows.length === 1) {
      allocatedReal.set(`${insumoId}|${rows[0].categoria}`, T);
    } else if (sumW > 0) {
      for (const row of rows) {
        const w = Math.max(0, Number(row.esperado) || 0);
        allocatedReal.set(`${insumoId}|${row.categoria}`, (T * w) / sumW);
      }
    } else {
      const share = T / rows.length;
      for (const row of rows) {
        allocatedReal.set(`${insumoId}|${row.categoria}`, share);
      }
    }
  }
  const data = rowsArray.map((r) => {
    const shouldUseReal = baseKeys.has(`${r.insumo_id}|${r.categoria}`);
    const realQty = allocatedReal.get(`${r.insumo_id}|${r.categoria}`) ?? 0;
    return {
      ...r,
      origen: shouldUseReal ? 'PLANTILLA' : 'AJUSTE',
      real: Number(Number(realQty).toFixed(6)),
      desviacion: Number((realQty - r.esperado).toFixed(6)),
    };
  });
  const resumen = {
    total_items: data.length,
    total_esperado: Number(data.reduce((s, r) => s + (r.esperado || 0), 0).toFixed(6)),
    total_real: Number(data.reduce((s, r) => s + (r.real || 0), 0).toFixed(6)),
    total_desviacion: Number(data.reduce((s, r) => s + (r.desviacion || 0), 0).toFixed(6)),
    unidades,
    lote_produccion_id,
    plantilla_proceso_id,
  };
  return { data, resumen };
}

/**
 * Filas del parte de producción según icono verde (calculado vs real) guardado en conciliación.
 * @param {object} seleccion - { calculado: string[], real: string[] } keys `insumo_id|categoria`
 */
export function insumosParteProduccionDesdeSeleccion(data, seleccion, cantidadTmMp) {
  const byKey = new Map((data || []).map((r) => [`${r.insumo_id}|${r.categoria}`, r]));
  const calcArr = Array.isArray(seleccion?.calculado) ? seleccion.calculado : [];
  const realArr = Array.isArray(seleccion?.real) ? seleccion.real : [];
  const added = new Set();
  const out = [];

  const pushRow = (key, cantidad) => {
    const row = byKey.get(key);
    if (!row || cantidad == null || !Number.isFinite(Number(cantidad))) return;
    const cant = Number(cantidad);
    const ratio_tm = cantidadTmMp > 0 ? Number((cant / cantidadTmMp).toFixed(6)) : null;
    out.push({
      codigo: row.insumo_codigo || '',
      descripcion: row.insumo_nombre || '',
      cantidad: cant,
      unidad_medida: row.insumo_unidad || '',
      ratio_tm,
    });
  };

  for (const key of calcArr) {
    if (added.has(key)) continue;
    const row = byKey.get(key);
    if (row) {
      pushRow(key, row.esperado);
      added.add(key);
    }
  }
  for (const key of realArr) {
    if (added.has(key)) continue;
    const row = byKey.get(key);
    if (row) {
      pushRow(key, row.real);
      added.add(key);
    }
  }

  out.sort((a, b) => `${a.descripcion || ''}`.localeCompare(`${b.descripcion || ''}`, 'es'));
  return out;
}
