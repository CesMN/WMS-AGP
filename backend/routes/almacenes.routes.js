import express from 'express';
import { pool } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.middleware.js';

const router = express.Router();
router.use(authenticateToken);

/** Devuelve descripción legible de una posición: "Almacén → Carril → Nn → Pn" */
async function descripcionPosicion(client, posicionId) {
  const r = await client.query(
    `SELECT a.nombre AS almacen, c.nombre AS carril, n.numero_nivel, pos.numero_posicion
     FROM posiciones pos
     JOIN niveles n ON n.id = pos.nivel_id
     JOIN carriles c ON c.id = n.carril_id
     JOIN almacenes a ON a.id = c.almacen_id
     WHERE pos.id = $1`,
    [posicionId]
  );
  if (r.rows.length === 0) return posicionId;
  const { almacen, carril, numero_nivel, numero_posicion } = r.rows[0];
  return `${almacen} → ${carril} → N${numero_nivel} → P${numero_posicion}`;
}

// Listar almacenes con estadísticas de ocupación (desde BD: posiciones)
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        a.id,
        a.nombre,
        a.cantidad_carriles,
        a.cantidad_niveles,
        a.cantidad_posiciones,
        (SELECT COUNT(*) FROM posiciones p
          JOIN niveles n ON n.id = p.nivel_id
          JOIN carriles c ON c.id = n.carril_id
          WHERE c.almacen_id = a.id) AS espacios_totales,
        (SELECT COUNT(*) FROM posiciones p
          JOIN niveles n ON n.id = p.nivel_id
          JOIN carriles c ON c.id = n.carril_id
          WHERE c.almacen_id = a.id AND (
            EXISTS (SELECT 1 FROM stock_posiciones s WHERE s.posicion_id = p.id AND (s.cantidad_bultos > 0 OR s.total_kg > 0 OR COALESCE(s.peso_adicional, 0) > 0))
            OR COALESCE(p.bloqueada, false)
          )) AS espacios_ocupados
      FROM almacenes a
      ORDER BY a.nombre
    `);

    const almacenes = result.rows.map((a) => {
      const total = Number(a.espacios_totales) || 0;
      const ocupados = Number(a.espacios_ocupados) || 0;
      const libres = Math.max(0, total - ocupados);
      return {
        ...a,
        espacios_totales: total,
        espacios_ocupados: ocupados,
        espacios_libres: libres,
        porcentaje_ocupacion: total > 0 ? Math.round((ocupados / total) * 100) : 0,
      };
    });

    res.json(almacenes);
  } catch (error) {
    console.error('Error listando almacenes:', error);
    res.status(500).json({ message: 'Error al listar almacenes' });
  }
});

// Obtener un almacén por ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT id, nombre, cantidad_carriles, cantidad_niveles, cantidad_posiciones FROM almacenes WHERE id = $1',
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Almacén no encontrado' });
    }
    const a = result.rows[0];

    const statsResult = await pool.query(
      `WITH pos AS (
        SELECT p.id,
               COALESCE(p.bloqueada, false) AS bloqueada,
               EXISTS (SELECT 1 FROM stock_posiciones s WHERE s.posicion_id = p.id AND (s.cantidad_bultos > 0 OR s.total_kg > 0 OR COALESCE(s.peso_adicional, 0) > 0)) AS tiene_stock
        FROM posiciones p
        JOIN niveles n ON n.id = p.nivel_id
        JOIN carriles c ON c.id = n.carril_id
        WHERE c.almacen_id = $1
      )
      SELECT 
        COUNT(*) AS espacios_totales,
        COUNT(*) FILTER (WHERE tiene_stock OR bloqueada) AS espacios_ocupados
      FROM pos`,
      [id]
    );
    const st = statsResult.rows[0];
    const total = Number(st?.espacios_totales) || 0;
    const ocupados = Number(st?.espacios_ocupados) || 0;

    res.json({
      ...a,
      espacios_totales: total,
      espacios_ocupados: ocupados,
      espacios_libres: Math.max(0, total - ocupados),
      porcentaje_ocupacion: total > 0 ? Math.round((ocupados / total) * 100) : 0,
    });
  } catch (error) {
    console.error('Error obteniendo almacén:', error);
    res.status(500).json({ message: 'Error al obtener almacén' });
  }
});

// Actualizar almacén (nombre y/o estructura: carriles, niveles, posiciones) solo si está vacío
router.put('/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { nombre, cantidad_carriles, cantidad_niveles, cantidad_posiciones } = req.body;
    if (!nombre || typeof nombre !== 'string' || !nombre.trim()) {
      return res.status(400).json({ message: 'El nombre es requerido' });
    }
    const cantC = cantidad_carriles != null ? parseInt(cantidad_carriles, 10) : null;
    const cantN = cantidad_niveles != null ? parseInt(cantidad_niveles, 10) : null;
    const cantP = cantidad_posiciones != null ? parseInt(cantidad_posiciones, 10) : null;

    const exist = await client.query('SELECT id, cantidad_carriles, cantidad_niveles, cantidad_posiciones FROM almacenes WHERE id = $1', [id]);
    if (exist.rows.length === 0) {
      return res.status(404).json({ message: 'Almacén no encontrado' });
    }
    const actual = exist.rows[0];
    const finalC = cantC > 0 ? cantC : actual.cantidad_carriles;
    const finalN = cantN > 0 ? cantN : actual.cantidad_niveles;
    const finalP = cantP > 0 ? cantP : actual.cantidad_posiciones;

    const stats = await client.query(
      `SELECT COUNT(*) AS con_stock FROM stock_posiciones sp
       JOIN posiciones p ON p.id = sp.posicion_id
       JOIN niveles n ON n.id = p.nivel_id
       JOIN carriles c ON c.id = n.carril_id
       WHERE c.almacen_id = $1
         AND (sp.cantidad_bultos > 0 OR sp.total_kg > 0 OR COALESCE(sp.peso_adicional, 0) > 0)`,
      [id]
    );
    const conStock = parseInt(stats.rows[0]?.con_stock, 10) || 0;
    if (conStock > 0) {
      return res.status(400).json({ message: 'Solo se puede modificar un almacén vacío (sin stock en sus posiciones)' });
    }

    // No bloquear por despacho_detalles: con la migración despacho_detalles_allow_null_stock_posicion.sql
    // la FK es ON DELETE SET NULL, así que se puede reestructurar y los despachos quedan con stock_posicion_id = NULL.

    // No bloquear por movimiento_detalles: son registros históricos; el almacén sigue existiendo, solo se recrea la estructura (carriles/niveles/posiciones).

    await client.query('BEGIN');

    const posIds = await client.query(
      `SELECT p.id FROM posiciones p
       JOIN niveles n ON n.id = p.nivel_id
       JOIN carriles c ON c.id = n.carril_id
       WHERE c.almacen_id = $1`,
      [id]
    );
    const ids = posIds.rows.map((r) => r.id);
    if (ids.length > 0) {
      await client.query('DELETE FROM stock_posiciones WHERE posicion_id = ANY($1::uuid[])', [ids]);
      await client.query('DELETE FROM posiciones WHERE id = ANY($1::uuid[])', [ids]);
    }
    await client.query('DELETE FROM niveles WHERE carril_id IN (SELECT id FROM carriles WHERE almacen_id = $1)', [id]);
    await client.query('DELETE FROM carriles WHERE almacen_id = $1', [id]);

    try {
      await client.query(
        `UPDATE almacenes SET nombre = $1, cantidad_carriles = $2, cantidad_niveles = $3, cantidad_posiciones = $4, updated_at = CURRENT_TIMESTAMP WHERE id = $5`,
        [nombre.trim(), finalC, finalN, finalP, id]
      );
    } catch (errUpdate) {
      if (errUpdate.message && /updated_at|column/.test(errUpdate.message)) {
        await client.query(
          `UPDATE almacenes SET nombre = $1, cantidad_carriles = $2, cantidad_niveles = $3, cantidad_posiciones = $4 WHERE id = $5`,
          [nombre.trim(), finalC, finalN, finalP, id]
        );
      } else {
        throw errUpdate;
      }
    }

    for (let nc = 1; nc <= finalC; nc++) {
      const insCarril = await client.query(
        `INSERT INTO carriles (almacen_id, nombre, numero_carril, cantidad_niveles, cantidad_posiciones)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [id, `Carril ${nc}`, nc, finalN, finalP]
      );
      const carrilId = insCarril.rows[0].id;
      for (let nn = 1; nn <= finalN; nn++) {
        const insNivel = await client.query(
          `INSERT INTO niveles (carril_id, numero_nivel, cantidad_posiciones)
           VALUES ($1, $2, $3) RETURNING id`,
          [carrilId, nn, finalP]
        );
        const nivelId = insNivel.rows[0].id;
        for (let np = 1; np <= finalP; np++) {
          await client.query(
            `INSERT INTO posiciones (nivel_id, nombre, numero_posicion, estado)
             VALUES ($1, $2, $3, 'Disponible')`,
            [nivelId, `P-${nc}-${nn}-${np}`, np]
          );
        }
      }
    }

    await client.query('COMMIT');
    const upd = await pool.query('SELECT id, nombre, cantidad_carriles, cantidad_niveles, cantidad_posiciones FROM almacenes WHERE id = $1', [id]);
    res.json(upd.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error actualizando almacén:', error);
    const msg = error.message && typeof error.message === 'string' ? error.message : 'Error al actualizar almacén';
    res.status(500).json({ message: process.env.NODE_ENV === 'development' ? msg : 'Error al actualizar almacén' });
  } finally {
    client.release();
  }
});

