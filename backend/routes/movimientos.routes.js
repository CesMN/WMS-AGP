import express from 'express';
import { pool } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.middleware.js';

const router = express.Router();
router.use(authenticateToken);

/**
 * GET /api/movimientos
 * Listado de movimientos con filtros y paginación.
 * Query: tipo_movimiento, fecha_desde, fecha_hasta, usuario_id, limit, offset
 */
router.get('/', async (req, res) => {
  try {
    const { tipo_movimiento, fecha_desde, fecha_hasta, usuario_id, limit = 50, offset = 0 } = req.query;
    const limitNum = Math.min(parseInt(limit, 10) || 50, 500);
    const offsetNum = Math.max(0, parseInt(offset, 10) || 0);

    let baseQuery = `
      FROM movimientos m
      JOIN usuarios u ON u.id = m.usuario_id
      LEFT JOIN despachos d ON d.movimiento_id = m.id
      LEFT JOIN clientes c_origen ON c_origen.id = d.cliente_origen_id
      WHERE 1=1
    `;
    const params = [];
    let n = 1;

    if (tipo_movimiento) {
      baseQuery += ` AND m.tipo_movimiento = $${n}`;
      params.push(tipo_movimiento);
      n++;
    }
    if (fecha_desde) {
      baseQuery += ` AND m.fecha_hora::date >= $${n}`;
      params.push(fecha_desde);
      n++;
    }
    if (fecha_hasta) {
      baseQuery += ` AND m.fecha_hora::date <= $${n}`;
      params.push(fecha_hasta);
      n++;
    }
    if (usuario_id) {
      baseQuery += ` AND m.usuario_id = $${n}`;
      params.push(usuario_id);
      n++;
    }

    const countResult = await pool.query('SELECT COUNT(*) AS total ' + baseQuery, params);
    const total = parseInt(countResult.rows[0]?.total, 10) || 0;

    const paramsList = [...params, limitNum, offsetNum];
    const queryWithGuia = `
      SELECT m.id, m.tipo_movimiento, m.fecha_hora, m.motivo, m.numero_guia, m.usuario_id,
             u.nombre AS usuario_nombre,
             (SELECT COUNT(*) FROM movimiento_detalles md WHERE md.movimiento_id = m.id) AS cantidad_detalles,
             d.cliente_destino, c_origen.nombre AS cliente_origen_nombre
      ${baseQuery}
      ORDER BY m.fecha_hora DESC LIMIT $${n} OFFSET $${n + 1}`;
    const querySinGuia = `
      SELECT m.id, m.tipo_movimiento, m.fecha_hora, m.motivo, NULL::VARCHAR AS numero_guia, m.usuario_id,
             u.nombre AS usuario_nombre,
             (SELECT COUNT(*) FROM movimiento_detalles md WHERE md.movimiento_id = m.id) AS cantidad_detalles,
             d.cliente_destino, c_origen.nombre AS cliente_origen_nombre
      ${baseQuery}
      ORDER BY m.fecha_hora DESC LIMIT $${n} OFFSET $${n + 1}`;

    let result;
    try {
      result = await pool.query(queryWithGuia, paramsList);
    } catch (err) {
      const msg = (err && err.message) ? String(err.message) : '';
      if (msg.includes('numero_guia') || msg.includes('cliente_origen') || msg.includes('column')) {
        try {
          result = await pool.query(querySinGuia, paramsList);
        } catch (err2) {
          const andPart = baseQuery.includes('WHERE 1=1') ? baseQuery.substring(baseQuery.indexOf('WHERE 1=1') + 9).trim() : '';
          const queryMinimal = `
            SELECT m.id, m.tipo_movimiento, m.fecha_hora, m.motivo, m.usuario_id,
                   u.nombre AS usuario_nombre,
                   (SELECT COUNT(*) FROM movimiento_detalles md WHERE md.movimiento_id = m.id) AS cantidad_detalles,
                   NULL::VARCHAR AS numero_guia, NULL::VARCHAR AS cliente_destino, NULL::VARCHAR AS cliente_origen_nombre
            FROM movimientos m
            JOIN usuarios u ON u.id = m.usuario_id
            WHERE 1=1 ${andPart}
            ORDER BY m.fecha_hora DESC LIMIT $${n} OFFSET $${n + 1}`;
          result = await pool.query(queryMinimal, paramsList);
        }
      } else {
        throw err;
      }
    }
    res.json({ data: result.rows, total });
  } catch (error) {
    console.error('Error listando movimientos:', error);
    res.status(500).json({ message: 'Error al listar movimientos' });
  }
});

