import express from 'express';
import { pool } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { emitirNotificacion } from '../utils/notificaciones.js';
import { parsePlantillaSnapshot } from '../utils/plantillaProcesoSnapshot.js';

const router = express.Router();
router.use(authenticateToken);

const LB_A_KG = 2.2046;

const pesoBandeja = (formato) => {
  const f = Number(formato);
  if (f === 20) return 10;
  if (f === 15) return 7.5;
  if (f > 0) return f / 2;
  return 0;
};

const bultosToKg = (bultos, formato, unidadMedida) => {
  const b = Number(bultos) || 0;
  const f = Number(formato) || 0;
  const um = (unidadMedida || 'KG').toUpperCase();
  if (f <= 0) return 0;
  if (um === 'LB') return (b * f) / LB_A_KG;
  return b * f;
};

const initTables = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS control_produccion_asignacion (
      lote_id UUID NOT NULL REFERENCES lotes_produccion(id) ON DELETE CASCADE,
      producto_id UUID NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
      prioridad INT NOT NULL DEFAULT 1,
      orden_exportacion_linea_id UUID REFERENCES ordenes_exportacion_lineas(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (lote_id, producto_id, prioridad)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS control_produccion_aplicacion (
      lote_id UUID PRIMARY KEY REFERENCES lotes_produccion(id) ON DELETE CASCADE,
      aplicado_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      usuario_id UUID REFERENCES usuarios(id)
    )
  `);
};

// Lotes activos (mismo criterio que envasado)
router.get('/lotes-activos', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT lp.id, lp.codigo, lp.estado, lp.fecha_inicio,
              vl.cliente_id, vl.especie_id,
              c.nombre AS cliente_nombre, e.nombre AS especie_nombre
       FROM lotes_produccion lp
       LEFT JOIN LATERAL (
         SELECT cliente_id, especie_id FROM vehiculos_lote
         WHERE lote_produccion_id = lp.id ORDER BY numero_orden, created_at LIMIT 1
       ) vl ON true
       LEFT JOIN clientes c ON c.id = vl.cliente_id
       LEFT JOIN especies e ON e.id = vl.especie_id
       WHERE lp.estado IN ('Iniciado', 'En proceso')
       ORDER BY lp.fecha_inicio DESC NULLS LAST, lp.codigo`
    );
    res.json({ data: result.rows });
  } catch (error) {
    console.error('Error listando lotes activos:', error);
    res.status(500).json({ message: 'Error al listar lotes' });
  }
});

