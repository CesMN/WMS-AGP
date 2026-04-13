-- Contenedores por OP, distribución por asignación de lote, referencia de exportación (prefijo sin letra).

ALTER TABLE ordenes_exportacion
  ADD COLUMN IF NOT EXISTS cantidad_contenedores INTEGER NOT NULL DEFAULT 1 CHECK (cantidad_contenedores >= 1 AND cantidad_contenedores <= 702);

ALTER TABLE ordenes_exportacion
  ADD COLUMN IF NOT EXISTS referencia_exportacion VARCHAR(120);

UPDATE ordenes_exportacion SET cantidad_contenedores = 1 WHERE cantidad_contenedores IS NULL;

COMMENT ON COLUMN ordenes_exportacion.cantidad_contenedores IS 'Número de contenedores físicos planificados para la OP.';
COMMENT ON COLUMN ordenes_exportacion.referencia_exportacion IS 'Prefijo de referencia al exportar (ej. SVF001-26); el código por contenedor es prefijo + espacio + letra.';

CREATE TABLE IF NOT EXISTS ordenes_exportacion_contenedores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_exportacion_id UUID NOT NULL REFERENCES ordenes_exportacion(id) ON DELETE CASCADE,
  indice INTEGER NOT NULL CHECK (indice >= 1),
  letra VARCHAR(8) NOT NULL,
  listo_para_exportar BOOLEAN NOT NULL DEFAULT FALSE,
  despachado_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (orden_exportacion_id, indice)
);

CREATE INDEX IF NOT EXISTS idx_oe_contenedores_orden ON ordenes_exportacion_contenedores (orden_exportacion_id);

CREATE TABLE IF NOT EXISTS ordenes_exportacion_contenedor_contenido (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contenedor_id UUID NOT NULL REFERENCES ordenes_exportacion_contenedores(id) ON DELETE CASCADE,
  linea_id UUID NOT NULL REFERENCES ordenes_exportacion_lineas(id) ON DELETE CASCADE,
  asignacion_id UUID NOT NULL REFERENCES ordenes_exportacion_linea_asignaciones(id) ON DELETE CASCADE,
  cantidad_bultos NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (cantidad_bultos >= 0),
  UNIQUE (contenedor_id, asignacion_id)
);

CREATE INDEX IF NOT EXISTS idx_oe_contenido_contenedor ON ordenes_exportacion_contenedor_contenido (contenedor_id);
CREATE INDEX IF NOT EXISTS idx_oe_contenido_asig ON ordenes_exportacion_contenedor_contenido (asignacion_id);
