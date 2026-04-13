import express from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import {
  RECURSOS_RBAC,
  ROLES_SISTEMA,
  ensureRbacTables,
  getRolePermissions,
  isAdminRole,
  normalizeRole,
  resolveUserPermissions,
} from '../utils/rbac.js';

const router = express.Router();
router.use(authenticateToken);

const requireAdmin = (req, res, next) => {
  if (!isAdminRole(req.user?.rol)) {
    return res.status(403).json({ message: 'No tienes permisos para esta acción' });
  }
  return next();
};

// Listar todos los usuarios (con paginación)
router.get('/', requireAdmin, async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const limitNum = Math.min(parseInt(limit, 10) || 50, 500);
    const offsetNum = Math.max(0, parseInt(offset, 10) || 0);

    const countResult = await pool.query('SELECT COUNT(*) AS total FROM usuarios');
    const total = parseInt(countResult.rows[0]?.total, 10) || 0;

    const result = await pool.query(
      'SELECT id, nombre, email, rol, activo, created_at FROM usuarios ORDER BY nombre LIMIT $1 OFFSET $2',
      [limitNum, offsetNum]
    );
    res.json({ data: result.rows, total });
  } catch (error) {
    console.error('Error listando usuarios:', error);
    res.status(500).json({ message: 'Error al listar usuarios' });
  }
});

// Obtener usuario actual
router.get('/me', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, nombre, email, rol FROM usuarios WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }
    const resolved = await resolveUserPermissions(result.rows[0].id, result.rows[0].rol);
    res.json({ ...result.rows[0], rol: resolved.role, permissions: resolved.permissions });
  } catch (error) {
    console.error('Error al obtener usuario:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// Obtener un usuario por ID
router.get('/permisos/catalogo', requireAdmin, async (req, res) => {
  try {
    await ensureRbacTables();
    res.json({
      roles: ROLES_SISTEMA,
      resources: RECURSOS_RBAC,
    });
  } catch (error) {
    console.error('Error obteniendo catalogo RBAC:', error);
    res.status(500).json({ message: 'Error obteniendo catálogo de permisos' });
  }
});

router.get('/permisos/roles/:rol', requireAdmin, async (req, res) => {
  try {
    const rol = normalizeRole(req.params.rol);
    if (!ROLES_SISTEMA.includes(rol)) {
      return res.status(400).json({ message: 'Rol inválido' });
    }
    const data = await getRolePermissions(rol);
    res.json({ rol, resources: data });
  } catch (error) {
    console.error('Error obteniendo permisos de rol:', error);
    res.status(500).json({ message: 'Error obteniendo permisos de rol' });
  }
});

router.put('/permisos/roles/:rol', requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const rol = normalizeRole(req.params.rol);
    const resources = Array.isArray(req.body?.resources) ? req.body.resources : [];
    if (!ROLES_SISTEMA.includes(rol)) return res.status(400).json({ message: 'Rol inválido' });
    await ensureRbacTables();
    await client.query('BEGIN');
    for (const item of resources) {
      const codigo = String(item?.codigo || '').trim();
      if (!codigo) continue;
      const puedeVer = !!item.puede_ver;
      const puedeOperar = !!item.puede_operar && puedeVer;
      await client.query(
        `INSERT INTO rbac_roles_permisos (rol, recurso_codigo, puede_ver, puede_operar)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (rol, recurso_codigo) DO UPDATE
         SET puede_ver = EXCLUDED.puede_ver,
             puede_operar = EXCLUDED.puede_operar,
             updated_at = CURRENT_TIMESTAMP`,
        [rol, codigo, puedeVer, puedeOperar]
      );
    }
    await client.query('COMMIT');
    const data = await getRolePermissions(rol);
    res.json({ rol, resources: data });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error guardando permisos de rol:', error);
    res.status(500).json({ message: 'Error guardando permisos de rol' });
  } finally {
    client.release();
  }
});

router.get('/:id/permisos', requireAdmin, async (req, res) => {
  try {
    await ensureRbacTables();
    const { id } = req.params;
    const userResult = await pool.query('SELECT id, rol FROM usuarios WHERE id = $1', [id]);
    if (!userResult.rows.length) return res.status(404).json({ message: 'Usuario no encontrado' });
    const rol = normalizeRole(userResult.rows[0].rol);
    const rows = await pool.query(
      `SELECT rr.codigo, rr.nombre, rr.seccion, rr.orden,
              COALESCE(rp.puede_ver, false) AS base_ver,
              COALESCE(rp.puede_operar, false) AS base_operar,
              uo.override_ver,
              uo.override_operar
         FROM rbac_recursos rr
         LEFT JOIN rbac_roles_permisos rp
           ON rp.recurso_codigo = rr.codigo AND rp.rol = $1
         LEFT JOIN rbac_usuarios_overrides uo
           ON uo.recurso_codigo = rr.codigo AND uo.usuario_id = $2
         ORDER BY rr.orden, rr.codigo`,
      [rol, id]
    );
    const resources = rows.rows.map((r) => {
      const effectiveVer = r.override_ver === null ? !!r.base_ver : !!r.override_ver;
      const rawOperate = r.override_operar === null ? !!r.base_operar : !!r.override_operar;
      const effectiveOperar = effectiveVer ? rawOperate : false;
      return {
        codigo: r.codigo,
        nombre: r.nombre,
        seccion: r.seccion,
        orden: Number(r.orden) || 0,
        base_ver: !!r.base_ver,
        base_operar: !!r.base_operar,
        override_ver: r.override_ver,
        override_operar: r.override_operar,
        effective_ver: effectiveVer,
        effective_operar: effectiveOperar,
      };
    });
    res.json({ user_id: id, rol, resources });
  } catch (error) {
    console.error('Error obteniendo permisos del usuario:', error);
    res.status(500).json({ message: 'Error obteniendo permisos del usuario' });
  }
});

