-- Permite filas de distribución por línea (cantidad solicitada) sin asignación de lote aún.
-- asignacion_id NULL = planificación por producto/línea; NOT NULL = reparto por lote asignado.

ALTER TABLE ordenes_exportacion_contenedor_contenido
  DROP CONSTRAINT IF EXISTS ordenes_exportacion_contenedor_contenido_contenedor_id_asignacion_id_key;

ALTER TABLE ordenes_exportacion_contenedor_contenido
  DROP CONSTRAINT IF EXISTS ordenes_exportacion_contenedor_contenido_asignacion_id_fkey;

ALTER TABLE ordenes_exportacion_contenedor_contenido
  ALTER COLUMN asignacion_id DROP NOT NULL;

ALTER TABLE ordenes_exportacion_contenedor_contenido
  ADD CONSTRAINT ordenes_exportacion_contenedor_contenido_asignacion_id_fkey
  FOREIGN KEY (asignacion_id) REFERENCES ordenes_exportacion_linea_asignaciones(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_oe_contenido_cont_asig
  ON ordenes_exportacion_contenedor_contenido (contenedor_id, asignacion_id)
  WHERE asignacion_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_oe_contenido_cont_linea_sin_asig
  ON ordenes_exportacion_contenedor_contenido (contenedor_id, linea_id)
  WHERE asignacion_id IS NULL;

COMMENT ON COLUMN ordenes_exportacion_contenedor_contenido.asignacion_id IS
  'NULL = distribución planificada por línea (bultos solicitados); NOT NULL = reparto por lote asignado.';
