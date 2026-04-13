import { pool } from '../config/database.js';

function sumJsonNumericValues(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return 0;
  let s = 0;
  for (const v of Object.values(obj)) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) s += n;
  }
  return s;
}

/**
 * Indica si el producto tiene cantidad registrada en envasado, congelado o empaque
 * para registros que usan esta plantilla (cualquier lote).
 */
export async function productoTieneIngresoEnProcesosPlantilla(client, plantillaId, productoId) {
  const c = client || pool;
  const procesos = [];

  const env = await c.query(
    `SELECT ed.datos_horas
     FROM envasado_detalle ed
     JOIN envasado e ON e.id = ed.envasado_id
     WHERE e.plantilla_id = $1 AND ed.producto_id = $2`,
    [plantillaId, productoId]
  );
  for (const r of env.rows) {
    const datos = typeof r.datos_horas === 'string' ? JSON.parse(r.datos_horas || '{}') : r.datos_horas || {};
    if (sumJsonNumericValues(datos) > 0) {
      procesos.push('envasado');
      break;
    }
  }

  const cong = await c.query(
    `SELECT cd.datos_columnas
     FROM congelado_detalle cd
     JOIN congelado c ON c.id = cd.congelado_id
     WHERE c.plantilla_id = $1 AND cd.producto_id = $2`,
    [plantillaId, productoId]
  );
  for (const r of cong.rows) {
    const datos =
      typeof r.datos_columnas === 'string' ? JSON.parse(r.datos_columnas || '{}') : r.datos_columnas || {};
    if (sumJsonNumericValues(datos) > 0) {
      procesos.push('congelado');
      break;
    }
  }

  const emp = await c.query(
    `SELECT ed.datos_horas
     FROM empaque_detalle ed
     JOIN empaque e ON e.id = ed.empaque_id
     WHERE e.plantilla_id = $1 AND ed.producto_id = $2`,
    [plantillaId, productoId]
  );
  for (const r of emp.rows) {
    const datos = typeof r.datos_horas === 'string' ? JSON.parse(r.datos_horas || '{}') : r.datos_horas || {};
    if (sumJsonNumericValues(datos) > 0) {
      procesos.push('empaque');
      break;
    }
  }

  const par = await c.query(
    `SELECT COALESCE(SUM(pp.cantidad), 0)::numeric AS suma
     FROM parihuelas_produccion pp
     JOIN empaque e ON e.id = pp.empaque_id
     WHERE e.plantilla_id = $1 AND pp.producto_id = $2`,
    [plantillaId, productoId]
  );
  if (Number(par.rows[0]?.suma || 0) > 0) {
    if (!procesos.includes('empaque')) procesos.push('empaque');
  }

  return { tiene: procesos.length > 0, procesos };
}

export async function productosRemovidosConIngreso(client, plantillaId, productoIdsAntes, productoIdsDespues) {
  const antes = new Set((productoIdsAntes || []).map((x) => String(x)));
  const despues = new Set((productoIdsDespues || []).map((x) => String(x)));
  const removidos = [...antes].filter((id) => !despues.has(id));
  const conflictos = [];
  for (const pid of removidos) {
    const { tiene, procesos } = await productoTieneIngresoEnProcesosPlantilla(client, plantillaId, pid);
    if (tiene) conflictos.push({ producto_id: pid, procesos });
  }
  return conflictos;
}