router.put('/:id/permisos-overrides', requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    await ensureRbacTables();
    const { id } = req.params;
    const resources = Array.isArray(req.body?.resources) ? req.body.resources : [];
    const userExists = await client.query('SELECT id FROM usuarios WHERE id = $1', [id]);
    if (!userExists.rows.length) return res.status(404).json({ message: 'Usuario no encontrado' });
    await client.query('BEGIN');
    await client.query('DELETE FROM rbac_usuarios_overrides WHERE usuario_id = $1', [id]);
    for (const item of resources) {
      const codigo = String(item?.codigo || '').trim();
      const overrideVer = item?.override_ver;
      const overrideOperar = item?.override_operar;
      const hasVer = typeof overrideVer === 'boolean';
      const hasOp = typeof overrideOperar === 'boolean';
      if (!codigo || (!hasVer && !hasOp)) continue;
      const safeOverrideVer = hasVer ? !!overrideVer : null;
      const safeOverrideOperar = hasOp ? !!overrideOperar : null;
      await client.query(
        `INSERT INTO rbac_usuarios_overrides (usuario_id, recurso_codigo, override_ver, override_operar)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (usuario_id, recurso_codigo) DO UPDATE
           SET override_ver = EXCLUDED.override_ver,
               override_operar = EXCLUDED.override_operar,
               updated_at = CURRENT_TIMESTAMP`,
        [id, codigo, safeOverrideVer, safeOverrideOperar]
      );
    }
    await client.query('COMMIT');
    res.json({ message: 'Overrides guardados correctamente' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error guardando overrides del usuario:', error);
    res.status(500).json({ message: 'Error guardando permisos del usuario' });
  } finally {
    client.release();
  }
});

// Obtener un usuario por ID
router.get('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT id, nombre, email, rol, activo FROM usuarios WHERE id = $1',
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error obteniendo usuario:', error);
    res.status(500).json({ message: 'Error al obtener usuario' });
  }
});

// Crear usuario
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { nombre, email, password, rol } = req.body;
    if (!nombre || !email || !password || !rol) {
      return res.status(400).json({ message: 'Faltan campos requeridos: nombre, email, contraseña, rol' });
    }
    if (!ROLES_SISTEMA.includes(normalizeRole(rol))) {
      return res.status(400).json({ message: 'Rol inválido' });
    }

    const existing = await pool.query('SELECT id FROM usuarios WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ message: 'Ya existe un usuario con ese email' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO usuarios (nombre, email, password_hash, rol)
       VALUES ($1, $2, $3, $4)
       RETURNING id, nombre, email, rol, activo, created_at`,
      [nombre.trim(), email.trim().toLowerCase(), passwordHash, normalizeRole(rol)]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creando usuario:', error);
    res.status(500).json({ message: 'Error al crear usuario' });
  }
});

// Actualizar usuario
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, email, password, rol } = req.body;
    if (!nombre || !email || !rol) {
      return res.status(400).json({ message: 'Faltan campos requeridos: nombre, email, rol' });
    }
    if (!ROLES_SISTEMA.includes(normalizeRole(rol))) {
      return res.status(400).json({ message: 'Rol inválido' });
    }

    const existing = await pool.query('SELECT id FROM usuarios WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    const emailCheck = await pool.query('SELECT id FROM usuarios WHERE email = $1 AND id != $2', [email.trim().toLowerCase(), id]);
    if (emailCheck.rows.length > 0) {
      return res.status(400).json({ message: 'Ya existe otro usuario con ese email' });
    }

    if (password && password.length >= 6) {
      const passwordHash = await bcrypt.hash(password, 10);
      const result = await pool.query(
        `UPDATE usuarios SET nombre = $1, email = $2, password_hash = $3, rol = $4, updated_at = CURRENT_TIMESTAMP WHERE id = $5 RETURNING id, nombre, email, rol, activo`,
        [nombre.trim(), email.trim().toLowerCase(), passwordHash, normalizeRole(rol), id]
      );
      return res.json(result.rows[0]);
    }

    const result = await pool.query(
      `UPDATE usuarios SET nombre = $1, email = $2, rol = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4 RETURNING id, nombre, email, rol, activo`,
      [nombre.trim(), email.trim().toLowerCase(), normalizeRole(rol), id]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error actualizando usuario:', error);
    const hint =
      error?.code === '23514'
        ? 'El rol no es válido en la base de datos. Reinicie el backend para aplicar el esquema RBAC o ejecute la migración 027.'
        : null;
    const message =
      hint ||
      (process.env.NODE_ENV === 'development' && error?.message ? error.message : 'Error al actualizar usuario');
    res.status(500).json({ message });
  }
});

// Eliminar usuario
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (id === req.user.id) {
      return res.status(400).json({ message: 'No puede eliminarse a sí mismo' });
    }
    const result = await pool.query('DELETE FROM usuarios WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }
    res.json({ message: 'Usuario eliminado correctamente' });
  } catch (error) {
    console.error('Error eliminando usuario:', error);
    res.status(500).json({ message: 'Error al eliminar usuario' });
  }
});

export default router;
