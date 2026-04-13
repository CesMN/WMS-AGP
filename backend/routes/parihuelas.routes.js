import express from 'express';
import { pool } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.middleware.js';

const router = express.Router();
router.use(authenticateToken);

const LB_A_KG = 2.2046;

const initTables = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS parihuelas_produccion (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      lote_id UUID NOT NULL REFERENCES lotes_produccion(id) ON DELETE CASCADE,
      empaque_id UUID REFERENCES empaque(id) ON DELETE SET NULL,
      producto_id UUID NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
      cantidad NUMERIC(12,2) NOT NULL DEFAULT 0,
      unidad_parihuela VARCHAR(20) NOT NULL DEFAULT 'BULTOS',
      es_completa BOOLEAN NOT NULL DEFAULT FALSE,
      estado VARCHAR(20) NOT NULL DEFAULT 'EN_TRANSITO',
      referencia VARCHAR(120),
      hora INTEGER,
      fecha_envio TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      usuario_empaque_id UUID REFERENCES usuarios(id),
      fecha_recepcion TIMESTAMP,
      usuario_almacen_id UUID REFERENCES usuarios(id),
      almacen_id UUID REFERENCES almacenes(id),
      carril_id UUID REFERENCES carriles(id),
      nivel_id UUID REFERENCES niveles(id),
      posicion_id UUID REFERENCES posiciones(id),
      stock_posicion_id UUID,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  const cols = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'parihuelas_produccion'`);
  const names = (cols.rows || []).map((r) => r.column_name);
  if (!names.includes('hora')) {
    await pool.query('ALTER TABLE parihuelas_produccion ADD COLUMN hora INTEGER');
  }
};

function descripcionPosicion(client, posicionId) {
  return client.query(
    `SELECT a.nombre AS almacen, c.nombre AS carril, n.numero_nivel, pos.numero_posicion
     FROM posiciones pos
     JOIN niveles n ON n.id = pos.nivel_id
     JOIN carriles c ON c.id = n.carril_id
     JOIN almacenes a ON a.id = c.almacen_id
     WHERE pos.id = $1`,
    [posicionId]
  ).then((r) => {
    if (r.rows.length === 0) return posicionId;
    const { almacen, carril, numero_nivel, numero_posicion } = r.rows[0];
    return `${almacen} → ${carril} → N${numero_nivel} → P${numero_posicion}`;
  });
}

// Crear parihuela(s) (desde Empaque). Si la cantidad supera la capacidad por parihuela, se generan varias (ej: 150 bultos con capacidad 50 → 3 parihuelas de 50).
router.post('/', async (req, res) => {
  try {
    await initTables();
    const usuario_id = req.user?.id;
    if (!usuario_id) return res.status(401).json({ message: 'Usuario no autenticado' });
    const { lote_id, empaque_id, producto_id, cantidad, unidad_parihuela, referencia, hora } = req.body;
    if (!lote_id || !producto_id) return res.status(400).json({ message: 'lote_id y producto_id son requeridos' });
    const cant = Number(cantidad);
    if (cant <= 0) return res.status(400).json({ message: 'La cantidad debe ser mayor a 0' });
    const horaNum = hora != null ? parseInt(hora, 10) : null;
    if (horaNum != null && (isNaN(horaNum) || horaNum < 0 || horaNum > 23)) {
      return res.status(400).json({ message: 'La hora debe estar entre 0 y 23' });
    }
    const unidad = (unidad_parihuela || 'BULTOS').toUpperCase() === 'CAJAS' ? 'CAJAS' : 'BULTOS';

    const prod = await pool.query(
      'SELECT id, capacidad_parihuela_bultos, capacidad_parihuela_cajas, unidad_parihuela AS prod_unidad FROM productos WHERE id = $1 AND activo = TRUE',
      [producto_id]
    );
    if (prod.rows.length === 0) return res.status(404).json({ message: 'Producto no encontrado' });
    const capBultos = Number(prod.rows[0].capacidad_parihuela_bultos) || 0;
    const capCajas = Number(prod.rows[0].capacidad_parihuela_cajas) || 0;
    const prodUnidad = (prod.rows[0].prod_unidad || 'BULTOS').toUpperCase();
    const capacidad = prodUnidad === 'CAJAS' ? capCajas : capBultos;

    const refBase = (referencia || '').trim() || null;
    const lotesAInsertar = [];

    if (capacidad > 0) {
      const fullCount = Math.floor(cant / capacidad);
      const remainder = cant - fullCount * capacidad;
      for (let i = 0; i < fullCount; i++) {
        lotesAInsertar.push({ cantidad: capacidad, es_completa: true });
      }
      if (remainder > 0) {
        lotesAInsertar.push({ cantidad: remainder, es_completa: false });
      }
    } else {
      lotesAInsertar.push({ cantidad: cant, es_completa: false });
    }

    const creadas = [];
    for (const item of lotesAInsertar) {
      const ins = await pool.query(
        `INSERT INTO parihuelas_produccion (lote_id, empaque_id, producto_id, cantidad, unidad_parihuela, es_completa, estado, referencia, hora, usuario_empaque_id)
         VALUES ($1, $2, $3, $4, $5, $6, 'EN_TRANSITO', $7, $8, $9)
         RETURNING id, lote_id, producto_id, cantidad, unidad_parihuela, es_completa, estado, referencia, hora, fecha_envio`,
        [lote_id, empaque_id || null, producto_id, item.cantidad, unidad, item.es_completa, refBase, horaNum, usuario_id]
      );
      const row = ins.rows[0];
      if (empaque_id && horaNum != null) {
        const horaKey = String(horaNum);
        await pool.query(
          `INSERT INTO empaque_detalle (empaque_id, producto_id, datos_horas)
           VALUES ($1, $2, $3::jsonb)
           ON CONFLICT (empaque_id, producto_id) DO UPDATE SET
             datos_horas = jsonb_set(
               COALESCE(empaque_detalle.datos_horas, '{}'),
               ARRAY[$4],
               to_jsonb(COALESCE((empaque_detalle.datos_horas->>$4)::numeric, 0) + $5)
             )`,
          [empaque_id, producto_id, JSON.stringify({ [horaKey]: item.cantidad }), horaKey, item.cantidad]
        );
      }
      const withProduct = await pool.query(
        `SELECT pp.*, p.codigo AS producto_codigo, p.producto AS producto_nombre, p.descripcion AS producto_descripcion, p.presentacion AS producto_presentacion
         FROM parihuelas_produccion pp JOIN productos p ON p.id = pp.producto_id WHERE pp.id = $1`,
        [row.id]
      );
      creadas.push(withProduct.rows[0]);
    }

    if (creadas.length === 1) {
      res.status(201).json(creadas[0]);
    } else {
      res.status(201).json(creadas);
    }
  } catch (error) {
    console.error('Error creando parihuela:', error);
    res.status(500).json({ message: 'Error al crear parihuela' });
  }
});

// Listar: ?estado=EN_TRANSITO | ALMACENADA | (vacío = ambos) | ?lote_id=xxx
router.get('/', async (req, res) => {
  try {
    await initTables();
    const { estado, lote_id, limit = 100, offset = 0 } = req.query;
    const limitNum = Math.min(parseInt(limit, 10) || 100, 500);
    const offsetNum = Math.max(0, parseInt(offset, 10) || 0);
    let where = 'WHERE 1=1';
    const params = [];
    let n = 1;
    if (estado && estado !== 'all') { where += ` AND pp.estado = $${n}`; params.push(estado); n++; }
    if (lote_id) { where += ` AND pp.lote_id = $${n}`; params.push(lote_id); n++; }

    const result = await pool.query(
      `SELECT pp.id, pp.lote_id, pp.empaque_id, pp.producto_id, pp.cantidad, pp.unidad_parihuela, pp.es_completa, pp.estado, pp.referencia, pp.hora, pp.fecha_envio, pp.fecha_recepcion, pp.created_at,
              lp.codigo AS lote_codigo, lp.estado AS lote_estado,
              p.codigo AS producto_codigo, p.producto AS producto_nombre, p.descripcion AS producto_descripcion, p.presentacion AS producto_presentacion,
              p.formato, p.unidad_medida, p.capacidad_parihuela_bultos, p.capacidad_parihuela_cajas, p.unidad_parihuela AS producto_unidad_parihuela,
              ub.ubicacion
       FROM parihuelas_produccion pp
       JOIN lotes_produccion lp ON lp.id = pp.lote_id
       JOIN productos p ON p.id = pp.producto_id
       LEFT JOIN LATERAL (
         SELECT a.nombre || ' → ' || c.nombre || ' → N' || niv.numero_nivel || ' → P' || pos.numero_posicion AS ubicacion
         FROM posiciones pos
         JOIN niveles niv ON niv.id = pos.nivel_id
         JOIN carriles c ON c.id = niv.carril_id
         JOIN almacenes a ON a.id = c.almacen_id
         WHERE pos.id = pp.posicion_id
       ) ub ON true
       ${where}
       ORDER BY pp.fecha_envio DESC NULLS LAST, pp.created_at DESC
       LIMIT $${n} OFFSET $${n + 1}`,
      [...params, limitNum, offsetNum]
    );
    const countResult = await pool.query(`SELECT COUNT(*) AS total FROM parihuelas_produccion pp ${where}`, params);
    const total = parseInt(countResult.rows[0]?.total, 10) || 0;
    res.json({ data: result.rows, total });
  } catch (error) {
    console.error('Error listando parihuelas:', error);
    res.status(500).json({ message: 'Error al listar parihuelas' });
  }
});

// Parihuelas incompletas en almacén (mismo producto) para remonte
router.get('/incompletas', async (req, res) => {
  try {
    await initTables();
    const { producto_id, almacen_id } = req.query;
    if (!producto_id) return res.status(400).json({ message: 'producto_id es requerido' });

    const prod = await pool.query(
      'SELECT capacidad_parihuela_bultos, capacidad_parihuela_cajas, unidad_parihuela FROM productos WHERE id = $1 AND activo = TRUE',
      [producto_id]
    );
    if (prod.rows.length === 0) return res.json({ data: [] });
    const capB = Number(prod.rows[0].capacidad_parihuela_bultos) || 0;
    const capC = Number(prod.rows[0].capacidad_parihuela_cajas) || 0;
    const u = (prod.rows[0].unidad_parihuela || 'BULTOS').toUpperCase();
    const capacidad = u === 'CAJAS' ? capC : capB;
    if (capacidad <= 0) return res.json({ data: [] });

    let almacenFilter = '';
    const params = [producto_id, capacidad];
    if (almacen_id) {
      almacenFilter = 'AND c.almacen_id = $3';
      params.push(almacen_id);
    }
    const result = await pool.query(
      `SELECT s.id AS stock_posicion_id, s.posicion_id, s.cantidad_bultos, s.total_kg, s.referencia, s.lote,
              p.id AS nivel_id, c.id AS carril_id, c.almacen_id,
              a.nombre AS almacen_nombre, c.nombre AS carril_nombre, n.numero_nivel, pos.numero_posicion
       FROM stock_posiciones s
       JOIN productos pr ON pr.id = s.producto_id
       JOIN posiciones pos ON pos.id = s.posicion_id
       JOIN niveles n ON n.id = pos.nivel_id
       JOIN carriles c ON c.id = n.carril_id
       JOIN almacenes a ON a.id = c.almacen_id
       WHERE s.producto_id = $1 AND s.cantidad_bultos > 0 AND s.cantidad_bultos < $2 ${almacenFilter}
       ORDER BY a.nombre, c.nombre, n.numero_nivel, pos.numero_posicion`,
      params
    );
    res.json({ data: result.rows });
  } catch (error) {
    console.error('Error listando incompletas:', error);
    res.status(500).json({ message: 'Error al listar' });
  }
});

// Lotes que tienen parihuelas (para vista recepción: agrupar por producción). Cliente/especie desde vehiculos_lote, empaque o producto.
router.get('/lotes', async (req, res) => {
  try {
    await initTables();
    const result = await pool.query(
      `SELECT lp.id, lp.codigo, lp.estado AS lote_estado, lp.fecha_inicio,
              (SELECT COUNT(*)::INT FROM parihuelas_produccion WHERE lote_id = lp.id AND estado = 'EN_TRANSITO') AS en_transito,
              (SELECT COUNT(*)::INT FROM parihuelas_produccion WHERE lote_id = lp.id AND estado = 'ALMACENADA') AS almacenadas,
              vl.cliente_id, vl.especie_id, c.nombre AS cliente_nombre, e.nombre AS especie_nombre
       FROM lotes_produccion lp
       INNER JOIN parihuelas_produccion pp ON pp.lote_id = lp.id
       LEFT JOIN LATERAL (SELECT cliente_id, especie_id FROM vehiculos_lote WHERE lote_id = lp.id LIMIT 1) vl ON true
       LEFT JOIN clientes c ON c.id = vl.cliente_id
       LEFT JOIN especies e ON e.id = vl.especie_id
       GROUP BY lp.id, lp.codigo, lp.estado, lp.fecha_inicio, vl.cliente_id, vl.especie_id, c.nombre, e.nombre
       ORDER BY lp.fecha_inicio DESC NULLS LAST, lp.codigo`
    );
    const rows = result.rows || [];
    for (const row of rows) {
      if (row.cliente_nombre || row.especie_nombre) continue;
      try {
        const fallback = await pool.query(
          `SELECT c.nombre AS cliente_nombre, e.nombre AS especie_nombre
           FROM empaque emp
           JOIN plantillas_proceso pp ON pp.id = emp.plantilla_id
           LEFT JOIN clientes c ON c.id = pp.cliente_id
           LEFT JOIN especies e ON e.id = pp.especie_id
           WHERE emp.lote_id = $1 LIMIT 1`,
          [row.id]
        );
        if (fallback.rows[0]) {
          row.cliente_nombre = fallback.rows[0].cliente_nombre;
          row.especie_nombre = fallback.rows[0].especie_nombre;
          continue;
        }
      } catch (_) {}
      try {
        const prodRes = await pool.query(
          `SELECT c.nombre AS cliente_nombre, e.nombre AS especie_nombre
           FROM parihuelas_produccion ppr
           JOIN productos p ON p.id = ppr.producto_id
           LEFT JOIN clientes c ON c.id = p.cliente_id
           LEFT JOIN especies e ON e.id = p.especie_id
           WHERE ppr.lote_id = $1 LIMIT 1`,
          [row.id]
        );
        if (prodRes.rows[0]) {
          row.cliente_nombre = prodRes.rows[0].cliente_nombre;
          row.especie_nombre = prodRes.rows[0].especie_nombre;
        }
      } catch (_) {}
    }
    res.json({ data: rows });
  } catch (error) {
    console.error('Error listando lotes con parihuelas:', error);
    res.status(500).json({ message: 'Error al listar lotes' });
  }
});

// Obtener una parihuela por ID (para rótulo). Si está ALMACENADA, incluye ubicación y contenido de la posición.
router.get('/:id', async (req, res) => {
  try {
    await initTables();
    const { id } = req.params;
    const result = await pool.query(
      `SELECT pp.id, pp.lote_id, pp.producto_id, pp.cantidad, pp.unidad_parihuela, pp.es_completa, pp.estado, pp.referencia, pp.hora, pp.fecha_envio, pp.posicion_id,
              lp.codigo AS lote_codigo,
              p.codigo AS producto_codigo, p.producto AS producto_nombre, p.descripcion AS producto_descripcion, p.presentacion AS producto_presentacion
       FROM parihuelas_produccion pp
       JOIN lotes_produccion lp ON lp.id = pp.lote_id
       JOIN productos p ON p.id = pp.producto_id
       WHERE pp.id = $1`,
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Parihuela no encontrada' });
    const row = result.rows[0];

    try {
      let clienteRes = await pool.query(
        `SELECT c.nombre AS cliente_nombre, e.nombre AS especie_nombre
         FROM vehiculos_lote vl
         LEFT JOIN clientes c ON c.id = vl.cliente_id
         LEFT JOIN especies e ON e.id = vl.especie_id
         WHERE vl.lote_id = $1 LIMIT 1`,
        [row.lote_id]
      );
      let ce = clienteRes.rows[0];
      if (!ce?.cliente_nombre && !ce?.especie_nombre) {
        const fallback = await pool.query(
          `SELECT c.nombre AS cliente_nombre, e.nombre AS especie_nombre
           FROM empaque emp
           JOIN plantillas_proceso pp ON pp.id = emp.plantilla_id
           LEFT JOIN clientes c ON c.id = pp.cliente_id
           LEFT JOIN especies e ON e.id = pp.especie_id
           WHERE emp.lote_id = $1 LIMIT 1`,
          [row.lote_id]
        );
        ce = fallback.rows[0];
      }
      if (!ce?.cliente_nombre && !ce?.especie_nombre) {
        const envasadoRes = await pool.query(
          `SELECT c.nombre AS cliente_nombre, e.nombre AS especie_nombre
           FROM envasado env
           JOIN plantillas_proceso pp ON pp.id = env.plantilla_id
           LEFT JOIN clientes c ON c.id = pp.cliente_id
           LEFT JOIN especies e ON e.id = pp.especie_id
           WHERE env.lote_id = $1 LIMIT 1`,
          [row.lote_id]
        );
        ce = envasadoRes.rows[0];
      }
      if (!ce?.cliente_nombre && !ce?.especie_nombre) {
        const prodRes = await pool.query(
          `SELECT c.nombre AS cliente_nombre, e.nombre AS especie_nombre
           FROM productos p
           LEFT JOIN clientes c ON c.id = p.cliente_id
           LEFT JOIN especies e ON e.id = p.especie_id
           WHERE p.id = $1`,
          [row.producto_id]
        );
        ce = prodRes.rows[0];
      }
      row.cliente_nombre = ce?.cliente_nombre || null;
      row.especie_nombre = ce?.especie_nombre || null;
    } catch (_) {
      row.cliente_nombre = null;
      row.especie_nombre = null;
    }

    try {
      const prodRes = await pool.query(
        'SELECT formato, unidad_medida FROM productos WHERE id = $1',
        [row.producto_id]
      );
      const cant = Number(row.cantidad) || 0;
      const formato = Number(prodRes.rows[0]?.formato) || 0;
      const um = ((prodRes.rows[0]?.unidad_medida) || 'KG').toString().toUpperCase();
      row.total_kg = um === 'LB' ? (cant * formato) / LB_A_KG : cant * formato;
    } catch (_) {
      row.total_kg = Number(row.cantidad) || 0;
    }

    if (row.estado === 'ALMACENADA' && row.posicion_id) {
      const descResult = await pool.query(
        `SELECT a.nombre AS almacen, c.nombre AS carril, niv.numero_nivel, pos.numero_posicion
         FROM posiciones pos
         JOIN niveles niv ON niv.id = pos.nivel_id
         JOIN carriles c ON c.id = niv.carril_id
         JOIN almacenes a ON a.id = c.almacen_id
         WHERE pos.id = $1`,
        [row.posicion_id]
      );
      if (descResult.rows.length > 0) {
        const { almacen, carril, numero_nivel, numero_posicion } = descResult.rows[0];
        row.ubicacion = `${almacen} → ${carril} → N${numero_nivel} → P${numero_posicion}`;
      }
      const contenidoResult = await pool.query(
        `SELECT s.id, s.lote, s.referencia, s.cantidad_bultos, s.total_kg,
                p.codigo AS producto_codigo, p.producto AS producto_nombre, p.descripcion AS producto_descripcion, p.presentacion AS producto_presentacion
         FROM stock_posiciones s
         JOIN productos p ON p.id = s.producto_id
         WHERE s.posicion_id = $1 AND (s.cantidad_bultos > 0 OR s.total_kg > 0)
         ORDER BY s.id`,
        [row.posicion_id]
      );
      row.contenido_posicion = contenidoResult.rows.map((r) => ({
        producto_codigo: r.producto_codigo,
        producto_nombre: r.producto_nombre,
        producto_descripcion: r.producto_descripcion,
        producto_presentacion: r.producto_presentacion,
        lote: r.lote,
        referencia: r.referencia,
        cantidad_bultos: Number(r.cantidad_bultos) || 0,
        total_kg: Number(r.total_kg) || 0,
      }));
    }

    res.json(row);
  } catch (error) {
    console.error('Error obteniendo parihuela:', error);
    res.status(500).json({ message: 'Error al obtener parihuela' });
  }
});

function restarDeEmpaqueDetalle(empaqueId, productoId, hora, cantidad) {
  if (!empaqueId || productoId == null || hora == null) return Promise.resolve();
  const horaKey = String(hora);
  return pool.query(
    `UPDATE empaque_detalle SET datos_horas = jsonb_set(
       COALESCE(datos_horas, '{}'),
       ARRAY[$3],
       to_jsonb(GREATEST(0, COALESCE((datos_horas->>$3)::numeric, 0) - $4))
     ) WHERE empaque_id = $1 AND producto_id = $2`,
    [empaqueId, productoId, horaKey, cantidad]
  );
}

function sumarEnEmpaqueDetalle(empaqueId, productoId, hora, cantidad) {
  if (!empaqueId || productoId == null || hora == null) return Promise.resolve();
  const horaKey = String(hora);
  return pool.query(
    `INSERT INTO empaque_detalle (empaque_id, producto_id, datos_horas)
     VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (empaque_id, producto_id) DO UPDATE SET
       datos_horas = jsonb_set(
         COALESCE(empaque_detalle.datos_horas, '{}'),
         ARRAY[$4],
         to_jsonb(COALESCE((empaque_detalle.datos_horas->>$4)::numeric, 0) + $5)
       )`,
    [empaqueId, productoId, JSON.stringify({ [horaKey]: cantidad }), horaKey, cantidad]
  );
}

// Recepcionar: asignar ubicación o remonte (ruta más específica antes de PATCH /:id)
router.patch('/:id/recepcionar', async (req, res) => {
  const client = await pool.connect();
  try {
    await initTables();
    const usuario_id = req.user?.id;
    if (!usuario_id) return res.status(401).json({ message: 'Usuario no autenticado' });
    const { id } = req.params;
    const { posicion_id, remonte_stock_posicion_id, almacen_id, carril_id, nivel_id } = req.body;

    const parihuela = await client.query(
      `SELECT pp.*, p.formato, p.unidad_medida, lp.codigo AS lote_codigo
       FROM parihuelas_produccion pp
       JOIN productos p ON p.id = pp.producto_id
       JOIN lotes_produccion lp ON lp.id = pp.lote_id
       WHERE pp.id = $1 FOR UPDATE`,
      [id]
    );
    if (parihuela.rows.length === 0) return res.status(404).json({ message: 'Parihuela no encontrada' });
    const pr = parihuela.rows[0];
    if (pr.estado !== 'EN_TRANSITO') return res.status(400).json({ message: 'Solo se puede recepcionar una parihuela en tránsito' });

    const cantidadBultos = Number(pr.cantidad) || 0;
    const formato = Number(pr.formato) || 0;
    const um = (pr.unidad_medida || 'KG').toUpperCase();
    const total_kg = um === 'LB' ? (cantidadBultos * formato) / LB_A_KG : cantidadBultos * formato;
    const referencia = pr.referencia || 'Produccion';
    const loteRef = pr.lote_codigo || null;
    const numeroGuiaIngreso = (pr.lote_codigo && String(pr.lote_codigo).trim()) || null;

    await client.query('BEGIN');

    if (remonte_stock_posicion_id) {
      const stock = await client.query(
        'SELECT id, posicion_id, cantidad_bultos, total_kg, peso_adicional, producto_id FROM stock_posiciones WHERE id = $1 FOR UPDATE',
        [remonte_stock_posicion_id]
      );
      if (stock.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Registro de stock no encontrado' });
      }
      if (stock.rows[0].producto_id !== pr.producto_id) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'El stock seleccionado no corresponde al mismo producto' });
      }
      const st = stock.rows[0];
      const pos = await client.query(
        'SELECT p.nivel_id, n.carril_id, c.almacen_id FROM posiciones p JOIN niveles n ON n.id = p.nivel_id JOIN carriles c ON c.id = n.carril_id WHERE p.id = $1',
        [st.posicion_id]
      );
      const nuevaCant = (Number(st.cantidad_bultos) || 0) + cantidadBultos;
      const nuevoKg = (Number(st.total_kg) || 0) + total_kg;
      await client.query(
        'UPDATE stock_posiciones SET cantidad_bultos = $1, total_kg = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
        [nuevaCant, nuevoKg, remonte_stock_posicion_id]
      );
      const desc = await descripcionPosicion(client, st.posicion_id);
      const mov = await client.query(
        'INSERT INTO movimientos (tipo_movimiento, usuario_id, fecha_hora, motivo, numero_guia) VALUES (\'Ingreso\', $1, CURRENT_TIMESTAMP, $2, $3) RETURNING id',
        [usuario_id, `Recepción parihuela (remonte) en ${desc}`, numeroGuiaIngreso]
      );
      await client.query(
        `INSERT INTO movimiento_detalles (movimiento_id, producto_id, cantidad_bultos, total_kg, peso_adicional, almacen_id, carril_id, nivel_id, posicion_id, stock_posicion_id)
         VALUES ($1, $2, $3, $4, 0, $5, $6, $7, $8, $9)`,
        [mov.rows[0].id, pr.producto_id, cantidadBultos, total_kg, pos.rows[0].almacen_id, pos.rows[0].carril_id, pos.rows[0].nivel_id, st.posicion_id, remonte_stock_posicion_id]
      );
      await client.query(
        `UPDATE parihuelas_produccion SET estado = 'ALMACENADA', fecha_recepcion = CURRENT_TIMESTAMP, usuario_almacen_id = $1, almacen_id = $2, carril_id = $3, nivel_id = $4, posicion_id = $5, stock_posicion_id = $6 WHERE id = $7`,
        [usuario_id, pos.rows[0].almacen_id, pos.rows[0].carril_id, pos.rows[0].nivel_id, st.posicion_id, remonte_stock_posicion_id, id]
      );
    } else if (posicion_id) {
      const posCheck = await client.query(
        `SELECT p.id, p.nivel_id, n.carril_id, c.almacen_id FROM posiciones p
         JOIN niveles n ON n.id = p.nivel_id JOIN carriles c ON c.id = n.carril_id
         WHERE p.id = $1`,
        [posicion_id]
      );
      if (posCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Posición no encontrada' });
      }
      const { almacen_id: aid, carril_id: cid, nivel_id: nid } = posCheck.rows[0];
      const existente = await client.query(
        `SELECT id, cantidad_bultos, total_kg FROM stock_posiciones WHERE posicion_id = $1 AND producto_id = $2 AND COALESCE(lote, '') = COALESCE($3, '') AND referencia = $4`,
        [posicion_id, pr.producto_id, loteRef, referencia]
      );
      let stockId;
      if (existente.rows.length > 0) {
        const ex = existente.rows[0];
        const nuevaCant = (Number(ex.cantidad_bultos) || 0) + cantidadBultos;
        const nuevoKg = (Number(ex.total_kg) || 0) + total_kg;
        await client.query(
          'UPDATE stock_posiciones SET cantidad_bultos = $1, total_kg = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
          [nuevaCant, nuevoKg, ex.id]
        );
        stockId = ex.id;
      } else {
        const ins = await client.query(
          `INSERT INTO stock_posiciones (posicion_id, producto_id, lote, referencia, fecha_ingreso, cantidad_bultos, peso_adicional, total_kg)
           VALUES ($1, $2, $3, $4, CURRENT_DATE, $5, 0, $6) RETURNING id`,
          [posicion_id, pr.producto_id, loteRef, referencia, cantidadBultos, total_kg]
        );
        stockId = ins.rows[0].id;
      }
      const desc = await descripcionPosicion(client, posicion_id);
      const mov = await client.query(
        'INSERT INTO movimientos (tipo_movimiento, usuario_id, fecha_hora, motivo, numero_guia) VALUES (\'Ingreso\', $1, CURRENT_TIMESTAMP, $2, $3) RETURNING id',
        [usuario_id, `Recepción parihuela en ${desc}`, numeroGuiaIngreso]
      );
      await client.query(
        `INSERT INTO movimiento_detalles (movimiento_id, producto_id, cantidad_bultos, total_kg, peso_adicional, almacen_id, carril_id, nivel_id, posicion_id, stock_posicion_id)
         VALUES ($1, $2, $3, $4, 0, $5, $6, $7, $8, $9)`,
        [mov.rows[0].id, pr.producto_id, cantidadBultos, total_kg, aid, cid, nid, posicion_id, stockId]
      );
      await client.query(
        `UPDATE parihuelas_produccion SET estado = 'ALMACENADA', fecha_recepcion = CURRENT_TIMESTAMP, usuario_almacen_id = $1, almacen_id = $2, carril_id = $3, nivel_id = $4, posicion_id = $5, stock_posicion_id = $6 WHERE id = $7`,
        [usuario_id, aid, cid, nid, posicion_id, stockId, id]
      );
    } else {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Debe indicar posicion_id o remonte_stock_posicion_id' });
    }

    await client.query('COMMIT');
    const updated = await pool.query(
      `SELECT pp.*, p.codigo AS producto_codigo, p.producto AS producto_nombre FROM parihuelas_produccion pp JOIN productos p ON p.id = pp.producto_id WHERE pp.id = $1`,
      [id]
    );
    const respuesta = updated.rows[0] || {};
    if (respuesta.posicion_id) {
      try {
        const desc = await descripcionPosicion(client, respuesta.posicion_id);
        respuesta.ubicacion = desc;
      } catch (_) {
        respuesta.ubicacion = null;
      }
    }
    res.json(respuesta);
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) { }
    console.error('Error recepcionando parihuela:', error);
    const em = String(error?.message || '');
    const tipoBultos = /is of type integer|invalid input syntax for type integer|integer\s+but\s+expression/i.test(em);
    const payload = {
      message: tipoBultos
        ? 'cantidad_bultos en la base aún es entero. Reinicie el backend (migración automática) o ejecute database/007_cantidad_bultos_decimal.sql'
        : 'Error al recepcionar',
    };
    if (tipoBultos || process.env.NODE_ENV !== 'production') payload.detail = em || undefined;
    res.status(500).json(payload);
  } finally {
    client.release();
  }
});

// Reabrir parihuela recepcionada (solo si lote sigue abierto): revierte stock y pasa a EN_TRANSITO
router.patch('/:id/reabrir', async (req, res) => {
  const client = await pool.connect();
  try {
    await initTables();
    const usuario_id = req.user?.id;
    if (!usuario_id) return res.status(401).json({ message: 'Usuario no autenticado' });
    const { id } = req.params;

    const parihuela = await client.query(
      `SELECT pp.*, p.formato, p.unidad_medida
       FROM parihuelas_produccion pp
       JOIN productos p ON p.id = pp.producto_id
       WHERE pp.id = $1 FOR UPDATE`,
      [id]
    );
    if (parihuela.rows.length === 0) return res.status(404).json({ message: 'Parihuela no encontrada' });
    const pr = parihuela.rows[0];
    if (pr.estado !== 'ALMACENADA') return res.status(400).json({ message: 'Solo se puede reabrir una parihuela ya recepcionada' });
    if (!pr.stock_posicion_id) return res.status(400).json({ message: 'Parihuela sin ubicación asignada' });

    const lote = await client.query(
      "SELECT id, estado FROM lotes_produccion WHERE id = $1",
      [pr.lote_id]
    );
    if (lote.rows.length === 0) return res.status(404).json({ message: 'Lote no encontrado' });
    if (!['Iniciado', 'En proceso'].includes(lote.rows[0].estado)) {
      return res.status(400).json({ message: 'Solo se puede reabrir si el lote sigue abierto (Iniciado o En proceso)' });
    }

    const cantidadBultos = Number(pr.cantidad) || 0;
    const formato = Number(pr.formato) || 0;
    const um = (pr.unidad_medida || 'KG').toUpperCase();
    const total_kg = um === 'LB' ? (cantidadBultos * formato) / LB_A_KG : cantidadBultos * formato;

    const stock = await client.query(
      `SELECT s.id, s.cantidad_bultos, s.total_kg, s.posicion_id, p.nivel_id, n.carril_id, c.almacen_id
       FROM stock_posiciones s
       JOIN posiciones p ON p.id = s.posicion_id
       JOIN niveles n ON n.id = p.nivel_id
       JOIN carriles c ON c.id = n.carril_id
       WHERE s.id = $1 FOR UPDATE`,
      [pr.stock_posicion_id]
    );
    if (stock.rows.length === 0) {
      return res.status(400).json({ message: 'Registro de stock no encontrado' });
    }
    const st = stock.rows[0];
    const nuevaCant = Math.max(0, (Number(st.cantidad_bultos) || 0) - cantidadBultos);
    const nuevoKg = Math.max(0, (Number(st.total_kg) || 0) - total_kg);

    await client.query('BEGIN');

    // Primero registrar movimiento y detalle (mientras stock_posiciones sigue existiendo, para no violar FK)
    const desc = await descripcionPosicion(client, pr.posicion_id);
    const mov = await client.query(
      "INSERT INTO movimientos (tipo_movimiento, usuario_id, fecha_hora, motivo) VALUES ('Salida', $1, CURRENT_TIMESTAMP, $2) RETURNING id",
      [usuario_id, `Reversa recepción parihuela (reabrir) - ${desc}`]
    );
    await client.query(
      `INSERT INTO movimiento_detalles (movimiento_id, producto_id, cantidad_bultos, total_kg, peso_adicional, almacen_id, carril_id, nivel_id, posicion_id, stock_posicion_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [mov.rows[0].id, pr.producto_id, cantidadBultos, total_kg, 0, st.almacen_id, st.carril_id, st.nivel_id, st.posicion_id, pr.stock_posicion_id]
    );

    // Después actualizar o vaciar stock (no borrar la fila para no violar FK de movimiento_detalles)
    if (nuevaCant <= 0 && nuevoKg <= 0) {
      await client.query(
        'UPDATE stock_posiciones SET cantidad_bultos = 0, total_kg = 0, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [pr.stock_posicion_id]
      );
    } else {
      await client.query(
        'UPDATE stock_posiciones SET cantidad_bultos = $1, total_kg = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
        [nuevaCant, nuevoKg, pr.stock_posicion_id]
      );
    }

    await client.query(
      `UPDATE parihuelas_produccion SET estado = 'EN_TRANSITO', fecha_recepcion = NULL, usuario_almacen_id = NULL,
       almacen_id = NULL, carril_id = NULL, nivel_id = NULL, posicion_id = NULL, stock_posicion_id = NULL
       WHERE id = $1`,
      [id]
    );

    await client.query('COMMIT');
    const updated = await pool.query(
      `SELECT pp.*, p.codigo AS producto_codigo, p.producto AS producto_nombre
       FROM parihuelas_produccion pp JOIN productos p ON p.id = pp.producto_id WHERE pp.id = $1`,
      [id]
    );
    res.json(updated.rows[0]);
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) { }
    console.error('Error reabriendo parihuela:', error);
    res.status(500).json({ message: 'Error al reabrir' });
  } finally {
    client.release();
  }
});

