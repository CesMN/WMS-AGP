-- Vincular imputaciones desde producción al lote de producción (control empaque → OP).
ALTER TABLE ordenes_exportacion_linea_asignaciones
  ADD COLUMN IF NOT EXISTS lote_produccion_id UUID REFERENCES lotes_produccion(id) ON DELETE SET NULL;

COMMENT ON COLUMN ordenes_exportacion_linea_asignaciones.lote_produccion_id IS
  'Si la carga viene de aplicar empaque a OP, apunta al lote; NULL si es solo stock de almacén.';
