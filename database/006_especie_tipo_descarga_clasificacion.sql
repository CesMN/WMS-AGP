-- =============================================================================
-- Migración: Tipo de descarga por especie (Normal / Clasificación) y pesos por clasificación en winchas
-- Ejecutar: psql -U postgres -d wms_db -f database/006_especie_tipo_descarga_clasificacion.sql
-- =============================================================================

-- 1. Tipo de descarga en especies: 'normal' (modelo actual) o 'clasificacion'
ALTER TABLE especies
  ADD COLUMN IF NOT EXISTS tipo_descarga VARCHAR(20) NOT NULL DEFAULT 'normal'
  CHECK (tipo_descarga IN ('normal', 'clasificacion'));

COMMENT ON COLUMN especies.tipo_descarga IS 'normal = descarga estándar; clasificacion = descarga con códigos de clasificación (ej. por peso 2-4 kg, 4-10 kg)';

-- 2. Códigos de clasificación por especie (ej. "2-4 kg", "4-10 kg" para Perico)
CREATE TABLE IF NOT EXISTS especie_clasificaciones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    especie_id UUID NOT NULL REFERENCES especies(id) ON DELETE CASCADE,
    codigo VARCHAR(100) NOT NULL,
    nombre VARCHAR(255),
    orden INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_especie_clasificaciones_especie ON especie_clasificaciones(especie_id);

-- 3. Pesos por clasificación en cada wincha (solo cuando la especie es tipo clasificacion)
CREATE TABLE IF NOT EXISTS descarga_wincha_pesos_clasificacion (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wincha_id UUID NOT NULL REFERENCES descarga_winchas(id) ON DELETE CASCADE,
    clasificacion_id UUID NOT NULL REFERENCES especie_clasificaciones(id) ON DELETE CASCADE,
    peso_kg DECIMAL(12, 3) NOT NULL DEFAULT 0 CHECK (peso_kg >= 0),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(wincha_id, clasificacion_id)
);

CREATE INDEX IF NOT EXISTS idx_wincha_pesos_clasif_wincha ON descarga_wincha_pesos_clasificacion(wincha_id);
CREATE INDEX IF NOT EXISTS idx_wincha_pesos_clasif_clasif ON descarga_wincha_pesos_clasificacion(clasificacion_id);
