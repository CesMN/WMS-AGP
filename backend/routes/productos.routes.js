import express from 'express';
import multer from 'multer';
import xlsx from 'xlsx';
import { pool } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { ensureInsumosModuleSchema } from '../utils/ensureInsumosModule.js';

const router = express.Router();
router.use(authenticateToken);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const ensureParihuelaColumns = async () => {
  const cols = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'productos'`
  );
  const names = (cols.rows || []).map((r) => r.column_name);
  if (!names.includes('capacidad_parihuela_bultos')) {
    await pool.query('ALTER TABLE productos ADD COLUMN capacidad_parihuela_bultos NUMERIC(12,2)');
  }
  if (!names.includes('capacidad_parihuela_cajas')) {
    await pool.query('ALTER TABLE productos ADD COLUMN capacidad_parihuela_cajas NUMERIC(12,2)');
  }
  if (!names.includes('unidad_parihuela')) {
    await pool.query("ALTER TABLE productos ADD COLUMN unidad_parihuela VARCHAR(20) DEFAULT 'BULTOS'");
  }
};

// Listar productos (con filtros, búsqueda y paginación)
router.get('/', async (req, res) => {
  try {
    await ensureParihuelaColumns();
    const { cliente_id, especie_id, q, limit = 50, offset = 0 } = req.query;
    const limitNum = Math.min(parseInt(limit, 10) || 50, 500);
    const offsetNum = Math.max(0, parseInt(offset, 10) || 0);

    let baseWhere = 'WHERE p.activo = TRUE';
    const params = [];
    let n = 1;

    if (cliente_id) {
      baseWhere += ` AND p.cliente_id = $${n}`;
      params.push(cliente_id);
      n++;
    }
    if (especie_id) {
      baseWhere += ` AND p.especie_id = $${n}`;
      params.push(especie_id);
      n++;
    }
    if (q && q.trim()) {
      baseWhere += ` AND (p.codigo ILIKE $${n} OR p.producto ILIKE $${n} OR p.descripcion ILIKE $${n})`;
      params.push(`%${q.trim()}%`);
      n++;
    }

    const countResult = await pool.query(
      `SELECT COUNT(*) AS total FROM productos p JOIN clientes c ON c.id = p.cliente_id JOIN especies e ON e.id = p.especie_id ${baseWhere}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.total, 10) || 0;

    const query = `
      SELECT p.id, p.codigo, p.cliente_id, p.especie_id, p.producto, p.descripcion, p.presentacion, p.formato, p.unidad_medida,
             p.capacidad_parihuela_bultos, p.capacidad_parihuela_cajas, p.unidad_parihuela,
             p.activo, p.created_at,
             c.nombre AS cliente_nombre,
             e.nombre AS especie_nombre
      FROM productos p
      JOIN clientes c ON c.id = p.cliente_id
      JOIN especies e ON e.id = p.especie_id
      ${baseWhere}
      ORDER BY p.codigo
      LIMIT $${n} OFFSET $${n + 1}`;
    params.push(limitNum, offsetNum);

    const result = await pool.query(query, params);
    res.json({ data: result.rows, total });
  } catch (error) {
    console.error('Error listando productos:', error);
    res.status(500).json({ message: 'Error al listar productos' });
  }
});

// Buscar productos por código (autocompletado)
router.get('/buscar', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) {
      return res.json([]);
    }

    const result = await pool.query(
      `SELECT id, codigo, producto, descripcion, formato, unidad_medida, presentacion
       FROM productos
       WHERE activo = TRUE 
         AND (codigo ILIKE $1 OR producto ILIKE $1)
       ORDER BY codigo
       LIMIT 20`,
      [`%${q}%`]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error buscando productos:', error);
    res.status(500).json({ message: 'Error al buscar productos' });
  }
});

