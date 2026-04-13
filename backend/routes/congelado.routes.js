import express from 'express';
import { pool } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { buildPlantillaProcesoSnapshot, parsePlantillaSnapshot } from '../utils/plantillaProcesoSnapshot.js';
import { emitirNotificacion } from '../utils/notificaciones.js';

const router = express.Router();
router.use(authenticateToken);

const initTables = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS congelado (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      lote_id UUID NOT NULL REFERENCES lotes_produccion(id) ON DELETE CASCADE,
      plantilla_id UUID NOT NULL REFERENCES plantillas_proceso(id) ON DELETE RESTRICT,
      estado VARCHAR(20) NOT NULL DEFAULT 'en_proceso',
      columnas JSONB NOT NULL DEFAULT '[]',
      finalizado_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS congelado_detalle (
      congelado_id UUID NOT NULL REFERENCES congelado(id) ON DELETE CASCADE,
      producto_id UUID NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
      datos_columnas JSONB NOT NULL DEFAULT '{}',
      PRIMARY KEY (congelado_id, producto_id)
    )
  `);
  await pool.query(`ALTER TABLE congelado ADD COLUMN IF NOT EXISTS plantilla_snapshot JSONB`);
};

/** Solo campos serializables válidos para JSONB (evita fallos al guardar). */
function sanitizeColumnasForDb(columnas) {
  if (!Array.isArray(columnas)) return [];
  return columnas.map((c, i) => {
    const hora = Math.min(23, Math.max(0, parseInt(c.hora, 10) || 0));
    let hora_inicio =
      typeof c.hora_inicio === 'string' && /^\d{1,2}:\d{2}$/.test(c.hora_inicio.trim())
        ? c.hora_inicio.trim()
        : `${String(hora).padStart(2, '0')}:00`;
    const [hh, mm] = hora_inicio.split(':').map((x) => parseInt(x, 10) || 0);
    hora_inicio = `${String(Math.min(23, Math.max(0, hh))).padStart(2, '0')}:${String(Math.min(59, Math.max(0, mm))).padStart(2, '0')}`;
    return {
      id: String(c.id != null ? c.id : `col-${i}`),
      tipo: c.tipo === 'placa' ? 'placa' : 'tunel',
      numero: Math.min(10, Math.max(1, parseInt(c.numero, 10) || 1)),
      hora: parseInt(hora_inicio.split(':')[0], 10) || hora,
      hora_inicio,
    };
  });
}

function sanitizeDatosColumnasForDb(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k == null || typeof k !== 'string') continue;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) continue;
    out[k] = Math.floor(n);
  }
  return out;
}

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
      `SELECT c.id, c.lote_id, c.plantilla_id, c.estado, c.finalizado_at, c.created_at,
              lp.codigo AS lote_codigo, lp.estado AS lote_estado,
              pp.titulo AS plantilla_titulo,
              cl.nombre AS cliente_nombre, esp.nombre AS especie_nombre
       FROM congelado c
       JOIN lotes_produccion lp ON lp.id = c.lote_id
       JOIN plantillas_proceso pp ON pp.id = c.plantilla_id
       LEFT JOIN clientes cl ON cl.id = pp.cliente_id
       LEFT JOIN especies esp ON esp.id = pp.especie_id
       WHERE lp.estado IN ('Iniciado', 'En proceso')
       ORDER BY c.created_at DESC`
    );
    res.json({ data: result.rows });
  } catch (error) {
    console.error('Error listando congelados:', error);
    res.status(500).json({ message: 'Error al listar congelado' });
  }
});

router.get('/por-lote/:loteId', async (req, res) => {
  try {
    await initTables();
    const { loteId } = req.params;
    const result = await pool.query(
      `SELECT c.id, c.estado FROM congelado c WHERE c.lote_id = $1 LIMIT 1`,
      [loteId]
    );
    if (result.rows.length === 0) return res.json({ data: null });
    res.json({ data: result.rows[0] });
  } catch (error) {
    console.error('Error obteniendo congelado por lote:', error);
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

    const existing = await pool.query('SELECT id FROM congelado WHERE lote_id = $1', [lote_id]);
    if (existing.rows.length > 0) return res.status(400).json({ message: 'Este lote ya tiene congelado iniciado' });

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

    const columnasInicial = Array.from({ length: 5 }, (_, i) => {
      const h = 7 + i;
      return {
        id: `col-${i}-${Date.now()}`,
        tipo: 'tunel',
        numero: 1,
        hora: h,
        hora_inicio: `${String(h).padStart(2, '0')}:00`,
      };
    });

    const ins = await pool.query(
      `INSERT INTO congelado (lote_id, plantilla_id, estado, columnas) VALUES ($1, $2, 'en_proceso', $3) RETURNING id, lote_id, plantilla_id, estado, columnas, created_at`,
      [lote_id, plantilla_id, JSON.stringify(columnasInicial)]
    );
    const congelado_id = ins.rows[0].id;

    const productos = await pool.query(
      `SELECT producto_id FROM plantillas_proceso_productos WHERE plantilla_id = $1 ORDER BY orden, producto_id`,
      [plantilla_id]
    );
    for (const row of productos.rows) {
      await pool.query(
        `INSERT INTO congelado_detalle (congelado_id, producto_id, datos_columnas) VALUES ($1, $2, '{}') ON CONFLICT (congelado_id, producto_id) DO NOTHING`,
        [congelado_id, row.producto_id]
      );
    }

    const full = await pool.query(
      `SELECT c.id, c.lote_id, c.plantilla_id, c.estado, c.columnas, lp.codigo AS lote_codigo, pp.titulo AS plantilla_titulo,
              cl.nombre AS cliente_nombre, esp.nombre AS especie_nombre
       FROM congelado c
       JOIN lotes_produccion lp ON lp.id = c.lote_id
       JOIN plantillas_proceso pp ON pp.id = c.plantilla_id
       LEFT JOIN clientes cl ON cl.id = pp.cliente_id
       LEFT JOIN especies esp ON esp.id = pp.especie_id
       WHERE c.id = $1`,
      [congelado_id]
    );
    const row = full.rows[0];
    if (row && row.columnas && typeof row.columnas === 'string') row.columnas = JSON.parse(row.columnas);
    try {
      await emitirNotificacion(pool, {
        tipo: 'proceso_iniciado',
        modulo: 'Producción',
        severidad: 'info',
        titulo: `Congelado iniciado: ${row?.lote_codigo || 'Lote'}`,
        mensaje: 'Se inicio el proceso de congelado.',
        origen_tabla: 'congelado',
        origen_id: congelado_id,
        metadata: { proceso: 'congelado', congelado_id, lote_id: lote_id, usuario_id: req.user?.id || null },
      });
    } catch (eNotif) {
      console.warn('Notificación congelado iniciado:', eNotif.message);
    }
    res.status(201).json(row);
  } catch (error) {
    console.error('Error iniciando congelado:', error);
    res.status(500).json({ message: 'Error al iniciar congelado' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    await initTables();
    const { id } = req.params;
    const enc = await pool.query(
      `SELECT c.id, c.lote_id, c.plantilla_id, c.estado, c.columnas, c.finalizado_at, c.created_at, c.plantilla_snapshot,
              lp.codigo AS lote_codigo, lp.estado AS lote_estado,
              pp.titulo AS plantilla_titulo, pp.cliente_id, pp.especie_id,
              cl.nombre AS cliente_nombre, esp.nombre AS especie_nombre
       FROM congelado c
       JOIN lotes_produccion lp ON lp.id = c.lote_id
       JOIN plantillas_proceso pp ON pp.id = c.plantilla_id
       LEFT JOIN clientes cl ON cl.id = pp.cliente_id
       LEFT JOIN especies esp ON esp.id = pp.especie_id
       WHERE c.id = $1`,
      [id]
    );
    if (enc.rows.length === 0) return res.status(404).json({ message: 'Congelado no encontrado' });
    const congelado = enc.rows[0];
    const plantilla_id = congelado.plantilla_id;
    if (congelado.columnas && typeof congelado.columnas === 'string') {
      congelado.columnas = JSON.parse(congelado.columnas);
    }
    if (!Array.isArray(congelado.columnas)) congelado.columnas = [];

    const snap = parsePlantillaSnapshot(congelado.plantilla_snapshot);

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
        `INSERT INTO congelado_detalle (congelado_id, producto_id, datos_columnas) VALUES ($1, $2, '{}')
         ON CONFLICT (congelado_id, producto_id) DO NOTHING`,
        [id, pid]
      );
    }

    let detalle;
    if (orderedIds.length === 0) {
      detalle = { rows: [] };
    } else {
      detalle = await pool.query(
        `SELECT cd.producto_id, cd.datos_columnas,
                p.codigo, p.producto, p.descripcion, p.presentacion, p.formato
         FROM congelado_detalle cd
         JOIN productos p ON p.id = cd.producto_id
         WHERE cd.congelado_id = $1 AND cd.producto_id = ANY($2::uuid[])
         ORDER BY array_position($2::uuid[], cd.producto_id::uuid)`,
        [id, orderedIds]
      );
    }
    congelado.productos = detalle.rows.map((r) => ({
      producto_id: r.producto_id,
      codigo: r.codigo,
      producto: r.producto,
      descripcion: r.descripcion,
      presentacion: r.presentacion,
      formato: r.formato,
      datos_columnas: typeof r.datos_columnas === 'string' ? JSON.parse(r.datos_columnas || '{}') : (r.datos_columnas || {}),
    }));
    res.json(congelado);
  } catch (error) {
    console.error('Error obteniendo congelado:', error);
    res.status(500).json({ message: 'Error al obtener congelado' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    await initTables();
    const { id } = req.params;
    const { plantilla_id, columnas, productos } = req.body;

    const enc = await pool.query('SELECT id, estado FROM congelado WHERE id = $1', [id]);
    if (enc.rows.length === 0) return res.status(404).json({ message: 'Congelado no encontrado' });
    if (enc.rows[0].estado === 'finalizado') {
      return res.status(400).json({ message: 'No se puede editar un congelado finalizado' });
    }

    if (plantilla_id) {
      await pool.query(
        'UPDATE congelado SET plantilla_id = $1, plantilla_snapshot = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [plantilla_id, id]
      );
      await pool.query('DELETE FROM congelado_detalle WHERE congelado_id = $1', [id]);
      const prods = await pool.query(
        'SELECT producto_id FROM plantillas_proceso_productos WHERE plantilla_id = $1 ORDER BY orden, producto_id',
        [plantilla_id]
      );
      for (const row of prods.rows) {
        await pool.query(
          `INSERT INTO congelado_detalle (congelado_id, producto_id, datos_columnas)
           VALUES ($1::uuid, $2::uuid, '{}'::jsonb)
           ON CONFLICT (congelado_id, producto_id) DO NOTHING`,
          [id, row.producto_id]
        );
      }
    }

    if (Array.isArray(columnas)) {
      const colsJson = JSON.stringify(sanitizeColumnasForDb(columnas));
      await pool.query(
        'UPDATE congelado SET columnas = $1::jsonb, updated_at = CURRENT_TIMESTAMP WHERE id = $2::uuid',
        [colsJson, id]
      );
    }

    if (Array.isArray(productos)) {
      for (const item of productos) {
        if (!item.producto_id) continue;
        const datos = sanitizeDatosColumnasForDb(item.datos_columnas);
        await pool.query(
          `UPDATE congelado_detalle SET datos_columnas = $1::jsonb
           WHERE congelado_id = $2::uuid AND producto_id = $3::uuid`,
          [JSON.stringify(datos), id, item.producto_id]
        );
      }
    }

    const full = await pool.query(
      `SELECT c.id, c.lote_id, c.plantilla_id, c.estado, c.columnas, c.updated_at,
              lp.codigo AS lote_codigo, pp.titulo AS plantilla_titulo,
              cl.nombre AS cliente_nombre, esp.nombre AS especie_nombre
       FROM congelado c
       JOIN lotes_produccion lp ON lp.id = c.lote_id
       JOIN plantillas_proceso pp ON pp.id = c.plantilla_id
       LEFT JOIN clientes cl ON cl.id = pp.cliente_id
       LEFT JOIN especies esp ON esp.id = pp.especie_id
       WHERE c.id = $1::uuid`,
      [id]
    );
    const row = full.rows[0];
    if (!row) {
      return res.status(500).json({ message: 'No se pudo leer el congelado tras guardar' });
    }
    if (row.columnas && typeof row.columnas === 'string') {
      try {
        row.columnas = JSON.parse(row.columnas);
      } catch (_) {
        row.columnas = [];
      }
    }
    res.json(row);
  } catch (error) {
    console.error('Error actualizando congelado:', error);
    const msg = error?.message || 'Error al actualizar';
    res.status(500).json({ message: msg.includes('invalid input') ? 'Datos inválidos al guardar' : 'Error al actualizar', detail: process.env.NODE_ENV === 'development' ? msg : undefined });
  }
});

router.post('/:id/finalizar', async (req, res) => {
  try {
    await initTables();
    const { id } = req.params;
    const enc = await pool.query('SELECT id, estado, lote_id, plantilla_id FROM congelado WHERE id = $1', [id]);
    if (enc.rows.length === 0) return res.status(404).json({ message: 'Congelado no encontrado' });
    if (enc.rows[0].estado === 'finalizado') return res.status(400).json({ message: 'Ya está finalizado' });

    const loteRow = await pool.query('SELECT codigo FROM lotes_produccion WHERE id = $1', [enc.rows[0].lote_id]);
    const loteCodigo = loteRow.rows[0]?.codigo ?? null;
    const snap = await buildPlantillaProcesoSnapshot(pool, enc.rows[0].plantilla_id, loteCodigo);
    const snapJson = snap ? JSON.stringify(snap) : null;

    await pool.query(
      `UPDATE congelado SET estado = 'finalizado', finalizado_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP,
            plantilla_snapshot = $2::jsonb
       WHERE id = $1`,
      [id, snapJson]
    );
    const updated = await pool.query('SELECT id, estado, finalizado_at FROM congelado WHERE id = $1', [id]);
    try {
      await emitirNotificacion(pool, {
        tipo: 'proceso_finalizado',
        modulo: 'Producción',
        severidad: 'success',
        titulo: 'Congelado finalizado',
        mensaje: 'El proceso de congelado fue finalizado.',
        origen_tabla: 'congelado',
        origen_id: id,
        metadata: { proceso: 'congelado', congelado_id: id, usuario_id: req.user?.id || null },
      });
    } catch (eNotif) {
      console.warn('Notificación congelado finalizado:', eNotif.message);
    }
    res.json(updated.rows[0]);
  } catch (error) {
    console.error('Error finalizando congelado:', error);
    res.status(500).json({ message: 'Error al finalizar' });
  }
});

router.patch('/:id/reabrir', async (req, res) => {
  try {
    const { id } = req.params;
    const enc = await pool.query('SELECT id, estado FROM congelado WHERE id = $1', [id]);
    if (enc.rows.length === 0) return res.status(404).json({ message: 'Congelado no encontrado' });
    if (enc.rows[0].estado !== 'finalizado') return res.status(400).json({ message: 'Solo se puede reabrir un congelado finalizado' });

    await pool.query(
      `UPDATE congelado SET estado = 'en_proceso', finalizado_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [id]
    );
    const updated = await pool.query('SELECT id, estado FROM congelado WHERE id = $1', [id]);
    try {
      await emitirNotificacion(pool, {
        tipo: 'proceso_reabierto',
        modulo: 'Producción',
        severidad: 'warning',
        titulo: 'Congelado reabierto',
        mensaje: 'Se reabrió un proceso de congelado finalizado.',
        origen_tabla: 'congelado',
        origen_id: id,
        metadata: { proceso: 'congelado', congelado_id: id, usuario_id: req.user?.id || null },
      });
    } catch (eNotif) {
      console.warn('Notificación congelado reabierto:', eNotif.message);
    }
    res.json(updated.rows[0]);
  } catch (error) {
    console.error('Error reabriendo congelado:', error);
    res.status(500).json({ message: 'Error al reabrir' });
  }
});

export default router;
