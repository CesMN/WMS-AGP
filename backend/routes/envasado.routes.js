import express from 'express';
import { pool } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { buildPlantillaProcesoSnapshot, parsePlantillaSnapshot } from '../utils/plantillaProcesoSnapshot.js';
import { emitirNotificacion } from '../utils/notificaciones.js';

const router = express.Router();
router.use(authenticateToken);

const initTables = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS envasado (
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
    CREATE TABLE IF NOT EXISTS envasado_detalle (
      envasado_id UUID NOT NULL REFERENCES envasado(id) ON DELETE CASCADE,
      producto_id UUID NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
      datos_horas JSONB NOT NULL DEFAULT '{}',
      PRIMARY KEY (envasado_id, producto_id)
    )
  `);
  const encCols = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'envasado'`
  );
  const encNames = (encCols.rows || []).map((r) => r.column_name);
  if (!encNames.includes('columnas_hora')) {
    await pool.query('ALTER TABLE envasado ADD COLUMN columnas_hora JSONB');
  }
  await pool.query(`ALTER TABLE envasado ADD COLUMN IF NOT EXISTS plantilla_snapshot JSONB`);
};

// Lotes activos (Iniciado, En proceso) con cliente y especie del primer vehículo
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

// Listar envasados solo de lotes activos (Iniciado, En proceso)
router.get('/', async (req, res) => {
  try {
    await initTables();
    const result = await pool.query(
      `SELECT e.id, e.lote_id, e.plantilla_id, e.estado, e.finalizado_at, e.created_at,
              lp.codigo AS lote_codigo, lp.estado AS lote_estado,
              pp.titulo AS plantilla_titulo,
              c.nombre AS cliente_nombre, esp.nombre AS especie_nombre
       FROM envasado e
       JOIN lotes_produccion lp ON lp.id = e.lote_id
       JOIN plantillas_proceso pp ON pp.id = e.plantilla_id
       LEFT JOIN clientes c ON c.id = pp.cliente_id
       LEFT JOIN especies esp ON esp.id = pp.especie_id
       WHERE lp.estado IN ('Iniciado', 'En proceso')
       ORDER BY e.created_at DESC`
    );
    res.json({ data: result.rows });
  } catch (error) {
    console.error('Error listando envasados:', error);
    res.status(500).json({ message: 'Error al listar envasado' });
  }
});

// Obtener envasado por lote_id (para saber si ya tiene envasado iniciado)
router.get('/por-lote/:loteId', async (req, res) => {
  try {
    await initTables();
    const { loteId } = req.params;
    const result = await pool.query(
      `SELECT e.id, e.estado FROM envasado e WHERE e.lote_id = $1 LIMIT 1`,
      [loteId]
    );
    if (result.rows.length === 0) return res.json({ data: null });
    res.json({ data: result.rows[0] });
  } catch (error) {
    console.error('Error obteniendo envasado por lote:', error);
    res.status(500).json({ message: 'Error' });
  }
});

// Iniciar envasado (crear registro y detalle por cada producto de la plantilla predeterminada)
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

    const existing = await pool.query('SELECT id FROM envasado WHERE lote_id = $1', [lote_id]);
    if (existing.rows.length > 0) return res.status(400).json({ message: 'Este lote ya tiene envasado iniciado' });

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
      `INSERT INTO envasado (lote_id, plantilla_id, estado) VALUES ($1, $2, 'en_proceso') RETURNING id, lote_id, plantilla_id, estado, created_at`,
      [lote_id, plantilla_id]
    );
    const envasado_id = ins.rows[0].id;

    const productos = await pool.query(
      `SELECT producto_id FROM plantillas_proceso_productos WHERE plantilla_id = $1 ORDER BY orden, producto_id`,
      [plantilla_id]
    );
    for (const row of productos.rows) {
      await pool.query(
        `INSERT INTO envasado_detalle (envasado_id, producto_id, datos_horas) VALUES ($1, $2, '{}') ON CONFLICT (envasado_id, producto_id) DO NOTHING`,
        [envasado_id, row.producto_id]
      );
    }

    const full = await pool.query(
      `SELECT e.id, e.lote_id, e.plantilla_id, e.estado, lp.codigo AS lote_codigo, pp.titulo AS plantilla_titulo,
              c.nombre AS cliente_nombre, esp.nombre AS especie_nombre
       FROM envasado e
       JOIN lotes_produccion lp ON lp.id = e.lote_id
       JOIN plantillas_proceso pp ON pp.id = e.plantilla_id
       LEFT JOIN clientes c ON c.id = pp.cliente_id
       LEFT JOIN especies esp ON esp.id = pp.especie_id
       WHERE e.id = $1`,
      [envasado_id]
    );
    try {
      await emitirNotificacion(pool, {
        tipo: 'proceso_iniciado',
        modulo: 'Producción',
        severidad: 'info',
        titulo: `Envasado iniciado: ${full.rows[0]?.lote_codigo || 'Lote'}`,
        mensaje: 'Se inicio el proceso de envasado.',
        origen_tabla: 'envasado',
        origen_id: envasado_id,
        metadata: { proceso: 'envasado', envasado_id, lote_id: lote_id, usuario_id: req.user?.id || null },
      });
    } catch (eNotif) {
      console.warn('Notificación envasado iniciado:', eNotif.message);
    }
    res.status(201).json(full.rows[0]);
  } catch (error) {
    console.error('Error iniciando envasado:', error);
    res.status(500).json({ message: 'Error al iniciar envasado' });
  }
});