// Eliminar almacén (solo si está vacío: sin stock y sin movimientos que lo referencien)
router.delete('/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const check = await client.query(
      'SELECT id FROM almacenes WHERE id = $1',
      [id]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ message: 'Almacén no encontrado' });
    }
    const stats = await client.query(
      `SELECT COUNT(*) AS con_stock FROM stock_posiciones sp
       JOIN posiciones p ON p.id = sp.posicion_id
       JOIN niveles n ON n.id = p.nivel_id
       JOIN carriles c ON c.id = n.carril_id
       WHERE c.almacen_id = $1
         AND (sp.cantidad_bultos > 0 OR sp.total_kg > 0 OR COALESCE(sp.peso_adicional, 0) > 0)`,
      [id]
    );
    const conStock = parseInt(stats.rows[0]?.con_stock, 10) || 0;
    if (conStock > 0) {
      return res.status(400).json({ message: 'Solo se puede eliminar un almacén vacío (sin stock en sus posiciones)' });
    }
    const movRef = await client.query(
      'SELECT COUNT(*) AS total FROM movimiento_detalles WHERE almacen_id = $1',
      [id]
    );
    const conMov = parseInt(movRef.rows[0]?.total, 10) || 0;
    if (conMov > 0) {
      return res.status(400).json({ message: 'No se puede eliminar: hay movimientos que usan este almacén. Solo se permite eliminar almacenes sin stock ni movimientos asociados.' });
    }
    await client.query('BEGIN');
    const posIds = await client.query(
      `SELECT p.id FROM posiciones p
       JOIN niveles n ON n.id = p.nivel_id
       JOIN carriles c ON c.id = n.carril_id
       WHERE c.almacen_id = $1`,
      [id]
    );
    const ids = posIds.rows.map((r) => r.id);
    if (ids.length > 0) {
      await client.query('DELETE FROM stock_posiciones WHERE posicion_id = ANY($1::uuid[])', [ids]);
      await client.query('DELETE FROM posiciones WHERE id = ANY($1::uuid[])', [ids]);
    }
    await client.query('DELETE FROM niveles WHERE carril_id IN (SELECT id FROM carriles WHERE almacen_id = $1)', [id]);
    await client.query('DELETE FROM carriles WHERE almacen_id = $1', [id]);
    await client.query('DELETE FROM almacenes WHERE id = $1', [id]);
    await client.query('COMMIT');
    res.json({ message: 'Almacén eliminado correctamente' });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error eliminando almacén:', error);
    res.status(500).json({ message: 'Error al eliminar almacén' });
  } finally {
    client.release();
  }
});

// Listar carriles de un almacén con ocupación
router.get('/:almacenId/carriles', async (req, res) => {
  try {
    const { almacenId } = req.params;
    const carrilesResult = await pool.query(
      `SELECT c.id, c.nombre, c.numero_carril, c.cantidad_niveles, c.cantidad_posiciones
       FROM carriles c
       WHERE c.almacen_id = $1
       ORDER BY c.numero_carril`,
      [almacenId]
    );

    const carriles = await Promise.all(
      carrilesResult.rows.map(async (c) => {
        const stats = await pool.query(
          `SELECT 
            COUNT(p.id) AS espacios_totales,
            COUNT(p.id) FILTER (WHERE EXISTS (
              SELECT 1 FROM stock_posiciones s WHERE s.posicion_id = p.id AND (s.cantidad_bultos > 0 OR s.total_kg > 0 OR COALESCE(s.peso_adicional, 0) > 0)
            ) OR COALESCE(p.bloqueada, false)) AS espacios_ocupados
           FROM posiciones p
           JOIN niveles n ON n.id = p.nivel_id
           WHERE n.carril_id = $1`,
          [c.id]
        );
        const row = stats.rows[0];
        const total = Number(row?.espacios_totales) || 0;
        const ocupados = Number(row?.espacios_ocupados) || 0;
        return {
          ...c,
          espacios_totales: total,
          espacios_ocupados: ocupados,
          espacios_libres: Math.max(0, total - ocupados),
          porcentaje_ocupacion: total > 0 ? Math.round((ocupados / total) * 100) : 0,
        };
      })
    );

    res.json(carriles);
  } catch (error) {
    console.error('Error listando carriles:', error);
    res.status(500).json({ message: 'Error al listar carriles' });
  }
});