// Importar productos: validar archivo Excel/CSV
router.post('/import', upload.single('archivo'), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ message: 'Debe enviar un archivo (Excel o CSV)' });
    }
    const buf = req.file.buffer;
    const ext = (req.file.originalname || '').toLowerCase();
    let rows = [];
    if (ext.endsWith('.csv')) {
      const text = buf.toString('utf8');
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      const header = lines[0] ? lines[0].split(',').map((h) => h.trim().toLowerCase()) : [];
      const codigoIdx = header.findIndex((h) => h === 'codigo' || h === 'código');
      const clienteIdx = header.findIndex((h) => h === 'cliente' || h === 'cliente_nombre');
      const especieIdx = header.findIndex((h) => h === 'especie' || h === 'especie_nombre');
      const productoIdx = header.findIndex((h) => h === 'producto' || h === 'nombre');
      const descripcionIdx = header.findIndex((h) => h === 'descripcion' || h === 'descripción');
      const presentacionIdx = header.findIndex((h) => h === 'presentacion' || h === 'presentación');
      const formatoIdx = header.findIndex((h) => h === 'formato');
      const unidadIdx = header.findIndex((h) => h === 'unidad' || h === 'unidad_medida');
      for (let i = 1; i < lines.length; i++) {
        const cells = lines[i].split(',').map((c) => c.trim());
        rows.push({
          codigo: cells[codigoIdx] ?? '',
          cliente: cells[clienteIdx] ?? '',
          especie: cells[especieIdx] ?? '',
          producto: cells[productoIdx] ?? '',
          descripcion: cells[descripcionIdx] ?? '',
          presentacion: cells[presentacionIdx] ?? '',
          formato: cells[formatoIdx] ?? '',
          unidad_medida: (cells[unidadIdx] ?? 'KG').toUpperCase(),
        });
      }
    } else {
      const wb = xlsx.read(buf, { type: 'buffer', raw: true });
      const sh = wb.Sheets[wb.SheetNames[0]];
      const data = xlsx.utils.sheet_to_json(sh, { header: 1, defval: '' });
      const header = (data[0] || []).map((h) => String(h).trim().toLowerCase());
      const codigoIdx = header.findIndex((h) => h === 'codigo' || h === 'código');
      const clienteIdx = header.findIndex((h) => h === 'cliente' || h === 'cliente_nombre');
      const especieIdx = header.findIndex((h) => h === 'especie' || h === 'especie_nombre');
      const productoIdx = header.findIndex((h) => h === 'producto' || h === 'nombre');
      const descripcionIdx = header.findIndex((h) => h === 'descripcion' || h === 'descripción');
      const presentacionIdx = header.findIndex((h) => h === 'presentacion' || h === 'presentación');
      const formatoIdx = header.findIndex((h) => h === 'formato');
      const unidadIdx = header.findIndex((h) => h === 'unidad' || h === 'unidad_medida');
      for (let i = 1; i < data.length; i++) {
        const row = data[i] || [];
        const cell = (j) => (row[j] != null ? String(row[j]).trim() : '');
        rows.push({
          codigo: cell(codigoIdx),
          cliente: cell(clienteIdx),
          especie: cell(especieIdx),
          producto: cell(productoIdx),
          descripcion: cell(descripcionIdx),
          presentacion: cell(presentacionIdx),
          formato: cell(formatoIdx),
          unidad_medida: (cell(unidadIdx) || 'KG').toUpperCase(),
        });
      }
    }

    const clientesMap = new Map();
    const especiesMap = new Map();
    const clientesRows = await pool.query('SELECT id, nombre FROM clientes');
    clientesRows.rows.forEach((r) => clientesMap.set(r.nombre.trim().toLowerCase(), r.id));
    const especiesRows = await pool.query('SELECT id, nombre FROM especies');
    especiesRows.rows.forEach((r) => especiesMap.set(r.nombre.trim().toLowerCase(), r.id));

    const codigosExistentes = new Set();
    const prodExistentes = await pool.query('SELECT codigo FROM productos WHERE activo = TRUE');
    prodExistentes.rows.forEach((r) => codigosExistentes.add(r.codigo.trim().toLowerCase()));

    const clienteEspeciesSet = new Set();
    const ceRows = await pool.query('SELECT cliente_id, especie_id FROM cliente_especies');
    ceRows.rows.forEach((row) => clienteEspeciesSet.add(`${row.cliente_id}|${row.especie_id}`));

    const validRows = [];
    const errors = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const fila = i + 2;
      const err = [];
      if (!r.codigo) err.push('Código requerido');
      else if (codigosExistentes.has(r.codigo.trim().toLowerCase())) err.push('Código ya existe');
      if (!r.producto) err.push('Producto requerido');
      if (!r.descripcion) err.push('Descripción requerida');
      const formatoNum = Number(r.formato);
      if (r.formato !== '' && (isNaN(formatoNum) || formatoNum < 0)) err.push('Formato debe ser número ≥ 0');
      const um = (r.unidad_medida || 'KG').toUpperCase();
      if (!['KG', 'LB'].includes(um)) err.push('Unidad debe ser KG o LB');
      const clienteId = r.cliente ? clientesMap.get(r.cliente.trim().toLowerCase()) : null;
      if (!r.cliente) err.push('Cliente requerido');
      else if (!clienteId) err.push('Cliente no encontrado');
      const especieId = r.especie ? especiesMap.get(r.especie.trim().toLowerCase()) : null;
      if (!r.especie) err.push('Especie requerida');
      else if (!especieId) err.push('Especie no encontrada');
      if (clienteId && especieId && !clienteEspeciesSet.has(`${clienteId}|${especieId}`)) {
        err.push('El cliente no tiene asignada esa especie');
      }
      if (err.length) {
        errors.push({ fila, mensaje: err.join('; ') });
      } else {
        validRows.push({
          codigo: r.codigo.trim(),
          cliente_id: clienteId,
          especie_id: especieId,
          producto: r.producto.trim(),
          descripcion: r.descripcion.trim(),
          presentacion: r.presentacion || null,
          formato: Number(r.formato) || 0,
          unidad_medida: um,
        });
      }
    }
    res.json({ validRows, errors, total: rows.length });
  } catch (error) {
    console.error('Error validando importación:', error);
    res.status(500).json({ message: 'Error al procesar el archivo' });
  }
});