/**
 * GET /api/movimientos/ingresos-agrupados
 * Ingresos agrupados por número de guía. Query: limit, offset, numero_guia, fecha_desde, fecha_hasta, cliente_id, especie_id
 */
router.get('/ingresos-agrupados', async (req, res) => {
  try {
    const { limit = 20, offset = 0, numero_guia, fecha_desde, fecha_hasta, cliente_id, especie_id } = req.query;
    const limitNum = Math.min(parseInt(limit, 10) || 20, 100);
    const offsetNum = Math.max(0, parseInt(offset, 10) || 0);

    const filtrosParams = [];
    let filtrosIdx = 1;
    let filtrosWhere = " m.tipo_movimiento = 'Ingreso' ";
    if (numero_guia && String(numero_guia).trim() !== '') {
      filtrosWhere += ` AND m.numero_guia ILIKE $${filtrosIdx}`;
      filtrosParams.push(`%${String(numero_guia).trim()}%`);
      filtrosIdx++;
    }
    if (fecha_desde) {
      filtrosWhere += ` AND m.fecha_hora::date >= $${filtrosIdx}`;
      filtrosParams.push(fecha_desde);
      filtrosIdx++;
    }
    if (fecha_hasta) {
      filtrosWhere += ` AND m.fecha_hora::date <= $${filtrosIdx}`;
      filtrosParams.push(fecha_hasta);
      filtrosIdx++;
    }
    if (cliente_id) {
      filtrosWhere += ` AND EXISTS (SELECT 1 FROM movimiento_detalles md2 JOIN productos p2 ON p2.id = md2.producto_id WHERE md2.movimiento_id = m.id AND p2.cliente_id = $${filtrosIdx})`;
      filtrosParams.push(cliente_id);
      filtrosIdx++;
    }
    if (especie_id) {
      filtrosWhere += ` AND EXISTS (SELECT 1 FROM movimiento_detalles md2 JOIN productos p2 ON p2.id = md2.producto_id WHERE md2.movimiento_id = m.id AND p2.especie_id = $${filtrosIdx})`;
      filtrosParams.push(especie_id);
      filtrosIdx++;
    }

    const runWithNumeroGuia = async () => {
      const countResult = await pool.query(
        `SELECT COUNT(DISTINCT COALESCE(m.numero_guia, m.id::text)) AS total FROM movimientos m WHERE ${filtrosWhere}`,
        filtrosParams
      );
      const total = parseInt(countResult.rows[0]?.total, 10) || 0;
      const paramsGrupos = [...filtrosParams, limitNum, offsetNum];
      const result = await pool.query(
        `WITH grupos AS (
          SELECT COALESCE(m.numero_guia, m.id::text) AS grupo_id,
                 COALESCE(NULLIF(TRIM(COALESCE(m.numero_guia, '')::text), ''), 'Sin guía') AS numero_guia,
                 MIN(m.fecha_hora) AS fecha_hora, (array_agg(DISTINCT u.nombre))[1] AS usuario_nombre,
                 array_agg(DISTINCT m.id) AS movimiento_ids
          FROM movimientos m JOIN usuarios u ON u.id = m.usuario_id
          WHERE ${filtrosWhere}
          GROUP BY COALESCE(m.numero_guia, m.id::text), COALESCE(NULLIF(TRIM(COALESCE(m.numero_guia, '')::text), ''), 'Sin guía')
        ),
        agregados AS (
          SELECT g.grupo_id, g.numero_guia, g.fecha_hora, g.usuario_nombre, g.movimiento_ids,
                 COALESCE(SUM(md.cantidad_bultos), 0)::INTEGER AS total_bultos,
                 COALESCE(SUM(md.total_kg), 0)::NUMERIC(12,2) AS total_kg,
                 COALESCE(SUM(md.peso_adicional), 0)::NUMERIC(12,2) AS total_peso_adicional,
                 COUNT(DISTINCT md.producto_id) AS cantidad_productos,
                 MAX(c.nombre) AS cliente_nombre, MAX(e.nombre) AS especie_nombre, MAX(sp.referencia) AS referencia_ingreso
          FROM grupos g
          JOIN movimientos m ON m.id = ANY(g.movimiento_ids)
          LEFT JOIN movimiento_detalles md ON md.movimiento_id = m.id
          LEFT JOIN productos p ON p.id = md.producto_id
          LEFT JOIN clientes c ON c.id = p.cliente_id
          LEFT JOIN especies e ON e.id = p.especie_id
          LEFT JOIN stock_posiciones sp ON sp.id = md.stock_posicion_id
          GROUP BY g.grupo_id, g.numero_guia, g.fecha_hora, g.usuario_nombre, g.movimiento_ids
        )
        SELECT * FROM agregados ORDER BY fecha_hora DESC LIMIT $${filtrosIdx} OFFSET $${filtrosIdx + 1}`,
        paramsGrupos
      );
      return { rows: result.rows, total };
    };

    const runWithoutNumeroGuia = async () => {
      const countResult = await pool.query(
        `SELECT COUNT(*) AS total FROM movimientos m WHERE ${filtrosWhere}`,
        filtrosParams
      );
      const total = parseInt(countResult.rows[0]?.total, 10) || 0;
      const paramsGrupos = [...filtrosParams, limitNum, offsetNum];
      const result = await pool.query(
        `WITH grupos AS (
          SELECT m.id::text AS grupo_id, 'Sin guía' AS numero_guia, m.fecha_hora,
                 u.nombre AS usuario_nombre, ARRAY[m.id] AS movimiento_ids
          FROM movimientos m JOIN usuarios u ON u.id = m.usuario_id
          WHERE ${filtrosWhere}
        ),
        agregados AS (
          SELECT g.grupo_id, g.numero_guia, g.fecha_hora, g.usuario_nombre, g.movimiento_ids,
                 COALESCE(SUM(md.cantidad_bultos), 0)::INTEGER AS total_bultos,
                 COALESCE(SUM(md.total_kg), 0)::NUMERIC(12,2) AS total_kg,
                 COALESCE(SUM(md.peso_adicional), 0)::NUMERIC(12,2) AS total_peso_adicional,
                 COUNT(DISTINCT md.producto_id) AS cantidad_productos,
                 MAX(c.nombre) AS cliente_nombre, MAX(e.nombre) AS especie_nombre, MAX(sp.referencia) AS referencia_ingreso
          FROM grupos g
          JOIN movimientos m ON m.id = ANY(g.movimiento_ids)
          LEFT JOIN movimiento_detalles md ON md.movimiento_id = m.id
          LEFT JOIN productos p ON p.id = md.producto_id
          LEFT JOIN clientes c ON c.id = p.cliente_id
          LEFT JOIN especies e ON e.id = p.especie_id
          LEFT JOIN stock_posiciones sp ON sp.id = md.stock_posicion_id
          GROUP BY g.grupo_id, g.numero_guia, g.fecha_hora, g.usuario_nombre, g.movimiento_ids
        )
        SELECT * FROM agregados ORDER BY fecha_hora DESC LIMIT $${filtrosIdx} OFFSET $${filtrosIdx + 1}`,
        paramsGrupos
      );
      return { rows: result.rows, total };
    };

    let rows;
    let total;
    let sinColumnaGuia = false;
    try {
      const out = await runWithNumeroGuia();
      rows = out.rows;
      total = out.total;
    } catch (err) {
      // Solo fallback si la columna numero_guia no existe (código 42703), no por otros errores de SQL
      const code = err && (String(err.code) === '42703' || err.code === 42703);
      if (code) {
        sinColumnaGuia = true;
        const out = await runWithoutNumeroGuia();
        rows = out.rows;
        total = out.total;
      } else {
        throw err;
      }
    }

    const data = rows.map((r) => ({
      grupo_id: r.grupo_id,
      numero_guia: r.numero_guia != null && String(r.numero_guia).trim() !== '' ? String(r.numero_guia).trim() : 'Sin guía',
      fecha_hora: r.fecha_hora,
      usuario_nombre: r.usuario_nombre,
      cliente_nombre: r.cliente_nombre || '-',
      especie_nombre: r.especie_nombre || '-',
      referencia_ingreso: r.referencia_ingreso || '-',
      cantidad_productos: parseInt(r.cantidad_productos, 10) || 0,
      total_bultos: Number(r.total_bultos) || 0,
      total_kg: Number(r.total_kg) || 0,
      total_peso_adicional: Number(r.total_peso_adicional) || 0,
      movimiento_ids: r.movimiento_ids || [],
    }));
    res.json({ data, total, sin_columna_guia: sinColumnaGuia });
  } catch (error) {
    console.error('Error listando ingresos agrupados:', error);
    res.status(500).json({ message: 'Error al listar ingresos' });
  }
});

