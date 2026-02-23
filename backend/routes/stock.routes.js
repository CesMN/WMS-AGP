import express from 'express';
import { pool } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.middleware.js';

const router = express.Router();
router.use(authenticateToken);

/**
 * GET /api/stock/resumen
 * Totales globales para dashboard: total_bultos, total_kg, cantidad_registros (posiciones con stock).
 */
router.get('/resumen', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        COALESCE(SUM(cantidad_bultos), 0)::INTEGER AS total_bultos,
        COALESCE(SUM(total_kg), 0)::NUMERIC(12,2) AS total_kg,
        COUNT(*)::INTEGER AS cantidad_registros
      FROM stock_posiciones
    `);
    const row = result.rows[0];
    res.json({
      total_bultos: Number(row.total_bultos) || 0,
      total_kg: Number(row.total_kg) || 0,
      cantidad_registros: Number(row.cantidad_registros) || 0,
    });
  } catch (error) {
    console.error('Error obteniendo resumen stock:', error);
    res.status(500).json({ message: 'Error al obtener resumen de stock' });
  }
});

/**
 * GET /api/stock/resumen-por-cliente
 * Por cada cliente: cantidad de especies asignadas, cantidad de productos (activos), total bultos y kg en stock.
 */
router.get('/resumen-por-cliente', async (req, res) => {
  try {
    const result = await pool.query(`
      WITH especies_por_cliente AS (
        SELECT cliente_id, COUNT(DISTINCT especie_id)::INTEGER AS cantidad_especies
        FROM cliente_especies
        GROUP BY cliente_id
      ),
      productos_por_cliente AS (
        SELECT cliente_id,
               COUNT(DISTINCT id)::INTEGER AS cantidad_productos,
               COUNT(DISTINCT especie_id)::INTEGER AS especies_con_producto
        FROM productos
        WHERE activo = TRUE
        GROUP BY cliente_id
      ),
      stock_por_cliente AS (
        SELECT pr.cliente_id,
               COALESCE(SUM(s.cantidad_bultos), 0)::INTEGER AS total_bultos,
               COALESCE(SUM(s.total_kg), 0)::NUMERIC(12,2) AS total_kg
        FROM stock_posiciones s
        JOIN productos pr ON pr.id = s.producto_id AND pr.activo = TRUE
        GROUP BY pr.cliente_id
      )
      SELECT c.id AS cliente_id,
             c.nombre AS cliente_nombre,
             COALESCE(epc.cantidad_especies, 0) AS cantidad_especies,
             COALESCE(ppc.cantidad_productos, 0) AS cantidad_productos,
             COALESCE(spc.total_bultos, 0) AS total_bultos,
             COALESCE(spc.total_kg, 0)::NUMERIC(12,2) AS total_kg
      FROM clientes c
      LEFT JOIN especies_por_cliente epc ON epc.cliente_id = c.id
      LEFT JOIN productos_por_cliente ppc ON ppc.cliente_id = c.id
      LEFT JOIN stock_por_cliente spc ON spc.cliente_id = c.id
      ORDER BY c.nombre
    `);
    res.json(result.rows.map((r) => ({
      cliente_id: r.cliente_id,
      cliente_nombre: r.cliente_nombre,
      cantidad_especies: Number(r.cantidad_especies) || 0,
      cantidad_productos: Number(r.cantidad_productos) || 0,
      total_bultos: Number(r.total_bultos) || 0,
      total_kg: Number(r.total_kg) || 0,
    })));
  } catch (error) {
    console.error('Error resumen por cliente:', error);
    res.status(500).json({ message: 'Error al obtener resumen por cliente' });
  }
});

/**
 * GET /api/stock
 * Inventario consolidado por producto.
 * Query: almacen_id, carril_id, nivel_id, posicion_id, especie_id, cliente_id, q
 */
router.get('/', async (req, res) => {
  try {
    const { almacen_id, carril_id, nivel_id, posicion_id, especie_id, cliente_id, q, limit = 50, offset = 0 } = req.query;
    const limitNum = Math.min(parseInt(limit, 10) || 50, 500);
    const offsetNum = Math.max(0, parseInt(offset, 10) || 0);

    let query = `
      WITH stock_agg AS (
        SELECT 
          s.producto_id,
          SUM(s.cantidad_bultos)::INTEGER AS total_bultos,
          SUM(CASE WHEN COALESCE(s.total_kg, 0) > 0 THEN s.total_kg ELSE COALESCE(s.total_kg, 0) + COALESCE(s.peso_adicional, 0) END)::NUMERIC(12,2) AS total_kg,
          COALESCE(SUM(s.peso_adicional), 0)::NUMERIC(12,2) AS total_peso_adicional,
          COUNT(s.id)::INTEGER AS cantidad_registros
        FROM stock_posiciones s
        JOIN posiciones p ON p.id = s.posicion_id
        JOIN niveles n ON n.id = p.nivel_id
        JOIN carriles c ON c.id = n.carril_id
        JOIN almacenes a ON a.id = c.almacen_id
        WHERE 1=1
    `;
    const params = [];
    let n = 1;

    if (almacen_id) {
      query += ` AND a.id = $${n}`;
      params.push(almacen_id);
      n++;
    }
    if (carril_id) {
      query += ` AND c.id = $${n}`;
      params.push(carril_id);
      n++;
    }
    if (nivel_id) {
      query += ` AND n.id = $${n}`;
      params.push(nivel_id);
      n++;
    }
    if (posicion_id) {
      query += ` AND p.id = $${n}`;
      params.push(posicion_id);
      n++;
    }

    query += `
      GROUP BY s.producto_id
      ),
      prod AS (
        SELECT pr.id, pr.codigo, pr.producto, pr.descripcion, pr.presentacion,
               e.nombre AS especie_nombre, c.nombre AS cliente_nombre
        FROM productos pr
        JOIN especies e ON e.id = pr.especie_id
        JOIN clientes c ON c.id = pr.cliente_id
        WHERE pr.activo = TRUE
    `;

    if (especie_id) {
      query += ` AND pr.especie_id = $${n}`;
      params.push(especie_id);
      n++;
    }
    if (cliente_id) {
      query += ` AND pr.cliente_id = $${n}`;
      params.push(cliente_id);
      n++;
    }
    if (q && q.trim()) {
      query += ` AND (pr.codigo ILIKE $${n} OR pr.producto ILIKE $${n} OR pr.descripcion ILIKE $${n})`;
      params.push(`%${q.trim()}%`);
      n++;
    }

    query += `
      )
      SELECT * FROM (
        SELECT 
          p.id AS producto_id,
          p.codigo,
          p.producto AS producto_nombre,
          p.descripcion,
          p.presentacion,
          p.especie_nombre,
          p.cliente_nombre,
          COALESCE(sa.total_bultos, 0) AS total_bultos,
          COALESCE(sa.total_kg, 0) AS total_kg,
          COALESCE(sa.total_peso_adicional, 0) AS total_peso_adicional,
          COALESCE(sa.cantidad_registros, 0) AS cantidad_registros
        FROM prod p
        LEFT JOIN stock_agg sa ON sa.producto_id = p.id
        WHERE (COALESCE(sa.total_bultos, 0) > 0 OR COALESCE(sa.total_kg, 0) > 0 OR COALESCE(sa.total_peso_adicional, 0) > 0)
        ORDER BY p.codigo
      ) AS paginated
      LIMIT $${n} OFFSET $${n + 1}
    `;
    const countParams = [...params];
    params.push(limitNum, offsetNum);
    const ci = (v) => (v ? 1 : 0);
    const locCount = ci(almacen_id) + ci(carril_id) + ci(nivel_id) + ci(posicion_id);
    const i2 = 1 + locCount;
    const i3 = i2 + ci(especie_id);
    const i4 = i3 + ci(cliente_id);

    let countStockWhere = 'WHERE 1=1';
    let countN = 1;
    if (almacen_id) { countStockWhere += ` AND a.id = $${countN}`; countN++; }
    if (carril_id) { countStockWhere += ` AND c.id = $${countN}`; countN++; }
    if (nivel_id) { countStockWhere += ` AND n.id = $${countN}`; countN++; }
    if (posicion_id) { countStockWhere += ` AND p.id = $${countN}`; countN++; }

    const countResult = await pool.query(
      `WITH stock_agg AS (
        SELECT s.producto_id, SUM(s.cantidad_bultos)::INTEGER AS total_bultos,
               COALESCE(SUM(s.total_kg), 0)::NUMERIC(12,2) AS total_kg,
               COALESCE(SUM(s.peso_adicional), 0)::NUMERIC(12,2) AS total_peso_adicional
        FROM stock_posiciones s
        JOIN posiciones p ON p.id = s.posicion_id
        JOIN niveles n ON n.id = p.nivel_id
        JOIN carriles c ON c.id = n.carril_id
        JOIN almacenes a ON a.id = c.almacen_id
        ${countStockWhere}
        GROUP BY s.producto_id
      ),
      prod AS (
        SELECT pr.id FROM productos pr
        JOIN especies e ON e.id = pr.especie_id
        JOIN clientes c ON c.id = pr.cliente_id
        WHERE pr.activo = TRUE
        ${especie_id ? ` AND pr.especie_id = $${i2}` : ''}
        ${cliente_id ? ` AND pr.cliente_id = $${i3}` : ''}
        ${q && q.trim() ? ` AND (pr.codigo ILIKE $${i4} OR pr.producto ILIKE $${i4} OR pr.descripcion ILIKE $${i4})` : ''}
      )
      SELECT COUNT(*) AS total FROM prod p
      LEFT JOIN stock_agg sa ON sa.producto_id = p.id
      WHERE (COALESCE(sa.total_bultos, 0) > 0 OR COALESCE(sa.total_kg, 0) > 0 OR COALESCE(sa.total_peso_adicional, 0) > 0)`,
      countParams
    );
    const total = parseInt(countResult.rows[0]?.total, 10) || 0;

    const result = await pool.query(query, params);
    const productos = result.rows;

    if (productos.length === 0) {
      return res.json({ data: [], total });
    }

    const productoIds = productos.map((r) => r.producto_id);

    const ubicaParams = [productoIds];
    let ubicaWhere = 'WHERE s.producto_id = ANY($1)';
    let u = 2;
    if (almacen_id) { ubicaWhere += ` AND a.id = $${u}`; ubicaParams.push(almacen_id); u++; }
    if (carril_id) { ubicaWhere += ` AND c.id = $${u}`; ubicaParams.push(carril_id); u++; }
    if (nivel_id) { ubicaWhere += ` AND n.id = $${u}`; ubicaParams.push(nivel_id); u++; }
    if (posicion_id) { ubicaWhere += ` AND pos.id = $${u}`; ubicaParams.push(posicion_id); u++; }
    const ubicaResult = await pool.query(
      `SELECT 
        s.id AS stock_posicion_id,
        s.producto_id,
        s.cantidad_bultos,
        s.peso_adicional,
        s.total_kg,
        a.id AS almacen_id,
        a.nombre AS almacen_nombre,
        c.id AS carril_id,
        c.nombre AS carril_nombre,
        n.numero_nivel,
        pos.nombre AS posicion_nombre,
        pos.id AS posicion_id,
        pos.numero_posicion
       FROM stock_posiciones s
       JOIN posiciones pos ON pos.id = s.posicion_id
       JOIN niveles n ON n.id = pos.nivel_id
       JOIN carriles c ON c.id = n.carril_id
       JOIN almacenes a ON a.id = c.almacen_id
       ${ubicaWhere}
       ORDER BY s.producto_id, a.nombre, c.nombre, n.numero_nivel, pos.numero_posicion`,
      ubicaParams
    );

    const ubicaPorProducto = new Map();
    for (const row of ubicaResult.rows) {
      const bultos = Number(row.cantidad_bultos) || 0;
      const totalKg = Number(row.total_kg) || 0;
      const pesoAdj = Number(row.peso_adicional) || 0;
      if (bultos === 0 && totalKg === 0 && pesoAdj === 0) continue;
      const key = row.producto_id;
      if (!ubicaPorProducto.has(key)) ubicaPorProducto.set(key, []);
      ubicaPorProducto.get(key).push({
        stock_posicion_id: row.stock_posicion_id,
        almacen_id: row.almacen_id,
        almacen_nombre: row.almacen_nombre,
        carril_id: row.carril_id,
        carril_nombre: row.carril_nombre,
        numero_nivel: row.numero_nivel,
        posicion_nombre: row.posicion_nombre,
        posicion_id: row.posicion_id,
        numero_posicion: row.numero_posicion,
        cantidad_bultos: bultos,
        peso_adicional: pesoAdj,
        total_kg: totalKg,
      });
    }

    const response = productos.map((prod) => ({
      producto_id: prod.producto_id,
      codigo: prod.codigo,
      producto_nombre: prod.producto_nombre,
      descripcion: prod.descripcion,
      presentacion: prod.presentacion,
      especie_nombre: prod.especie_nombre,
      cliente_nombre: prod.cliente_nombre,
      total_bultos: Number(prod.total_bultos),
      total_kg: Number(prod.total_kg),
      total_peso_adicional: Number(prod.total_peso_adicional) || 0,
      cantidad_registros: Number(prod.cantidad_registros),
      ubicaciones: ubicaPorProducto.get(prod.producto_id) || [],
    }));

    res.json({ data: response, total });
  } catch (error) {
    console.error('Error listando stock:', error);
    res.status(500).json({ message: 'Error al listar el inventario' });
  }
});

/**
 * GET /api/stock/lineas
 * Lista plana: una fila por cada registro en stock_posiciones (para selector en despachos).
 * Query: cliente_id, especie_id, q, almacen_id, carril_id, nivel_id, posicion_id (filtros por ubicación)
 */
router.get('/lineas', async (req, res) => {
  try {
    const { cliente_id, especie_id, q, almacen_id, carril_id, nivel_id, posicion_id } = req.query;
    let query = `
      SELECT s.id AS stock_posicion_id,
             pr.id AS producto_id,
             pr.codigo,
             pr.producto AS producto_nombre,
             pr.descripcion,
             pr.presentacion,
             pr.formato,
             pr.unidad_medida,
             c.nombre AS cliente_nombre,
             e.nombre AS especie_nombre,
             s.lote,
             s.cantidad_bultos,
             s.total_kg,
             COALESCE(s.peso_adicional, 0) AS peso_adicional,
             a.nombre AS almacen_nombre,
             car.nombre AS carril_nombre,
             n.numero_nivel,
             pos.numero_posicion
      FROM stock_posiciones s
      JOIN productos pr ON pr.id = s.producto_id
      JOIN clientes c ON c.id = pr.cliente_id
      JOIN especies e ON e.id = pr.especie_id
      JOIN posiciones pos ON pos.id = s.posicion_id
      JOIN niveles n ON n.id = pos.nivel_id
      JOIN carriles car ON car.id = n.carril_id
      JOIN almacenes a ON a.id = car.almacen_id
      WHERE pr.activo = TRUE
        AND (s.cantidad_bultos > 0 OR s.total_kg > 0 OR COALESCE(s.peso_adicional, 0) > 0)
    `;
    const params = [];
    let n = 1;
    if (cliente_id) {
      query += ` AND pr.cliente_id = $${n}`;
      params.push(cliente_id);
      n++;
    }
    if (especie_id) {
      query += ` AND pr.especie_id = $${n}`;
      params.push(especie_id);
      n++;
    }
    if (q && q.trim()) {
      query += ` AND (pr.codigo ILIKE $${n} OR pr.producto ILIKE $${n} OR pr.descripcion ILIKE $${n})`;
      params.push(`%${q.trim()}%`);
      n++;
    }
    if (almacen_id) {
      query += ` AND a.id = $${n}`;
      params.push(almacen_id);
      n++;
    }
    if (carril_id) {
      query += ` AND car.id = $${n}`;
      params.push(carril_id);
      n++;
    }
    if (nivel_id) {
      query += ` AND n.id = $${n}`;
      params.push(nivel_id);
      n++;
    }
    if (posicion_id) {
      query += ` AND pos.id = $${n}`;
      params.push(posicion_id);
      n++;
    }
    query += ' ORDER BY pr.codigo, a.nombre, car.nombre, n.numero_nivel, pos.numero_posicion LIMIT 500';
    const result = await pool.query(query, params);
    res.json(result.rows.map((r) => ({
      stock_posicion_id: r.stock_posicion_id,
      producto_id: r.producto_id,
      codigo: r.codigo,
      producto_nombre: r.producto_nombre,
      descripcion: r.descripcion || '',
      presentacion: r.presentacion || '',
      formato: Number(r.formato),
      unidad_medida: r.unidad_medida || 'KG',
      lote: r.lote || '',
      cliente_nombre: r.cliente_nombre,
      especie_nombre: r.especie_nombre,
      cantidad_bultos: Number(r.cantidad_bultos),
      total_kg: Number(r.total_kg),
      peso_adicional: Number(r.peso_adicional) || 0,
      ubicacion: `${r.almacen_nombre} → ${r.carril_nombre} → N${r.numero_nivel} → P${r.numero_posicion}`,
    })));
  } catch (error) {
    console.error('Error listando stock líneas:', error);
    res.status(500).json({ message: 'Error al listar stock' });
  }
});

export default router;
