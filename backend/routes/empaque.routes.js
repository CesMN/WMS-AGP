import express from 'express';
import { pool } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { buildPlantillaProcesoSnapshot, parsePlantillaSnapshot } from '../utils/plantillaProcesoSnapshot.js';
import { emitirNotificacion } from '../utils/notificaciones.js';

const router = express.Router();
router.use(authenticateToken);

const initTables = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS empaque (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      lote_id UUID NOT NULL REFERENCES lotes_produccion(id) ON DELETE CASCADE,
      plantilla_id UUID NOT NULL REFERENCES plantillas_proceso(id) ON DELETE RESTRICT,
      estado VARCHAR(20) NOT NULL DEFAULT 'en_proceso',
      finalizado_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS empaque_detalle (
      empaque_id UUID NOT NULL REFERENCES empaque(id) ON DELETE CASCADE,
      producto_id UUID NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
      datos_horas JSONB NOT NULL DEFAULT '{}',
      PRIMARY KEY (empaque_id, producto_id)
    )
  `);
  await pool.query(`ALTER TABLE empaque ADD COLUMN IF NOT EXISTS plantilla_snapshot JSONB`);
  const empCols = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'empaque'`
  );
  const empNames = (empCols.rows || []).map((r) => r.column_name);
  if (!empNames.includes('columnas_hora')) {
    await pool.query('ALTER TABLE empaque ADD COLUMN columnas_hora JSONB');
  }
};

