import { pool } from '../config/database.js';

export const ROLES_SISTEMA = [
  'Administrador',
  'Jefe Planta',
  'Gerencia',
  'Area Contable',
  'Almacen',
  'Produccion',
  'Supervisor de Envasado',
  'Supervisor de Congelado',
  'Supervisor de Empaque',
  'Camaras de Almacenamiento',
  'Recepcion',
  'Garita',
  'Supervisor de Proceso',
  'Supervisor de Calidad',
  'Exportaciones',
];

export const RECURSOS_RBAC = [
  { codigo: 'dashboard', nombre: 'Panel de control', seccion: 'General', orden: 10 },
  { codigo: 'recepcion.general', nombre: 'Recepcion general', seccion: 'General', orden: 20 },
  { codigo: 'configuracion', nombre: 'Configuracion', seccion: 'General', orden: 30 },
  { codigo: 'ingresos_mp.lotes', nombre: 'Lotes de produccion', seccion: 'Ingresos MP', orden: 100 },
  { codigo: 'ingresos_mp.vehiculos', nombre: 'Vehiculos lote', seccion: 'Ingresos MP', orden: 110 },
  { codigo: 'ingresos_mp.descargas', nombre: 'Descarga materia prima', seccion: 'Ingresos MP', orden: 120 },
  { codigo: 'ingresos_mp.proveedores', nombre: 'Proveedores MP', seccion: 'Ingresos MP', orden: 130 },
  { codigo: 'ingresos_mp.validacion_descargas', nombre: 'Validacion de descargas', seccion: 'Ingresos MP', orden: 140 },
  { codigo: 'produccion.plantillas_proceso', nombre: 'Plantillas de proceso', seccion: 'Produccion', orden: 200 },
  { codigo: 'produccion.plantillas_snapshots', nombre: 'Snapshots de plantillas', seccion: 'Produccion', orden: 210 },
  { codigo: 'produccion.envasado', nombre: 'Envasado', seccion: 'Produccion', orden: 220 },
  { codigo: 'produccion.congelado', nombre: 'Congelado', seccion: 'Produccion', orden: 230 },
  { codigo: 'produccion.empaque', nombre: 'Empaque', seccion: 'Produccion', orden: 240 },
  { codigo: 'produccion.control', nombre: 'Control de produccion', seccion: 'Produccion', orden: 250 },
  { codigo: 'produccion.stock_pptt', nombre: 'Stock PPTT', seccion: 'Produccion', orden: 260 },
  { codigo: 'produccion.reporte', nombre: 'Reporte de produccion', seccion: 'Produccion', orden: 270 },
  { codigo: 'almacenamiento.almacenes', nombre: 'Almacenes', seccion: 'Almacenamiento', orden: 300 },
  { codigo: 'almacenamiento.recepcion_parihuelas', nombre: 'Recepcion parihuelas', seccion: 'Almacenamiento', orden: 310 },
  { codigo: 'almacenamiento.historial_parihuelas', nombre: 'Historial parihuelas', seccion: 'Almacenamiento', orden: 320 },
  { codigo: 'almacenamiento.stock_fisico', nombre: 'Stock fisico', seccion: 'Almacenamiento', orden: 330 },
  { codigo: 'almacenamiento.mov_ingresos', nombre: 'Movimientos ingresos', seccion: 'Almacenamiento', orden: 340 },
  { codigo: 'almacenamiento.mov_salidas', nombre: 'Movimientos salidas', seccion: 'Almacenamiento', orden: 350 },
  { codigo: 'insumos.proveedores', nombre: 'Proveedores de insumos', seccion: 'Insumos', orden: 400 },
  { codigo: 'insumos.catalogo', nombre: 'Catalogo de insumos', seccion: 'Insumos', orden: 410 },
  { codigo: 'insumos.ingresos', nombre: 'Ingresos de insumos', seccion: 'Insumos', orden: 420 },
  { codigo: 'insumos.salidas', nombre: 'Salidas de insumos', seccion: 'Insumos', orden: 430 },
  { codigo: 'insumos.stock', nombre: 'Stock de insumos', seccion: 'Insumos', orden: 440 },
  { codigo: 'insumos.plantillas_empaque', nombre: 'Plantillas de empaque', seccion: 'Insumos', orden: 450 },
  { codigo: 'insumos.conciliacion', nombre: 'Conciliacion de empaque', seccion: 'Insumos', orden: 460 },
  { codigo: 'exportaciones.clientes', nombre: 'Clientes exportacion', seccion: 'Exportaciones', orden: 500 },
  { codigo: 'exportaciones.ordenes', nombre: 'Ordenes de produccion', seccion: 'Exportaciones', orden: 510 },
  { codigo: 'exportaciones.listos', nombre: 'Listos para despacho', seccion: 'Exportaciones', orden: 520 },
  { codigo: 'exportaciones.despachos', nombre: 'Despachos', seccion: 'Exportaciones', orden: 530 },
  { codigo: 'admin.usuarios', nombre: 'Usuarios', seccion: 'Administracion', orden: 600 },
  { codigo: 'admin.registro_actividad', nombre: 'Registro de actividad', seccion: 'Administracion', orden: 610 },
  { codigo: 'admin.especies', nombre: 'Especies', seccion: 'Administracion', orden: 620 },
  { codigo: 'admin.productos', nombre: 'Productos', seccion: 'Administracion', orden: 630 },
  { codigo: 'admin.clientes', nombre: 'Clientes', seccion: 'Administracion', orden: 640 },
];

