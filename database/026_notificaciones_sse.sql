-- Notificaciones de sistema (feed unificado) + estado por usuario
CREATE TABLE IF NOT EXISTS notificaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  tipo VARCHAR(120) NOT NULL,
  modulo VARCHAR(120) NOT NULL,
  severidad VARCHAR(20) NOT NULL DEFAULT 'info'
    CHECK (severidad IN ('info', 'success', 'warning', 'error')),
  titulo VARCHAR(255) NOT NULL,
  mensaje TEXT,
  origen_tabla VARCHAR(80),
  origen_id VARCHAR(80),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_notificaciones_fecha ON notificaciones (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notificaciones_modulo ON notificaciones (modulo);
CREATE INDEX IF NOT EXISTS idx_notificaciones_severidad ON notificaciones (severidad);

CREATE TABLE IF NOT EXISTS notificaciones_usuarios (
  notificacion_id UUID NOT NULL REFERENCES notificaciones(id) ON DELETE CASCADE,
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  leida_at TIMESTAMPTZ,
  descartada_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (notificacion_id, usuario_id)
);

CREATE INDEX IF NOT EXISTS idx_notif_usuario_estado
  ON notificaciones_usuarios (usuario_id, leida_at, descartada_at);
CREATE INDEX IF NOT EXISTS idx_notif_usuario_fecha
  ON notificaciones_usuarios (usuario_id, created_at DESC);

COMMENT ON TABLE notificaciones IS 'Feed central de notificaciones operativas del sistema.';
COMMENT ON TABLE notificaciones_usuarios IS 'Estado por usuario (leído/descartado) de cada notificación.';