// Datos de control para un lote: productos con totales envasado/congelado/empaque, estados, asignación OP
router.get('/por-lote/:loteId', async (req, res) => {
  try {
    await initTables();
    const { loteId } = req.params;

    const lote = await pool.query(
      `SELECT lp.id, lp.codigo, lp.estado,
              vl.cliente_id, vl.especie_id,
              c.nombre AS cliente_nombre, e.nombre AS especie_nombre
       FROM lotes_produccion lp
       LEFT JOIN LATERAL (
         SELECT cliente_id, especie_id FROM vehiculos_lote
         WHERE lote_produccion_id = lp.id ORDER BY numero_orden, created_at LIMIT 1
       ) vl ON true
       LEFT JOIN clientes c ON c.id = vl.cliente_id
       LEFT JOIN especies e ON e.id = vl.especie_id
       WHERE lp.id = $1`,
      [loteId]
    );
    if (lote.rows.length === 0) return res.status(404).json({ message: 'Lote no encontrado' });
    const header = lote.rows[0];
    const cliente_id = header.cliente_id;
    const especie_id = header.especie_id;

    const plantilla = await pool.query(
      `SELECT id, titulo FROM plantillas_proceso
       WHERE cliente_id = $1 AND especie_id = $2 AND es_predeterminada = TRUE LIMIT 1`,
      [cliente_id, especie_id]
    );
    const plantilla_id = plantilla.rows[0]?.id;
    const plantilla_titulo = plantilla.rows[0]?.titulo || null;
    if (!plantilla_id) {
      return res.json({
        ...header,
        plantilla_titulo: null,
        envasado_estado: null,
        congelado_estado: null,
        empaque_estado: null,
        productos: [],
      });
    }

    const envasado = await pool.query(
      'SELECT id, estado, plantilla_snapshot FROM envasado WHERE lote_id = $1 LIMIT 1',
      [loteId]
    );
    const congelado = await pool.query(
      'SELECT id, estado, plantilla_snapshot FROM congelado WHERE lote_id = $1 LIMIT 1',
      [loteId]
    );
    const empaque = await pool.query(
      'SELECT id, estado, plantilla_snapshot FROM empaque WHERE lote_id = $1 LIMIT 1',
      [loteId]
    );
    const envasado_estado = envasado.rows[0]?.estado ?? null;
    const congelado_estado = congelado.rows[0]?.estado ?? null;
    const empaque_estado = empaque.rows[0]?.estado ?? null;

    const envasado_id = envasado.rows[0]?.id;
    const congelado_id = congelado.rows[0]?.id;
    const empaque_id = empaque.rows[0]?.id;

    const productosPlantilla = await pool.query(
      `SELECT pp.producto_id, p.codigo, p.producto, p.descripcion, p.presentacion, p.formato, p.unidad_medida, p.unidad_parihuela
       FROM plantillas_proceso_productos pp
       JOIN productos p ON p.id = pp.producto_id
       WHERE pp.plantilla_id = $1 ORDER BY pp.orden, p.codigo`,
      [plantilla_id]
    );

    const snapE = parsePlantillaSnapshot(envasado.rows[0]?.plantilla_snapshot);
    const snapC = parsePlantillaSnapshot(congelado.rows[0]?.plantilla_snapshot);
    const snapM = parsePlantillaSnapshot(empaque.rows[0]?.plantilla_snapshot);

    const idSet = new Set();
    for (const r of productosPlantilla.rows) idSet.add(r.producto_id);
    for (const snap of [snapE, snapC, snapM]) {
      if (snap?.productos?.length) {
        for (const p of snap.productos) {
          if (p.producto_id) idSet.add(p.producto_id);
        }
      }
    }
    if (envasado_id) {
      const ex = await pool.query('SELECT DISTINCT producto_id FROM envasado_detalle WHERE envasado_id = $1', [
        envasado_id,
      ]);
      ex.rows.forEach((r) => idSet.add(r.producto_id));
    }
    if (congelado_id) {
      const ex = await pool.query('SELECT DISTINCT producto_id FROM congelado_detalle WHERE congelado_id = $1', [
        congelado_id,
      ]);
      ex.rows.forEach((r) => idSet.add(r.producto_id));
    }
    if (empaque_id) {
      const ex = await pool.query('SELECT DISTINCT producto_id FROM empaque_detalle WHERE empaque_id = $1', [
        empaque_id,
      ]);
      ex.rows.forEach((r) => idSet.add(r.producto_id));
    }

    const productoIdsUnion = [...idSet];
    let productosPlantillaRows = productosPlantilla.rows;
    if (productoIdsUnion.length > 0) {
      const metaExtra = await pool.query(
        `SELECT p.id AS producto_id, p.codigo, p.producto, p.descripcion, p.presentacion, p.formato, p.unidad_medida, p.unidad_parihuela
         FROM productos p WHERE p.id = ANY($1::uuid[]) ORDER BY p.codigo`,
        [productoIdsUnion]
      );
      productosPlantillaRows = metaExtra.rows;
    }

    const aplicado = await pool.query(
      'SELECT aplicado_at FROM control_produccion_aplicacion WHERE lote_id = $1',
      [loteId]
    );
    const op_aplicado_at = aplicado.rows[0]?.aplicado_at ?? null;

    const asignacionRows = await pool.query(
      `SELECT producto_id, prioridad, orden_exportacion_linea_id
       FROM control_produccion_asignacion
       WHERE lote_id = $1`,
      [loteId]
    );
    const asignacionByProducto = new Map();
    for (const r of asignacionRows.rows) {
      if (!asignacionByProducto.has(r.producto_id)) asignacionByProducto.set(r.producto_id, []);
      asignacionByProducto.get(r.producto_id).push({
        prioridad: r.prioridad,
        orden_exportacion_linea_id: r.orden_exportacion_linea_id,
      });
    }
    for (const arr of asignacionByProducto.values()) {
      arr.sort((a, b) => a.prioridad - b.prioridad);
    }

    let enviadoByProducto = new Map();
    let recepcionadoByProducto = new Map();
    try {
      const parihuelasSum = await pool.query(
        `SELECT producto_id, COALESCE(SUM(cantidad), 0) AS enviado
         FROM parihuelas_produccion
         WHERE lote_id = $1
         GROUP BY producto_id`,
        [loteId]
      );
      parihuelasSum.rows.forEach((r) => enviadoByProducto.set(r.producto_id, Number(r.enviado) || 0));

      const parihuelasRecepcionadas = await pool.query(
        `SELECT producto_id, COALESCE(SUM(cantidad), 0) AS recepcionado
         FROM parihuelas_produccion
         WHERE lote_id = $1 AND estado = 'ALMACENADA'
         GROUP BY producto_id`,
        [loteId]
      );
      parihuelasRecepcionadas.rows.forEach((r) => recepcionadoByProducto.set(r.producto_id, Number(r.recepcionado) || 0));
    } catch (e) {
      if (e.code !== '42P01') throw e;
    }

    const productos = [];
    for (const row of productosPlantillaRows) {
      const producto_id = row.producto_id;
      const formato = Number(row.formato) || 0;
      const um = (row.unidad_medida || 'KG').toUpperCase();
      const pesoB = pesoBandeja(formato);

      let total_envasado_bandejas = 0;
      let total_congelado_bandejas = 0;
      let total_empaque_bultos = 0;

      if (envasado_id) {
        const ed = await pool.query(
          'SELECT datos_horas FROM envasado_detalle WHERE envasado_id = $1 AND producto_id = $2',
          [envasado_id, producto_id]
        );
        if (ed.rows.length > 0) {
          const datos = ed.rows[0].datos_horas;
          const obj = typeof datos === 'string' ? JSON.parse(datos || '{}') : datos || {};
          total_envasado_bandejas = Object.values(obj).reduce((s, v) => s + (Number(v) || 0), 0);
        }
      }
      if (congelado_id) {
        const cd = await pool.query(
          'SELECT datos_columnas FROM congelado_detalle WHERE congelado_id = $1 AND producto_id = $2',
          [congelado_id, producto_id]
        );
        if (cd.rows.length > 0) {
          const datos = cd.rows[0].datos_columnas;
          const obj = typeof datos === 'string' ? JSON.parse(datos || '{}') : datos || {};
          total_congelado_bandejas = Object.values(obj).reduce((s, v) => s + (Number(v) || 0), 0);
        }
      }
      if (empaque_id) {
        const emp = await pool.query(
          'SELECT datos_horas FROM empaque_detalle WHERE empaque_id = $1 AND producto_id = $2',
          [empaque_id, producto_id]
        );
        if (emp.rows.length > 0) {
          const datos = emp.rows[0].datos_horas;
          const obj = typeof datos === 'string' ? JSON.parse(datos || '{}') : datos || {};
          total_empaque_bultos = Object.values(obj).reduce((s, v) => s + (Number(v) || 0), 0);
        }
      }

      const total_envasado_kg = total_envasado_bandejas * pesoB;
      const total_congelado_kg = total_congelado_bandejas * pesoB;
      const total_empaque_kg = bultosToKg(total_empaque_bultos, formato, um);

      const asignacionRaw = asignacionByProducto.get(producto_id) || [];
      const asignacion = [];
      for (const a of asignacionRaw) {
        if (!a.orden_exportacion_linea_id) {
          asignacion.push({ prioridad: a.prioridad, linea_id: null, numero_op: null, solicitado_kg: 0, cargado_kg: 0, solicitado_bultos: 0, cargado_bultos: 0, faltante_bultos: 0 });
          continue;
        }
        const linea = await pool.query(
          `SELECT oel.id, oel.orden_exportacion_id, oel.cantidad_solicitada, oel.cantidad_cargada,
                  oe.numero_op, p.formato AS producto_formato, p.unidad_medida AS producto_um
           FROM ordenes_exportacion_lineas oel
           JOIN ordenes_exportacion oe ON oe.id = oel.orden_exportacion_id
           JOIN productos p ON p.id = oel.producto_id
           WHERE oel.id = $1`,
          [a.orden_exportacion_linea_id]
        );
        if (linea.rows.length > 0) {
          const l = linea.rows[0];
          const solBultos = Number(l.cantidad_solicitada) || 0;
          const cargBultos = Number(l.cantidad_cargada) || 0;
          const faltBultos = Math.max(0, solBultos - cargBultos);
          const solKg = bultosToKg(Number(l.cantidad_solicitada) || 0, l.producto_formato, l.producto_um);
          const cargKg = bultosToKg(Number(l.cantidad_cargada) || 0, l.producto_formato, l.producto_um);
          asignacion.push({
            prioridad: a.prioridad,
            linea_id: l.id,
            orden_id: l.orden_exportacion_id,
            numero_op: l.numero_op,
            solicitado_kg: solKg,
            cargado_kg: cargKg,
            solicitado_bultos: solBultos,
            cargado_bultos: cargBultos,
            faltante_bultos: faltBultos,
          });
        }
      }

      const enviado_a_camara = enviadoByProducto.get(producto_id) ?? 0;
      const recepcionado_camara = recepcionadoByProducto.get(producto_id) ?? 0;
      const validado_camara = enviado_a_camara === 0 ? null : (recepcionado_camara >= enviado_a_camara - 0.01);
      productos.push({
        producto_id,
        codigo: row.codigo,
        producto: row.producto,
        descripcion: row.descripcion,
        presentacion: row.presentacion,
        formato: row.formato,
        unidad_medida: row.unidad_medida,
        unidad_parihuela: row.unidad_parihuela || 'BULTOS',
        total_envasado_bandejas: total_envasado_bandejas,
        total_envasado_kg: total_envasado_kg,
        total_congelado_bandejas: total_congelado_bandejas,
        total_congelado_kg: total_congelado_kg,
        total_empaque_bultos: total_empaque_bultos,
        total_empaque_kg: total_empaque_kg,
        enviado_a_camara,
        validado_camara,
        asignacion,
      });
    }

    res.json({
      ...header,
      plantilla_titulo,
      op_aplicado_at,
      envasado_estado,
      congelado_estado,
      empaque_estado,
      productos,
    });
  } catch (error) {
    console.error('Error obteniendo control por lote:', error);
    res.status(500).json({ message: 'Error al obtener control' });
  }
});