/**
 * GET /api/movimientos/salidas-agrupadas
 * Salidas (despachos despachados) agrupadas por guía. Query: limit, offset, numero_guia, fecha_desde, fecha_hasta, cliente_id, especie_id
 */
router.get('/salidas-agrupadas', async (req, res) => {
  try {
    const { limit = 20, offset = 0, numero_guia, fecha_desde, fecha_hasta, cliente_id, especie_id } = req.query;
    const limitNum = Math.min(parseInt(limit, 10) || 20, 100);
    const offsetNum = Math.max(0, parseInt(offset, 10) || 0);

    const salidasParams = [];
    let salidasIdx = 1;
    let salidasWhere = " d.estado = 'Despachado' ";
    if (numero_guia && String(numero_guia).trim() !== '') {
      salidasWhere += ` AND d.guia_salida ILIKE $${salidasIdx}`;
      salidasParams.push(`%${String(numero_guia).trim()}%`);
      salidasIdx++;
    }
    if (fecha_desde) {
      salidasWhere += ` AND d.fecha_salida::date >= $${salidasIdx}`;
      salidasParams.push(fecha_desde);
      salidasIdx++;
    }
    if (fecha_hasta) {
      salidasWhere += ` AND d.fecha_salida::date <= $${salidasIdx}`;
      salidasParams.push(fecha_hasta);
      salidasIdx++;
    }
    if (cliente_id) {
      salidasWhere += ` AND d.cliente_origen_id = $${salidasIdx}`;
      salidasParams.push(cliente_id);
      salidasIdx++;
    }
    if (especie_id) {
      salidasWhere += ` AND EXISTS (SELECT 1 FROM movimiento_detalles md JOIN productos p ON p.id = md.producto_id WHERE md.movimiento_id = d.movimiento_id AND p.especie_id = $${salidasIdx})`;
      salidasParams.push(especie_id);
      salidasIdx++;
    }

    const countResult = await pool.query(
      `SELECT COUNT(*) AS total FROM despachos d WHERE ${salidasWhere}`,
      salidasParams
    );
    const total = parseInt(countResult.rows[0]?.total, 10) || 0;

    const query = `
      SELECT
        d.id AS despacho_id,
        d.guia_salida AS numero_guia,
        d.fecha_salida,
        d.tipo_salida,
        d.cliente_destino AS cliente_nombre,
        c_origen.nombre AS cliente_origen_nombre,
        d.guia_salida AS referencia_salida,
        d.observaciones,
        u.nombre AS usuario_nombre,
        COALESCE(tot.total_bultos, 0)::INTEGER AS total_bultos,
        COALESCE(tot.total_kg, 0)::NUMERIC(12,2) AS total_kg,
        COALESCE(tot.total_peso_adicional, 0)::NUMERIC(12,2) AS total_peso_adicional,
        COALESCE(tot.cantidad_productos, 0)::INTEGER AS cantidad_productos
      FROM despachos d
      JOIN usuarios u ON u.id = d.usuario_id
      LEFT JOIN clientes c_origen ON c_origen.id = d.cliente_origen_id
      LEFT JOIN (
        SELECT md.movimiento_id,
               SUM(md.cantidad_bultos)::INTEGER AS total_bultos,
               SUM(md.total_kg)::NUMERIC(12,2) AS total_kg,
               COALESCE(SUM(md.peso_adicional), 0)::NUMERIC(12,2) AS total_peso_adicional,
               COUNT(DISTINCT md.producto_id) AS cantidad_productos
        FROM movimiento_detalles md
        WHERE md.movimiento_id IS NOT NULL
        GROUP BY md.movimiento_id
      ) tot ON tot.movimiento_id = d.movimiento_id
      WHERE ${salidasWhere}
      ORDER BY d.fecha_salida DESC NULLS LAST, d.created_at DESC
      LIMIT $${salidasIdx} OFFSET $${salidasIdx + 1}
    `;
    const result = await pool.query(query, [...salidasParams, limitNum, offsetNum]);
    const data = result.rows.map((r) => ({
      despacho_id: r.despacho_id,
      numero_guia: r.numero_guia || 'Sin guía',
      fecha: r.fecha_salida,
      tipo_salida: r.tipo_salida,
      cliente_nombre: r.cliente_nombre || '-',
      cliente_origen_nombre: r.cliente_origen_nombre || null,
      referencia: r.referencia_salida || '-',
      usuario_nombre: r.usuario_nombre,
      total_bultos: Number(r.total_bultos) || 0,
      total_kg: Number(r.total_kg) || 0,
      total_peso_adicional: Number(r.total_peso_adicional) || 0,
      cantidad_productos: parseInt(r.cantidad_productos, 10) || 0,
    }));
    res.json({ data, total });
  } catch (error) {
    console.error('Error listando salidas agrupadas:', error);
    res.status(500).json({ message: 'Error al listar salidas' });
  }
});

