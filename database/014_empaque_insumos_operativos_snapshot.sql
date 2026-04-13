-- Snapshot de insumos operativos (agua/hielo/bunker) al sincronizar conciliación → empaque
ALTER TABLE empaque ADD COLUMN IF NOT EXISTS insumos_operativos_snapshot JSONB;
