-- Insumos operativos por plantilla: agua/hielo calculados por TM de materia prima; bunker desde salidas documentadas.
-- Requiere insumos en catálogo (ej. Agua proceso, Hielo, Bunker).

ALTER TABLE plantillas_proceso ADD COLUMN IF NOT EXISTS operativo_agua_insumo_id UUID REFERENCES insumos(id) ON DELETE SET NULL;
ALTER TABLE plantillas_proceso ADD COLUMN IF NOT EXISTS operativo_agua_litros_por_tm_mp NUMERIC(14, 6) NOT NULL DEFAULT 0
  CHECK (operativo_agua_litros_por_tm_mp >= 0);
ALTER TABLE plantillas_proceso ADD COLUMN IF NOT EXISTS operativo_hielo_insumo_id UUID REFERENCES insumos(id) ON DELETE SET NULL;
ALTER TABLE plantillas_proceso ADD COLUMN IF NOT EXISTS operativo_hielo_kg_por_tm_mp NUMERIC(14, 6) NOT NULL DEFAULT 0
  CHECK (operativo_hielo_kg_por_tm_mp >= 0);
ALTER TABLE plantillas_proceso ADD COLUMN IF NOT EXISTS operativo_bunker_insumo_id UUID REFERENCES insumos(id) ON DELETE SET NULL;

COMMENT ON COLUMN plantillas_proceso.operativo_agua_litros_por_tm_mp IS 'Litros de agua por tonelada métrica de materia prima recibida (winchas).';
COMMENT ON COLUMN plantillas_proceso.operativo_hielo_kg_por_tm_mp IS 'Kg de hielo por TM de materia prima.';
COMMENT ON COLUMN plantillas_proceso.operativo_bunker_insumo_id IS 'Insumo bunker: cantidad del parte = suma salidas con documento para el lote.';
