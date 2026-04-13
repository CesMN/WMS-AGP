-- =============================================================================
-- Migración: Validación de Descargas (documentos y estado validado)
-- Ejecutar después de 002 y 003
-- =============================================================================

-- Campos de validación en descarga
ALTER TABLE descargas_materia_prima
  ADD COLUMN IF NOT EXISTS validated_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS validated_by VARCHAR(255);

-- Documentos subidos para validación (PDF/foto por tipo)
CREATE TABLE IF NOT EXISTS descarga_validacion_documentos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    descarga_id UUID NOT NULL REFERENCES descargas_materia_prima(id) ON DELETE CASCADE,
    wincha_id UUID REFERENCES descarga_winchas(id) ON DELETE CASCADE,
    tipo VARCHAR(50) NOT NULL
        CHECK (tipo IN ('guia_interna', 'vehiculo', 'desembarcadero', 'transportista', 'wincha', 'guia_remitente', 'embarcacion', 'otros')),
    nombre_archivo VARCHAR(255) NOT NULL,
    content_type VARCHAR(100),
    contenido_base64 TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_validacion_docs_descarga ON descarga_validacion_documentos(descarga_id);
CREATE INDEX IF NOT EXISTS idx_validacion_docs_wincha ON descarga_validacion_documentos(wincha_id);
CREATE INDEX IF NOT EXISTS idx_validacion_docs_tipo ON descarga_validacion_documentos(tipo);