/** Asegura columna origen en parihuelas (planilla manual vs. generación normal). */
const ensureParihuelasOrigen = async () => {
  const cols = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'parihuelas_produccion'`
  );
  const names = (cols.rows || []).map((r) => r.column_name);
  if (!names.includes('origen')) {
    await pool.query(`ALTER TABLE parihuelas_produccion ADD COLUMN origen VARCHAR(40) DEFAULT 'NORMAL'`);
  }
};

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

router.get('/', async (req, res) => {
  try {
    await initTables();
    const result = await pool.query(
      `SELECT e.id, e.lote_id, e.plantilla_id, e.estado, e.finalizado_at, e.created_at,
              lp.codigo AS lote_codigo, lp.estado AS lote_estado,
              pp.titulo AS plantilla_titulo,
              c.nombre AS cliente_nombre, esp.nombre AS especie_nombre
       FROM empaque e
       JOIN lotes_produccion lp ON lp.id = e.lote_id
       JOIN plantillas_proceso pp ON pp.id = e.plantilla_id
       LEFT JOIN clientes c ON c.id = pp.cliente_id
       LEFT JOIN especies esp ON esp.id = pp.especie_id
       WHERE lp.estado IN ('Iniciado', 'En proceso')
       ORDER BY e.created_at DESC`
    );
    res.json({ data: result.rows });
  } catch (error) {
    console.error('Error listando empaques:', error);
    res.status(500).json({ message: 'Error al listar empaque' });
  }
});

router.get('/por-lote/:loteId', async (req, res) => {
  try {
    await initTables();
    const { loteId } = req.params;
    const result = await pool.query(
      `SELECT e.id, e.estado FROM empaque e WHERE e.lote_id = $1 LIMIT 1`,
      [loteId]
    );
    if (result.rows.length === 0) return res.json({ data: null });
    res.json({ data: result.rows[0] });
  } catch (error) {
    console.error('Error obteniendo empaque por lote:', error);
    res.status(500).json({ message: 'Error' });
  }
});

router.post('/', async (req, res) => {
  try {
    await initTables();
    const { lote_id } = req.body;
    if (!lote_id) return res.status(400).json({ message: 'lote_id es requerido' });

    const lote = await pool.query(
      'SELECT id, codigo, estado FROM lotes_produccion WHERE id = $1',
      [lote_id]
    );
    if (lote.rows.length === 0) return res.status(404).json({ message: 'Lote no encontrado' });
    if (!['Iniciado', 'En proceso'].includes(lote.rows[0].estado)) {
      return res.status(400).json({ message: 'El lote debe estar Iniciado o En proceso' });
    }

    const existing = await pool.query('SELECT id FROM empaque WHERE lote_id = $1', [lote_id]);
    if (existing.rows.length > 0) return res.status(400).json({ message: 'Este lote ya tiene empaque iniciado' });

    const firstVeh = await pool.query(
      'SELECT cliente_id, especie_id FROM vehiculos_lote WHERE lote_produccion_id = $1 ORDER BY numero_orden, created_at LIMIT 1',
      [lote_id]
    );
    const cliente_id = firstVeh.rows[0]?.cliente_id;
    const especie_id = firstVeh.rows[0]?.especie_id;
    if (!cliente_id || !especie_id) {
      return res.status(400).json({ message: 'El lote debe tener al menos un vehículo con cliente y especie' });
    }

    const plantilla = await pool.query(
      `SELECT id FROM plantillas_proceso WHERE cliente_id = $1 AND especie_id = $2 AND es_predeterminada = TRUE LIMIT 1`,
      [cliente_id, especie_id]
    );
    if (plantilla.rows.length === 0) {
      return res.status(400).json({ message: 'No hay plantilla predeterminada para el cliente y especie de este lote' });
    }
    const plantilla_id = plantilla.rows[0].id;

    const ins = await pool.query(
      `INSERT INTO empaque (lote_id, plantilla_id, estado) VALUES ($1, $2, 'en_proceso') RETURNING id, lote_id, plantilla_id, estado, created_at`,
      [lote_id, plantilla_id]
    );
    const empaque_id = ins.rows[0].id;

    const productos = await pool.query(
      `SELECT producto_id FROM plantillas_proceso_productos WHERE plantilla_id = $1 ORDER BY orden, producto_id`,
      [plantilla_id]
    );
    for (const row of productos.rows) {
      await pool.query(
        `INSERT INTO empaque_detalle (empaque_id, producto_id, datos_horas) VALUES ($1, $2, '{}') ON CONFLICT (empaque_id, producto_id) DO NOTHING`,
        [empaque_id, row.producto_id]
      );
    }

    const full = await pool.query(
      `SELECT e.id, e.lote_id, e.plantilla_id, e.estado, lp.codigo AS lote_codigo, pp.titulo AS plantilla_titulo,
              c.nombre AS cliente_nombre, esp.nombre AS especie_nombre
       FROM empaque e
       JOIN lotes_produccion lp ON lp.id = e.lote_id
       JOIN plantillas_proceso pp ON pp.id = e.plantilla_id
       LEFT JOIN clientes c ON c.id = pp.cliente_id
       LEFT JOIN especies esp ON esp.id = pp.especie_id
       WHERE e.id = $1`,
      [empaque_id]
    );
    try {
      await emitirNotificacion(pool, {
        tipo: 'proceso_iniciado',
        modulo: 'Producción',
        severidad: 'info',
        titulo: `Empaque iniciado: ${full.rows[0]?.lote_codigo || 'Lote'}`,
        mensaje: 'Se inicio el proceso de empaque.',
        origen_tabla: 'empaque',
        origen_id: empaque_id,
        metadata: { proceso: 'empaque', empaque_id, lote_id: lote_id, usuario_id: req.user?.id || null },
      });
    } catch (eNotif) {
      console.warn('Notificación empaque iniciado:', eNotif.message);
    }
    res.status(201).json(full.rows[0]);
  } catch (error) {
    console.error('Error iniciando empaque:', error);
    res.status(500).json({ message: 'Error al iniciar empaque' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    await initTables();
    const { id } = req.params;
    const enc = await pool.query(
      `SELECT e.id, e.lote_id, e.plantilla_id, e.estado, e.finalizado_at, e.created_at, e.plantilla_snapshot, e.columnas_hora,
              lp.codigo AS lote_codigo, lp.estado AS lote_estado,
              pp.titulo AS plantilla_titulo, pp.cliente_id, pp.especie_id,
              c.nombre AS cliente_nombre, esp.nombre AS especie_nombre
       FROM empaque e
       JOIN lotes_produccion lp ON lp.id = e.lote_id
       JOIN plantillas_proceso pp ON pp.id = e.plantilla_id
       LEFT JOIN clientes c ON c.id = pp.cliente_id
       LEFT JOIN especies esp ON esp.id = pp.especie_id
       WHERE e.id = $1`,
      [id]
    );
    if (enc.rows.length === 0) return res.status(404).json({ message: 'Empaque no encontrado' });
    const empaque = enc.rows[0];
    if (empaque.columnas_hora != null && typeof empaque.columnas_hora === 'string') {
      try {
        empaque.columnas_hora = JSON.parse(empaque.columnas_hora);
      } catch {
        empaque.columnas_hora = null;
      }
    }
    const plantilla_id = empaque.plantilla_id;
    const snap = parsePlantillaSnapshot(empaque.plantilla_snapshot);

    let orderedIds = [];
    if (snap?.productos?.length) {
      orderedIds = snap.productos.map((x) => x.producto_id).filter(Boolean);
    } else {
      const plantillaProds = await pool.query(
        'SELECT producto_id FROM plantillas_proceso_productos WHERE plantilla_id = $1 ORDER BY orden, producto_id',
        [plantilla_id]
      );
      orderedIds = plantillaProds.rows.map((r) => r.producto_id);
    }
    for (const pid of orderedIds) {
      await pool.query(
        `INSERT INTO empaque_detalle (empaque_id, producto_id, datos_horas) VALUES ($1, $2, '{}')
         ON CONFLICT (empaque_id, producto_id) DO NOTHING`,
        [id, pid]
      );
    }

    let detalle;
    if (orderedIds.length === 0) {
      detalle = { rows: [] };
    } else {
      detalle = await pool.query(
        `SELECT ed.producto_id, ed.datos_horas,
                p.codigo, p.producto, p.descripcion, p.presentacion, p.formato, p.unidad_parihuela
         FROM empaque_detalle ed
         JOIN productos p ON p.id = ed.producto_id
         WHERE ed.empaque_id = $1 AND ed.producto_id = ANY($2::uuid[])
         ORDER BY array_position($2::uuid[], ed.producto_id::uuid)`,
        [id, orderedIds]
      );
    }
    empaque.productos = detalle.rows.map((r) => ({
      producto_id: r.producto_id,
      codigo: r.codigo,
      producto: r.producto,
      descripcion: r.descripcion,
      presentacion: r.presentacion,
      formato: r.formato,
      unidad_parihuela: r.unidad_parihuela || 'BULTOS',
      datos_horas: typeof r.datos_horas === 'string' ? JSON.parse(r.datos_horas || '{}') : (r.datos_horas || {}),
    }));
    res.json(empaque);
  } catch (error) {
    console.error('Error obteniendo empaque:', error);
    res.status(500).json({ message: 'Error al obtener empaque' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    await initTables();
    const { id } = req.params;
    const { plantilla_id, productos, columnas_horas } = req.body;

    const enc = await pool.query('SELECT id, estado FROM empaque WHERE id = $1', [id]);
    if (enc.rows.length === 0) return res.status(404).json({ message: 'Empaque no encontrado' });
    if (enc.rows[0].estado === 'finalizado') {
      return res.status(400).json({ message: 'No se puede editar un empaque finalizado' });
    }

    if (plantilla_id) {
      await pool.query(
        'UPDATE empaque SET plantilla_id = $1, plantilla_snapshot = NULL, columnas_hora = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [plantilla_id, id]
      );
      await pool.query('DELETE FROM empaque_detalle WHERE empaque_id = $1', [id]);
      const prods = await pool.query(
        'SELECT producto_id FROM plantillas_proceso_productos WHERE plantilla_id = $1 ORDER BY orden, producto_id',
        [plantilla_id]
      );
      for (const row of prods.rows) {
        await pool.query(
          'INSERT INTO empaque_detalle (empaque_id, producto_id, datos_horas) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
          [id, row.producto_id, JSON.stringify({})]
        );
      }
    }

    if (Array.isArray(productos)) {
      for (const item of productos) {
        if (!item.producto_id) continue;
        const datos = item.datos_horas && typeof item.datos_horas === 'object' ? item.datos_horas : {};
        await pool.query(
          `UPDATE empaque_detalle SET datos_horas = $1 WHERE empaque_id = $2 AND producto_id = $3`,
          [JSON.stringify(datos), id, item.producto_id]
        );
      }
    }

    if (Array.isArray(columnas_horas) && columnas_horas.length > 0) {
      const cols = columnas_horas.map((c, i) => ({
        id: c.id != null ? String(c.id) : `col-${i}`,
        hora: Math.min(23, Math.max(0, Number(c.hora) || 0)),
      }));
      await pool.query(
        'UPDATE empaque SET columnas_hora = $1::jsonb, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [JSON.stringify(cols), id]
      );
    }

    const full = await pool.query(
      `SELECT e.id, e.lote_id, e.plantilla_id, e.estado, e.updated_at,
              lp.codigo AS lote_codigo, pp.titulo AS plantilla_titulo,
              c.nombre AS cliente_nombre, esp.nombre AS especie_nombre
       FROM empaque e
       JOIN lotes_produccion lp ON lp.id = e.lote_id
       JOIN plantillas_proceso pp ON pp.id = e.plantilla_id
       LEFT JOIN clientes c ON c.id = pp.cliente_id
       LEFT JOIN especies esp ON esp.id = pp.especie_id
       WHERE e.id = $1`,
      [id]
    );
    res.json(full.rows[0]);
  } catch (error) {
    console.error('Error actualizando empaque:', error);
    res.status(500).json({ message: 'Error al actualizar' });
  }
});

/** Crea parihuelas EN_TRANSITO desde datos_horas (planilla manual). Reemplaza solo las anteriores de origen PLANILLA_MANUAL. */
router.post('/:id/enviar-planilla-recepcion', async (req, res) => {
  try {
    await initTables();
    await ensureParihuelasOrigen();
    const usuario_id = req.user?.id;
    if (!usuario_id) return res.status(401).json({ message: 'Usuario no autenticado' });
    const { id: empaque_id } = req.params;

    const enc = await pool.query(`SELECT e.id, e.lote_id, e.estado FROM empaque e WHERE e.id = $1`, [empaque_id]);
    if (enc.rows.length === 0) return res.status(404).json({ message: 'Empaque no encontrado' });
    if (enc.rows[0].estado === 'finalizado') {
      return res.status(400).json({ message: 'No se puede enviar: el empaque está finalizado' });
    }
    const lote_id = enc.rows[0].lote_id;

    await pool.query(
      `DELETE FROM parihuelas_produccion
       WHERE empaque_id = $1 AND estado = 'EN_TRANSITO' AND COALESCE(origen, 'NORMAL') = 'PLANILLA_MANUAL'`,
      [empaque_id]
    );

    const detalle = await pool.query(
      `SELECT ed.producto_id, ed.datos_horas,
              p.capacidad_parihuela_bultos, p.capacidad_parihuela_cajas, p.unidad_parihuela
       FROM empaque_detalle ed
       JOIN productos p ON p.id = ed.producto_id
       WHERE ed.empaque_id = $1`,
      [empaque_id]
    );

    let creadas = 0;
    for (const row of detalle.rows) {
      let datos_horas = row.datos_horas;
      if (typeof datos_horas === 'string') {
        try {
          datos_horas = JSON.parse(datos_horas || '{}');
        } catch {
          datos_horas = {};
        }
      }
      datos_horas = datos_horas || {};
      const unidadProd = (row.unidad_parihuela || 'BULTOS').toUpperCase() === 'CAJAS' ? 'CAJAS' : 'BULTOS';
      const capB = Number(row.capacidad_parihuela_bultos) || 0;
      const capC = Number(row.capacidad_parihuela_cajas) || 0;
      const capacidad = unidadProd === 'CAJAS' ? capC : capB;

      for (const [horaKey, rawVal] of Object.entries(datos_horas)) {
        const horaNum = parseInt(horaKey, 10);
        if (Number.isNaN(horaNum) || horaNum < 0 || horaNum > 23) continue;
        const cant = Number(rawVal);
        if (!cant || cant <= 0) continue;

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

        const refBase = `MP H${String(horaNum).padStart(2, '0')}`;
        for (const item of lotesAInsertar) {
          await pool.query(
            `INSERT INTO parihuelas_produccion (lote_id, empaque_id, producto_id, cantidad, unidad_parihuela, es_completa, estado, referencia, hora, usuario_empaque_id, origen)
             VALUES ($1, $2, $3, $4, $5, $6, 'EN_TRANSITO', $7, $8, $9, 'PLANILLA_MANUAL')`,
            [lote_id, empaque_id, row.producto_id, item.cantidad, unidadProd, item.es_completa, refBase, horaNum, usuario_id]
          );
          creadas += 1;
        }
      }
    }

    res.json({
      message: 'Parihuelas generadas desde la planilla manual. Aparecen en Recepción de parihuelas.',
      creadas,
    });
  } catch (error) {
    console.error('Error enviando planilla a recepción:', error);
    res.status(500).json({ message: 'Error al generar parihuelas desde la planilla' });
  }
});

router.post('/:id/finalizar', async (req, res) => {
  try {
    await initTables();
    const { id } = req.params;
    const enc = await pool.query('SELECT id, estado, lote_id, plantilla_id FROM empaque WHERE id = $1', [id]);
    if (enc.rows.length === 0) return res.status(404).json({ message: 'Empaque no encontrado' });
    if (enc.rows[0].estado === 'finalizado') return res.status(400).json({ message: 'Ya está finalizado' });

    const enTransito = await pool.query(
      'SELECT COUNT(*)::INT AS c FROM parihuelas_produccion WHERE lote_id = $1 AND estado = $2',
      [enc.rows[0].lote_id, 'EN_TRANSITO']
    );
    if ((enTransito.rows[0]?.c || 0) > 0) {
      return res.status(400).json({
        message: 'No se puede finalizar: hay parihuelas en tránsito. Recepcione todas en Recepción de parihuelas.',
      });
    }

    const loteRow = await pool.query('SELECT codigo FROM lotes_produccion WHERE id = $1', [enc.rows[0].lote_id]);
    const loteCodigo = loteRow.rows[0]?.codigo ?? null;
    const snap = await buildPlantillaProcesoSnapshot(pool, enc.rows[0].plantilla_id, loteCodigo);
    const snapJson = snap ? JSON.stringify(snap) : null;

    await pool.query(
      `UPDATE empaque SET estado = 'finalizado', finalizado_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP,
            plantilla_snapshot = $2::jsonb
       WHERE id = $1`,
      [id, snapJson]
    );
    const updated = await pool.query('SELECT id, estado, finalizado_at FROM empaque WHERE id = $1', [id]);
    try {
      await emitirNotificacion(pool, {
        tipo: 'proceso_finalizado',
        modulo: 'Producción',
        severidad: 'success',
        titulo: 'Empaque finalizado',
        mensaje: 'El proceso de empaque fue finalizado.',
        origen_tabla: 'empaque',
        origen_id: id,
        metadata: { proceso: 'empaque', empaque_id: id, usuario_id: req.user?.id || null },
      });
    } catch (eNotif) {
      console.warn('Notificación empaque finalizado:', eNotif.message);
    }
    res.json(updated.rows[0]);
  } catch (error) {
    console.error('Error finalizando empaque:', error);
    res.status(500).json({ message: 'Error al finalizar' });
  }
});

router.patch('/:id/reabrir', async (req, res) => {
  try {
    const { id } = req.params;
    const enc = await pool.query('SELECT id, estado FROM empaque WHERE id = $1', [id]);
    if (enc.rows.length === 0) return res.status(404).json({ message: 'Empaque no encontrado' });
    if (enc.rows[0].estado !== 'finalizado') return res.status(400).json({ message: 'Solo se puede reabrir un empaque finalizado' });

    await pool.query(
      `UPDATE empaque SET estado = 'en_proceso', finalizado_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [id]
    );
    const updated = await pool.query('SELECT id, estado FROM empaque WHERE id = $1', [id]);
    try {
      await emitirNotificacion(pool, {
        tipo: 'proceso_reabierto',
        modulo: 'Producción',
        severidad: 'warning',
        titulo: 'Empaque reabierto',
        mensaje: 'Se reabrió un proceso de empaque finalizado.',
        origen_tabla: 'empaque',
        origen_id: id,
        metadata: { proceso: 'empaque', empaque_id: id, usuario_id: req.user?.id || null },
      });
    } catch (eNotif) {
      console.warn('Notificación empaque reabierto:', eNotif.message);
    }
    res.json(updated.rows[0]);
  } catch (error) {
    console.error('Error reabriendo empaque:', error);
    res.status(500).json({ message: 'Error al reabrir' });
  }
});

export default router;