// Importar productos: confirmar e insertar/reactualizar filas validadas
// Si el código ya existe (activo o inactivo), se actualiza y reactiva en lugar de insertar de nuevo
router.post('/import/confirm', async (req, res) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ message: 'Debe enviar un array de filas válidas' });
    }
    const inserted = [];
    const updated = [];
    for (const r of rows) {
      const existing = await pool.query('SELECT id, activo FROM productos WHERE codigo = $1', [r.codigo]);
      if (existing.rows.length > 0) {
        await pool.query(
          `UPDATE productos SET activo = TRUE, cliente_id = $2, especie_id = $3, producto = $4, descripcion = $5, presentacion = $6, formato = $7, unidad_medida = $8, updated_at = CURRENT_TIMESTAMP WHERE codigo = $1`,
          [r.codigo, r.cliente_id, r.especie_id, r.producto, r.descripcion, r.presentacion || null, r.formato, r.unidad_medida]
        );
        updated.push(r.codigo);
      } else {
        await pool.query(
          `INSERT INTO productos (codigo, cliente_id, especie_id, producto, descripcion, presentacion, formato, unidad_medida)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [r.codigo, r.cliente_id, r.especie_id, r.producto, r.descripcion, r.presentacion || null, r.formato, r.unidad_medida]
        );
        inserted.push(r.codigo);
      }
    }
    const total = inserted.length + updated.length;
    const msg = updated.length > 0
      ? `${inserted.length} nuevo(s), ${updated.length} reactualizado(s)`
      : `${total} producto(s) importado(s)`;
    res.json({ message: msg, inserted, updated });
  } catch (error) {
    console.error('Error importando productos:', error);
    res.status(500).json({ message: 'Error al importar' });
  }
});

// Receta de insumos por producto (cantidad de insumo por bulto; la unidad es la del insumo)
router.get('/:id/insumos', async (req, res) => {
  try {
    await ensureInsumosModuleSchema();
    const { id } = req.params;
    const prod = await pool.query('SELECT id FROM productos WHERE id = $1 AND activo = TRUE', [id]);
    if (prod.rows.length === 0) return res.status(404).json({ message: 'Producto no encontrado' });
    const result = await pool.query(
      `SELECT pi.insumo_id, COALESCE(pi.cantidad_por_bulto, 0) AS cantidad_por_bulto,
              i.nombre AS insumo_nombre, i.unidad_medida AS insumo_unidad, i.codigo AS insumo_codigo
       FROM producto_insumo pi
       JOIN insumos i ON i.id = pi.insumo_id AND COALESCE(i.activo, TRUE) = TRUE
       WHERE pi.producto_id = $1
       ORDER BY i.nombre`,
      [id]
    );
    res.json({ items: result.rows });
  } catch (error) {
    console.error('Error listando insumos del producto:', error);
    res.status(500).json({ message: 'Error al listar insumos del producto' });
  }
});

router.put('/:id/insumos', async (req, res) => {
  try {
    await ensureInsumosModuleSchema();
    const { id } = req.params;
    const { items } = req.body;
    if (!Array.isArray(items)) {
      return res.status(400).json({ message: 'items debe ser un array' });
    }
    const prod = await pool.query('SELECT id FROM productos WHERE id = $1 AND activo = TRUE', [id]);
    if (prod.rows.length === 0) return res.status(404).json({ message: 'Producto no encontrado' });
    const client = await pool.connect();
    try {
      const fmtRow = await client.query('SELECT formato FROM productos WHERE id = $1', [id]);
      const formatoProd = Number(fmtRow.rows[0]?.formato) || 0;
      const colMeta = await client.query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'producto_insumo'`
      );
      const piCols = new Set(colMeta.rows.map((r) => r.column_name));
      const tieneKgLegacy = piCols.has('cantidad_por_kg_producto');

      await client.query('BEGIN');
      await client.query('DELETE FROM producto_insumo WHERE producto_id = $1', [id]);
      for (const it of items) {
        if (!it.insumo_id) continue;
        let c = Number(it.cantidad_por_bulto);
        if (Number.isNaN(c) && it.cantidad_por_kg_producto != null) {
          const perKg = Number(it.cantidad_por_kg_producto);
          if (!Number.isNaN(perKg) && formatoProd > 0) c = perKg * formatoProd;
        }
        if (Number.isNaN(c) || c < 0) continue;
        const kgLegacy =
          tieneKgLegacy && formatoProd > 0 ? c / formatoProd : tieneKgLegacy ? 0 : null;
        if (tieneKgLegacy) {
          await client.query(
            `INSERT INTO producto_insumo (producto_id, insumo_id, cantidad_por_bulto, cantidad_por_kg_producto)
             VALUES ($1, $2, $3, $4)`,
            [id, it.insumo_id, c, kgLegacy]
          );
        } else {
          await client.query(
            'INSERT INTO producto_insumo (producto_id, insumo_id, cantidad_por_bulto) VALUES ($1, $2, $3)',
            [id, it.insumo_id, c]
          );
        }
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    const result = await pool.query(
      `SELECT pi.insumo_id, pi.cantidad_por_bulto, i.nombre AS insumo_nombre, i.unidad_medida AS insumo_unidad, i.codigo AS insumo_codigo
       FROM producto_insumo pi
       JOIN insumos i ON i.id = pi.insumo_id
       WHERE pi.producto_id = $1 ORDER BY i.nombre`,
      [id]
    );
    res.json({ items: result.rows });
  } catch (error) {
    console.error('Error guardando insumos del producto:', error);
    res.status(500).json({ message: 'Error al guardar insumos del producto' });
  }
});

