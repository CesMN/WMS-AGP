-- RBAC: roles por area, permisos por recurso y overrides por usuario

BEGIN;

ALTER TABLE usuarios
  DROP CONSTRAINT IF EXISTS usuarios_rol_check;

ALTER TABLE usuarios
  ADD CONSTRAINT usuarios_rol_check
  CHECK (
    rol IN (
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
      'Admin',
      'Usuario',
      'Visitante'
    )
  );

UPDATE usuarios
SET rol = 'Administrador'
WHERE rol = 'Admin';

UPDATE usuarios
SET rol = 'Recepcion'
WHERE rol IN ('Usuario', 'Visitante');

ALTER TABLE usuarios
  DROP CONSTRAINT IF EXISTS usuarios_rol_check;

ALTER TABLE usuarios
  ADD CONSTRAINT usuarios_rol_check
  CHECK (
    rol IN (
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
      'Exportaciones'
    )
  );

CREATE TABLE IF NOT EXISTS rbac_recursos (
  codigo VARCHAR(120) PRIMARY KEY,
  nombre VARCHAR(255) NOT NULL,
  seccion VARCHAR(120) NOT NULL,
  orden INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rbac_roles_permisos (
  rol VARCHAR(80) NOT NULL,
  recurso_codigo VARCHAR(120) NOT NULL REFERENCES rbac_recursos(codigo) ON DELETE CASCADE,
  puede_ver BOOLEAN NOT NULL DEFAULT FALSE,
  puede_operar BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (rol, recurso_codigo)
);

CREATE TABLE IF NOT EXISTS rbac_usuarios_overrides (
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  recurso_codigo VARCHAR(120) NOT NULL REFERENCES rbac_recursos(codigo) ON DELETE CASCADE,
  override_ver BOOLEAN,
  override_operar BOOLEAN,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (usuario_id, recurso_codigo)
);

CREATE INDEX IF NOT EXISTS idx_rbac_roles_rol ON rbac_roles_permisos(rol);
CREATE INDEX IF NOT EXISTS idx_rbac_overrides_usuario ON rbac_usuarios_overrides(usuario_id);

COMMIT;