// Matriz niveles-posiciones de un carril (filas = niveles, columnas = posiciones)
router.get('/:almacenId/carriles/:carrilId/niveles-posiciones', async (req, res) => {
  try {
    const { almacenId, carrilId } = req.params;

    const carrilResult = await pool.query(
      'SELECT c.id, c.nombre, c.almacen_id, c.numero_carril FROM carriles c WHERE c.id = $1 AND c.almacen_id = $2',
      [carrilId, almacenId]
    );
    if (carrilResult.rows.length === 0) {
      return res.status(404).json({ message: 'Carril no encontrado' });
    }

    const almacenResult = await pool.query(
      'SELECT id, nombre FROM almacenes WHERE id = $1',
      [almacenId]
    );
    const almacen = almacenResult.rows[0] || { id: almacenId, nombre: 'Almacén' };

    const nivelesResult = await pool.query(
      `SELECT id, numero_nivel, cantidad_posiciones
       FROM niveles
       WHERE carril_id = $1
       ORDER BY numero_nivel`,
      [carrilId]
    );

    const niveles = nivelesResult.rows;
    const matriz = [];

    for (const nivel of niveles) {
      const posicionesResult = await pool.query(
        `SELECT 
                p.id, 
                p.nombre, 
                p.numero_posicion, 
                p.estado,
                COALESCE(p.bloqueada, false) AS bloqueada,
                COALESCE(SUM(s.cantidad_bultos), 0)::INTEGER AS total_bultos,
                COALESCE(SUM(s.peso_adicional), 0)::NUMERIC(10,2) AS total_peso_adicional,
                COALESCE(SUM(CASE WHEN COALESCE(s.total_kg, 0) > 0 THEN s.total_kg ELSE COALESCE(s.total_kg, 0) + COALESCE(s.peso_adicional, 0) END), 0)::NUMERIC(10,2) AS total_kg,
                COUNT(DISTINCT s.producto_id) AS productos_distintos,
                COUNT(DISTINCT (s.producto_id::text || '-' || COALESCE(s.lote, ''))) AS productos_lotes_distintos
         FROM posiciones p
         LEFT JOIN stock_posiciones s ON s.posicion_id = p.id AND (s.cantidad_bultos > 0 OR s.total_kg > 0 OR COALESCE(s.peso_adicional, 0) > 0)
         WHERE p.nivel_id = $1
         GROUP BY p.id, p.nombre, p.numero_posicion, p.estado, p.bloqueada
         ORDER BY p.numero_posicion`,
        [nivel.id]
      );

      // Producto con más bultos por posición (solo stock con cantidad > 0)
      const productoPrincipalResult = await pool.query(
        `WITH sums AS (
          SELECT s.posicion_id, p.codigo, p.producto, p.descripcion, SUM(s.cantidad_bultos) AS bultos
          FROM stock_posiciones s
          JOIN productos p ON p.id = s.producto_id
          WHERE s.posicion_id IN (SELECT id FROM posiciones WHERE nivel_id = $1)
            AND (s.cantidad_bultos > 0 OR s.total_kg > 0 OR COALESCE(s.peso_adicional, 0) > 0)
          GROUP BY s.posicion_id, p.id, p.codigo, p.producto, p.descripcion
        ),
        ranked AS (
          SELECT posicion_id, codigo, producto, descripcion,
                 ROW_NUMBER() OVER (PARTITION BY posicion_id ORDER BY bultos DESC) AS rn,
                 COUNT(*) OVER (PARTITION BY posicion_id) AS num_productos
          FROM sums
        )
        SELECT posicion_id, codigo, producto, descripcion, num_productos FROM ranked WHERE rn = 1`,
        [nivel.id]
      );
      const productoPorPosicion = new Map(
        productoPrincipalResult.rows.map((r) => [r.posicion_id, r])
      );

      matriz.push({
        nivel_id: nivel.id,
        numero_nivel: nivel.numero_nivel,
        posiciones: posicionesResult.rows.map((p) => {
          // Calcular estado dinámicamente: Mix si hay diferentes productos o lotes
          let estadoCalculado = p.estado;
          const productosDistintos = Number(p.productos_distintos) || 0;
          const productosLotesDistintos = Number(p.productos_lotes_distintos) || 0;
          
          if (productosDistintos === 0) {
            estadoCalculado = 'Disponible';
          } else if (productosDistintos === 1 && productosLotesDistintos === 1) {
            estadoCalculado = 'Ocupado';
          } else {
            estadoCalculado = 'Mix';
          }

          const infoProducto = productoPorPosicion.get(p.id);
          let producto_codigo = null;
          let producto_nombre = null;
          let producto_descripcion = null;
          let es_varios = false;
          if (infoProducto) {
            producto_codigo = infoProducto.codigo;
            producto_nombre = infoProducto.producto;
            producto_descripcion = infoProducto.descripcion || null;
            es_varios = Number(infoProducto.num_productos) > 1;
          }

          return {
            id: p.id,
            nombre: p.nombre,
            numero_posicion: p.numero_posicion,
            estado: estadoCalculado,
            bloqueada: Boolean(p.bloqueada),
            total_bultos: Number(p.total_bultos) || 0,
            total_peso_adicional: Number(p.total_peso_adicional) || 0,
            total_kg: Number(p.total_kg) || 0,
            producto_codigo,
            producto_nombre,
            producto_descripcion,
            es_varios,
          };
        }),
      });
    }

    const statsResult = await pool.query(
      `SELECT 
        COUNT(p.id) AS total,
        COUNT(p.id) FILTER (WHERE EXISTS (
          SELECT 1 FROM stock_posiciones s WHERE s.posicion_id = p.id AND (s.cantidad_bultos > 0 OR s.total_kg > 0 OR COALESCE(s.peso_adicional, 0) > 0)
        ) OR COALESCE(p.bloqueada, false)) AS ocupados
       FROM posiciones p
       JOIN niveles n ON n.id = p.nivel_id
       WHERE n.carril_id = $1`,
      [carrilId]
    );
    const st = statsResult.rows[0];
    const total = Number(st?.total) || 0;
    const ocupados = Number(st?.ocupados) || 0;

    res.json({
      almacen: { id: almacen.id, nombre: almacen.nombre },
      carril: carrilResult.rows[0],
      matriz,
      resumen: {
        espacios_totales: total,
        espacios_ocupados: ocupados,
        espacios_libres: Math.max(0, total - ocupados),
        porcentaje_ocupacion: total > 0 ? Math.round((ocupados / total) * 100) : 0,
      },
    });
  } catch (error) {
    console.error('Error obteniendo matriz nivel-posición:', error);
    res.status(500).json({ message: 'Error al obtener niveles y posiciones' });
  }
});