// Obtener un producto por ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT p.id, p.codigo, p.cliente_id, p.especie_id, p.producto, p.descripcion, p.presentacion, p.formato, p.unidad_medida,
              p.capacidad_parihuela_bultos, p.capacidad_parihuela_cajas, p.unidad_parihuela
       FROM productos p WHERE p.id = $1 AND p.activo = TRUE`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error obteniendo producto:', error);
    res.status(500).json({ message: 'Error al obtener producto' });
  }
});

// Crear producto
router.post('/', async (req, res) => {
  try {
    await ensureParihuelaColumns();
    const { codigo, cliente_id, especie_id, producto, descripcion, presentacion, formato, unidad_medida, capacidad_parihuela_bultos, capacidad_parihuela_cajas, unidad_parihuela } = req.body;
    if (!codigo || !cliente_id || !especie_id || !producto || !descripcion || formato === undefined || !unidad_medida) {
      return res.status(400).json({ message: 'Faltan campos requeridos' });
    }
    if (!['KG', 'LB'].includes(unidad_medida)) {
      return res.status(400).json({ message: 'Unidad de medida debe ser KG o LB' });
    }
    if (Number(formato) < 0) {
      return res.status(400).json({ message: 'El formato debe ser un número positivo' });
    }

    const clienteEspecie = await pool.query(
      'SELECT 1 FROM cliente_especies WHERE cliente_id = $1 AND especie_id = $2',
      [cliente_id, especie_id]
    );
    if (clienteEspecie.rows.length === 0) {
      return res.status(400).json({ message: 'El cliente no tiene asignada esa especie. Asigne la especie al cliente en la ficha del cliente.' });
    }

    const existing = await pool.query('SELECT id FROM productos WHERE codigo = $1', [codigo.trim()]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ message: 'Ya existe un producto con ese código' });
    }

    const unidadParihuelaVal = unidad_parihuela === 'CAJAS' ? 'CAJAS' : 'BULTOS';
    const result = await pool.query(
      `INSERT INTO productos (codigo, cliente_id, especie_id, producto, descripcion, presentacion, formato, unidad_medida, capacidad_parihuela_bultos, capacidad_parihuela_cajas, unidad_parihuela)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, codigo, cliente_id, especie_id, producto, descripcion, presentacion, formato, unidad_medida, capacidad_parihuela_bultos, capacidad_parihuela_cajas, unidad_parihuela, activo, created_at`,
      [codigo.trim(), cliente_id, especie_id, producto.trim(), descripcion.trim(), presentacion ? presentacion.trim() : null, Number(formato), unidad_medida, capacidad_parihuela_bultos != null ? Number(capacidad_parihuela_bultos) : null, capacidad_parihuela_cajas != null ? Number(capacidad_parihuela_cajas) : null, unidadParihuelaVal]
    );
    const row = result.rows[0];
    const clienteResult = await pool.query('SELECT nombre FROM clientes WHERE id = $1', [row.cliente_id]);
    const especieResult = await pool.query('SELECT nombre FROM especies WHERE id = $1', [row.especie_id]);
    row.cliente_nombre = clienteResult.rows[0]?.nombre;
    row.especie_nombre = especieResult.rows[0]?.nombre;
    res.status(201).json(row);
  } catch (error) {
    console.error('Error creando producto:', error);
    res.status(500).json({ message: 'Error al crear producto' });
  }
});

// Actualizar producto
router.put('/:id', async (req, res) => {
  try {
    await ensureParihuelaColumns();
    const { id } = req.params;
    const { codigo, cliente_id, especie_id, producto, descripcion, presentacion, formato, unidad_medida, capacidad_parihuela_bultos, capacidad_parihuela_cajas, unidad_parihuela } = req.body;
    if (!codigo || !cliente_id || !especie_id || !producto || !descripcion || formato === undefined || !unidad_medida) {
      return res.status(400).json({ message: 'Faltan campos requeridos' });
    }
    if (!['KG', 'LB'].includes(unidad_medida)) {
      return res.status(400).json({ message: 'Unidad de medida debe ser KG o LB' });
    }

    const existing = await pool.query('SELECT id FROM productos WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }

    const clienteEspecie = await pool.query(
      'SELECT 1 FROM cliente_especies WHERE cliente_id = $1 AND especie_id = $2',
      [cliente_id, especie_id]
    );
    if (clienteEspecie.rows.length === 0) {
      return res.status(400).json({ message: 'El cliente no tiene asignada esa especie. Asigne la especie al cliente en la ficha del cliente.' });
    }

    const codeCheck = await pool.query('SELECT id FROM productos WHERE codigo = $1 AND id != $2', [codigo.trim(), id]);
    if (codeCheck.rows.length > 0) {
      return res.status(400).json({ message: 'Ya existe otro producto con ese código' });
    }

    const unidadParihuelaVal = unidad_parihuela === 'CAJAS' ? 'CAJAS' : (unidad_parihuela || 'BULTOS');
    const result = await pool.query(
      `UPDATE productos SET codigo = $1, cliente_id = $2, especie_id = $3, producto = $4, descripcion = $5, presentacion = $6, formato = $7, unidad_medida = $8,
        capacidad_parihuela_bultos = $9, capacidad_parihuela_cajas = $10, unidad_parihuela = $11, updated_at = CURRENT_TIMESTAMP
       WHERE id = $12 RETURNING id, codigo, cliente_id, especie_id, producto, descripcion, presentacion, formato, unidad_medida, capacidad_parihuela_bultos, capacidad_parihuela_cajas, unidad_parihuela, activo`,
      [codigo.trim(), cliente_id, especie_id, producto.trim(), descripcion.trim(), presentacion ? presentacion.trim() : null, Number(formato), unidad_medida, capacidad_parihuela_bultos != null ? Number(capacidad_parihuela_bultos) : null, capacidad_parihuela_cajas != null ? Number(capacidad_parihuela_cajas) : null, unidadParihuelaVal, id]
    );
    const row = result.rows[0];
    const clienteResult = await pool.query('SELECT nombre FROM clientes WHERE id = $1', [row.cliente_id]);
    const especieResult = await pool.query('SELECT nombre FROM especies WHERE id = $1', [row.especie_id]);
    row.cliente_nombre = clienteResult.rows[0]?.nombre;
    row.especie_nombre = especieResult.rows[0]?.nombre;
    res.json(row);
  } catch (error) {
    console.error('Error actualizando producto:', error);
    res.status(500).json({ message: 'Error al actualizar producto' });
  }
});

// Eliminar producto (soft delete: activo = false)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'UPDATE productos SET activo = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING id',
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }
    res.json({ message: 'Producto eliminado correctamente' });
  } catch (error) {
    console.error('Error eliminando producto:', error);
    res.status(500).json({ message: 'Error al eliminar producto' });
  }
});

export default router;
