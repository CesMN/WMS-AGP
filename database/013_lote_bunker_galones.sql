-- Galones de bunker por lote (captura manual en conciliación / insumos operativos).
ALTER TABLE lotes_produccion ADD COLUMN IF NOT EXISTS operativo_bunker_galones NUMERIC(14, 3);

COMMENT ON COLUMN lotes_produccion.operativo_bunker_galones IS 'Galones de bunker usados en el lote; se registran en resumen de insumos operativos, no en plantilla.';
