import { pool } from '../config/database.js';

/**
 * Construye el objeto JSON a guardar al finalizar un proceso (envasado/congelado/empaque).
 */
export async function buildPlantillaProcesoSnapshot(client, plantillaId, loteCodigo) {
  const c = client || pool;
  const pp = await c.query(
    `SELECT id, titulo, operativo_agua_litros_por_tm_mp, operativo_hielo_kg_por_tm_mp
     FROM plantillas_proceso WHERE id = $1`,
    [plantillaId]
  );
  if (pp.rows.length === 0) return null;
  const row = pp.rows[0];
  const prods = await c.query(
    `SELECT p.id AS producto_id, ppp.orden, p.codigo, p.producto, p.descripcion, p.presentacion,
            p.formato, p.unidad_medida, p.unidad_parihuela
     FROM plantillas_proceso_productos ppp
     JOIN productos p ON p.id = ppp.producto_id
     WHERE ppp.plantilla_id = $1
     ORDER BY ppp.orden, p.codigo`,
    [plantillaId]
  );
  return {
    version: 1,
    lote_codigo: loteCodigo != null ? String(loteCodigo) : null,
    plantilla_id: plantillaId,
    titulo: row.titulo ?? null,
    operativo_agua_litros_por_tm_mp: row.operativo_agua_litros_por_tm_mp ?? 0,
    operativo_hielo_kg_por_tm_mp: row.operativo_hielo_kg_por_tm_mp ?? 0,
    productos: prods.rows,
  };
}

export function parsePlantillaSnapshot(raw) {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return raw;
}
