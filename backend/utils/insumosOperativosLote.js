/**
 * Agua / hielo: fijos por nombre; cantidad = factor (plantilla) × TM de materia prima (kg winchas / 1000).
 * Bunker: galones capturados manualmente en el lote (operativo_bunker_galones).
 */

export async function getTotalKgMateriaPrimaLote(client, loteId) {
  const r = await client.query(
    `SELECT COALESCE(SUM(w.peso_kg), 0)::numeric AS total
     FROM descarga_winchas w
     JOIN descargas_materia_prima d ON d.id = w.descarga_id
     JOIN vehiculos_lote vl ON vl.id = d.vehiculo_lote_id
     WHERE vl.lote_produccion_id = $1`,
    [loteId]
  );
  return Number(r.rows[0]?.total) || 0;
}

/**
 * @returns {Promise<Array<{ tipo: string, codigo: string, descripcion: string, cantidad: number, unidad_medida: string, ratio_tm: number|null, fuente: string, detalle?: string }>>}
 */
export async function buildInsumosOperativosReporte(client, loteId, plantillaId, cantidadTmMp) {
  const out = [];
  const tm = Number(cantidadTmMp) || 0;

  if (plantillaId) {
    const p = await client.query(
      `SELECT operativo_agua_litros_por_tm_mp, operativo_hielo_kg_por_tm_mp
       FROM plantillas_proceso WHERE id = $1`,
      [plantillaId]
    );
    const row = p.rows[0];
    if (row) {
      const litrosPorTm = Number(row.operativo_agua_litros_por_tm_mp) || 0;
      if (litrosPorTm > 0 && tm > 0) {
        const cant = Number((tm * litrosPorTm).toFixed(6));
        out.push({
          tipo: 'agua',
          codigo: '',
          descripcion: 'Agua',
          cantidad: cant,
          unidad_medida: 'L',
          ratio_tm: Number((cant / tm).toFixed(6)),
          fuente: 'calculado_tm_mp',
          detalle: `${litrosPorTm} L/TM × ${tm.toFixed(4)} TM MP`,
        });
      }
      const kgHieloPorTm = Number(row.operativo_hielo_kg_por_tm_mp) || 0;
      if (kgHieloPorTm > 0 && tm > 0) {
        const cant = Number((tm * kgHieloPorTm).toFixed(6));
        out.push({
          tipo: 'hielo',
          codigo: '',
          descripcion: 'Hielo',
          cantidad: cant,
          unidad_medida: 'KG',
          ratio_tm: Number((cant / tm).toFixed(6)),
          fuente: 'calculado_tm_mp',
          detalle: `${kgHieloPorTm} KG/TM × ${tm.toFixed(4)} TM MP`,
        });
      }
    }
  }

  let galRaw = null;
  try {
    const loteB = await client.query(
      `SELECT operativo_bunker_galones FROM lotes_produccion WHERE id = $1`,
      [loteId]
    );
    galRaw = loteB.rows[0]?.operativo_bunker_galones;
  } catch (_) {
    /* columna aún no existe en BD antigua */
  }
  if (galRaw != null && galRaw !== '') {
    const gal = Number(galRaw);
    if (Number.isFinite(gal) && gal >= 0) {
      const ratio_tm = tm > 0 ? Number((gal / tm).toFixed(6)) : null;
      out.push({
        tipo: 'bunker',
        codigo: '',
        descripcion: 'Bunker',
        cantidad: gal,
        unidad_medida: 'GAL',
        ratio_tm,
        fuente: 'manual_resumen',
        detalle: 'Galones registrados en resumen de insumos operativos',
      });
    }
  }

  return out;
}