// Crear almacén y generar carriles, niveles y posiciones
router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    const { nombre, cantidad_carriles, cantidad_niveles, cantidad_posiciones } = req.body;
    if (!nombre || !cantidad_carriles || !cantidad_niveles || !cantidad_posiciones) {
      return res.status(400).json({ message: 'Faltan campos requeridos' });
    }

    await client.query('BEGIN');

    const insAlmacen = await client.query(
      `INSERT INTO almacenes (nombre, cantidad_carriles, cantidad_niveles, cantidad_posiciones)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [nombre, cantidad_carriles, cantidad_niveles, cantidad_posiciones]
    );
    const almacenId = insAlmacen.rows[0].id;

    for (let nc = 1; nc <= cantidad_carriles; nc++) {
      const insCarril = await client.query(
        `INSERT INTO carriles (almacen_id, nombre, numero_carril, cantidad_niveles, cantidad_posiciones)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [almacenId, `Carril ${nc}`, nc, cantidad_niveles, cantidad_posiciones]
      );
      const carrilId = insCarril.rows[0].id;

      for (let nn = 1; nn <= cantidad_niveles; nn++) {
        const insNivel = await client.query(
          `INSERT INTO niveles (carril_id, numero_nivel, cantidad_posiciones)
           VALUES ($1, $2, $3) RETURNING id`,
          [carrilId, nn, cantidad_posiciones]
        );
        const nivelId = insNivel.rows[0].id;

        for (let np = 1; np <= cantidad_posiciones; np++) {
          await client.query(
            `INSERT INTO posiciones (nivel_id, nombre, numero_posicion, estado)
             VALUES ($1, $2, $3, 'Disponible')`,
            [nivelId, `P-${nc}-${nn}-${np}`, np]
          );
        }
      }
    }

    await client.query('COMMIT');
    res.status(201).json({
      message: 'Almacén creado correctamente',
      id: almacenId,
      nombre,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creando almacén:', error);
    res.status(500).json({ message: 'Error al crear almacén' });
  } finally {
    client.release();
  }
});

// Obtener detalles de una posición con su stock
router.get('/:almacenId/carriles/:carrilId/posiciones/:posicionId', async (req, res) => {
  try {
    const { almacenId, carrilId, posicionId } = req.params;

    // Verificar que la posición pertenece al carril y almacén
    const posicionResult = await pool.query(
      `SELECT p.id, p.nombre, p.numero_posicion, p.estado, COALESCE(p.bloqueada, false) AS bloqueada, p.nivel_id,
              n.numero_nivel, n.id AS nivel_id_db,
              c.numero_carril, c.id AS carril_id,
              a.nombre AS almacen_nombre, a.id AS almacen_id
       FROM posiciones p
       JOIN niveles n ON n.id = p.nivel_id
       JOIN carriles c ON c.id = n.carril_id
       JOIN almacenes a ON a.id = c.almacen_id
       WHERE p.id = $1 AND n.carril_id = $2 AND c.almacen_id = $3`,
      [posicionId, carrilId, almacenId]
    );

    if (posicionResult.rows.length === 0) {
      return res.status(404).json({ message: 'Posición no encontrada' });
    }

    const posicion = posicionResult.rows[0];

    // Obtener stock de la posición (solo filas con cantidad > 0; si quedó en 0 se considera posición liberada)
    const stockResult = await pool.query(
      `SELECT 
        s.id,
        s.lote,
        s.referencia,
        s.fecha_ingreso,
        s.cantidad_bultos,
        s.peso_adicional,
        s.total_kg,
        s.created_at,
        p.id AS producto_id,
        p.codigo AS producto_codigo,
        p.producto AS producto_nombre,
        p.descripcion AS producto_descripcion,
        p.presentacion AS producto_presentacion,
        p.formato,
        p.unidad_medida,
        p.cliente_id,
        p.especie_id,
        (SELECT m.numero_guia FROM movimientos m
         JOIN movimiento_detalles md ON md.movimiento_id = m.id
         WHERE md.stock_posicion_id = s.id AND m.tipo_movimiento = 'Ingreso'
         ORDER BY m.fecha_hora DESC LIMIT 1) AS numero_guia
       FROM stock_posiciones s
       LEFT JOIN productos p ON p.id = s.producto_id
       WHERE s.posicion_id = $1 AND (s.cantidad_bultos > 0 OR s.total_kg > 0 OR COALESCE(s.peso_adicional, 0) > 0)
       ORDER BY s.fecha_ingreso DESC NULLS LAST, s.created_at DESC`,
      [posicionId]
    );

    // Calcular resumen: total_kg en BD ya incluye peso_adicional al guardar; solo si total_kg=0 (ej. saldo tras vaciar) se suma peso_adicional
    const resumen = stockResult.rows.reduce(
      (acc, item) => {
        acc.total_bultos += Number(item.cantidad_bultos) || 0;
        const tk = Number(item.total_kg) || 0;
        const pa = Number(item.peso_adicional) || 0;
        acc.total_kg += tk > 0 ? tk : tk + pa;
        return acc;
      },
      { total_bultos: 0, total_kg: 0 }
    );

    res.json({
      posicion: {
        id: posicion.id,
        nombre: posicion.nombre,
        numero_posicion: posicion.numero_posicion,
        estado: posicion.estado,
        bloqueada: Boolean(posicion.bloqueada),
        nivel: {
          id: posicion.nivel_id_db || posicion.nivel_id,
          numero_nivel: posicion.numero_nivel,
        },
        carril: {
          id: posicion.carril_id,
          numero_carril: posicion.numero_carril,
        },
        almacen: {
          id: posicion.almacen_id,
          nombre: posicion.almacen_nombre,
        },
      },
      stock: stockResult.rows,
      resumen,
    });
  } catch (error) {
    console.error('Error obteniendo detalles de posición:', error);
    res.status(500).json({ message: 'Error al obtener detalles de posición' });
  }
});

// Actualizar bloqueo de una posición
router.patch('/:almacenId/carriles/:carrilId/posiciones/:posicionId', async (req, res) => {
  try {
    const { almacenId, carrilId, posicionId } = req.params;
    const { bloqueada } = req.body;

    const check = await pool.query(
      `SELECT p.id FROM posiciones p
       JOIN niveles n ON n.id = p.nivel_id
       JOIN carriles c ON c.id = n.carril_id
       WHERE p.id = $1 AND n.carril_id = $2 AND c.almacen_id = $3`,
      [posicionId, carrilId, almacenId]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ message: 'Posición no encontrada' });
    }

    const valor = Boolean(bloqueada);
    await pool.query(
      'UPDATE posiciones SET bloqueada = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [valor, posicionId]
    );
    res.json({ bloqueada: valor, message: valor ? 'Posición bloqueada' : 'Posición desbloqueada' });
  } catch (error) {
    console.error('Error actualizando bloqueo de posición:', error);
    res.status(500).json({ message: 'Error al actualizar la posición' });
  }
});

