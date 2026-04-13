import express from 'express';
import { pool } from '../config/database.js';
import { authenticateToken, checkPermission } from '../middleware/auth.middleware.js';
import { productoTieneIngresoEnProcesosPlantilla, productosRemovidosConIngreso } from '../utils/plantillaProductoIngreso.js';

const router = express.Router();
router.use(authenticateToken);

const uuidOrNull = (v) => {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  return s || null;
};
const numOperativo = (v, def = 0) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : def;
};

const initTables = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS plantillas_proceso (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
      especie_id UUID NOT NULL REFERENCES especies(id) ON DELETE CASCADE,
      titulo VARCHAR(255) NOT NULL,
      es_predeterminada BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_plantillas_proceso_predeterminada
    ON plantillas_proceso (cliente_id, especie_id) WHERE es_predeterminada = TRUE
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS plantillas_proceso_productos (
      plantilla_id UUID NOT NULL REFERENCES plantillas_proceso(id) ON DELETE CASCADE,
      producto_id UUID NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (plantilla_id, producto_id)
    )
  `);
  await pool.query(
    `ALTER TABLE plantillas_proceso_productos ADD COLUMN IF NOT EXISTS orden INTEGER NOT NULL DEFAULT 0`
  );
  await pool.query(
    `ALTER TABLE plantillas_proceso ADD COLUMN IF NOT EXISTS operativo_agua_insumo_id UUID REFERENCES insumos(id) ON DELETE SET NULL`
  );
  await pool.query(
    `ALTER TABLE plantillas_proceso ADD COLUMN IF NOT EXISTS operativo_agua_litros_por_tm_mp NUMERIC(14, 6) NOT NULL DEFAULT 0`
  );
  await pool.query(
    `ALTER TABLE plantillas_proceso ADD COLUMN IF NOT EXISTS operativo_hielo_insumo_id UUID REFERENCES insumos(id) ON DELETE SET NULL`
  );
  await pool.query(
    `ALTER TABLE plantillas_proceso ADD COLUMN IF NOT EXISTS operativo_hielo_kg_por_tm_mp NUMERIC(14, 6) NOT NULL DEFAULT 0`
  );
  await pool.query(
    `ALTER TABLE plantillas_proceso ADD COLUMN IF NOT EXISTS operativo_bunker_insumo_id UUID REFERENCES insumos(id) ON DELETE SET NULL`
  );
  await pool.query(`ALTER TABLE empaque ADD COLUMN IF NOT EXISTS plantilla_snapshot JSONB`);
  await pool.query(`ALTER TABLE envasado ADD COLUMN IF NOT EXISTS plantilla_snapshot JSONB`);
  await pool.query(`ALTER TABLE congelado ADD COLUMN IF NOT EXISTS plantilla_snapshot JSONB`);
};

// Historial de snapshots guardados al finalizar procesos (solo Admin)
router.get('/snapshots-historial', checkPermission('produccion.plantillas_snapshots', 'view'), async (req, res) => {
  try {
    await initTables();
    const rows = [];
    const qE = await pool.query(
      `SELECT 'empaque' AS proceso, e.id AS registro_id, lp.id AS lote_id, lp.codigo AS lote_codigo,
              e.finalizado_at, e.plantilla_snapshot, pp.titulo AS plantilla_titulo_actual
       FROM empaque e
       JOIN lotes_produccion lp ON lp.id = e.lote_id
       JOIN plantillas_proceso pp ON pp.id = e.plantilla_id
       WHERE e.plantilla_snapshot IS NOT NULL
       ORDER BY e.finalizado_at DESC NULLS LAST
       LIMIT 500`
    );
    const qV = await pool.query(
      `SELECT 'envasado' AS proceso, e.id AS registro_id, lp.id AS lote_id, lp.codigo AS lote_codigo,
              e.finalizado_at, e.plantilla_snapshot, pp.titulo AS plantilla_titulo_actual
       FROM envasado e
       JOIN lotes_produccion lp ON lp.id = e.lote_id
       JOIN plantillas_proceso pp ON pp.id = e.plantilla_id
       WHERE e.plantilla_snapshot IS NOT NULL
       ORDER BY e.finalizado_at DESC NULLS LAST
       LIMIT 500`
    );
    const qC = await pool.query(
      `SELECT 'congelado' AS proceso, c.id AS registro_id, lp.id AS lote_id, lp.codigo AS lote_codigo,
              c.finalizado_at, c.plantilla_snapshot, pp.titulo AS plantilla_titulo_actual
       FROM congelado c
       JOIN lotes_produccion lp ON lp.id = c.lote_id
       JOIN plantillas_proceso pp ON pp.id = c.plantilla_id
       WHERE c.plantilla_snapshot IS NOT NULL
       ORDER BY c.finalizado_at DESC NULLS LAST
       LIMIT 500`
    );
    rows.push(...qE.rows, ...qV.rows, ...qC.rows);
    rows.sort((a, b) => {
      const ta = a.finalizado_at ? new Date(a.finalizado_at).getTime() : 0;
      const tb = b.finalizado_at ? new Date(b.finalizado_at).getTime() : 0;
      return tb - ta;
    });
    res.json({ data: rows.slice(0, 500) });
  } catch (error) {
    console.error('Error listando snapshots:', error);
    res.status(500).json({ message: 'Error al listar snapshots' });
  }
});

// Listar todas las plantillas (agrupables por cliente/especie en front), con lista de productos
router.get('/', async (req, res) => {
  try {
    await initTables();
    const result = await pool.query(
      `SELECT pp.id, pp.cliente_id, pp.especie_id, pp.titulo, pp.es_predeterminada, pp.created_at,
              pp.operativo_agua_litros_por_tm_mp, pp.operativo_hielo_kg_por_tm_mp,
              c.nombre AS cliente_nombre, e.nombre AS especie_nombre,
              (SELECT COUNT(*) FROM plantillas_proceso_productos ppp WHERE ppp.plantilla_id = pp.id) AS productos_count,
              (SELECT COALESCE(json_agg(json_build_object('codigo', p.codigo, 'producto', p.producto, 'descripcion', p.descripcion, 'presentacion', p.presentacion) ORDER BY ppp.orden, p.codigo), '[]'::json)
               FROM plantillas_proceso_productos ppp JOIN productos p ON p.id = ppp.producto_id WHERE ppp.plantilla_id = pp.id) AS productos
       FROM plantillas_proceso pp
       JOIN clientes c ON c.id = pp.cliente_id
       JOIN especies e ON e.id = pp.especie_id
       ORDER BY c.nombre, e.nombre, pp.titulo`
    );
    const rows = result.rows.map((r) => ({
      ...r,
      productos: typeof r.productos === 'string' ? JSON.parse(r.productos || '[]') : (r.productos || []),
    }));
    res.json({ data: rows });
  } catch (error) {
    console.error('Error listando plantillas de proceso:', error);
    res.status(500).json({ message: 'Error al listar plantillas' });
  }
});

// Obtener plantilla predeterminada por cliente y especie (para otras vistas del módulo producción)
router.get('/predeterminada', async (req, res) => {
  try {
    await initTables();
    const { cliente_id, especie_id } = req.query;
    if (!cliente_id || !especie_id) {
      return res.status(400).json({ message: 'cliente_id y especie_id son requeridos' });
    }
    const result = await pool.query(
      `SELECT pp.id, pp.cliente_id, pp.especie_id, pp.titulo, pp.es_predeterminada,
              c.nombre AS cliente_nombre, e.nombre AS especie_nombre
       FROM plantillas_proceso pp
       JOIN clientes c ON c.id = pp.cliente_id
       JOIN especies e ON e.id = pp.especie_id
       WHERE pp.cliente_id = $1 AND pp.especie_id = $2 AND pp.es_predeterminada = TRUE
       LIMIT 1`,
      [cliente_id, especie_id]
    );
    if (result.rows.length === 0) {
      return res.json({ data: null });
    }
    const plantilla = result.rows[0];
    const productosResult = await pool.query(
      `SELECT p.id, p.codigo, p.producto, p.descripcion, p.presentacion
       FROM plantillas_proceso_productos ppp
       JOIN productos p ON p.id = ppp.producto_id
       WHERE ppp.plantilla_id = $1 ORDER BY ppp.orden, p.codigo`,
      [plantilla.id]
    );
    plantilla.productos = productosResult.rows;
    res.json({ data: plantilla });
  } catch (error) {
    console.error('Error obteniendo plantilla predeterminada:', error);
    res.status(500).json({ message: 'Error al obtener plantilla' });
  }
});

// Verificar si un producto tiene ingreso en envasado/congelado/empaque para esta plantilla
router.get('/:id/producto-ingreso/:productoId', async (req, res) => {
  try {
    await initTables();
    const { id, productoId } = req.params;
    const ex = await pool.query('SELECT id FROM plantillas_proceso WHERE id = $1', [id]);
    if (ex.rows.length === 0) return res.status(404).json({ message: 'Plantilla no encontrada' });
    const r = await productoTieneIngresoEnProcesosPlantilla(pool, id, productoId);
    res.json(r);
  } catch (error) {
    console.error('Error verificando ingreso producto:', error);
    res.status(500).json({ message: 'Error al verificar' });
  }
});

// Obtener una plantilla con sus productos
router.get('/:id', async (req, res) => {
  try {
    await initTables();
    const { id } = req.params;
    const ordenResult = await pool.query(
      `SELECT pp.id, pp.cliente_id, pp.especie_id, pp.titulo, pp.es_predeterminada, pp.created_at,
              pp.operativo_agua_litros_por_tm_mp, pp.operativo_hielo_kg_por_tm_mp,
              c.nombre AS cliente_nombre, e.nombre AS especie_nombre
       FROM plantillas_proceso pp
       JOIN clientes c ON c.id = pp.cliente_id
       JOIN especies e ON e.id = pp.especie_id
       WHERE pp.id = $1`,
      [id]
    );
    if (ordenResult.rows.length === 0) {
      return res.status(404).json({ message: 'Plantilla no encontrada' });
    }
    const plantilla = ordenResult.rows[0];
    const productosResult = await pool.query(
      `SELECT p.id, p.codigo, p.producto, p.descripcion, p.presentacion
       FROM plantillas_proceso_productos ppp
       JOIN productos p ON p.id = ppp.producto_id
       WHERE ppp.plantilla_id = $1 ORDER BY ppp.orden, p.codigo`,
      [id]
    );
    plantilla.productos = productosResult.rows;
    res.json(plantilla);
  } catch (error) {
    console.error('Error obteniendo plantilla:', error);
    res.status(500).json({ message: 'Error al obtener plantilla' });
  }
});

// Crear plantilla
router.post('/', async (req, res) => {
  try {
    await initTables();
    const {
      cliente_id,
      especie_id,
      titulo,
      es_predeterminada,
      producto_ids,
      operativo_agua_litros_por_tm_mp,
      operativo_hielo_kg_por_tm_mp,
    } = req.body;
    if (!cliente_id || !especie_id || !titulo || !titulo.trim()) {
      return res.status(400).json({ message: 'Cliente, especie y título son requeridos' });
    }
    if (es_predeterminada) {
      await pool.query(
        'UPDATE plantillas_proceso SET es_predeterminada = FALSE WHERE cliente_id = $1 AND especie_id = $2',
        [cliente_id, especie_id]
      );
    }
    const insert = await pool.query(
      `INSERT INTO plantillas_proceso (
         cliente_id, especie_id, titulo, es_predeterminada,
         operativo_agua_insumo_id, operativo_agua_litros_por_tm_mp,
         operativo_hielo_insumo_id, operativo_hielo_kg_por_tm_mp,
         operativo_bunker_insumo_id
       )
       VALUES (
         $1, $2, $3, COALESCE($4, FALSE),
         NULL, $5, NULL, $6, NULL
       )
       RETURNING id, cliente_id, especie_id, titulo, es_predeterminada, created_at`,
      [
        cliente_id,
        especie_id,
        titulo.trim(),
        es_predeterminada,
        numOperativo(operativo_agua_litros_por_tm_mp, 0),
        numOperativo(operativo_hielo_kg_por_tm_mp, 0),
      ]
    );
    const plantilla = insert.rows[0];
    const ids = Array.isArray(producto_ids) ? producto_ids.filter(Boolean) : [];
    for (let i = 0; i < ids.length; i++) {
      const pid = ids[i];
      await pool.query(
        `INSERT INTO plantillas_proceso_productos (plantilla_id, producto_id, orden) VALUES ($1, $2, $3)
         ON CONFLICT (plantilla_id, producto_id) DO UPDATE SET orden = EXCLUDED.orden`,
        [plantilla.id, pid, i]
      );
    }
    const withNames = await pool.query(
      `SELECT pp.id, pp.cliente_id, pp.especie_id, pp.titulo, pp.es_predeterminada, pp.created_at,
              pp.operativo_agua_litros_por_tm_mp, pp.operativo_hielo_kg_por_tm_mp,
              c.nombre AS cliente_nombre, e.nombre AS especie_nombre
       FROM plantillas_proceso pp JOIN clientes c ON c.id = pp.cliente_id JOIN especies e ON e.id = pp.especie_id
       WHERE pp.id = $1`,
      [plantilla.id]
    );
    const out = withNames.rows[0];
    const prods = await pool.query(
      `SELECT p.id, p.codigo, p.producto, p.descripcion, p.presentacion
       FROM plantillas_proceso_productos ppp JOIN productos p ON p.id = ppp.producto_id
       WHERE ppp.plantilla_id = $1 ORDER BY ppp.orden, p.codigo`,
      [plantilla.id]
    );
    out.productos = prods.rows;
    out.productos_count = prods.rows.length;
    res.status(201).json(out);
  } catch (error) {
    console.error('Error creando plantilla:', error);
    res.status(500).json({ message: 'Error al crear plantilla' });
  }
});

// Actualizar plantilla (titulo, producto_ids, es_predeterminada)
router.put('/:id', async (req, res) => {
  try {
    await initTables();
    const { id } = req.params;
    const {
      titulo,
      producto_ids,
      es_predeterminada,
      operativo_agua_litros_por_tm_mp,
      operativo_hielo_kg_por_tm_mp,
    } = req.body;
    const existing = await pool.query('SELECT id, cliente_id, especie_id FROM plantillas_proceso WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ message: 'Plantilla no encontrada' });
    }
    const { cliente_id, especie_id } = existing.rows[0];
    if (es_predeterminada === true) {
      await pool.query(
        'UPDATE plantillas_proceso SET es_predeterminada = FALSE WHERE cliente_id = $1 AND especie_id = $2 AND id != $3',
        [cliente_id, especie_id, id]
      );
    }
    if (titulo !== undefined && titulo !== null) {
      await pool.query(
        'UPDATE plantillas_proceso SET titulo = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [String(titulo).trim(), id]
      );
    }
    if (es_predeterminada !== undefined) {
      await pool.query(
        'UPDATE plantillas_proceso SET es_predeterminada = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [!!es_predeterminada, id]
      );
    }
    if (Array.isArray(producto_ids)) {
      const confirmar = req.body.confirmar_eliminacion_con_ingreso === true;
      const prevProds = await pool.query(
        'SELECT producto_id FROM plantillas_proceso_productos WHERE plantilla_id = $1 ORDER BY orden, producto_id',
        [id]
      );
      const antes = prevProds.rows.map((r) => r.producto_id);
      const ids = producto_ids.filter(Boolean);
      const conflictos = await productosRemovidosConIngreso(pool, id, antes, ids);
      if (conflictos.length > 0 && !confirmar) {
        return res.status(409).json({
          message:
            'Hay productos con cantidad registrada en envasado, congelado o empaque. Confirme la eliminación o cancele.',
          conflictos,
        });
      }
      await pool.query('DELETE FROM plantillas_proceso_productos WHERE plantilla_id = $1', [id]);
      for (let i = 0; i < ids.length; i++) {
        await pool.query(
          'INSERT INTO plantillas_proceso_productos (plantilla_id, producto_id, orden) VALUES ($1, $2, $3)',
          [id, ids[i], i]
        );
      }
    }
    if (
      Object.prototype.hasOwnProperty.call(req.body, 'operativo_agua_litros_por_tm_mp') ||
      Object.prototype.hasOwnProperty.call(req.body, 'operativo_hielo_kg_por_tm_mp')
    ) {
      await pool.query(
        `UPDATE plantillas_proceso SET
           operativo_agua_litros_por_tm_mp = $2,
           operativo_hielo_kg_por_tm_mp = $3,
           operativo_agua_insumo_id = NULL,
           operativo_hielo_insumo_id = NULL,
           operativo_bunker_insumo_id = NULL,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [id, numOperativo(operativo_agua_litros_por_tm_mp, 0), numOperativo(operativo_hielo_kg_por_tm_mp, 0)]
      );
    }
    const withNames = await pool.query(
      `SELECT pp.id, pp.cliente_id, pp.especie_id, pp.titulo, pp.es_predeterminada, pp.updated_at,
              pp.operativo_agua_litros_por_tm_mp, pp.operativo_hielo_kg_por_tm_mp,
              c.nombre AS cliente_nombre, e.nombre AS especie_nombre
       FROM plantillas_proceso pp JOIN clientes c ON c.id = pp.cliente_id JOIN especies e ON e.id = pp.especie_id
       WHERE pp.id = $1`,
      [id]
    );
    const out = withNames.rows[0];
    const prods = await pool.query(
      `SELECT p.id, p.codigo, p.producto, p.descripcion, p.presentacion
       FROM plantillas_proceso_productos ppp JOIN productos p ON p.id = ppp.producto_id
       WHERE ppp.plantilla_id = $1 ORDER BY ppp.orden, p.codigo`,
      [id]
    );
    out.productos = prods.rows;
    out.productos_count = prods.rows.length;
    res.json(out);
  } catch (error) {
    console.error('Error actualizando plantilla:', error);
    res.status(500).json({ message: 'Error al actualizar plantilla' });
  }
});

