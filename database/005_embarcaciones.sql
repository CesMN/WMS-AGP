-- =============================================================================
-- Migración: Registro de embarcaciones (matrícula como identificador)
-- Ejecutar después de 002 y 003
-- =============================================================================

CREATE TABLE IF NOT EXISTS embarcaciones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    matricula VARCHAR(100) NOT NULL UNIQUE,
    nombre VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER update_embarcaciones_updated_at
    BEFORE UPDATE ON embarcaciones
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_embarcaciones_matricula ON embarcaciones(matricula);