/**
 * PATCH /api/movimientos/actualizar-guia-grupo
 * Actualiza el numero_guia de todos los movimientos de tipo Ingreso indicados.
 * Body: { movimiento_ids: string[], numero_guia: string }
 * Se refleja en vista Ingresos, historial de movimientos y vista posición (que lee guía del movimiento).
 */
router.patch('/actualizar-guia-grupo', async (req, res) => {
  try {
    const { movimiento_ids, numero_guia } = req.body;
    if (!Array.isArray(movimiento_ids) || movimiento_ids.length === 0) {
      return res.status(400).json({ message: 'movimiento_ids es requerido y debe ser un array no vacío' });
    }
    const valorGuia = numero_guia != null && String(numero_guia).trim() !== '' ? String(numero_guia).trim() : null;
    const result = await pool.query(
      `UPDATE movimientos SET numero_guia = $1
       WHERE tipo_movimiento = 'Ingreso' AND id = ANY($2::uuid[])
       RETURNING id`,
      [valorGuia, movimiento_ids]
    );
    const actualizados = result.rowCount || 0;
    res.json({
      message: `Guía actualizada en ${actualizados} movimiento(s). El cambio se refleja en ingresos, historial y vista posición.`,
      actualizados,
    });
  } catch (error) {
    console.error('Error actualizando guía de grupo:', error);
    res.status(500).json({ message: 'Error al actualizar el número de guía' });
  }
});

