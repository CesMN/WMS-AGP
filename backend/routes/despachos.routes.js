import express from 'express';
import { pool } from '../config/database.js';
import { authenticateToken, checkPermission, checkRole } from '../middleware/auth.middleware.js';
import { emitirNotificacion } from '../utils/notificaciones.js';

const router = express.Router();
router.use(authenticateToken);

const TIPOS_SALIDA = ['Embarque', 'Venta Local', 'Reempaque', 'Reproceso', 'Etiquetado', 'Muestreo', 'Otros'];

const getRestriccionProductosDespacho = async (client, despachoId) => {
  const cab = await client.query(
    `SELECT id, tipo_salida, TRIM(COALESCE(estado, '')) AS estado, TRIM(COALESCE(orden_produccion, '')) AS orden_produccion
     FROM despachos
     WHERE id = $1`,
    [despachoId]
  );
  if (cab.rows.length === 0) return null;
  const row = cab.rows[0];
  const op = String(row.orden_produccion || '').trim();
  /** Solo aplica resaltado / restricción por OP mientras el despacho se puede editar (en curso). */
  const despachoEnCurso = String(row.estado || '').trim() === 'Registrado';
  if (String(row.tipo_salida || '') !== 'Embarque' || !op) {
    return { activa: false, orden_produccion: op, productos: [], ids: new Set(), codigos: new Set() };
  }

  const productosQ = await client.query(
    `SELECT p.id AS producto_id,
            TRIM(COALESCE(p.codigo, '')) AS codigo,
            COALESCE(SUM(oel.cantidad_solicitada), 0)::NUMERIC AS requerido_bultos
     FROM ordenes_exportacion oe
     JOIN ordenes_exportacion_lineas oel ON oel.orden_exportacion_id = oe.id
     JOIN productos p ON p.id = oel.producto_id
     WHERE TRIM(COALESCE(oe.numero_op, '')) = $1
     GROUP BY p.id, TRIM(COALESCE(p.codigo, ''))`,
    [op]
  );
  const productos = productosQ.rows || [];
  return {
    activa: despachoEnCurso && productos.length > 0,
    orden_produccion: op,
    productos,
    ids: new Set(productos.map((p) => p.producto_id).filter(Boolean)),
    codigos: new Set(productos.map((p) => String(p.codigo || '').trim()).filter(Boolean)),
  };
};

/**
 * GET /api/despachos
 * Listado con filtros: estado, fecha_desde, fecha_hasta, cliente_destino, especie_id, producto_id
 * Devuelve total_bultos, total_kg, productos [{ codigo, descripcion }], especie_nombre
 */
