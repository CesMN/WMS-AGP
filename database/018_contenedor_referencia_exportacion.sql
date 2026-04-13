ALTER TABLE ordenes_exportacion_contenedores
  ADD COLUMN IF NOT EXISTS referencia_exportacion VARCHAR(120);

COMMENT ON COLUMN ordenes_exportacion_contenedores.referencia_exportacion IS 'Prefijo al completar exportación del contenedor (ej. SVF001-26); código final = prefijo + espacio + letra.';