// Marcar como predeterminada (una por cliente+especie)
router.patch('/:id/predeterminada', async (req, res) => {
  try {
    await initTables();
    const { id } = req.params;
    const { es_predeterminada } = req.body;
    const row = await pool.query('SELECT cliente_id, especie_id FROM plantillas_proceso WHERE id = $1', [id]);
    if (row.rows.length === 0) return res.status(404).json({ message: 'Plantilla no encontrada' });
    const { cliente_id, especie_id } = row.rows[0];
    if (es_predeterminada) {
      await pool.query(
        'UPDATE plantillas_proceso SET es_predeterminada = FALSE WHERE cliente_id = $1 AND especie_id = $2',
        [cliente_id, especie_id]
      );
    }
    await pool.query(
      'UPDATE plantillas_proceso SET es_predeterminada = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [!!es_predeterminada, id]
    );
    const updated = await pool.query(
      'SELECT id, es_predeterminada FROM plantillas_proceso WHERE id = $1',
      [id]
    );
    res.json(updated.rows[0]);
  } catch (error) {
    console.error('Error actualizando predeterminada:', error);
    res.status(500).json({ message: 'Error al actualizar' });
  }
});

// Eliminar plantilla
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM plantillas_proceso WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Plantilla no encontrada' });
    res.json({ message: 'Plantilla eliminada correctamente' });
  } catch (error) {
    console.error('Error eliminando plantilla:', error);
    res.status(500).json({ message: 'Error al eliminar plantilla' });
  }
});

export default router;
