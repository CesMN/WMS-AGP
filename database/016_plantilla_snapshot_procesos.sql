-- Snapshot JSON de plantilla de proceso al finalizar (envasado / congelado / empaque).
-- No modifica plantillas maestras; permite reabrir el lote con la misma lista/orden congelados.

ALTER TABLE empaque ADD COLUMN IF NOT EXISTS plantilla_snapshot JSONB;
ALTER TABLE envasado ADD COLUMN IF NOT EXISTS plantilla_snapshot JSONB;
ALTER TABLE congelado ADD COLUMN IF NOT EXISTS plantilla_snapshot JSONB;

COMMENT ON COLUMN empaque.plantilla_snapshot IS 'Copia de plantilla al finalizar (productos, orden, título).';
COMMENT ON COLUMN envasado.plantilla_snapshot IS 'Copia de plantilla al finalizar (productos, orden, título).';
COMMENT ON COLUMN congelado.plantilla_snapshot IS 'Copia de plantilla al finalizar (productos, orden, título).';