// Crear ingreso de producto en una posición
router.post('/:almacenId/carriles/:carrilId/posiciones/:posicionId/stock', async (req, res) => {
  const client = await pool.connect();
  try {
    const { almacenId, carrilId, posicionId } = req.params;
    const { producto_id, referencia, lote, fecha_ingreso, cantidad_bultos, peso_adicional, numero_guia } = req.body;
    const usuario_id = req.user.id;

    // Validaciones
    if (!producto_id || !referencia || !fecha_ingreso || !cantidad_bultos) {
      return res.status(400).json({ message: 'Faltan campos requeridos' });
    }

    if (cantidad_bultos < 1) {
      return res.status(400).json({ message: 'La cantidad de bultos debe ser mayor a 0' });
    }

    await client.query('BEGIN');

    // Verificar que la posición existe y pertenece al almacén/carril
    const posicionCheck = await client.query(
      `SELECT p.id, p.nivel_id, COALESCE(p.bloqueada, false) AS bloqueada FROM posiciones p
       JOIN niveles n ON n.id = p.nivel_id
       JOIN carriles c ON c.id = n.carril_id
       WHERE p.id = $1 AND n.carril_id = $2 AND c.almacen_id = $3`,
      [posicionId, carrilId, almacenId]
    );

    if (posicionCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Posición no encontrada' });
    }

    if (posicionCheck.rows[0].bloqueada) {
      await client.query('ROLLBACK');
      return res.status(403).json({ message: 'La posición está bloqueada. No se pueden agregar productos.' });
    }

    const nivelId = posicionCheck.rows[0].nivel_id;

    // Obtener información del producto
    const productoResult = await client.query(
      'SELECT formato, unidad_medida FROM productos WHERE id = $1 AND activo = TRUE',
      [producto_id]
    );

    if (productoResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Producto no encontrado' });
    }

    const producto = productoResult.rows[0];
    const formato = Number(producto.formato);
    const unidad_medida = producto.unidad_medida;
    const pesoAdicional = Number(peso_adicional) || 0;

    // Calcular total_kg (peso_adicional siempre en KG)
    let total_kg;
    if (unidad_medida === 'KG') {
      total_kg = cantidad_bultos * formato + pesoAdicional;
    } else {
      total_kg = (cantidad_bultos * formato) / 2.2046 + pesoAdicional;
    }

    const descPosicion = await descripcionPosicion(client, posicionId);
    const numeroGuia = numero_guia != null && String(numero_guia).trim() !== '' ? String(numero_guia).trim() : null;

    // Consolidar: si ya existe stock en esta posición para el mismo producto, lote y referencia, sumar en lugar de crear otra fila
    const existente = await client.query(
      `SELECT id, cantidad_bultos, total_kg, peso_adicional FROM stock_posiciones
       WHERE posicion_id = $1 AND producto_id = $2
         AND COALESCE(lote, '') = COALESCE($3, '') AND referencia = $4`,
      [posicionId, producto_id, lote || null, referencia]
    );

    let stockCreado;
    if (existente.rows.length > 0) {
      const row = existente.rows[0];
      const nuevaCantidad = (Number(row.cantidad_bultos) || 0) + cantidad_bultos;
      const nuevoTotalKg = (Number(row.total_kg) || 0) + total_kg;
      const nuevoPesoAdj = (Number(row.peso_adicional) || 0) + pesoAdicional;
      const upd = await client.query(
        `UPDATE stock_posiciones
         SET cantidad_bultos = $1, total_kg = $2, peso_adicional = $3, fecha_ingreso = $4, updated_at = CURRENT_TIMESTAMP
         WHERE id = $5 RETURNING *`,
        [nuevaCantidad, nuevoTotalKg, nuevoPesoAdj, fecha_ingreso, row.id]
      );
      stockCreado = upd.rows[0];
    } else {
      const stockResult = await client.query(
        `INSERT INTO stock_posiciones 
         (posicion_id, producto_id, lote, referencia, fecha_ingreso, cantidad_bultos, peso_adicional, total_kg)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [posicionId, producto_id, lote || null, referencia, fecha_ingreso, cantidad_bultos, pesoAdicional, total_kg]
      );
      stockCreado = stockResult.rows[0];
    }

    // Siempre crear un movimiento de Ingreso y su detalle (para trazabilidad); el detalle refleja este ingreso concreto
    const movimientoResult = await client.query(
      `INSERT INTO movimientos (tipo_movimiento, usuario_id, fecha_hora, motivo, numero_guia)
       VALUES ('Ingreso', $1, CURRENT_TIMESTAMP, $2, $3)
       RETURNING id`,
      [usuario_id, `Ingreso en ${descPosicion}`, numeroGuia]
    );
    const movimientoId = movimientoResult.rows[0].id;
    await client.query(
      `INSERT INTO movimiento_detalles 
       (movimiento_id, producto_id, cantidad_bultos, total_kg, peso_adicional, almacen_id, carril_id, nivel_id, posicion_id, stock_posicion_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        movimientoId,
        producto_id,
        cantidad_bultos,
        total_kg,
        pesoAdicional,
        almacenId,
        carrilId,
        nivelId,
        posicionId,
        stockCreado.id,
      ]
    );

    await client.query('COMMIT');

    res.status(201).json({
      message: existente.rows.length > 0 ? 'Producto sumado al stock existente' : 'Producto ingresado correctamente',
      stock: stockCreado,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creando ingreso:', error);
    res.status(500).json({ message: 'Error al crear ingreso de producto' });
  } finally {
    client.release();
  }
});

// Actualizar ingreso de producto (registra movimiento de tipo Ajuste)
router.put('/:almacenId/carriles/:carrilId/posiciones/:posicionId/stock/:stockId', async (req, res) => {
  const client = await pool.connect();
  try {
    const { almacenId, carrilId, posicionId, stockId } = req.params;
    const { referencia, lote, fecha_ingreso, cantidad_bultos, peso_adicional, numero_guia, producto_id: bodyProductoId } = req.body;
    const usuario_id = req.user?.id;

    if (!referencia || (cantidad_bultos == null || cantidad_bultos === '')) {
      return res.status(400).json({ message: 'Faltan campos requeridos (referencia, cantidad_bultos)' });
    }
    // Normalizar fecha a YYYY-MM-DD para PostgreSQL
    let fechaIngresoNorm = null;
    if (fecha_ingreso) {
      const s = String(fecha_ingreso).trim();
      if (s.length >= 10) {
        const match = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (match) fechaIngresoNorm = `${match[1]}-${match[2]}-${match[3]}`;
        else {
          const d = new Date(s);
          if (!isNaN(d.getTime())) fechaIngresoNorm = d.toISOString().slice(0, 10);
        }
      }
    }
    if (!fechaIngresoNorm) {
      return res.status(400).json({ message: 'Fecha de ingreso inválida o faltante (use formato YYYY-MM-DD)' });
    }

    await client.query('BEGIN');

    // Verificar que el stock pertenece a la posición y obtener nivel
    const stockCheck = await client.query(
      `SELECT s.id, s.producto_id, s.cantidad_bultos, s.total_kg, s.peso_adicional, p.formato, p.unidad_medida
       FROM stock_posiciones s
       JOIN productos p ON p.id = s.producto_id
       WHERE s.id = $1 AND s.posicion_id = $2`,
      [stockId, posicionId]
    );

    if (stockCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Stock no encontrado' });
    }

    const stock = stockCheck.rows[0];
    const productIdVal = bodyProductoId != null && bodyProductoId !== '' ? bodyProductoId : null;
    const productIdToUse = productIdVal || stock.producto_id;

    // Si se cambia el producto, obtener formato/unidad del nuevo producto
    let formato = Number(stock.formato);
    let unidad_medida = stock.unidad_medida;
    if (productIdVal && productIdVal !== stock.producto_id) {
      const prodRow = await client.query(
        'SELECT formato, unidad_medida FROM productos WHERE id = $1',
        [productIdVal]
      );
      if (prodRow.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Producto no encontrado' });
      }
      formato = Number(prodRow.rows[0].formato);
      unidad_medida = prodRow.rows[0].unidad_medida;
    }

    const pesoAdicional = Number(peso_adicional) || 0;
    const bultos = parseInt(cantidad_bultos, 10) || 0;

    // Recalcular total_kg (peso_adicional siempre en KG)
    let total_kg;
    if (unidad_medida === 'KG') {
      total_kg = bultos * formato + pesoAdicional;
    } else {
      total_kg = (bultos * formato) / 2.2046 + pesoAdicional;
    }

    // Actualizar numero_guia del movimiento de tipo Ingreso asociado a este stock (si la columna existe)
    if (numero_guia !== undefined) {
      try {
        await client.query(
          `UPDATE movimientos SET numero_guia = $1
           WHERE tipo_movimiento = 'Ingreso' AND id IN (
             SELECT movimiento_id FROM movimiento_detalles WHERE stock_posicion_id = $2
           )`,
          [numero_guia === '' ? null : numero_guia, stockId]
        );
      } catch (err) {
        if (err.code !== '42703') throw err; // 42703 = undefined_column
      }
    }

    // Actualizar stock (incluye producto_id si se envía)
    const updateFields = [
      'referencia = $1', 'lote = $2', 'fecha_ingreso = $3',
      'cantidad_bultos = $4', 'peso_adicional = $5', 'total_kg = $6',
      'updated_at = CURRENT_TIMESTAMP'
    ];
    const updateValues = [referencia, lote || null, fechaIngresoNorm, bultos, pesoAdicional, total_kg];
    if (productIdVal) {
      updateFields.push('producto_id = $7');
      updateValues.push(productIdVal);
    }
    updateValues.push(stockId);
    const updateResult = await client.query(
      `UPDATE stock_posiciones SET ${updateFields.join(', ')} WHERE id = $${updateValues.length} RETURNING *`,
      updateValues
    );

    // Mantener historial: actualizar el detalle del movimiento Ingreso asociado a este stock para que la vista Ingresos refleje la cantidad editada
    await client.query(
      `UPDATE movimiento_detalles SET cantidad_bultos = $1, total_kg = $2, peso_adicional = $3
       WHERE stock_posicion_id = $4 AND movimiento_id IN (
         SELECT id FROM movimientos WHERE tipo_movimiento = 'Ingreso'
       )`,
      [bultos, total_kg, pesoAdicional, stockId]
    );

    // Registrar movimiento (Ajuste): una fila "Antes" y una "Después" (opcional; no falla la actualización)
    if (usuario_id) {
      try {
        const posicionInfo = await client.query(
          `SELECT n.id AS nivel_id FROM posiciones p
           JOIN niveles n ON n.id = p.nivel_id
           WHERE p.id = $1`,
          [posicionId]
        );
        const nivelId = posicionInfo.rows[0]?.nivel_id || null;
        const movimientoResult = await client.query(
          `INSERT INTO movimientos (tipo_movimiento, usuario_id, fecha_hora, motivo)
           VALUES ('Movimiento', $1, CURRENT_TIMESTAMP, $2)
           RETURNING id`,
          [usuario_id, 'Ajuste de producto en posición']
        );
        const movimientoId = movimientoResult.rows[0].id;
        const detalleIns = (cantidad_bultos, total_kg, peso_adicional, tipo_linea) =>
          client.query(
            `INSERT INTO movimiento_detalles
             (movimiento_id, producto_id, cantidad_bultos, total_kg, peso_adicional, almacen_id, carril_id, nivel_id, posicion_id, stock_posicion_id, tipo_linea)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [
              movimientoId,
              productIdToUse,
              cantidad_bultos,
              total_kg,
              peso_adicional,
              almacenId,
              carrilId,
              nivelId,
              posicionId,
              stockId,
              tipo_linea,
            ]
          );
        const oldBultos = Number(stock.cantidad_bultos) || 0;
        const oldTotalKg = Number(stock.total_kg) || 0;
        const oldPesoAdj = Number(stock.peso_adicional) || 0;
        await detalleIns(oldBultos, oldTotalKg, oldPesoAdj, 'Antes');
        await detalleIns(bultos, total_kg, pesoAdicional, 'Despues');
      } catch (ajusteErr) {
        console.error('Error registrando movimiento de Ajuste (stock ya actualizado):', ajusteErr);
      }
    }

    let stockDevuelto = updateResult.rows[0];
    if (bultos === 0) {
      await client.query('DELETE FROM stock_posiciones WHERE id = $1', [stockId]);
      stockDevuelto = null;
    }

    await client.query('COMMIT');

    res.json({
      message: stockDevuelto ? 'Stock actualizado correctamente' : 'Stock en 0 eliminado; posición liberada.',
      stock: stockDevuelto,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error actualizando stock:', error);
    const msg = error.message || 'Error al actualizar stock';
    const detail = error.detail ? ` ${error.detail}` : '';
    res.status(500).json({ message: `${msg}${detail}`, code: error.code });
  } finally {
    client.release();
  }
});

// Eliminar ingreso de producto
router.delete('/:almacenId/carriles/:carrilId/posiciones/:posicionId/stock/:stockId', async (req, res) => {
  const client = await pool.connect();
  try {
    const { almacenId, carrilId, posicionId, stockId } = req.params;
    const usuario_id = req.user.id;

    await client.query('BEGIN');

    // Verificar que el stock pertenece a la posición
    const stockCheck = await client.query(
      `SELECT s.id, s.producto_id, s.cantidad_bultos, s.total_kg, s.peso_adicional
       FROM stock_posiciones s
       WHERE s.id = $1 AND s.posicion_id = $2`,
      [stockId, posicionId]
    );

    if (stockCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Stock no encontrado' });
    }

    const stock = stockCheck.rows[0];

    // Crear registro de movimiento (salida)
    const movimientoResult = await client.query(
      `INSERT INTO movimientos (tipo_movimiento, usuario_id, fecha_hora, motivo)
       VALUES ('Salida', $1, CURRENT_TIMESTAMP, $2)
       RETURNING id`,
      [usuario_id, `Eliminación de stock de posición ${posicionId}`]
    );

    const movimientoId = movimientoResult.rows[0].id;

    // Obtener información de la posición para el detalle
    const posicionInfo = await client.query(
      `SELECT n.id AS nivel_id FROM posiciones p
       JOIN niveles n ON n.id = p.nivel_id
       WHERE p.id = $1`,
      [posicionId]
    );

    await client.query(
      `INSERT INTO movimiento_detalles 
       (movimiento_id, producto_id, cantidad_bultos, total_kg, peso_adicional, almacen_id, carril_id, nivel_id, posicion_id, stock_posicion_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        movimientoId,
        stock.producto_id,
        stock.cantidad_bultos,
        stock.total_kg,
        Number(stock.peso_adicional) || 0,
        almacenId,
        carrilId,
        posicionInfo.rows[0]?.nivel_id || null,
        posicionId,
        stockId,
      ]
    );

    // Eliminar stock (el trigger actualizará el estado de la posición)
    await client.query('DELETE FROM stock_posiciones WHERE id = $1', [stockId]);

    await client.query('COMMIT');

    res.json({ message: 'Stock eliminado correctamente' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error eliminando stock:', error);
    res.status(500).json({ message: 'Error al eliminar stock' });
  } finally {
    client.release();
  }
});

// Mover producto a otra posición (total o parcial: cantidad_bultos, peso_adicional)
router.post('/:almacenId/carriles/:carrilId/posiciones/:posicionId/stock/:stockId/mover', async (req, res) => {
  const client = await pool.connect();
  try {
    const { almacenId, carrilId, posicionId, stockId } = req.params;
    const { nuevo_almacen_id, nuevo_carril_id, nuevo_nivel_id, nuevo_posicion_id, motivo, cantidad_bultos: cantidadMover, peso_adicional: pesoAdicionalMover } = req.body;
    const usuario_id = req.user.id;

    if (!nuevo_almacen_id || !nuevo_carril_id || !nuevo_nivel_id || !nuevo_posicion_id) {
      return res.status(400).json({ message: 'Faltan campos requeridos para el movimiento' });
    }

    await client.query('BEGIN');

    const stockOrigen = await client.query(
      `SELECT s.*, p.formato, p.unidad_medida
       FROM stock_posiciones s
       JOIN productos p ON p.id = s.producto_id
       WHERE s.id = $1 AND s.posicion_id = $2`,
      [stockId, posicionId]
    );

    if (stockOrigen.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Stock no encontrado' });
    }

    const posicionOrigenBlock = await client.query(
      'SELECT COALESCE(bloqueada, false) AS bloqueada FROM posiciones WHERE id = $1',
      [posicionId]
    );
    if (posicionOrigenBlock.rows.length > 0 && posicionOrigenBlock.rows[0].bloqueada) {
      await client.query('ROLLBACK');
      return res.status(403).json({ message: 'La posición de origen está bloqueada. No se pueden mover productos.' });
    }

    const stock = stockOrigen.rows[0];
    const totalBultosOrigen = Number(stock.cantidad_bultos) || 0;
    const formato = Number(stock.formato) || 0;
    const unidadMedida = stock.unidad_medida || 'KG';
    const cantidadMoverNum = cantidadMover != null ? Math.max(1, parseInt(cantidadMover, 10)) : totalBultosOrigen;
    const pesoAdicional = Number(pesoAdicionalMover) || 0;

    if (cantidadMoverNum > totalBultosOrigen) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: `La cantidad a mover no puede superar ${totalBultosOrigen} bultos` });
    }

    const posicionDestino = await client.query(
      `SELECT p.id, COALESCE(p.bloqueada, false) AS bloqueada FROM posiciones p
       JOIN niveles n ON n.id = p.nivel_id
       JOIN carriles c ON c.id = n.carril_id
       WHERE p.id = $1 AND n.id = $2 AND c.id = $3 AND c.almacen_id = $4`,
      [nuevo_posicion_id, nuevo_nivel_id, nuevo_carril_id, nuevo_almacen_id]
    );

    if (posicionDestino.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Posición destino no encontrada' });
    }

    if (posicionDestino.rows[0].bloqueada) {
      await client.query('ROLLBACK');
      return res.status(403).json({ message: 'La posición de destino está bloqueada. No se pueden mover productos a esa posición.' });
    }

    let totalKgMover;
    if (unidadMedida === 'KG') {
      totalKgMover = cantidadMoverNum * formato + pesoAdicional;
    } else {
      totalKgMover = (cantidadMoverNum * formato) / 2.2046 + pesoAdicional;
    }

    const posicionOrigenInfo = await client.query(
      `SELECT n.id AS nivel_id FROM posiciones p JOIN niveles n ON n.id = p.nivel_id WHERE p.id = $1`,
      [posicionId]
    );
    const nivelOrigenId = posicionOrigenInfo.rows[0]?.nivel_id || null;

    const descOrigen = await descripcionPosicion(client, posicionId);
    const descDestino = await descripcionPosicion(client, nuevo_posicion_id);
    const motivoMovimiento = motivo && motivo.trim() ? motivo.trim() : `Desde ${descOrigen} hacia ${descDestino}`;

    if (cantidadMoverNum >= totalBultosOrigen) {
      // Mover todo el registro
      await client.query(
        `UPDATE stock_posiciones SET posicion_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [nuevo_posicion_id, stockId]
      );

      const movimientoResult = await client.query(
        `INSERT INTO movimientos (tipo_movimiento, usuario_id, fecha_hora, motivo)
         VALUES ('Movimiento', $1, CURRENT_TIMESTAMP, $2) RETURNING id`,
        [usuario_id, motivoMovimiento]
      );
      const movimientoId = movimientoResult.rows[0].id;

      const pesoAdj = Number(stock.peso_adicional) || 0;
      await client.query(
        `INSERT INTO movimiento_detalles (movimiento_id, producto_id, cantidad_bultos, total_kg, peso_adicional, almacen_id, carril_id, nivel_id, posicion_id, stock_posicion_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [movimientoId, stock.producto_id, totalBultosOrigen, stock.total_kg, pesoAdj, almacenId, carrilId, nivelOrigenId, posicionId, stockId]
      );
      await client.query(
        `INSERT INTO movimiento_detalles (movimiento_id, producto_id, cantidad_bultos, total_kg, peso_adicional, almacen_id, carril_id, nivel_id, posicion_id, stock_posicion_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [movimientoId, stock.producto_id, totalBultosOrigen, stock.total_kg, pesoAdj, nuevo_almacen_id, nuevo_carril_id, nuevo_nivel_id, nuevo_posicion_id, stockId]
      );
    } else {
      // Movimiento parcial: crear nuevo registro en destino y reducir el origen
      const bultosQuedan = totalBultosOrigen - cantidadMoverNum;
      let totalKgOrigen;
      if (unidadMedida === 'KG') {
        totalKgOrigen = bultosQuedan * formato;
      } else {
        totalKgOrigen = (bultosQuedan * formato) / 2.2046;
      }

      const insDestino = await client.query(
        `INSERT INTO stock_posiciones (posicion_id, producto_id, lote, referencia, fecha_ingreso, cantidad_bultos, peso_adicional, total_kg)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [nuevo_posicion_id, stock.producto_id, stock.lote, stock.referencia, stock.fecha_ingreso, cantidadMoverNum, pesoAdicional, totalKgMover]
      );
      const nuevoStockId = insDestino.rows[0].id;

      await client.query(
        `UPDATE stock_posiciones SET cantidad_bultos = $1, peso_adicional = 0, total_kg = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
        [bultosQuedan, totalKgOrigen, stockId]
      );

      const movimientoResult = await client.query(
        `INSERT INTO movimientos (tipo_movimiento, usuario_id, fecha_hora, motivo)
         VALUES ('Movimiento', $1, CURRENT_TIMESTAMP, $2) RETURNING id`,
        [usuario_id, `Movimiento parcial: desde ${descOrigen} hacia ${descDestino}`]
      );
      const movimientoId = movimientoResult.rows[0].id;

      const pesoAdj = Number(pesoAdicional) || 0;
      await client.query(
        `INSERT INTO movimiento_detalles (movimiento_id, producto_id, cantidad_bultos, total_kg, peso_adicional, almacen_id, carril_id, nivel_id, posicion_id, stock_posicion_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [movimientoId, stock.producto_id, cantidadMoverNum, totalKgMover, pesoAdj, almacenId, carrilId, nivelOrigenId, posicionId, stockId]
      );
      await client.query(
        `INSERT INTO movimiento_detalles (movimiento_id, producto_id, cantidad_bultos, total_kg, peso_adicional, almacen_id, carril_id, nivel_id, posicion_id, stock_posicion_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [movimientoId, stock.producto_id, cantidadMoverNum, totalKgMover, pesoAdj, nuevo_almacen_id, nuevo_carril_id, nuevo_nivel_id, nuevo_posicion_id, nuevoStockId]
      );

      if (bultosQuedan === 0) {
        await client.query('DELETE FROM stock_posiciones WHERE id = $1', [stockId]);
      }
    }

    await client.query('COMMIT');

    res.json({
      message: 'Producto movido correctamente',
      cantidad_movida: cantidadMoverNum,
      total_kg_movido: totalKgMover,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error moviendo producto:', error);
    res.status(500).json({ message: 'Error al mover producto' });
  } finally {
    client.release();
  }
});

// Mover todos los productos de una posición a otra (desde vista nivel-posición)
router.post('/:almacenId/carriles/:carrilId/posiciones/:posicionId/mover-todo', async (req, res) => {
  const client = await pool.connect();
  try {
    const { almacenId, carrilId, posicionId } = req.params;
    const { nuevo_almacen_id, nuevo_carril_id, nuevo_nivel_id, nuevo_posicion_id } = req.body;
    const usuario_id = req.user.id;

    if (!nuevo_almacen_id || !nuevo_carril_id || !nuevo_nivel_id || !nuevo_posicion_id) {
      return res.status(400).json({ message: 'Faltan datos de la posición destino' });
    }

    if (posicionId === nuevo_posicion_id) {
      return res.status(400).json({ message: 'La posición origen y destino deben ser distintas' });
    }

    await client.query('BEGIN');

    const origenCheck = await client.query(
      `SELECT p.id, COALESCE(p.bloqueada, false) AS bloqueada
       FROM posiciones p
       JOIN niveles n ON n.id = p.nivel_id
       JOIN carriles c ON c.id = n.carril_id
       WHERE p.id = $1 AND n.carril_id = $2 AND c.almacen_id = $3`,
      [posicionId, carrilId, almacenId]
    );
    if (origenCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Posición de origen no encontrada' });
    }
    if (origenCheck.rows[0].bloqueada) {
      await client.query('ROLLBACK');
      return res.status(403).json({ message: 'La posición de origen está bloqueada.' });
    }

    const destinoCheck = await client.query(
      `SELECT p.id, COALESCE(p.bloqueada, false) AS bloqueada
       FROM posiciones p
       JOIN niveles n ON n.id = p.nivel_id
       JOIN carriles c ON c.id = n.carril_id
       WHERE p.id = $1 AND n.id = $2 AND c.id = $3 AND c.almacen_id = $4`,
      [nuevo_posicion_id, nuevo_nivel_id, nuevo_carril_id, nuevo_almacen_id]
    );
    if (destinoCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Posición de destino no encontrada' });
    }
    if (destinoCheck.rows[0].bloqueada) {
      await client.query('ROLLBACK');
      return res.status(403).json({ message: 'La posición de destino está bloqueada.' });
    }

    const stockRows = await client.query(
      `SELECT id, producto_id, cantidad_bultos, total_kg, COALESCE(peso_adicional, 0) AS peso_adicional FROM stock_posiciones WHERE posicion_id = $1`,
      [posicionId]
    );
    if (stockRows.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'La posición de origen no tiene productos para mover' });
    }

    const descOrigenTodo = await descripcionPosicion(client, posicionId);
    const descDestinoTodo = await descripcionPosicion(client, nuevo_posicion_id);
    const movimientoResult = await client.query(
      `INSERT INTO movimientos (tipo_movimiento, usuario_id, fecha_hora, motivo)
       VALUES ('Movimiento', $1, CURRENT_TIMESTAMP, $2) RETURNING id`,
      [usuario_id, `Traslado desde ${descOrigenTodo} hacia ${descDestinoTodo}`]
    );
    const movimientoId = movimientoResult.rows[0].id;

    for (const row of stockRows.rows) {
      await client.query(
        `INSERT INTO movimiento_detalles (movimiento_id, producto_id, cantidad_bultos, total_kg, peso_adicional, almacen_id, carril_id, nivel_id, posicion_id, stock_posicion_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [movimientoId, row.producto_id, row.cantidad_bultos, row.total_kg, Number(row.peso_adicional) || 0, nuevo_almacen_id, nuevo_carril_id, nuevo_nivel_id, nuevo_posicion_id, row.id]
      );
    }

    await client.query(
      `UPDATE stock_posiciones SET posicion_id = $1, updated_at = CURRENT_TIMESTAMP WHERE posicion_id = $2`,
      [nuevo_posicion_id, posicionId]
    );

    await client.query('COMMIT');
    res.json({
      message: 'Todos los productos se movieron correctamente',
      cantidad_registros: stockRows.rows.length,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error en mover-todo posición:', error);
    res.status(500).json({ message: 'Error al mover los productos' });
  } finally {
    client.release();
  }
});

export default router;
