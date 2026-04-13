-- Registro genérico de actividad (eventos explícitos desde código; la vista admin también une movimientos, despachos, etc.)
CREATE TABLE IF NOT EXISTS registro_actividad_app (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  usuario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  modulo VARCHAR(120) NOT NULL,
  area VARCHAR(120),
  tipo_evento VARCHAR(160),
  descripcion TEXT,
  referencia_resumen VARCHAR(500),
  origen_tabla VARCHAR(80),
  origen_id VARCHAR(80),
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_registro_actividad_app_fecha ON registro_actividad_app (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_registro_actividad_app_modulo ON registro_actividad_app (modulo);

COMMENT ON TABLE registro_actividad_app IS 'Eventos de auditoría insertados explícitamente; el listado global une también otras tablas.';