// Obtener un envasado con productos y datos_horas (sincronizado con la plantilla actual)
router.get('/:id', async (req, res) => {
  try {
    await initTables();
    const { id } = req.params;
    const enc = await pool.query(
      `SELECT e.id, e.lote_id, e.plantilla_id, e.estado, e.finalizado_at, e.created_at, e.columnas_hora, e.plantilla_snapshot,
              lp.codigo AS lote_codigo, lp.estado AS lote_estado,
              pp.titulo AS plantilla_titulo, pp.cliente_id, pp.especie_id,
              c.nombre AS cliente_nombre, esp.nombre AS especie_nombre
       FROM envasado e
       JOIN lotes_produccion lp ON lp.id = e.lote_id
       JOIN plantillas_proceso pp ON pp.id = e.plantilla_id
       LEFT JOIN clientes c ON c.id = pp.cliente_id
       LEFT JOIN especies esp ON esp.id = pp.especie_id
       WHERE e.id = $1`,
      [id]
    );
    if (enc.rows.length === 0) return res.status(404).json({ message: 'Envasado no encontrado' });
    const envasado = enc.rows[0];
    const plantilla_id = envasado.plantilla_id;
    const snap = parsePlantillaSnapshot(envasado.plantilla_snapshot);

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
        `INSERT INTO envasado_detalle (envasado_id, producto_id, datos_horas) VALUES ($1, $2, '{}')
         ON CONFLICT (envasado_id, producto_id) DO NOTHING`,
        [id, pid]
      );
    }

    let detalle;
    if (orderedIds.length === 0) {
      detalle = { rows: [] };
    } else {
      detalle = await pool.query(
        `SELECT ed.producto_id, ed.datos_horas,
                p.codigo, p.producto, p.descripcion, p.presentacion, p.formato
         FROM envasado_detalle ed
         JOIN productos p ON p.id = ed.producto_id
         WHERE ed.envasado_id = $1 AND ed.producto_id = ANY($2::uuid[])
         ORDER BY array_position($2::uuid[], ed.producto_id::uuid)`,
        [id, orderedIds]
      );
    }
    envasado.productos = detalle.rows.map((r) => ({
      producto_id: r.producto_id,
      codigo: r.codigo,
      producto: r.producto,
      descripcion: r.descripcion,
      presentacion: r.presentacion,
      formato: r.formato,
      datos_horas: typeof r.datos_horas === 'string' ? JSON.parse(r.datos_horas || '{}') : (r.datos_horas || {}),
    }));
    if (envasado.columnas_hora != null && typeof envasado.columnas_hora === 'string') {
      try {
        envasado.columnas_hora = JSON.parse(envasado.columnas_hora);
      } catch (_) {
        envasado.columnas_hora = null;
      }
    }
    res.json(envasado);
  } catch (error) {
    console.error('Error obteniendo envasado:', error);
    res.status(500).json({ message: 'Error al obtener envasado' });
  }
});