// Validar (totales coinciden) y aplicar empaque a OP según prioridades
router.post('/por-lote/:loteId/aplicar-op', async (req, res) => {
  const client = await pool.connect();
  try {
    await initTables();
    const { loteId } = req.params;
    const usuario_id = req.user?.id;
    if (!usuario_id) return res.status(401).json({ message: 'Usuario no autenticado' });

    await client.query('BEGIN');

    await client
      .query(
        `ALTER TABLE ordenes_exportacion_linea_asignaciones
         ADD COLUMN lote_produccion_id UUID REFERENCES lotes_produccion(id) ON DELETE SET NULL`
      )
      .catch(() => {});

    const ya = await client.query('SELECT lote_id FROM control_produccion_aplicacion WHERE lote_id = $1', [loteId]);
    if (ya.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Este lote ya fue aplicado a OP.' });
    }

    const empaqueEnc = await client.query('SELECT id, estado FROM empaque WHERE lote_id = $1 LIMIT 1', [loteId]);
    if (empaqueEnc.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Este lote no tiene empaque.' });
    }
    if (empaqueEnc.rows[0].estado !== 'finalizado') {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'El empaque debe estar finalizado para aplicar a OP.' });
    }

    const enTransito = await client.query(
      'SELECT COUNT(*)::INT AS c FROM parihuelas_produccion WHERE lote_id = $1 AND estado = $2',
      [loteId, 'EN_TRANSITO']
    );
    if ((enTransito.rows[0]?.c || 0) > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: 'No se puede aplicar a OP: hay parihuelas en tránsito. Recepcione todas en Recepción de parihuelas.',
      });
    }

    const header = await client.query(
      `SELECT lp.id,
              lp.codigo AS lote_codigo,
              vl.cliente_id, vl.especie_id
       FROM lotes_produccion lp
       LEFT JOIN LATERAL (
         SELECT cliente_id, especie_id FROM vehiculos_lote
         WHERE lote_produccion_id = lp.id ORDER BY numero_orden, created_at LIMIT 1
       ) vl ON true
       WHERE lp.id = $1`,
      [loteId]
    );
    if (header.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Lote no encontrado' });
    }
    const cliente_id = header.rows[0].cliente_id;
    const especie_id = header.rows[0].especie_id;
    const loteCodigo = String(header.rows[0].lote_codigo || '').trim() || '—';

    const plantilla = await client.query(
      `SELECT id FROM plantillas_proceso WHERE cliente_id = $1 AND especie_id = $2 AND es_predeterminada = TRUE LIMIT 1`,
      [cliente_id, especie_id]
    );
    const plantilla_id = plantilla.rows[0]?.id;
    if (!plantilla_id) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'No hay plantilla predeterminada para este lote.' });
    }

    const productosPlantilla = await client.query(
      `SELECT pp.producto_id, p.formato, p.unidad_medida
       FROM plantillas_proceso_productos pp
       JOIN productos p ON p.id = pp.producto_id
       WHERE pp.plantilla_id = $1
       ORDER BY pp.orden, p.codigo`,
      [plantilla_id]
    );
    const productoIds = productosPlantilla.rows.map((r) => r.producto_id);
    const metaByProducto = new Map(productosPlantilla.rows.map((r) => [r.producto_id, r]));

    const envasadoEnc = await client.query('SELECT id FROM envasado WHERE lote_id = $1 LIMIT 1', [loteId]);
    const congeladoEnc = await client.query('SELECT id FROM congelado WHERE lote_id = $1 LIMIT 1', [loteId]);
    const empaque_id = empaqueEnc.rows[0].id;
    const envasado_id = envasadoEnc.rows[0]?.id || null;
    const congelado_id = congeladoEnc.rows[0]?.id || null;

    const envasadoDet = envasado_id
      ? await client.query(
          `SELECT producto_id, datos_horas FROM envasado_detalle WHERE envasado_id = $1 AND producto_id = ANY($2::uuid[])`,
          [envasado_id, productoIds]
        )
      : { rows: [] };
    const congeladoDet = congelado_id
      ? await client.query(
          `SELECT producto_id, datos_columnas FROM congelado_detalle WHERE congelado_id = $1 AND producto_id = ANY($2::uuid[])`,
          [congelado_id, productoIds]
        )
      : { rows: [] };
    const empaqueDet = await client.query(
      `SELECT producto_id, datos_horas FROM empaque_detalle WHERE empaque_id = $1 AND producto_id = ANY($2::uuid[])`,
      [empaque_id, productoIds]
    );

    const envasadoMap = new Map();
    const congeladoMap = new Map();
    const empaqueMap = new Map();

    for (const r of envasadoDet.rows) {
      const obj = typeof r.datos_horas === 'string' ? JSON.parse(r.datos_horas || '{}') : (r.datos_horas || {});
      const total = Object.values(obj).reduce((s, v) => s + (Number(v) || 0), 0);
      envasadoMap.set(r.producto_id, total);
    }
    for (const r of congeladoDet.rows) {
      const obj = typeof r.datos_columnas === 'string' ? JSON.parse(r.datos_columnas || '{}') : (r.datos_columnas || {});
      const total = Object.values(obj).reduce((s, v) => s + (Number(v) || 0), 0);
      congeladoMap.set(r.producto_id, total);
    }
    for (const r of empaqueDet.rows) {
      const obj = typeof r.datos_horas === 'string' ? JSON.parse(r.datos_horas || '{}') : (r.datos_horas || {});
      const total = Object.values(obj).reduce((s, v) => s + (Number(v) || 0), 0);
      empaqueMap.set(r.producto_id, total);
    }

    const asignRows = await client.query(
      `SELECT producto_id, prioridad, orden_exportacion_linea_id
       FROM control_produccion_asignacion
       WHERE lote_id = $1
       ORDER BY producto_id, prioridad`,
      [loteId]
    );
    const asignByProducto = new Map();
    for (const r of asignRows.rows) {
      if (!asignByProducto.has(r.producto_id)) asignByProducto.set(r.producto_id, []);
      asignByProducto.get(r.producto_id).push({ prioridad: r.prioridad, linea_id: r.orden_exportacion_linea_id || null });
    }

    const applied = [];

    for (const producto_id of productoIds) {
      const meta = metaByProducto.get(producto_id);
      const formato = Number(meta?.formato) || 0;
      const um = (meta?.unidad_medida || 'KG').toUpperCase();
      const pesoB = pesoBandeja(formato);

      const envB = Number(envasadoMap.get(producto_id) || 0);
      const congB = Number(congeladoMap.get(producto_id) || 0);
      const empBultos = Number(empaqueMap.get(producto_id) || 0);

      const envKg = envB * pesoB;
      const congKg = congB * pesoB;
      const empKg = bultosToKg(empBultos, formato, um);

      const r1 = Number(envKg.toFixed(1));
      const r2 = Number(congKg.toFixed(1));
      const r3 = Number(empKg.toFixed(1));
      if (r1 !== r2 || r1 !== r3) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          message: 'No se puede aplicar: los totales no coinciden en control de proceso.',
          detalle: { producto_id, envasado_kg: r1, congelado_kg: r2, empaque_kg: r3 },
        });
      }

      let restante = empBultos;
      const prioridades = asignByProducto.get(producto_id) || [];
      const detalleAplicado = [];

      for (const pr of prioridades) {
        if (!restante) break;
        if (!pr.linea_id) continue; // sin OP como opción, pero no actualiza OP
        const linea = await client.query(
          'SELECT id, cantidad_solicitada, cantidad_cargada FROM ordenes_exportacion_lineas WHERE id = $1 FOR UPDATE',
          [pr.linea_id]
        );
        if (linea.rows.length === 0) continue;
        const sol = Number(linea.rows[0].cantidad_solicitada) || 0;
        const carg = Number(linea.rows[0].cantidad_cargada) || 0;
        const falt = Math.max(0, sol - carg);
        const add = Math.min(restante, falt);
        if (add > 0) {
          await client.query(
            `UPDATE ordenes_exportacion_lineas
             SET cantidad_cargada = LEAST(cantidad_solicitada, cantidad_cargada + $1)
             WHERE id = $2`,
            [add, pr.linea_id]
          );
          await client.query(
            `INSERT INTO ordenes_exportacion_linea_asignaciones (linea_id, lote, cantidad_bultos, origen, lote_produccion_id)
             VALUES ($1, $2, $3, 'produccion', $4)`,
            [pr.linea_id, loteCodigo, add, loteId]
          );
          detalleAplicado.push({ linea_id: pr.linea_id, agregado_bultos: add });
          restante -= add;
        }
      }

      applied.push({ producto_id, total_empaque_bultos: empBultos, aplicado: detalleAplicado, sin_op_bultos: restante });
    }

    await client.query(
      'INSERT INTO control_produccion_aplicacion (lote_id, usuario_id) VALUES ($1, $2)',
      [loteId, usuario_id]
    );

    await client.query('COMMIT');
    try {
      await emitirNotificacion(pool, {
        tipo: 'control_aplicado_op',
        modulo: 'Producción',
        severidad: 'success',
        titulo: `Control aplicado a OP (${loteCodigo})`,
        mensaje: 'El lote fue aplicado a ordenes de exportación.',
        origen_tabla: 'control_produccion_aplicacion',
        origen_id: loteId,
        metadata: { lote_id: loteId, lote_codigo: loteCodigo, usuario_id },
      });
    } catch (eNotif) {
      console.warn('Notificación control_aplicado_op:', eNotif.message);
    }
    res.json({ message: 'Aplicado a OP', data: applied });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('Error aplicando a OP:', error);
    res.status(500).json({ message: 'Error al aplicar a OP' });
  } finally {
    client.release();
  }
});