// Actualizar parihuela (solo EN_TRANSITO)
router.patch('/:id', async (req, res) => {
  try {
    await initTables();
    const { id } = req.params;
    const { cantidad, referencia, hora: horaNueva } = req.body;

    const current = await pool.query(
      'SELECT id, empaque_id, producto_id, cantidad, hora, estado FROM parihuelas_produccion WHERE id = $1',
      [id]
    );
    if (current.rows.length === 0) return res.status(404).json({ message: 'Parihuela no encontrada' });
    const pr = current.rows[0];
    if (pr.estado !== 'EN_TRANSITO') return res.status(400).json({ message: 'Solo se puede editar una parihuela en tránsito' });

    const cantNew = cantidad != null ? Number(cantidad) : null;
    if (cantNew != null && (isNaN(cantNew) || cantNew <= 0)) return res.status(400).json({ message: 'La cantidad debe ser mayor a 0' });
    const horaNum = horaNueva != null ? parseInt(horaNueva, 10) : null;
    if (horaNum != null && (isNaN(horaNum) || horaNum < 0 || horaNum > 23)) return res.status(400).json({ message: 'La hora debe estar entre 0 y 23' });

    const cantOld = Number(pr.cantidad) || 0;
    const horaOld = pr.hora != null ? parseInt(pr.hora, 10) : null;
    const cant = cantNew != null ? cantNew : cantOld;
    const hora = horaNum != null ? horaNum : horaOld;

    if (pr.empaque_id && (horaOld != null || hora != null)) {
      if (horaOld != null) await restarDeEmpaqueDetalle(pr.empaque_id, pr.producto_id, horaOld, cantOld);
      if (hora != null) await sumarEnEmpaqueDetalle(pr.empaque_id, pr.producto_id, hora, cant);
    }

    await pool.query(
      `UPDATE parihuelas_produccion SET cantidad = $1, referencia = COALESCE($2, referencia), hora = COALESCE($3, hora),
         es_completa = (SELECT CASE WHEN (p.capacidad_parihuela_bultos > 0 AND (p.unidad_parihuela IS NULL OR UPPER(p.unidad_parihuela) = 'BULTOS'))
           THEN $1 >= p.capacidad_parihuela_bultos WHEN (p.capacidad_parihuela_cajas > 0) THEN $1 >= p.capacidad_parihuela_cajas ELSE FALSE END
         FROM productos p WHERE p.id = parihuelas_produccion.producto_id)
       WHERE id = $4`,
      [cant, (referencia || '').trim() || null, horaNum, id]
    );

    const withProduct = await pool.query(
      `SELECT pp.*, p.codigo AS producto_codigo, p.producto AS producto_nombre, p.descripcion AS producto_descripcion, p.presentacion AS producto_presentacion
       FROM parihuelas_produccion pp JOIN productos p ON p.id = pp.producto_id WHERE pp.id = $1`,
      [id]
    );
    res.json(withProduct.rows[0]);
  } catch (error) {
    console.error('Error actualizando parihuela:', error);
    res.status(500).json({ message: 'Error al actualizar parihuela' });
  }
});

// Eliminar parihuela (solo EN_TRANSITO)
router.delete('/:id', async (req, res) => {
  try {
    await initTables();
    const { id } = req.params;
    const row = await pool.query(
      'SELECT id, empaque_id, producto_id, cantidad, hora, estado FROM parihuelas_produccion WHERE id = $1',
      [id]
    );
    if (row.rows.length === 0) return res.status(404).json({ message: 'Parihuela no encontrada' });
    const pr = row.rows[0];
    if (pr.estado !== 'EN_TRANSITO') return res.status(400).json({ message: 'Solo se puede eliminar una parihuela en tránsito' });

    if (pr.empaque_id && pr.hora != null) {
      await restarDeEmpaqueDetalle(pr.empaque_id, pr.producto_id, parseInt(pr.hora, 10), Number(pr.cantidad) || 0);
    }
    await pool.query('DELETE FROM parihuelas_produccion WHERE id = $1', [id]);
    res.status(204).send();
  } catch (error) {
    console.error('Error eliminando parihuela:', error);
    res.status(500).json({ message: 'Error al eliminar parihuela' });
  }
});

export default router;