// Actualizar plantilla y/o datos_horas
router.put('/:id', async (req, res) => {
  try {
    await initTables();
    const { id } = req.params;
    const { plantilla_id, productos, columnas_horas } = req.body;

    const enc = await pool.query('SELECT id, estado FROM envasado WHERE id = $1', [id]);
    if (enc.rows.length === 0) return res.status(404).json({ message: 'Envasado no encontrado' });
    if (enc.rows[0].estado === 'finalizado') {
      return res.status(400).json({ message: 'No se puede editar un envasado finalizado' });
    }

    if (plantilla_id) {
      await pool.query(
        'UPDATE envasado SET plantilla_id = $1, columnas_hora = NULL, plantilla_snapshot = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [plantilla_id, id]
      );
      await pool.query('DELETE FROM envasado_detalle WHERE envasado_id = $1', [id]);
      const prods = await pool.query(
        'SELECT producto_id FROM plantillas_proceso_productos WHERE plantilla_id = $1 ORDER BY orden, producto_id',
        [plantilla_id]
      );
      for (const row of prods.rows) {
        await pool.query(
          'INSERT INTO envasado_detalle (envasado_id, producto_id, datos_horas) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
          [id, row.producto_id, JSON.stringify({})]
        );
      }
    }

    if (Array.isArray(columnas_horas) && columnas_horas.length > 0) {
      const cols = columnas_horas.map((c, i) => ({
        id: c.id != null ? String(c.id) : `col-${i}`,
        hora: Math.min(23, Math.max(0, parseInt(c.hora, 10) || 0)),
      }));
      await pool.query(
        'UPDATE envasado SET columnas_hora = $1::jsonb, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [JSON.stringify(cols), id]
      );
    }

    if (Array.isArray(productos)) {
      for (const item of productos) {
        if (!item.producto_id) continue;
        const datos = item.datos_horas && typeof item.datos_horas === 'object' && !Array.isArray(item.datos_horas)
          ? item.datos_horas
          : {};
        await pool.query(
          `UPDATE envasado_detalle SET datos_horas = $1::jsonb WHERE envasado_id = $2 AND producto_id = $3::uuid`,
          [JSON.stringify(datos), id, item.producto_id]
        );
      }
    }

    const full = await pool.query(
      `SELECT e.id, e.lote_id, e.plantilla_id, e.estado, e.updated_at,
              lp.codigo AS lote_codigo, pp.titulo AS plantilla_titulo,
              c.nombre AS cliente_nombre, esp.nombre AS especie_nombre
       FROM envasado e
       JOIN lotes_produccion lp ON lp.id = e.lote_id
       JOIN plantillas_proceso pp ON pp.id = e.plantilla_id
       LEFT JOIN clientes c ON c.id = pp.cliente_id
       LEFT JOIN especies esp ON esp.id = pp.especie_id
       WHERE e.id = $1`,
      [id]
    );
    res.json(full.rows[0]);
  } catch (error) {
    console.error('Error actualizando envasado:', error);
    res.status(500).json({ message: 'Error al actualizar' });
  }
});

// Finalizar envasado
router.post('/:id/finalizar', async (req, res) => {
  try {
    await initTables();
    const { id } = req.params;
    const enc = await pool.query('SELECT id, estado, lote_id, plantilla_id FROM envasado WHERE id = $1', [id]);
    if (enc.rows.length === 0) return res.status(404).json({ message: 'Envasado no encontrado' });
    if (enc.rows[0].estado === 'finalizado') return res.status(400).json({ message: 'Ya está finalizado' });

    const loteRow = await pool.query('SELECT codigo FROM lotes_produccion WHERE id = $1', [enc.rows[0].lote_id]);
    const loteCodigo = loteRow.rows[0]?.codigo ?? null;
    const snap = await buildPlantillaProcesoSnapshot(pool, enc.rows[0].plantilla_id, loteCodigo);
    const snapJson = snap ? JSON.stringify(snap) : null;

    await pool.query(
      `UPDATE envasado SET estado = 'finalizado', finalizado_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP,
            plantilla_snapshot = $2::jsonb
       WHERE id = $1`,
      [id, snapJson]
    );
    const updated = await pool.query('SELECT id, estado, finalizado_at FROM envasado WHERE id = $1', [id]);
    try {
      await emitirNotificacion(pool, {
        tipo: 'proceso_finalizado',
        modulo: 'Producción',
        severidad: 'success',
        titulo: 'Envasado finalizado',
        mensaje: 'El proceso de envasado fue finalizado.',
        origen_tabla: 'envasado',
        origen_id: id,
        metadata: { proceso: 'envasado', envasado_id: id, usuario_id: req.user?.id || null },
      });
    } catch (eNotif) {
      console.warn('Notificación envasado finalizado:', eNotif.message);
    }
    res.json(updated.rows[0]);
  } catch (error) {
    console.error('Error finalizando envasado:', error);
    res.status(500).json({ message: 'Error al finalizar' });
  }
});

// Reabrir envasado (solo admin)
router.patch('/:id/reabrir', async (req, res) => {
  try {
    const { id } = req.params;
    const enc = await pool.query('SELECT id, estado FROM envasado WHERE id = $1', [id]);
    if (enc.rows.length === 0) return res.status(404).json({ message: 'Envasado no encontrado' });
    if (enc.rows[0].estado !== 'finalizado') return res.status(400).json({ message: 'Solo se puede reabrir un envasado finalizado' });

    await pool.query(
      `UPDATE envasado SET estado = 'en_proceso', finalizado_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [id]
    );
    const updated = await pool.query('SELECT id, estado FROM envasado WHERE id = $1', [id]);
    try {
      await emitirNotificacion(pool, {
        tipo: 'proceso_reabierto',
        modulo: 'Producción',
        severidad: 'warning',
        titulo: 'Envasado reabierto',
        mensaje: 'Se reabrió un proceso de envasado finalizado.',
        origen_tabla: 'envasado',
        origen_id: id,
        metadata: { proceso: 'envasado', envasado_id: id, usuario_id: req.user?.id || null },
      });
    } catch (eNotif) {
      console.warn('Notificación envasado reabierto:', eNotif.message);
    }
    res.json(updated.rows[0]);
  } catch (error) {
    console.error('Error reabriendo envasado:', error);
    res.status(500).json({ message: 'Error al reabrir' });
  }
});

export default router;