// Opciones de OP (líneas) para un producto: órdenes no completadas que tengan este producto
router.get('/opciones-op', async (req, res) => {
  try {
    const { producto_id } = req.query;
    if (!producto_id) return res.status(400).json({ message: 'producto_id es requerido' });

    const result = await pool.query(
      `SELECT oel.id AS linea_id, oel.orden_exportacion_id AS orden_id, oel.producto_id,
              oel.cantidad_solicitada, oel.cantidad_cargada, oel.completado_at,
              oe.numero_op, oe.estado AS orden_estado,
              p.formato AS producto_formato, p.unidad_medida AS producto_unidad_medida
       FROM ordenes_exportacion_lineas oel
       JOIN ordenes_exportacion oe ON oe.id = oel.orden_exportacion_id
       JOIN productos p ON p.id = oel.producto_id
       WHERE oel.producto_id = $1 AND oe.estado != 'Completo' AND oel.completado_at IS NULL
       ORDER BY oe.fecha_envio_op ASC, oe.numero_op`,
      [producto_id]
    );

    const rows = result.rows.map((r) => {
      const solBultos = Number(r.cantidad_solicitada) || 0;
      const cargBultos = Number(r.cantidad_cargada) || 0;
      const faltBultos = Math.max(0, solBultos - cargBultos);
      const solKg = bultosToKg(solBultos, r.producto_formato, r.producto_unidad_medida);
      const cargKg = bultosToKg(cargBultos, r.producto_formato, r.producto_unidad_medida);
      return {
        linea_id: r.linea_id,
        orden_id: r.orden_id,
        numero_op: r.numero_op,
        producto_id: r.producto_id,
        cantidad_solicitada: r.cantidad_solicitada,
        cantidad_cargada: r.cantidad_cargada,
        solicitado_bultos: solBultos,
        cargado_bultos: cargBultos,
        faltante_bultos: faltBultos,
        solicitado_kg: solKg,
        cargado_kg: cargKg,
        faltante_kg: Math.max(0, solKg - cargKg),
      };
    });
    res.json({ data: rows });
  } catch (error) {
    console.error('Error listando opciones OP:', error);
    res.status(500).json({ message: 'Error al listar OP' });
  }
});