router.get('/', async (req, res) => {
  try {
    const { estado, fecha_desde, fecha_hasta, cliente_destino, especie_id, producto_id, limit, offset } = req.query;
    const limitNum = Math.min(parseInt(limit, 10) || 50, 500);
    const offsetNum = Math.max(0, parseInt(offset, 10) || 0);

    const baseWhere = [];
    const params = [];
    let n = 1;
    if (estado) {
      baseWhere.push(`d.estado = $${n}`);
      params.push(estado);
      n++;
    }
    if (fecha_desde) {
      baseWhere.push(`d.fecha_salida >= $${n}`);
      params.push(fecha_desde);
      n++;
    }
    if (fecha_hasta) {
      baseWhere.push(`d.fecha_salida <= $${n}`);
      params.push(fecha_hasta);
      n++;
    }
    if (cliente_destino && cliente_destino.trim()) {
      baseWhere.push(`d.cliente_destino ILIKE $${n}`);
      params.push(`%${cliente_destino.trim()}%`);
      n++;
    }
    if (especie_id) {
      baseWhere.push(`EXISTS (
        SELECT 1 FROM despacho_detalles dd
        JOIN stock_posiciones s ON s.id = dd.stock_posicion_id
        JOIN productos p ON p.id = s.producto_id
        WHERE dd.despacho_id = d.id AND p.especie_id = $${n}
      )`);
      params.push(especie_id);
      n++;
    }
    if (producto_id) {
      baseWhere.push(`EXISTS (
        SELECT 1 FROM despacho_detalles dd
        JOIN stock_posiciones s ON s.id = dd.stock_posicion_id
        WHERE dd.despacho_id = d.id AND s.producto_id = $${n}
      )`);
      params.push(producto_id);
      n++;
    }
    const whereClause = baseWhere.length ? `AND ${baseWhere.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT COUNT(*) AS total FROM despachos d JOIN usuarios u ON u.id = d.usuario_id WHERE 1=1 ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.total, 10) || 0;

    const query = `
      SELECT d.id, d.movimiento_id, d.tipo_salida, d.fecha_salida, d.guia_salida, d.cliente_destino, d.pais_destino, d.cliente_origen_id, d.estado, d.usuario_id, d.created_at,
             u.nombre AS usuario_nombre,
             c_origen.nombre AS cliente_origen_nombre
      FROM despachos d
      JOIN usuarios u ON u.id = d.usuario_id
      LEFT JOIN clientes c_origen ON c_origen.id = d.cliente_origen_id
      WHERE 1=1 ${whereClause}
      ORDER BY d.created_at DESC
      LIMIT $${n} OFFSET $${n + 1}`;
    params.push(limitNum, offsetNum);
    const result = await pool.query(query, params);

    const lista = [];
    for (const row of result.rows) {
      let totales;
      if (row.movimiento_id) {
        totales = await pool.query(
          `SELECT COALESCE(SUM(md.cantidad_bultos), 0)::NUMERIC(14, 2) AS total_bultos,
                  COALESCE(SUM(md.total_kg), 0)::NUMERIC(12,2) AS total_kg
           FROM movimiento_detalles md WHERE md.movimiento_id = $1`,
          [row.movimiento_id]
        );
      } else {
        totales = await pool.query(
          `SELECT COALESCE(SUM(dd.cantidad_bultos), 0)::NUMERIC(14, 2) AS total_bultos,
                  COALESCE(SUM(dd.total_kg), 0)::NUMERIC(12,2) AS total_kg
           FROM despacho_detalles dd WHERE dd.despacho_id = $1`,
          [row.id]
        );
      }
      let productosResp;
      let especiesResp;
      if (row.movimiento_id) {
        productosResp = await pool.query(
          `SELECT p.codigo, p.descripcion, md.stock_posicion_id, md.cantidad_bultos,
                  (SELECT sp.lote FROM stock_posiciones sp WHERE sp.id = md.stock_posicion_id LIMIT 1) AS lote
           FROM movimiento_detalles md JOIN productos p ON p.id = md.producto_id WHERE md.movimiento_id = $1`,
          [row.movimiento_id]
        );
        especiesResp = await pool.query(
          `SELECT DISTINCT e.nombre FROM movimiento_detalles md JOIN productos p ON p.id = md.producto_id JOIN especies e ON e.id = p.especie_id WHERE md.movimiento_id = $1`,
          [row.movimiento_id]
        );
      } else {
        productosResp = await pool.query(
          `SELECT p.codigo, p.descripcion, s.lote, s.id AS stock_posicion_id, dd.cantidad_bultos
           FROM despacho_detalles dd
           JOIN stock_posiciones s ON s.id = dd.stock_posicion_id
           JOIN productos p ON p.id = s.producto_id
           WHERE dd.despacho_id = $1`,
          [row.id]
        );
        especiesResp = await pool.query(
          `SELECT DISTINCT e.nombre FROM despacho_detalles dd JOIN stock_posiciones s ON s.id = dd.stock_posicion_id JOIN productos p ON p.id = s.producto_id JOIN especies e ON e.id = p.especie_id WHERE dd.despacho_id = $1`,
          [row.id]
        );
      }
      const especies = especiesResp.rows.map((r) => r.nombre);
      lista.push({
        ...row,
        cliente_origen_nombre: row.cliente_origen_nombre || null,
        referencia_salida: row.guia_salida || '-',
        total_bultos: Number(totales.rows[0]?.total_bultos) || 0,
        total_kg: Number(totales.rows[0]?.total_kg) || 0,
        productos: productosResp.rows.map((r) => ({
          codigo: r.codigo,
          descripcion: r.descripcion || '',
          lote: r.lote || '',
          stock_posicion_id: r.stock_posicion_id || null,
          cantidad_bultos: Number(r.cantidad_bultos) || 0,
        })),
        especie_nombre: especies.length > 1 ? 'Varias' : especies[0] || '-',
      });
    }
    res.json({ data: lista, total });
  } catch (error) {
    console.error('Error listando despachos:', error);
    res.status(500).json({ message: 'Error al listar despachos' });
  }
});

/**
 * PATCH /api/despachos/sincronizar-fecha-referencia
 * Sincroniza fecha_salida en despachos registrados creados desde "Listos para despacho".
 * Body: { orden_produccion, referencia, fecha_salida }
 */
router.patch('/sincronizar-fecha-referencia', async (req, res) => {
  try {
    const ordenProduccion = String(req.body?.orden_produccion || '').trim();
    const referencia = String(req.body?.referencia || '').trim();
    const fechaSalida = String(req.body?.fecha_salida || '').trim().slice(0, 10);

    if (!ordenProduccion || !referencia || !/^\d{4}-\d{2}-\d{2}$/.test(fechaSalida)) {
      return res.status(400).json({ message: 'orden_produccion, referencia y fecha_salida (YYYY-MM-DD) son requeridos' });
    }

    const up = await pool.query(
      `UPDATE despachos d
       SET fecha_salida = $1, updated_at = CURRENT_TIMESTAMP
       WHERE d.estado = 'Registrado'
         AND d.tipo_salida = 'Embarque'
         AND TRIM(COALESCE(d.orden_produccion, '')) = $2
         AND COALESCE(d.observaciones, '') ILIKE $3`,
      [fechaSalida, ordenProduccion, `%Referencia: ${referencia}%`]
    );

    res.json({
      message: up.rowCount > 0
        ? `Fecha sincronizada en ${up.rowCount} despacho(s) registrado(s)`
        : 'No se encontraron despachos registrados para sincronizar con esta referencia',
      actualizados: up.rowCount || 0,
    });
  } catch (error) {
    console.error('Error sincronizando fecha de despacho por referencia:', error);
    res.status(500).json({ message: 'Error al sincronizar fecha en despachos' });
  }
});

/**
 * GET /api/despachos/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const cab = await pool.query(
      `SELECT d.*, u.nombre AS usuario_nombre, c_origen.nombre AS cliente_origen_nombre
       FROM despachos d
       JOIN usuarios u ON u.id = d.usuario_id
       LEFT JOIN clientes c_origen ON c_origen.id = d.cliente_origen_id
       WHERE d.id = $1`,
      [id]
    );
    if (cab.rows.length === 0) {
      return res.status(404).json({ message: 'Despacho no encontrado' });
    }
    const despacho = cab.rows[0];
    if (despacho.cliente_origen_nombre !== undefined) {
      despacho.cliente_origen_nombre = despacho.cliente_origen_nombre || null;
    }
    let lineas = [];
    let total_bultos_despacho = null;
    let total_kg_despacho = null;
    let total_adicional_despacho = null;
    if (despacho.movimiento_id) {
      const totalesMov = await pool.query(
        `SELECT COALESCE(SUM(md.cantidad_bultos), 0)::NUMERIC(14, 2) AS total_bultos,
                COALESCE(SUM(md.total_kg), 0)::NUMERIC(12,2) AS total_kg,
                COALESCE(SUM(md.peso_adicional), 0)::NUMERIC(12,2) AS total_adicional
         FROM movimiento_detalles md WHERE md.movimiento_id = $1`,
        [despacho.movimiento_id]
      );
      total_bultos_despacho = Number(totalesMov.rows[0]?.total_bultos) || 0;
      total_kg_despacho = Number(totalesMov.rows[0]?.total_kg) || 0;
      total_adicional_despacho = Number(totalesMov.rows[0]?.total_adicional) || 0;

      const FACTOR_LB_A_KG = 2.2046;
      const movDet = await pool.query(
        `SELECT md.id, md.producto_id, md.cantidad_bultos, md.total_kg, md.peso_adicional, md.stock_posicion_id,
                p.codigo AS producto_codigo, p.producto AS producto_nombre, p.descripcion AS producto_descripcion, p.presentacion AS producto_presentacion,
                p.formato AS formato_producto, p.unidad_medida AS unidad_medida_producto,
                a.nombre AS almacen_nombre, c.nombre AS carril_nombre, n.numero_nivel, pos.numero_posicion,
                sp.lote
         FROM movimiento_detalles md
         JOIN productos p ON p.id = md.producto_id
         LEFT JOIN stock_posiciones sp ON sp.id = md.stock_posicion_id
         LEFT JOIN almacenes a ON a.id = md.almacen_id
         LEFT JOIN carriles c ON c.id = md.carril_id
         LEFT JOIN niveles n ON n.id = md.nivel_id
         LEFT JOIN posiciones pos ON pos.id = md.posicion_id
         WHERE md.movimiento_id = $1 ORDER BY md.id`,
        [despacho.movimiento_id]
      );
      lineas = movDet.rows.map((r) => {
        const bultos = Number(r.cantidad_bultos) || 0;
        const adicional = Number(r.peso_adicional) || 0;
        const formato = parseFloat(r.formato_producto != null ? r.formato_producto : r.formato) || 0;
        const rawUnidad = r.unidad_medida_producto != null ? r.unidad_medida_producto : (r.unidad_medida || 'KG');
        const unidadMedida = String(rawUnidad).toUpperCase();
        let kgBultos = bultos * formato;
        if (unidadMedida === 'LB') kgBultos = kgBultos / FACTOR_LB_A_KG;
        const totalKgLinea = Math.round((kgBultos + adicional) * 100) / 100;
        return {
          id: r.id,
          cantidad_bultos: bultos,
          total_kg: totalKgLinea,
          peso_adicional: adicional,
          formato,
          unidad_medida: unidadMedida,
          producto_codigo: r.producto_codigo,
          producto_nombre: r.producto_nombre,
          producto_descripcion: r.producto_descripcion || '',
          producto_presentacion: r.producto_presentacion || '',
          ubicacion: r.almacen_nombre ? `${r.almacen_nombre} → ${r.carril_nombre} → N${r.numero_nivel} → P${r.numero_posicion}` : '-',
          lote: r.lote || '',
        };
      });
    } else {
      const dd = await pool.query(
        `SELECT dd.id, dd.stock_posicion_id, dd.cantidad_bultos, dd.total_kg, dd.peso_adicional,
                s.cantidad_bultos AS stock_cantidad_bultos, s.total_kg AS stock_total_kg, s.lote,
                p.codigo AS producto_codigo, p.producto AS producto_nombre, p.descripcion AS producto_descripcion,
                p.formato, p.unidad_medida,
                a.nombre AS almacen_nombre, c.nombre AS carril_nombre, n.numero_nivel, pos.numero_posicion
         FROM despacho_detalles dd
         JOIN stock_posiciones s ON s.id = dd.stock_posicion_id
         JOIN productos p ON p.id = s.producto_id
         JOIN posiciones pos ON pos.id = s.posicion_id
         JOIN niveles n ON n.id = pos.nivel_id
         JOIN carriles c ON c.id = n.carril_id
         JOIN almacenes a ON a.id = c.almacen_id
         WHERE dd.despacho_id = $1 ORDER BY dd.id`,
        [id]
      );
      lineas = dd.rows.map((r) => ({
        id: r.id,
        stock_posicion_id: r.stock_posicion_id,
        cantidad_bultos: Number(r.cantidad_bultos),
        total_kg: Number(r.total_kg),
        peso_adicional: Number(r.peso_adicional) || 0,
        stock_cantidad_bultos: r.stock_cantidad_bultos != null ? Number(r.stock_cantidad_bultos) : null,
        stock_total_kg: r.stock_total_kg != null ? Number(r.stock_total_kg) : null,
        lote: r.lote || '',
        formato: Number(r.formato),
        unidad_medida: r.unidad_medida || 'KG',
        producto_codigo: r.producto_codigo,
        producto_nombre: r.producto_nombre,
        producto_descripcion: r.producto_descripcion || '',
        ubicacion: `${r.almacen_nombre} → ${r.carril_nombre} → N${r.numero_nivel} → P${r.numero_posicion}`,
      }));
    }
    const payload = { ...despacho, lineas };
    if (total_bultos_despacho != null) payload.total_bultos_despacho = total_bultos_despacho;
    if (total_kg_despacho != null) payload.total_kg_despacho = total_kg_despacho;
    if (total_adicional_despacho != null) payload.total_adicional_despacho = total_adicional_despacho;
    res.json(payload);
  } catch (error) {
    console.error('Error obteniendo despacho:', error);
    res.status(500).json({ message: 'Error al obtener el despacho' });
  }
});

/**
 * GET /api/despachos/:id/productos-requeridos
 * Devuelve codigos/ids permitidos cuando el despacho es Embarque con OP.
 */
router.get('/:id/productos-requeridos', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const restriccion = await getRestriccionProductosDespacho(client, id);
    if (!restriccion) return res.status(404).json({ message: 'Despacho no encontrado' });
    res.json({
      activa: !!restriccion.activa,
      orden_produccion: restriccion.orden_produccion || '',
      productos: restriccion.productos.map((p) => ({
        producto_id: p.producto_id,
        codigo: p.codigo,
        requerido_bultos: Number(p.requerido_bultos) || 0,
      })),
    });
  } catch (error) {
    console.error('Error obteniendo productos requeridos del despacho:', error);
    res.status(500).json({ message: 'Error al obtener productos requeridos' });
  } finally {
    client.release();
  }
});

/**
 * POST /api/despachos - Crear con estado Registrado (no descuenta stock)
 */
router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    const usuario_id = req.user.id;
    const body = req.body;
    const { tipo_salida, lineas, ...resto } = body;

    if (!tipo_salida || !TIPOS_SALIDA.includes(tipo_salida)) {
      return res.status(400).json({ message: 'tipo_salida es requerido y debe ser uno de: ' + TIPOS_SALIDA.join(', ') });
    }
    const lineasArray = Array.isArray(lineas) ? lineas : [];

    await client.query('BEGIN');

    for (const linea of lineasArray) {
      const { stock_posicion_id, cantidad_bultos, peso_adicional } = linea;
      const bultos = typeof cantidad_bultos === 'number' ? Math.floor(cantidad_bultos) : parseInt(cantidad_bultos, 10);
      const adicional = Number(peso_adicional) || 0;
      if (!stock_posicion_id || (isNaN(bultos) || bultos < 0)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Cada línea debe tener stock_posicion_id y cantidad_bultos >= 0' });
      }
      if (bultos === 0 && adicional <= 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Cada línea debe tener al menos cantidad_bultos > 0 o peso_adicional > 0' });
      }
      if (adicional < 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'El saldo (peso_adicional) no puede ser negativo' });
      }
      const stock = await client.query(
        'SELECT id, cantidad_bultos, total_kg FROM stock_posiciones WHERE id = $1',
        [stock_posicion_id]
      );
      if (stock.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Stock no encontrado en una de las líneas' });
      }
      const s = stock.rows[0];
      if (bultos > Number(s.cantidad_bultos)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: `Stock insuficiente: disponible ${s.cantidad_bultos} bultos` });
      }
    }

    const insDespacho = await client.query(
      `INSERT INTO despachos (tipo_salida, fecha_salida, orden_produccion, cliente_destino, cliente_origen_id, pais_destino, destino, contenedor, guia_salida, observaciones, estado, usuario_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Registrado', $11)
       RETURNING id`,
      [
        tipo_salida,
        resto.fecha_salida || null,
        resto.orden_produccion || null,
        resto.cliente_destino || null,
        resto.cliente_origen_id || null,
        resto.pais_destino || null,
        resto.destino || null,
        resto.contenedor || null,
        resto.guia_salida || null,
        resto.observaciones || null,
        usuario_id,
      ]
    );
    const despachoId = insDespacho.rows[0].id;

    const FACTOR_LB_A_KG = 2.2046;
    for (const linea of lineasArray) {
      const { stock_posicion_id, cantidad_bultos, peso_adicional } = linea;
      const bultos = Math.max(0, typeof cantidad_bultos === 'number' ? Math.floor(cantidad_bultos) : parseInt(cantidad_bultos, 10) || 0);
      const adicional = Number(peso_adicional) || 0;
      const stock = await client.query(
        'SELECT s.cantidad_bultos, s.total_kg AS stock_total_kg, COALESCE(s.peso_adicional, 0) AS stock_peso_adicional, p.formato, p.unidad_medida FROM stock_posiciones s JOIN productos p ON p.id = s.producto_id WHERE s.id = $1',
        [stock_posicion_id]
      );
      const s = stock.rows[0];
      const formato = Number(s.formato) || 0;
      const unidadMedida = (s.unidad_medida || 'KG').toUpperCase();
      let kgBultos = bultos * formato;
      if (unidadMedida === 'LB') kgBultos = kgBultos / FACTOR_LB_A_KG;
      const totalKgLinea = kgBultos + adicional;
      const stockTotalKg = (Number(s.stock_total_kg) || 0) + (Number(s.stock_peso_adicional) || 0);
      if (totalKgLinea > stockTotalKg) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: `La salida total (${totalKgLinea.toFixed(2)} kg) no puede superar el stock disponible (${stockTotalKg.toFixed(2)} kg) en una de las líneas` });
      }
      if (totalKgLinea <= 0) continue;
      await client.query(
        `INSERT INTO despacho_detalles (despacho_id, stock_posicion_id, cantidad_bultos, total_kg, peso_adicional) VALUES ($1, $2, $3, $4, $5)`,
        [despachoId, stock_posicion_id, bultos, totalKgLinea, adicional]
      );
    }

    await client.query('COMMIT');
    try {
      await emitirNotificacion(pool, {
        tipo: 'despacho_creado',
        modulo: 'Despachos',
        severidad: 'info',
        titulo: `Despacho creado (${tipo_salida})`,
        mensaje: `Estado inicial: Registrado.`,
        origen_tabla: 'despachos',
        origen_id: despachoId,
        metadata: { despacho_id: despachoId, tipo_salida, usuario_id, lineas: lineasArray.length },
      });
    } catch (eNotif) {
      console.warn('Notificación despacho_creado:', eNotif.message);
    }
    res.status(201).json({ id: despachoId, message: 'Despacho registrado correctamente', estado: 'Registrado' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creando despacho:', error);
    res.status(500).json({ message: 'Error al crear el despacho' });
  } finally {
    client.release();
  }
});

/**
 * PUT /api/despachos/:id - Actualizar solo si estado = Registrado
 */
router.put('/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const usuario_id = req.user.id;
    const body = req.body;
    const { tipo_salida, lineas, ...resto } = body;

    const cab = await client.query('SELECT id, estado FROM despachos WHERE id = $1', [id]);
    if (cab.rows.length === 0) {
      return res.status(404).json({ message: 'Despacho no encontrado' });
    }
    if (cab.rows[0].estado !== 'Registrado') {
      return res.status(403).json({ message: 'Solo se puede editar un despacho con estado Registrado' });
    }

    if (!tipo_salida || !TIPOS_SALIDA.includes(tipo_salida)) {
      return res.status(400).json({ message: 'tipo_salida inválido' });
    }
    const lineasArray = Array.isArray(lineas) ? lineas : [];

    await client.query('BEGIN');

    for (const linea of lineasArray) {
      const { stock_posicion_id, cantidad_bultos, peso_adicional } = linea;
      const bultos = typeof cantidad_bultos === 'number' ? Math.floor(cantidad_bultos) : parseInt(cantidad_bultos, 10);
      const adicional = Number(peso_adicional) || 0;
      if (!stock_posicion_id || (isNaN(bultos) || bultos < 0)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Cada línea debe tener stock_posicion_id y cantidad_bultos >= 0' });
      }
      if (bultos === 0 && adicional <= 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Cada línea debe tener al menos cantidad_bultos > 0 o peso_adicional > 0' });
      }
      if (adicional < 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'El saldo (peso_adicional) no puede ser negativo' });
      }
      const stock = await client.query('SELECT cantidad_bultos FROM stock_posiciones WHERE id = $1', [stock_posicion_id]);
      if (stock.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Stock no encontrado en una de las líneas' });
      }
      if (bultos > Number(stock.rows[0].cantidad_bultos)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Stock insuficiente en una de las líneas' });
      }
    }

    await client.query(
      `UPDATE despachos SET tipo_salida = $1, fecha_salida = $2, orden_produccion = $3, cliente_destino = $4, cliente_origen_id = $5, pais_destino = $6, destino = $7, contenedor = $8, guia_salida = $9, observaciones = $10, updated_at = CURRENT_TIMESTAMP WHERE id = $11`,
      [
        tipo_salida,
        resto.fecha_salida || null,
        resto.orden_produccion || null,
        resto.cliente_destino || null,
        resto.cliente_origen_id || null,
        resto.pais_destino || null,
        resto.destino || null,
        resto.contenedor || null,
        resto.guia_salida || null,
        resto.observaciones || null,
        id,
      ]
    );
    await client.query('DELETE FROM despacho_detalles WHERE despacho_id = $1', [id]);

    const FACTOR_LB_A_KG = 2.2046;
    for (const linea of lineasArray) {
      const { stock_posicion_id, cantidad_bultos, peso_adicional } = linea;
      const bultos = Math.max(0, typeof cantidad_bultos === 'number' ? Math.floor(cantidad_bultos) : parseInt(cantidad_bultos, 10) || 0);
      const adicional = Number(peso_adicional) || 0;
      const stock = await client.query(
        'SELECT s.cantidad_bultos, s.total_kg AS stock_total_kg, COALESCE(s.peso_adicional, 0) AS stock_peso_adicional, p.formato, p.unidad_medida FROM stock_posiciones s JOIN productos p ON p.id = s.producto_id WHERE s.id = $1',
        [stock_posicion_id]
      );
      const s = stock.rows[0];
      const formato = Number(s.formato) || 0;
      const unidadMedida = (s.unidad_medida || 'KG').toUpperCase();
      let kgBultos = bultos * formato;
      if (unidadMedida === 'LB') kgBultos = kgBultos / FACTOR_LB_A_KG;
      const totalKgLinea = kgBultos + adicional;
      const stockTotalKg = (Number(s.stock_total_kg) || 0) + (Number(s.stock_peso_adicional) || 0);
      if (totalKgLinea > stockTotalKg) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: `La salida total (${totalKgLinea.toFixed(2)} kg) no puede superar el stock disponible (${stockTotalKg.toFixed(2)} kg) en una de las líneas` });
      }
      if (totalKgLinea <= 0) continue;
      await client.query(
        `INSERT INTO despacho_detalles (despacho_id, stock_posicion_id, cantidad_bultos, total_kg, peso_adicional) VALUES ($1, $2, $3, $4, $5)`,
        [id, stock_posicion_id, bultos, totalKgLinea, adicional]
      );
    }

    await client.query('COMMIT');
    res.json({ message: 'Despacho actualizado correctamente' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error actualizando despacho:', error);
    res.status(500).json({ message: 'Error al actualizar el despacho' });
  } finally {
    client.release();
  }
});

const FACTOR_LB_A_KG = 2.2046;

async function crearFilaSaldoStock(client, stockOrigenId, bultosSaldo, kgSaldo) {
  const saldoBultos = Number(bultosSaldo) || 0;
  const saldoKg = Number(kgSaldo) || 0;
  if (saldoBultos <= 0 && saldoKg <= 0) return null;

  const base = await client.query(
    `SELECT posicion_id, producto_id, lote, referencia, fecha_ingreso
     FROM stock_posiciones
     WHERE id = $1`,
    [stockOrigenId]
  );
  if (base.rows.length === 0) return null;
  const b = base.rows[0];

  const ins = await client.query(
    `INSERT INTO stock_posiciones
      (posicion_id, producto_id, lote, referencia, fecha_ingreso, cantidad_bultos, peso_adicional, total_kg)
     VALUES ($1, $2, $3, $4, $5, $6, 0, $7)
     RETURNING id`,
    [b.posicion_id, b.producto_id, b.lote || null, b.referencia, b.fecha_ingreso, saldoBultos, saldoKg]
  );
  return ins.rows[0]?.id || null;
}

async function compactarStockCompatibles(client, stockId) {
  const base = await client.query(
    `SELECT posicion_id, producto_id, lote, referencia, fecha_ingreso
     FROM stock_posiciones
     WHERE id = $1`,
    [stockId]
  );
  if (base.rows.length === 0) return;
  const b = base.rows[0];

  const rows = await client.query(
    `SELECT s.id, s.cantidad_bultos, s.total_kg, COALESCE(s.peso_adicional, 0) AS peso_adicional
     FROM stock_posiciones s
     LEFT JOIN despacho_detalles dd ON dd.stock_posicion_id = s.id
     WHERE s.posicion_id = $1
       AND s.producto_id = $2
       AND s.lote IS NOT DISTINCT FROM $3
       AND s.referencia = $4
       AND s.fecha_ingreso = $5
       AND dd.id IS NULL
     ORDER BY s.created_at, s.id`,
    [b.posicion_id, b.producto_id, b.lote || null, b.referencia, b.fecha_ingreso]
  );
  if (rows.rows.length <= 1) return;

  const keepId = rows.rows[0].id;
  const totalBultos = rows.rows.reduce((acc, r) => acc + (Number(r.cantidad_bultos) || 0), 0);
  const totalKg = rows.rows.reduce((acc, r) => acc + (Number(r.total_kg) || 0), 0);
  const totalAdic = rows.rows.reduce((acc, r) => acc + (Number(r.peso_adicional) || 0), 0);
  const eliminarIds = rows.rows.slice(1).map((r) => r.id);

  await client.query(
    `UPDATE stock_posiciones
     SET cantidad_bultos = $1, total_kg = $2, peso_adicional = $3, updated_at = CURRENT_TIMESTAMP
     WHERE id = $4`,
    [totalBultos, totalKg, totalAdic, keepId]
  );
  if (eliminarIds.length > 0) {
    await client.query('DELETE FROM stock_posiciones WHERE id = ANY($1::uuid[])', [eliminarIds]);
  }
}

function calcularTotalKg(client, stock_posicion_id, bultos, peso_adicional) {
  return client.query(
    'SELECT s.cantidad_bultos, s.total_kg AS stock_total_kg, COALESCE(s.peso_adicional, 0) AS stock_peso_adicional, p.formato, p.unidad_medida FROM stock_posiciones s JOIN productos p ON p.id = s.producto_id WHERE s.id = $1',
    [stock_posicion_id]
  ).then((r) => {
    if (r.rows.length === 0) return null;
    const s = r.rows[0];
    const formato = Number(s.formato) || 0;
    const unidadMedida = (s.unidad_medida || 'KG').toUpperCase();
    let kgBultos = bultos * formato;
    if (unidadMedida === 'LB') kgBultos = kgBultos / FACTOR_LB_A_KG;
    const stockKg = Number(s.stock_total_kg) || 0;
    const stockPesoAdj = Number(s.stock_peso_adicional) || 0;
    return { totalKg: kgBultos + (Number(peso_adicional) || 0), stockTotalKg: stockKg + stockPesoAdj };
  });
}

/**
 * POST /api/despachos/:id/lineas - Agregar líneas a un despacho (estado = Registrado)
 * Body: { lineas: [{ stock_posicion_id, cantidad_bultos?, peso_adicional? }] }
 */
router.post('/:id/lineas', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { lineas } = req.body;
    if (!Array.isArray(lineas) || lineas.length === 0) {
      return res.status(400).json({ message: 'Debe enviar al menos una línea' });
    }

    const cab = await client.query('SELECT id, estado FROM despachos WHERE id = $1', [id]);
    if (cab.rows.length === 0) {
      return res.status(404).json({ message: 'Despacho no encontrado' });
    }
    if (cab.rows[0].estado !== 'Registrado') {
      return res.status(403).json({ message: 'Solo se pueden agregar líneas a un despacho con estado Registrado' });
    }

    const existentes = await client.query('SELECT stock_posicion_id FROM despacho_detalles WHERE despacho_id = $1', [id]);
    const idsEnDespacho = new Set(existentes.rows.map((r) => r.stock_posicion_id));
    const restriccion = await getRestriccionProductosDespacho(client, id);

    await client.query('BEGIN');

    for (const linea of lineas) {
      const stock_posicion_id = linea.stock_posicion_id;
      const bultos = Math.max(0, typeof linea.cantidad_bultos === 'number' ? Math.floor(linea.cantidad_bultos) : parseInt(linea.cantidad_bultos, 10) || 0);
      const adicional = Number(linea.peso_adicional) || 0;
      if (!stock_posicion_id) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Cada línea debe tener stock_posicion_id' });
      }
      if (bultos === 0 && adicional <= 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Cada línea debe tener cantidad_bultos > 0 o peso_adicional > 0' });
      }
      if (idsEnDespacho.has(stock_posicion_id)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: `El stock ${stock_posicion_id} ya está en este despacho` });
      }
      const stock = await client.query(
        `SELECT s.id, s.cantidad_bultos, s.producto_id, TRIM(COALESCE(p.codigo, '')) AS producto_codigo
         FROM stock_posiciones s
         LEFT JOIN productos p ON p.id = s.producto_id
         WHERE s.id = $1`,
        [stock_posicion_id]
      );
      if (restriccion?.activa && !restriccion.ids.has(stock.rows[0].producto_id)) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          message: `Producto no requerido para esta OP (${stock.rows[0].producto_codigo || 'sin código'}).`,
        });
      }

      if (stock.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Stock no encontrado en una de las líneas' });
      }
      if (bultos > Number(stock.rows[0].cantidad_bultos)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Stock insuficiente en una de las líneas' });
      }

      const calc = await calcularTotalKg(client, stock_posicion_id, bultos, adicional);
      if (!calc || calc.totalKg > calc.stockTotalKg) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'La salida total no puede superar el stock disponible en una de las líneas' });
      }
      if (calc.totalKg <= 0) continue;

      await client.query(
        `INSERT INTO despacho_detalles (despacho_id, stock_posicion_id, cantidad_bultos, total_kg, peso_adicional) VALUES ($1, $2, $3, $4, $5)`,
        [id, stock_posicion_id, bultos, calc.totalKg, adicional]
      );
      idsEnDespacho.add(stock_posicion_id);
    }

    await client.query('COMMIT');
    res.status(201).json({ message: 'Líneas agregadas correctamente' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error agregando líneas al despacho:', error);
    res.status(500).json({ message: 'Error al agregar líneas' });
  } finally {
    client.release();
  }
});

/**
 * POST /api/despachos/:id/agregar-posicion - Agregar toda una posición (todos los stock) al despacho
 * Body: { posicion_id }
 */
router.post('/:id/agregar-posicion', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { posicion_id } = req.body;
    if (!posicion_id) {
      return res.status(400).json({ message: 'posicion_id es requerido' });
    }

    const cab = await client.query('SELECT id, estado FROM despachos WHERE id = $1', [id]);
    if (cab.rows.length === 0) {
      return res.status(404).json({ message: 'Despacho no encontrado' });
    }
    if (cab.rows[0].estado !== 'Registrado') {
      return res.status(403).json({ message: 'Solo se pueden agregar líneas a un despacho con estado Registrado' });
    }

    const restriccion = await getRestriccionProductosDespacho(client, id);

    const stockEnPosicion = await client.query(
      `SELECT s.id AS stock_posicion_id, s.cantidad_bultos, s.total_kg, s.peso_adicional,
              s.producto_id, TRIM(COALESCE(p.codigo, '')) AS producto_codigo
       FROM stock_posiciones s
       LEFT JOIN productos p ON p.id = s.producto_id
       WHERE s.posicion_id = $1`,
      [posicion_id]
    );
    const stockFiltrado = restriccion?.activa
      ? stockEnPosicion.rows.filter((s) => restriccion.ids.has(s.producto_id))
      : stockEnPosicion.rows;
    const noPermitidos = restriccion?.activa
      ? stockEnPosicion.rows.filter((s) => !restriccion.ids.has(s.producto_id))
      : [];
    if (restriccion?.activa && stockFiltrado.length === 0) {
      const codigosNoReq = [...new Set(noPermitidos.map((x) => x.producto_codigo).filter(Boolean))].join(', ');
      return res.status(400).json({
        message: `No hay productos requeridos de la OP en esta posición. Detectados no requeridos: ${codigosNoReq || 'sin código'}.`,
      });
    }

    if (stockEnPosicion.rows.length === 0) {
      return res.status(404).json({ message: 'No hay stock en esa posición' });
    }

    const existentes = await client.query('SELECT stock_posicion_id FROM despacho_detalles WHERE despacho_id = $1', [id]);
    const idsEnDespacho = new Set(existentes.rows.map((r) => r.stock_posicion_id));

    await client.query('BEGIN');

    let agregadas = 0;
    for (const s of stockFiltrado) {
      const stock_posicion_id = s.stock_posicion_id;
      if (idsEnDespacho.has(stock_posicion_id)) continue;
      const bultos = Math.max(0, Number(s.cantidad_bultos) || 0);
      const adicional = Math.max(0, Number(s.peso_adicional) || 0);
      const totalKg = Number(s.total_kg) || 0;
      if (bultos === 0 && totalKg <= 0) continue;
      await client.query(
        `INSERT INTO despacho_detalles (despacho_id, stock_posicion_id, cantidad_bultos, total_kg, peso_adicional) VALUES ($1, $2, $3, $4, $5)`,
        [id, stock_posicion_id, bultos, totalKg, adicional]
      );
      idsEnDespacho.add(stock_posicion_id);
      agregadas++;
    }

    await client.query('COMMIT');
    const codigosNoReq = [...new Set(noPermitidos.map((x) => x.producto_codigo).filter(Boolean))];
    const msgBase = agregadas > 0
      ? `Se agregaron ${agregadas} línea(s) al despacho`
      : 'No había stock nuevo en la posición para agregar';
    const msgFinal = restriccion?.activa && codigosNoReq.length > 0
      ? `${msgBase}. Se omitieron productos no requeridos: ${codigosNoReq.join(', ')}.`
      : msgBase;
    res.json({ message: msgFinal, agregadas, omitidas_no_requeridas: codigosNoReq.length });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error agregando posición al despacho:', error);
    res.status(500).json({ message: 'Error al agregar posición' });
  } finally {
    client.release();
  }
});

/**
 * PUT /api/despachos/:id/lineas - Actualizar cantidad_bultos y peso_adicional de todas las líneas (estado = Registrado)
 * Body: { lineas: [{ id: lineaId, cantidad_bultos, peso_adicional }] }
 */
router.put('/:id/lineas', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { lineas } = req.body || {};

    const cab = await client.query('SELECT id, estado FROM despachos WHERE id = $1', [id]);
    if (cab.rows.length === 0) {
      return res.status(404).json({ message: 'Despacho no encontrado' });
    }
    if (cab.rows[0].estado !== 'Registrado') {
      return res.status(403).json({ message: 'Solo se puede editar líneas en un despacho con estado Registrado' });
    }

    if (!Array.isArray(lineas) || lineas.length === 0) {
      return res.status(400).json({ message: 'Debe enviar lineas como array con al menos una línea' });
    }

    await client.query('BEGIN');

    for (const item of lineas) {
      const { id: lineaId, cantidad_bultos, peso_adicional } = item;
      if (!lineaId) continue;

      const linea = await client.query(
        'SELECT dd.id, dd.stock_posicion_id, dd.cantidad_bultos FROM despacho_detalles dd WHERE dd.id = $1 AND dd.despacho_id = $2',
        [lineaId, id]
      );
      if (linea.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: `Línea ${lineaId} no pertenece a este despacho` });
      }
      const stock_posicion_id = linea.rows[0].stock_posicion_id;

      let bultos = 0;
      if (typeof cantidad_bultos === 'number' && !Number.isNaN(cantidad_bultos)) {
        bultos = Math.max(0, Math.floor(cantidad_bultos));
      } else if (cantidad_bultos !== undefined && cantidad_bultos !== null && cantidad_bultos !== '') {
        bultos = Math.max(0, parseInt(String(cantidad_bultos), 10) || 0);
      }
      const adicional = Math.max(0, Number(peso_adicional) || 0);

      const stock = await client.query(
        'SELECT s.id, s.cantidad_bultos, s.total_kg AS stock_total_kg, COALESCE(s.peso_adicional, 0) AS stock_peso_adicional, p.formato, p.unidad_medida FROM stock_posiciones s JOIN productos p ON p.id = s.producto_id WHERE s.id = $1',
        [stock_posicion_id]
      );
      if (stock.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Stock no encontrado en una de las líneas' });
      }
      const s = stock.rows[0];
      const maxBultos = Number(s.cantidad_bultos) || 0;
      const stockTotalKg = (Number(s.stock_total_kg) || 0) + (Number(s.stock_peso_adicional) || 0);
      if (bultos > maxBultos) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: `Bultos no puede superar el stock disponible (${maxBultos}) en una línea` });
      }

      const formato = Number(s.formato) || 0;
      const unidadMedida = (s.unidad_medida || 'KG').toUpperCase();
      let kgBultos = bultos * formato;
      if (unidadMedida === 'LB') kgBultos = kgBultos / FACTOR_LB_A_KG;
      const totalKg = kgBultos + adicional;
      if (totalKg > stockTotalKg) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: `El total (kg) no puede superar el stock disponible en una de las líneas` });
      }
      if (totalKg <= 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Cada línea debe tener cantidad_bultos > 0 o peso_adicional > 0' });
      }

      await client.query(
        'UPDATE despacho_detalles SET cantidad_bultos = $1, total_kg = $2, peso_adicional = $3 WHERE id = $4 AND despacho_id = $5',
        [bultos, totalKg, adicional, lineaId, id]
      );

      const stockActualBultos = Number(s.cantidad_bultos) || 0;
      if (bultos < stockActualBultos) {
        const kgDisponible = (Number(s.stock_total_kg) || 0) + (Number(s.stock_peso_adicional) || 0);
        const kgSaldo = Math.max(0, kgDisponible - totalKg);
        const bultosSaldo = Math.max(0, stockActualBultos - bultos);
        await client.query(
          `UPDATE stock_posiciones
           SET cantidad_bultos = $1, total_kg = $2, peso_adicional = 0, updated_at = CURRENT_TIMESTAMP
           WHERE id = $3`,
          [bultos, totalKg, stock_posicion_id]
        );
        await crearFilaSaldoStock(client, stock_posicion_id, bultosSaldo, kgSaldo);
      }
    }

    await client.query('COMMIT');
    res.json({ message: 'Cambios guardados correctamente' });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('Error actualizando líneas del despacho:', error);
    res.status(500).json({ message: error.message || 'Error al guardar los cambios' });
  } finally {
    client.release();
  }
});

/**
 * PATCH /api/despachos/:id/lineas/:lineaId - Actualizar cantidad_bultos y peso_adicional de una línea (estado = Registrado)
 * Body: { cantidad_bultos?, peso_adicional? }
 */
router.patch('/:id/lineas/:lineaId', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id, lineaId } = req.params;
    const body = req.body || {};
    const cantidad_bultos = body.cantidad_bultos;
    const peso_adicional = body.peso_adicional;

    const cab = await client.query('SELECT id, estado FROM despachos WHERE id = $1', [id]);
    if (cab.rows.length === 0) {
      return res.status(404).json({ message: 'Despacho no encontrado' });
    }
    if (cab.rows[0].estado !== 'Registrado') {
      return res.status(403).json({ message: 'Solo se puede editar líneas en un despacho con estado Registrado' });
    }

    const linea = await client.query(
      'SELECT dd.id, dd.stock_posicion_id, dd.cantidad_bultos FROM despacho_detalles dd WHERE dd.id = $1 AND dd.despacho_id = $2',
      [lineaId, id]
    );
    if (linea.rows.length === 0) {
      return res.status(404).json({ message: 'Línea no encontrada en este despacho' });
    }
    const stock_posicion_id = linea.rows[0].stock_posicion_id;

    let bultos = 0;
    if (typeof cantidad_bultos === 'number' && !Number.isNaN(cantidad_bultos)) {
      bultos = Math.max(0, Math.floor(cantidad_bultos));
    } else if (cantidad_bultos !== undefined && cantidad_bultos !== null && cantidad_bultos !== '') {
      bultos = Math.max(0, parseInt(String(cantidad_bultos), 10) || 0);
    }
    const adicional = Math.max(0, Number(peso_adicional) || 0);

    const stock = await client.query(
      'SELECT s.id, s.cantidad_bultos, s.total_kg AS stock_total_kg, COALESCE(s.peso_adicional, 0) AS stock_peso_adicional, p.formato, p.unidad_medida FROM stock_posiciones s JOIN productos p ON p.id = s.producto_id WHERE s.id = $1',
      [stock_posicion_id]
    );
    if (stock.rows.length === 0) {
      return res.status(400).json({ message: 'Stock no encontrado' });
    }
    const s = stock.rows[0];
    const maxBultos = Number(s.cantidad_bultos) || 0;
    const stockTotalKg = (Number(s.stock_total_kg) || 0) + (Number(s.stock_peso_adicional) || 0);
    if (bultos > maxBultos) {
      return res.status(400).json({ message: `Bultos no puede superar el stock disponible (${maxBultos})` });
    }

    const formato = Number(s.formato) || 0;
    const unidadMedida = (s.unidad_medida || 'KG').toUpperCase();
    let kgBultos = bultos * formato;
    if (unidadMedida === 'LB') kgBultos = kgBultos / FACTOR_LB_A_KG;
    const totalKg = kgBultos + adicional;
    if (totalKg > stockTotalKg) {
      return res.status(400).json({ message: `El total (kg) no puede superar el stock disponible (${stockTotalKg.toFixed(2)} kg)` });
    }
    if (totalKg <= 0) {
      return res.status(400).json({ message: 'La línea debe tener cantidad_bultos > 0 o peso_adicional > 0' });
    }

    await client.query('BEGIN');
    try {
      await client.query(
        'UPDATE despacho_detalles SET cantidad_bultos = $1, total_kg = $2, peso_adicional = $3 WHERE id = $4 AND despacho_id = $5',
        [bultos, totalKg, adicional, lineaId, id]
      );

      const stockActualBultos = Number(s.cantidad_bultos) || 0;
      if (bultos < stockActualBultos) {
        const kgDisponible = (Number(s.stock_total_kg) || 0) + (Number(s.stock_peso_adicional) || 0);
        const kgSaldo = Math.max(0, kgDisponible - totalKg);
        const bultosSaldo = Math.max(0, stockActualBultos - bultos);
        await client.query(
          `UPDATE stock_posiciones
           SET cantidad_bultos = $1, total_kg = $2, peso_adicional = 0, updated_at = CURRENT_TIMESTAMP
           WHERE id = $3`,
          [bultos, totalKg, stock_posicion_id]
        );
        await crearFilaSaldoStock(client, stock_posicion_id, bultosSaldo, kgSaldo);
      }

      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    }
    res.json({ message: 'Línea actualizada', cantidad_bultos: bultos, total_kg: totalKg, peso_adicional: adicional });
  } catch (error) {
    console.error('Error actualizando línea del despacho:', error);
    res.status(500).json({ message: 'Error al actualizar la línea' });
  } finally {
    client.release();
  }
});

/**
 * DELETE /api/despachos/:id/lineas/:lineaId - Quitar una línea del despacho (estado = Registrado)
 */
router.delete('/:id/lineas/:lineaId', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id, lineaId } = req.params;

    const cab = await client.query('SELECT id, estado FROM despachos WHERE id = $1', [id]);
    if (cab.rows.length === 0) {
      return res.status(404).json({ message: 'Despacho no encontrado' });
    }
    if (cab.rows[0].estado !== 'Registrado') {
      return res.status(403).json({ message: 'Solo se puede quitar líneas de un despacho con estado Registrado' });
    }

    await client.query('BEGIN');
    const del = await client.query(
      'DELETE FROM despacho_detalles WHERE id = $1 AND despacho_id = $2 RETURNING id, stock_posicion_id',
      [lineaId, id]
    );
    if (del.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Línea no encontrada en este despacho' });
    }
    const stockId = del.rows[0]?.stock_posicion_id || null;
    if (stockId) await compactarStockCompatibles(client, stockId);
    await client.query('COMMIT');
    res.json({ message: 'Línea eliminada del despacho' });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('Error eliminando línea del despacho:', error);
    res.status(500).json({ message: 'Error al eliminar la línea' });
  } finally {
    client.release();
  }
});

/**
 * PATCH /api/despachos/:id/reabrir - Reabrir despacho (solo Admin): vuelve a Registrado, devuelve stock y restaura líneas
 */
router.patch('/:id/reabrir', checkPermission('exportaciones.despachos', 'operate'), async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    const cab = await client.query('SELECT id, estado, movimiento_id, tipo_salida, orden_produccion FROM despachos WHERE id = $1', [id]);
    if (cab.rows.length === 0) {
      return res.status(404).json({ message: 'Despacho no encontrado' });
    }
    if (cab.rows[0].estado !== 'Despachado') {
      return res.status(400).json({ message: 'Solo se puede reabrir un despacho que esté en estado Despachado' });
    }
    const movimientoId = cab.rows[0].movimiento_id;
    if (!movimientoId) {
      return res.status(400).json({ message: 'El despacho no tiene movimiento asociado' });
    }

    const detalles = await client.query(
      `SELECT id, stock_posicion_id, cantidad_bultos, total_kg, peso_adicional
       FROM movimiento_detalles WHERE movimiento_id = $1 ORDER BY id`,
      [movimientoId]
    );
    if (detalles.rows.length === 0) {
      return res.status(400).json({ message: 'No hay detalles de movimiento para revertir' });
    }

    const sinPosicion = detalles.rows.filter((d) => !d.stock_posicion_id);
    if (sinPosicion.length > 0) {
      return res.status(400).json({
        message: 'No se puede reabrir: falta referencia de stock en una o más líneas del movimiento. Contacte al administrador.',
      });
    }

    await client.query('BEGIN');

    await client.query('DELETE FROM despacho_detalles WHERE despacho_id = $1', [id]);

    for (const md of detalles.rows) {
      const bultos = Number(md.cantidad_bultos) || 0;
      const totalKg = Number(md.total_kg) || 0;
      const adicional = Number(md.peso_adicional) || 0;
      await client.query(
        `UPDATE stock_posiciones SET cantidad_bultos = cantidad_bultos + $1, total_kg = total_kg + $2, peso_adicional = peso_adicional + $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4`,
        [bultos, totalKg, adicional, md.stock_posicion_id]
      );
      await client.query(
        `INSERT INTO despacho_detalles (despacho_id, stock_posicion_id, cantidad_bultos, total_kg, peso_adicional) VALUES ($1, $2, $3, $4, $5)`,
        [id, md.stock_posicion_id, bultos, totalKg, adicional]
      );
    }

    await client.query(
      'UPDATE despachos SET estado = $1, movimiento_id = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
      ['Registrado', null, id]
    );

    if (String(cab.rows[0]?.tipo_salida || '') === 'Embarque' && String(cab.rows[0]?.orden_produccion || '').trim()) {
      await client.query(
        `UPDATE ordenes_exportacion
         SET estado = CASE WHEN estado IN ('Completo', 'Embarcado') THEN 'En producción' ELSE estado END,
             notificado_at = CASE WHEN estado IN ('Completo', 'Embarcado') THEN NULL ELSE notificado_at END,
             updated_at = CURRENT_TIMESTAMP
         WHERE TRIM(COALESCE(numero_op, '')) = $1`,
        [String(cab.rows[0].orden_produccion).trim()]
      ).catch(() => {});
    }

    await client.query('COMMIT');
    try {
      await emitirNotificacion(pool, {
        tipo: 'despacho_reabierto',
        modulo: 'Despachos',
        severidad: 'warning',
        titulo: 'Despacho reabierto',
        mensaje: 'Se revirtió un despacho a estado Registrado.',
        origen_tabla: 'despachos',
        origen_id: id,
        metadata: { despacho_id: id, usuario_id: req.user?.id || null },
      });
    } catch (eNotif) {
      console.warn('Notificación despacho_reabierto:', eNotif.message);
    }
    res.json({ message: 'Despacho reabierto correctamente. Puede editar y volver a dar salida.', estado: 'Registrado' });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {}
    console.error('Error reabriendo despacho:', error);
    res.status(500).json({ message: error.message || 'Error al reabrir el despacho' });
  } finally {
    client.release();
  }
});

/**
 * PATCH /api/despachos/:id/estado - Cambiar a Despachado (descuenta stock y crea movimiento)
 */
router.patch('/:id/estado', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { estado } = req.body;
    const guiaSalidaReq = String(req.body?.guia_salida || '').trim();
    const contenedorReq = String(req.body?.contenedor || '').trim();
    const fechaSalidaBody = req.body?.fecha_salida;
    const usuario_id = req.user.id;

    if (estado !== 'Despachado') {
      return res.status(400).json({ message: 'Solo se puede cambiar a estado Despachado' });
    }

    const cab = await client.query('SELECT id, estado, tipo_salida, guia_salida, destino, fecha_salida, orden_produccion FROM despachos WHERE id = $1', [id]);
    if (cab.rows.length === 0) {
      return res.status(404).json({ message: 'Despacho no encontrado' });
    }
    if (cab.rows[0].estado !== 'Registrado') {
      return res.status(400).json({ message: 'El despacho ya está despachado' });
    }

    const toDateStr = (v) => {
      if (v == null) return null;
      if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
      const s = String(v).trim().slice(0, 10);
      return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
    };
    let fechaSalidaFinal = toDateStr(cab.rows[0].fecha_salida);
    if (fechaSalidaBody != null && String(fechaSalidaBody).trim() !== '') {
      const raw = toDateStr(fechaSalidaBody);
      if (raw) fechaSalidaFinal = raw;
    }
    if (!fechaSalidaFinal) {
      fechaSalidaFinal = new Date().toISOString().slice(0, 10);
    }
    if (!contenedorReq) {
      return res.status(400).json({ message: 'El número de contenedor es obligatorio para finalizar el despacho' });
    }
    if (!guiaSalidaReq) {
      return res.status(400).json({ message: 'La guía de salida es obligatoria para finalizar el despacho' });
    }

    const countLineas = await client.query('SELECT COUNT(*) AS c FROM despacho_detalles WHERE despacho_id = $1', [id]);
    if (parseInt(countLineas.rows[0]?.c, 10) === 0) {
      return res.status(400).json({ message: 'No se puede dar salida a un despacho sin líneas. Agregue productos al despacho.' });
    }

    await client.query('BEGIN');

    const FACTOR_LB_A_KG = 2.2046;
    const detalles = await client.query(
      `SELECT dd.stock_posicion_id, dd.cantidad_bultos, dd.total_kg, dd.peso_adicional,
              s.producto_id, s.posicion_id, s.cantidad_bultos AS stock_bultos, s.total_kg AS stock_total_kg, s.peso_adicional AS stock_peso_adicional,
              p.formato, p.unidad_medida,
              n.id AS nivel_id, n.carril_id, c.almacen_id
       FROM despacho_detalles dd
       LEFT JOIN stock_posiciones s ON s.id = dd.stock_posicion_id
       LEFT JOIN productos p ON p.id = s.producto_id
       LEFT JOIN posiciones pos ON pos.id = s.posicion_id
       LEFT JOIN niveles n ON n.id = pos.nivel_id
       LEFT JOIN carriles c ON c.id = n.carril_id
       WHERE dd.despacho_id = $1`,
      [id]
    );

    if (String(cab.rows[0]?.tipo_salida || '') === 'Embarque' && String(cab.rows[0]?.orden_produccion || '').trim()) {
      const op = String(cab.rows[0].orden_produccion).trim();
      const requeridosQ = await client.query(
        `SELECT oel.producto_id, TRIM(COALESCE(p.codigo, '')) AS codigo,
                COALESCE(SUM(oel.cantidad_solicitada), 0)::NUMERIC AS requerido_bultos
         FROM ordenes_exportacion oe
         JOIN ordenes_exportacion_lineas oel ON oel.orden_exportacion_id = oe.id
         JOIN productos p ON p.id = oel.producto_id
         WHERE TRIM(COALESCE(oe.numero_op, '')) = $1
         GROUP BY oel.producto_id, TRIM(COALESCE(p.codigo, ''))`,
        [op]
      );
      const reqMap = new Map(
        requeridosQ.rows.map((r) => [String(r.producto_id), { codigo: String(r.codigo || ''), requerido: Number(r.requerido_bultos) || 0 }])
      );
      const enviadosQ = await client.query(
        `SELECT s.producto_id, COALESCE(SUM(dd.cantidad_bultos), 0)::NUMERIC AS enviado_bultos
         FROM despacho_detalles dd
         JOIN stock_posiciones s ON s.id = dd.stock_posicion_id
         WHERE dd.despacho_id = $1
         GROUP BY s.producto_id`,
        [id]
      );
      const excedidos = enviadosQ.rows
        .map((r) => {
          const pid = String(r.producto_id)
          const enviado = Number(r.enviado_bultos) || 0
          const req = reqMap.get(pid)
          const requerido = req ? Number(req.requerido) || 0 : 0
          return { codigo: req?.codigo || pid, enviado, requerido }
        })
        .filter((x) => x.enviado > x.requerido + 1e-6);
      if (excedidos.length > 0) {
        await client.query('ROLLBACK');
        const detalleExceso = excedidos.map((x) => `${x.codigo}: ${x.enviado} > ${x.requerido}`).join(' | ');
        return res.status(400).json({
          message: `No se puede finalizar: hay productos con bultos por encima de lo requerido en la OP. ${detalleExceso}`,
        });
      }
    }

    const lineasSinStock = detalles.rows.filter((d) => !d.stock_posicion_id || d.stock_bultos == null);
    if (lineasSinStock.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: 'No se puede dar salida: hay líneas cuya ubicación ya no tiene stock (otro despacho pudo haber consumido ese stock). Quite o reemplace esas líneas y vuelva a intentar.',
      });
    }

    for (const d of detalles.rows) {
      const stockBultos = Number(d.stock_bultos) || 0;
      const stockKg = Number(d.stock_total_kg) || 0;
      const stockPesoAdj = Number(d.stock_peso_adicional) || 0;
      const stockKgDisponible = stockKg + stockPesoAdj;
      const reqBultos = Number(d.cantidad_bultos) || 0;
      const reqKg = Number(d.total_kg) || 0;
      if (reqBultos > stockBultos || reqKg > stockKgDisponible) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          message: `No hay stock suficiente para completar el despacho. En una línea se solicitan ${reqBultos} bultos (${reqKg} kg) pero solo hay ${stockBultos} bultos (${stockKgDisponible.toFixed(2)} kg) disponibles. Otro despacho pudo haber consumido parte del stock. Ajuste las cantidades o quite la línea afectada.`,
        });
      }
    }

    const motivoSalida = guiaSalidaReq
      ? `Despacho ${cab.rows[0].tipo_salida} - Guía ${guiaSalidaReq}`
      : cab.rows[0].destino
      ? `Despacho ${cab.rows[0].tipo_salida} - ${cab.rows[0].destino}`
      : `Despacho ${cab.rows[0].tipo_salida}`;

    const movResult = await client.query(
      `INSERT INTO movimientos (tipo_movimiento, usuario_id, fecha_hora, motivo) VALUES ('Salida', $1, CURRENT_TIMESTAMP, $2) RETURNING id`,
      [usuario_id, motivoSalida]
    );
    const movimientoId = movResult.rows[0].id;

    for (const d of detalles.rows) {
      await client.query(
        `INSERT INTO movimiento_detalles (movimiento_id, producto_id, cantidad_bultos, total_kg, peso_adicional, almacen_id, carril_id, nivel_id, posicion_id, stock_posicion_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [movimientoId, d.producto_id, d.cantidad_bultos, d.total_kg, Number(d.peso_adicional) || 0, d.almacen_id, d.carril_id, d.nivel_id, d.posicion_id, d.stock_posicion_id]
      );

      const totalBultos = Number(d.stock_bultos) || 0;
      const despachoBultos = Number(d.cantidad_bultos) || 0;
      const stockPesoAdj = Number(d.stock_peso_adicional) || 0;
      const despachoPesoAdj = Number(d.peso_adicional) || 0;
      const saldoRestante = Math.max(0, stockPesoAdj - despachoPesoAdj);

      const vaciarStock = async () => {
        await client.query('DELETE FROM despacho_detalles WHERE despacho_id = $1 AND stock_posicion_id = $2', [id, d.stock_posicion_id]);
        await client.query(
          `UPDATE stock_posiciones SET cantidad_bultos = 0, total_kg = 0, peso_adicional = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
          [saldoRestante, d.stock_posicion_id]
        );
      };
      if (despachoBultos >= totalBultos) {
        await vaciarStock();
      } else {
        const totalKgRestante = Number(d.stock_total_kg) - Number(d.total_kg);
        if (totalKgRestante <= 0) {
          await vaciarStock();
        } else {
          const formato = Number(d.formato) || 0;
          const unidadMedida = (d.unidad_medida || 'KG').toUpperCase();
          let nuevoBultos = 0;
          let pesoAdicionalRestante = totalKgRestante;
          if (formato > 0) {
            let bultosEquivalentes = totalKgRestante;
            if (unidadMedida === 'LB') {
              bultosEquivalentes = (totalKgRestante * FACTOR_LB_A_KG) / formato;
            } else {
              bultosEquivalentes = totalKgRestante / formato;
            }
            nuevoBultos = Math.floor(bultosEquivalentes);
            let kgDeBultos = nuevoBultos * formato;
            if (unidadMedida === 'LB') kgDeBultos = kgDeBultos / FACTOR_LB_A_KG;
            pesoAdicionalRestante = Math.max(0, totalKgRestante - kgDeBultos);
          }
          const nuevoPesoAdj = saldoRestante + pesoAdicionalRestante;
          await client.query(
            `UPDATE stock_posiciones SET cantidad_bultos = $1, total_kg = $2, peso_adicional = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4`,
            [nuevoBultos, totalKgRestante, nuevoPesoAdj, d.stock_posicion_id]
          );
        }
      }
    }

    await client.query(
      'UPDATE despachos SET estado = $1, movimiento_id = $2, guia_salida = $3, contenedor = $4, fecha_salida = $5, updated_at = CURRENT_TIMESTAMP WHERE id = $6',
      ['Despachado', movimientoId, guiaSalidaReq, contenedorReq, fechaSalidaFinal, id]
    );

    // Si el despacho corresponde a una OP de exportación, avanzar estado a Embarcado.
    if (String(cab.rows[0]?.tipo_salida || '') === 'Embarque' && String(cab.rows[0]?.orden_produccion || '').trim()) {
      await client.query(
        `UPDATE ordenes_exportacion
         SET estado = 'Embarcado', updated_at = CURRENT_TIMESTAMP
         WHERE TRIM(COALESCE(numero_op, '')) = $1`,
        [String(cab.rows[0].orden_produccion).trim()]
      ).catch(() => {});
    }

    await client.query('COMMIT');
    try {
      await emitirNotificacion(pool, {
        tipo: 'despacho_despachado',
        modulo: 'Despachos',
        severidad: 'success',
        titulo: `Despacho realizado (${cab.rows[0]?.tipo_salida || 'Salida'})`,
        mensaje: `Guía: ${guiaSalidaReq}.`,
        origen_tabla: 'despachos',
        origen_id: id,
        metadata: { despacho_id: id, tipo_salida: cab.rows[0]?.tipo_salida, guia_salida: guiaSalidaReq, usuario_id },
      });
    } catch (eNotif) {
      console.warn('Notificación despacho_despachado:', eNotif.message);
    }
    res.json({ message: 'Los datos fueron registrados exitosamente', estado: 'Despachado' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error cambiando estado despacho:', error);
    const msg = error.message || 'Error al actualizar el estado';
    res.status(500).json({ message: msg });
  } finally {
    client.release();
  }
});

/**
 * DELETE /api/despachos/:id - Solo si estado = Registrado
 */
router.delete('/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const cab = await client.query('SELECT id, estado FROM despachos WHERE id = $1', [id]);
    if (cab.rows.length === 0) {
      return res.status(404).json({ message: 'Despacho no encontrado' });
    }
    if (cab.rows[0].estado !== 'Registrado') {
      return res.status(403).json({ message: 'Solo se puede eliminar un despacho con estado Registrado' });
    }
    const stockRows = await client.query(
      'SELECT stock_posicion_id FROM despacho_detalles WHERE despacho_id = $1',
      [id]
    );
    const stockIds = Array.from(new Set((stockRows.rows || []).map((r) => r.stock_posicion_id).filter(Boolean)));
    await client.query('BEGIN');
    await client.query('DELETE FROM despachos WHERE id = $1', [id]);
    for (const stockId of stockIds) {
      await compactarStockCompatibles(client, stockId);
    }
    await client.query('COMMIT');
    res.json({ message: 'Despacho eliminado correctamente' });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('Error eliminando despacho:', error);
    res.status(500).json({ message: 'Error al eliminar el despacho' });
  } finally {
    client.release();
  }
});

export default router;