const ALL_TRUE = Object.fromEntries(RECURSOS_RBAC.map((r) => [r.codigo, { view: true, operate: true }]));

const DEFAULT_FALSE = Object.fromEntries(RECURSOS_RBAC.map((r) => [r.codigo, { view: false, operate: false }]));

function withResources(codes, operate = false) {
  const base = structuredClone(DEFAULT_FALSE);
  codes.forEach((code) => {
    if (!base[code]) return;
    base[code].view = true;
    base[code].operate = !!operate;
  });
  return base;
}

export const ROLE_PRESETS = {
  Administrador: ALL_TRUE,
  'Jefe Planta': withResources(RECURSOS_RBAC.map((r) => r.codigo), true),
  Gerencia: withResources(RECURSOS_RBAC.map((r) => r.codigo), false),
  'Area Contable': withResources(['dashboard', 'exportaciones.despachos', 'exportaciones.ordenes', 'almacenamiento.stock_fisico', 'admin.clientes'], false),
  Almacen: withResources(
    ['dashboard', 'almacenamiento.almacenes', 'almacenamiento.recepcion_parihuelas', 'almacenamiento.historial_parihuelas', 'almacenamiento.stock_fisico', 'almacenamiento.mov_ingresos', 'almacenamiento.mov_salidas', 'exportaciones.despachos'],
    true
  ),
  Produccion: withResources(
    ['dashboard', 'produccion.plantillas_proceso', 'produccion.envasado', 'produccion.congelado', 'produccion.empaque', 'produccion.control', 'produccion.stock_pptt', 'produccion.reporte', 'ingresos_mp.lotes'],
    true
  ),
  'Supervisor de Envasado': withResources(['dashboard', 'produccion.envasado', 'produccion.control', 'produccion.stock_pptt'], true),
  'Supervisor de Congelado': withResources(['dashboard', 'produccion.congelado', 'produccion.control', 'produccion.stock_pptt'], true),
  'Supervisor de Empaque': withResources(['dashboard', 'produccion.empaque', 'produccion.control', 'insumos.conciliacion'], true),
  'Camaras de Almacenamiento': withResources(['dashboard', 'almacenamiento.almacenes', 'almacenamiento.stock_fisico', 'almacenamiento.historial_parihuelas'], true),
  Recepcion: withResources(['dashboard', 'recepcion.general', 'ingresos_mp.lotes', 'ingresos_mp.vehiculos', 'ingresos_mp.descargas', 'ingresos_mp.validacion_descargas'], true),
  Garita: withResources(['dashboard', 'ingresos_mp.vehiculos', 'ingresos_mp.validacion_descargas', 'exportaciones.despachos'], false),
  'Supervisor de Proceso': withResources(['dashboard', 'produccion.control', 'produccion.reporte', 'produccion.stock_pptt', 'ingresos_mp.lotes'], true),
  'Supervisor de Calidad': withResources(['dashboard', 'produccion.reporte', 'produccion.control', 'exportaciones.listos', 'exportaciones.ordenes'], false),
  Exportaciones: withResources(['dashboard', 'exportaciones.clientes', 'exportaciones.ordenes', 'exportaciones.listos', 'exportaciones.despachos'], true),
};

export function normalizeRole(role) {
  const raw = String(role || '').trim();
  if (!raw) return '';
  if (raw.toLowerCase() === 'admin') return 'Administrador';
  if (raw.toLowerCase() === 'usuario' || raw.toLowerCase() === 'visitante') return 'Recepcion';
  return raw;
}

export function isAdminRole(role) {
  return normalizeRole(role).toLowerCase() === 'administrador';
}

export function getRolePreset(role) {
  const normalizedRole = normalizeRole(role);
  return ROLE_PRESETS[normalizedRole] || structuredClone(DEFAULT_FALSE);
}

/**
 * Alinea la columna usuarios.rol con los roles RBAC (migración manual opcional).
 * Sin esto, UPDATE puede fallar con violación de CHECK si la BD sigue con Admin/Usuario/Visitante.
 */