// Guardar asignación OP por lote
router.put('/por-lote/:loteId/asignacion', async (req, res) => {
  try {
    await initTables();
    const { loteId } = req.params;
    const { asignacion } = req.body; // [{ producto_id, linea_ids: [uuid|null, ...] }] por prioridad

    const exist = await pool.query('SELECT id FROM lotes_produccion WHERE id = $1', [loteId]);
    if (exist.rows.length === 0) return res.status(404).json({ message: 'Lote no encontrado' });

    await pool.query('DELETE FROM control_produccion_asignacion WHERE lote_id = $1', [loteId]);

    if (Array.isArray(asignacion)) {
      for (const item of asignacion) {
        const producto_id = item.producto_id;
        const linea_ids = Array.isArray(item.linea_ids) ? item.linea_ids : [];
        for (let i = 0; i < linea_ids.length; i++) {
          const linea_id = linea_ids[i];
          await pool.query(
            `INSERT INTO control_produccion_asignacion (lote_id, producto_id, prioridad, orden_exportacion_linea_id)
             VALUES ($1, $2, $3, $4)`,
            [loteId, producto_id, i + 1, linea_id || null]
          );
        }
      }
    }

    const data = await pool.query(
      `SELECT lote_id, producto_id, prioridad, orden_exportacion_linea_id
       FROM control_produccion_asignacion WHERE lote_id = $1 ORDER BY producto_id, prioridad`,
      [loteId]
    );
    res.json({ data: data.rows });
  } catch (error) {
    console.error('Error guardando asignación:', error);
    res.status(500).json({ message: 'Error al guardar asignación' });
  }
});

export default router;
