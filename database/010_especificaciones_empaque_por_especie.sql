-- Fase 1: especificaciones de empaque por especie.
-- Base principal obligatoria y ajustes por lote para control hibrido.

CREATE TABLE IF NOT EXISTS empaque_componentes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    insumo_id UUID NOT NULL REFERENCES insumos(id) ON DELETE RESTRICT,
    categoria VARCHAR(20) NOT NULL DEFAULT 'PRINCIPAL'
        CHECK (categoria IN ('PRINCIPAL', 'SECUNDARIO', 'EXTRA')),
    tipo VARCHAR(20) NOT NULL
        CHECK (tipo IN ('SACO', 'CAJA', 'RAFIA', 'CINTA', 'LAMINA', 'OTRO')),
    subtipo VARCHAR(60),
    con_logo BOOLEAN NOT NULL DEFAULT FALSE,
    medida VARCHAR(60),
    descripcion VARCHAR(255),
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_empaque_componentes_insumo ON empaque_componentes(insumo_id);
CREATE INDEX IF NOT EXISTS idx_empaque_componentes_tipo ON empaque_componentes(tipo);

DROP TRIGGER IF EXISTS update_empaque_componentes_updated_at ON empaque_componentes;
CREATE TRIGGER update_empaque_componentes_updated_at
    BEFORE UPDATE ON empaque_componentes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS especie_empaque_plantillas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    especie_id UUID NOT NULL REFERENCES especies(id) ON DELETE CASCADE,
    nombre VARCHAR(120) NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    activa BOOLEAN NOT NULL DEFAULT TRUE,
    observaciones TEXT,
    created_by UUID REFERENCES usuarios(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_esp_empaque_plantillas_especie ON especie_empaque_plantillas(especie_id);
CREATE INDEX IF NOT EXISTS idx_esp_empaque_plantillas_activa ON especie_empaque_plantillas(activa);

DROP TRIGGER IF EXISTS update_especie_empaque_plantillas_updated_at ON especie_empaque_plantillas;
CREATE TRIGGER update_especie_empaque_plantillas_updated_at
    BEFORE UPDATE ON especie_empaque_plantillas
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS especie_empaque_plantilla_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plantilla_id UUID NOT NULL REFERENCES especie_empaque_plantillas(id) ON DELETE CASCADE,
    componente_id UUID NOT NULL REFERENCES empaque_componentes(id) ON DELETE RESTRICT,
    unidad_base VARCHAR(20) NOT NULL DEFAULT 'BULTO'
        CHECK (unidad_base IN ('BULTO', 'CAJA')),
    cantidad_por_unidad NUMERIC(14, 6) NOT NULL CHECK (cantidad_por_unidad >= 0),
    obligatorio BOOLEAN NOT NULL DEFAULT TRUE,
    condicion VARCHAR(30) NOT NULL DEFAULT 'DEFECTO'
        CHECK (condicion IN ('DEFECTO', 'DEFORME', 'SIN_LOGO', 'PEDIDO_ESPECIAL', 'OTRO')),
    orden INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (plantilla_id, componente_id, unidad_base, condicion)
);

CREATE INDEX IF NOT EXISTS idx_esp_empaque_items_plantilla ON especie_empaque_plantilla_items(plantilla_id);
CREATE INDEX IF NOT EXISTS idx_esp_empaque_items_comp ON especie_empaque_plantilla_items(componente_id);

CREATE TABLE IF NOT EXISTS lote_empaque_ajustes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lote_produccion_id UUID NOT NULL REFERENCES lotes_produccion(id) ON DELETE CASCADE,
    item_plantilla_id UUID REFERENCES especie_empaque_plantilla_items(id) ON DELETE SET NULL,
    componente_id UUID NOT NULL REFERENCES empaque_componentes(id) ON DELETE RESTRICT,
    unidad_base VARCHAR(20) NOT NULL DEFAULT 'BULTO'
        CHECK (unidad_base IN ('BULTO', 'CAJA')),
    cantidad_por_unidad NUMERIC(14, 6) NOT NULL CHECK (cantidad_por_unidad >= 0),
    obligatorio BOOLEAN NOT NULL DEFAULT FALSE,
    motivo VARCHAR(30) NOT NULL
        CHECK (motivo IN ('DEFORME', 'SIN_LOGO', 'PEDIDO_ESPECIAL', 'CORRECCION', 'OTRO')),
    observaciones TEXT,
    usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_lote_empaque_ajustes_lote ON lote_empaque_ajustes(lote_produccion_id);
CREATE INDEX IF NOT EXISTS idx_lote_empaque_ajustes_comp ON lote_empaque_ajustes(componente_id);