export async function ensureUsuariosRolConstraint() {
  await pool.query('ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check');
  await pool.query(`UPDATE usuarios SET rol = 'Administrador' WHERE LOWER(TRIM(rol)) = 'admin'`);
  await pool.query(`UPDATE usuarios SET rol = 'Recepcion' WHERE LOWER(TRIM(rol)) IN ('usuario', 'visitante')`);
  const inList = ROLES_SISTEMA.map((_, i) => `$${i + 1}`).join(', ');
  await pool.query(
    `UPDATE usuarios SET rol = 'Recepcion' WHERE rol::text NOT IN (${inList})`,
    ROLES_SISTEMA
  );
  const listSql = ROLES_SISTEMA.map((r) => `'${String(r).replace(/'/g, "''")}'`).join(', ');
  await pool.query(`
    ALTER TABLE usuarios
    ADD CONSTRAINT usuarios_rol_check
    CHECK (rol IN (${listSql}))
  `);
}

export async function ensureRbacTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rbac_recursos (
      codigo VARCHAR(120) PRIMARY KEY,
      nombre VARCHAR(255) NOT NULL,
      seccion VARCHAR(120) NOT NULL,
      orden INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rbac_roles_permisos (
      rol VARCHAR(80) NOT NULL,
      recurso_codigo VARCHAR(120) NOT NULL REFERENCES rbac_recursos(codigo) ON DELETE CASCADE,
      puede_ver BOOLEAN NOT NULL DEFAULT FALSE,
      puede_operar BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (rol, recurso_codigo)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rbac_usuarios_overrides (
      usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      recurso_codigo VARCHAR(120) NOT NULL REFERENCES rbac_recursos(codigo) ON DELETE CASCADE,
      override_ver BOOLEAN,
      override_operar BOOLEAN,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (usuario_id, recurso_codigo)
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_rbac_roles_rol ON rbac_roles_permisos(rol)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_rbac_overrides_usuario ON rbac_usuarios_overrides(usuario_id)');

  for (const recurso of RECURSOS_RBAC) {
    await pool.query(
      `INSERT INTO rbac_recursos (codigo, nombre, seccion, orden)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (codigo) DO UPDATE
         SET nombre = EXCLUDED.nombre,
             seccion = EXCLUDED.seccion,
             orden = EXCLUDED.orden`,
      [recurso.codigo, recurso.nombre, recurso.seccion, recurso.orden]
    );
  }

  for (const role of ROLES_SISTEMA) {
    const preset = getRolePreset(role);
    for (const recurso of RECURSOS_RBAC) {
      const value = preset[recurso.codigo] || { view: false, operate: false };
      await pool.query(
        `INSERT INTO rbac_roles_permisos (rol, recurso_codigo, puede_ver, puede_operar)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (rol, recurso_codigo) DO NOTHING`,
        [role, recurso.codigo, !!value.view, !!value.operate]
      );
    }
  }
}

export async function resolveUserPermissions(userId, role) {
  const normalizedRole = normalizeRole(role);
  if (isAdminRole(normalizedRole)) {
    return { role: normalizedRole, permissions: structuredClone(ALL_TRUE) };
  }

  await ensureRbacTables();
  const rows = await pool.query(
    `SELECT rr.codigo,
            COALESCE(uo.override_ver, rp.puede_ver, false) AS puede_ver,
            CASE
              WHEN COALESCE(uo.override_operar, rp.puede_operar, false)
              THEN COALESCE(uo.override_ver, rp.puede_ver, false)
              ELSE false
            END AS puede_operar
       FROM rbac_recursos rr
       LEFT JOIN rbac_roles_permisos rp
         ON rp.recurso_codigo = rr.codigo AND rp.rol = $1
       LEFT JOIN rbac_usuarios_overrides uo
         ON uo.recurso_codigo = rr.codigo AND uo.usuario_id = $2
       ORDER BY rr.orden, rr.codigo`,
    [normalizedRole, userId]
  );
  const permissions = {};
  rows.rows.forEach((r) => {
    permissions[r.codigo] = { view: !!r.puede_ver, operate: !!r.puede_operar };
  });
  return { role: normalizedRole, permissions };
}

export async function getRolePermissions(role) {
  await ensureRbacTables();
  const normalizedRole = normalizeRole(role);
  const rows = await pool.query(
    `SELECT rr.codigo, rr.nombre, rr.seccion, rr.orden,
            COALESCE(rp.puede_ver, false) AS puede_ver,
            COALESCE(rp.puede_operar, false) AS puede_operar
       FROM rbac_recursos rr
       LEFT JOIN rbac_roles_permisos rp
         ON rp.recurso_codigo = rr.codigo AND rp.rol = $1
       ORDER BY rr.orden, rr.codigo`,
    [normalizedRole]
  );
  return rows.rows.map((r) => ({
    codigo: r.codigo,
    nombre: r.nombre,
    seccion: r.seccion,
    orden: Number(r.orden) || 0,
    puede_ver: !!r.puede_ver,
    puede_operar: !!r.puede_operar,
  }));
}