/**
 * GET /api/movimientos/:id
 * Detalle de un movimiento con sus líneas (movimiento_detalles).
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const movResult = await pool.query(
      `SELECT m.id, m.tipo_movimiento, m.fecha_hora, m.motivo, m.numero_guia, m.usuario_id,
              u.nombre AS usuario_nombre, u.email AS usuario_email,
              d.cliente_destino,
              c_orig.nombre AS cliente_origen_nombre
       FROM movimientos m
       JOIN usuarios u ON u.id = m.usuario_id
       LEFT JOIN despachos d ON d.movimiento_id = m.id
       LEFT JOIN clientes c_orig ON c_orig.id = d.cliente_origen_id
       WHERE m.id = $1`,
      [id]
    );
    if (movResult.rows.length === 0) {
      return res.status(404).json({ message: 'Movimiento no encontrado' });
    }

    const movimiento = movResult.rows[0];

    const detalleResult = await pool.query(
      `SELECT 
        md.id,
        md.producto_id,
        md.cantidad_bultos,
        md.total_kg,
        md.peso_adicional,
        md.tipo_linea,
        md.stock_posicion_id,
        md.almacen_id,
        md.carril_id,
        md.nivel_id,
        md.posicion_id,
        p.codigo AS producto_codigo,
        p.producto AS producto_nombre,
        p.descripcion AS producto_descripcion,
        p.presentacion AS producto_presentacion,
        cli.nombre AS cliente_nombre,
        e.nombre AS especie_nombre,
        a.nombre AS almacen_nombre,
        c.nombre AS carril_nombre,
        n.numero_nivel,
        pos.numero_posicion,
        pos.nombre AS posicion_nombre
       FROM movimiento_detalles md
       JOIN productos p ON p.id = md.producto_id
       LEFT JOIN clientes cli ON cli.id = p.cliente_id
       LEFT JOIN especies e ON e.id = p.especie_id
       LEFT JOIN almacenes a ON a.id = md.almacen_id
       LEFT JOIN carriles c ON c.id = md.carril_id
       LEFT JOIN niveles n ON n.id = md.nivel_id
       LEFT JOIN posiciones pos ON pos.id = md.posicion_id
       WHERE md.movimiento_id = $1
       ORDER BY (CASE WHEN md.tipo_linea = 'Antes' THEN 0 WHEN md.tipo_linea = 'Despues' THEN 2 ELSE 1 END), md.id`,
      [id]
    );

    const detalles = detalleResult.rows.map((d) => ({
      id: d.id,
      stock_posicion_id: d.stock_posicion_id || null,
      producto_id: d.producto_id,
      producto_codigo: d.producto_codigo,
      producto_nombre: d.producto_nombre,
      producto_descripcion: d.producto_descripcion,
      producto_presentacion: d.producto_presentacion,
      cantidad_bultos: Number(d.cantidad_bultos),
      total_kg: Number(d.total_kg),
      peso_adicional: Number(d.peso_adicional) || 0,
      tipo_linea: d.tipo_linea || null,
      almacen_nombre: d.almacen_nombre,
      carril_nombre: d.carril_nombre,
      numero_nivel: d.numero_nivel,
      numero_posicion: d.numero_posicion,
      posicion_nombre: d.posicion_nombre,
      cliente_nombre: d.cliente_nombre || null,
      especie_nombre: d.especie_nombre || null,
    }));

    const firstDetalle = detalleResult.rows[0];
    res.json({
      ...movimiento,
      motivo: movimiento.motivo,
      numero_guia: movimiento.numero_guia || null,
      cliente_destino: movimiento.cliente_destino || null,
      cliente_origen_nombre: movimiento.cliente_origen_nombre || null,
      cliente_ingreso: movimiento.tipo_movimiento === 'Ingreso' && firstDetalle ? (firstDetalle.cliente_nombre || null) : null,
      especie_ingreso: movimiento.tipo_movimiento === 'Ingreso' && firstDetalle ? (firstDetalle.especie_nombre || null) : null,
      detalles,
    });
  } catch (error) {
    console.error('Error obteniendo movimiento:', error);
    res.status(500).json({ message: 'Error al obtener el movimiento' });
  }
});

export default router;
