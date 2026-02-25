import express from 'express';
import { pool } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.middleware.js';

const router = express.Router();
router.use(authenticateToken);

const CLAVES_TAMAÑOS_TEXTO = [
  ['tamaño_fuente', '14', 'Tamaño de fuente base (px)'],
  ['tamaño_titulos', '20', 'Tamaño de fuente de títulos (px)'],
  ['tamaño_texto', '14', 'Tamaño de texto general (px)'],
  ['tamaño_tablas', '13', 'Tamaño de fuente en tablas (px)'],
  ['tamaño_modales', '14', 'Tamaño de fuente en ventanas modales (px)'],
];

/**
 * GET /api/configuracion
 * Lista configuración fusionada: valores por usuario (configuracion_usuario) o global (configuracion).
 * Asegura que existan las claves de tamaños de texto (insert si faltan).
 */
router.get('/', async (req, res) => {
  try {
    for (const [clave, valor, descripcion] of CLAVES_TAMAÑOS_TEXTO) {
      await pool.query(
        `INSERT INTO configuracion (clave, valor, tipo, descripcion)
         SELECT $1::varchar(255), $2::text, 'number'::varchar(50), $3::text
         WHERE NOT EXISTS (SELECT 1 FROM configuracion WHERE clave = $1::varchar(255))`,
        [clave, valor, descripcion]
      );
    }
    await pool.query(
      `INSERT INTO configuracion (clave, valor, tipo, descripcion)
       SELECT 'tamaño_logo', '48', 'number', 'Altura del logo en el menú lateral (px)'
       WHERE NOT EXISTS (SELECT 1 FROM configuracion WHERE clave = 'tamaño_logo')`
    );
    await pool.query(
      `INSERT INTO configuracion (clave, valor, tipo, descripcion)
       SELECT 'lote_republicano_anos', '{}', 'json', 'Mapa letra→año para lotes republicanos (ej. {"H":"2025"}). Solo administradores.'
       WHERE NOT EXISTS (SELECT 1 FROM configuracion WHERE clave = 'lote_republicano_anos')`
    );
    const global = await pool.query(
      `SELECT id, clave, valor, tipo, descripcion, updated_at FROM configuracion ORDER BY clave`
    );
    const userId = req.user?.id;
    let userMap = new Map();
    if (userId) {
      try {
        const userRows = await pool.query(
          `SELECT clave, valor FROM configuracion_usuario WHERE user_id = $1`,
          [userId]
        );
        userMap = new Map(userRows.rows.map((r) => [r.clave, r.valor]));
      } catch (e) {
        if (e.code !== '42P01') throw e;
        // Tabla configuracion_usuario no existe; usar solo global
      }
    }
    const merged = global.rows.map((row) => ({
      ...row,
      valor: userMap.has(row.clave) ? userMap.get(row.clave) : row.valor,
    }));
    res.json(merged);
  } catch (error) {
    console.error('Error listando configuración:', error);
    res.status(500).json({ message: 'Error al listar configuración' });
  }
});

/**
 * PUT /api/configuracion/:id
 * Actualiza configuración del usuario (por clave, resolviendo id a clave desde configuracion global).
 */
router.put('/:id', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Usuario no autenticado' });
    }
    const { id } = req.params;
    const { valor } = req.body;

    if (valor === undefined || valor === null) {
      return res.status(400).json({ message: 'El campo valor es requerido' });
    }

    const valStr = String(valor).trim();
    const globalRow = await pool.query(
      'SELECT id, clave FROM configuracion WHERE id = $1',
      [id]
    );
    if (globalRow.rows.length === 0) {
      return res.status(404).json({ message: 'Entrada de configuración no encontrada' });
    }
    const clave = globalRow.rows[0].clave;

    try {
      await pool.query(
        `INSERT INTO configuracion_usuario (user_id, clave, valor, updated_at)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
         ON CONFLICT (user_id, clave) DO UPDATE SET valor = $3, updated_at = CURRENT_TIMESTAMP`,
        [userId, clave, valStr]
      );
    } catch (e) {
      if (e.code === '42P01') {
        try {
          await pool.query(`
            CREATE TABLE IF NOT EXISTS configuracion_usuario (
              user_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
              clave VARCHAR(255) NOT NULL,
              valor TEXT NOT NULL,
              updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              PRIMARY KEY (user_id, clave)
            )
          `);
          await pool.query(
            `INSERT INTO configuracion_usuario (user_id, clave, valor, updated_at)
             VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
             ON CONFLICT (user_id, clave) DO UPDATE SET valor = $3, updated_at = CURRENT_TIMESTAMP`,
            [userId, clave, valStr]
          );
        } catch (e2) {
          return res.status(503).json({ message: 'No se pudo crear la tabla de configuración por usuario. Ejecute database/configuracion_usuario.sql manualmente.' });
        }
      } else {
        throw e;
      }
    }

    const result = await pool.query(
      `SELECT id, clave, valor, tipo, descripcion, updated_at FROM configuracion WHERE id = $1`,
      [id]
    );
    res.json({ ...result.rows[0], valor: valStr });
  } catch (error) {
    console.error('Error actualizando configuración:', error);
    res.status(500).json({ message: 'Error al actualizar configuración' });
  }
});

export default router;
