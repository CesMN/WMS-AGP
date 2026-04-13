-- =============================================================================
-- Migración: Ingresos de Materia Prima (Lote de producción, Vehículos, Descarga, Proveedores)
-- Ejecutar: psql -U postgres -d wms_db -f database/002_ingresos_materia_prima.sql
-- =============================================================================

-- 1. LOTES DE PRODUCCIÓN (origen de la lógica; estados: Registrado, Iniciado, En proceso, Terminado)
CREATE TABLE IF NOT EXISTS lotes_produccion (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    codigo VARCHAR(100) NOT NULL UNIQUE,
    estado VARCHAR(50) NOT NULL DEFAULT 'Registrado'
        CHECK (estado IN ('Registrado', 'Iniciado', 'En proceso', 'Terminado')),
    fecha_creacion DATE NOT NULL DEFAULT CURRENT_DATE,
    fecha_inicio TIMESTAMP,
    fecha_terminado TIMESTAMP,
    observaciones TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER update_lotes_produccion_updated_at
    BEFORE UPDATE ON lotes_produccion
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_lotes_produccion_estado ON lotes_produccion(estado);
CREATE INDEX idx_lotes_produccion_fecha ON lotes_produccion(fecha_creacion);

-- 2. PROVEEDORES DE MATERIA PRIMA
CREATE TABLE IF NOT EXISTS proveedores_materia_prima (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    razon_social VARCHAR(255) NOT NULL,
    ruc VARCHAR(20),
    contacto VARCHAR(255),
    direccion TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER update_proveedores_mp_updated_at
    BEFORE UPDATE ON proveedores_materia_prima
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_proveedores_mp_ruc ON proveedores_materia_prima(ruc);

-- 3. VEHÍCULOS POR LOTE (solo lotes Iniciado o En proceso)
CREATE TABLE IF NOT EXISTS vehiculos_lote (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lote_produccion_id UUID NOT NULL REFERENCES lotes_produccion(id) ON DELETE RESTRICT,
    numero_orden VARCHAR(100) NOT NULL,
    proveedor_id UUID REFERENCES proveedores_materia_prima(id) ON DELETE SET NULL,
    proveedor_nombre VARCHAR(255),
    placas VARCHAR(255) NOT NULL,
    cantidad_aproximada DECIMAL(12, 3),
    especie_id UUID REFERENCES especies(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER update_vehiculos_lote_updated_at
    BEFORE UPDATE ON vehiculos_lote
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_vehiculos_lote_lote ON vehiculos_lote(lote_produccion_id);

-- 4. DESCARGA MATERIA PRIMA (fase 1: datos vehículo, estado Descargando/Completado)
CREATE TABLE IF NOT EXISTS descargas_materia_prima (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vehiculo_lote_id UUID NOT NULL REFERENCES vehiculos_lote(id) ON DELETE RESTRICT,
    numero_guia_interna VARCHAR(100),
    fecha_descarga DATE NOT NULL,
    especie_id UUID REFERENCES especies(id) ON DELETE SET NULL,
    cliente_id UUID REFERENCES clientes(id) ON DELETE SET NULL,
    numero_guia_remitente VARCHAR(255),
    ruc_proveedor VARCHAR(20),
    proveedor_razon_social VARCHAR(255),
    desembarcadero VARCHAR(255),
    origen VARCHAR(255),
    placas_vehiculo VARCHAR(255),
    ruc_transportista VARCHAR(20),
    datos_chofer TEXT,
    estado VARCHAR(50) NOT NULL DEFAULT 'Descargando'
        CHECK (estado IN ('Descargando', 'Completado')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER update_descargas_mp_updated_at
    BEFORE UPDATE ON descargas_materia_prima
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_descargas_mp_vehiculo ON descargas_materia_prima(vehiculo_lote_id);
CREATE INDEX idx_descargas_mp_estado ON descargas_materia_prima(estado);
CREATE INDEX idx_descargas_mp_fecha ON descargas_materia_prima(fecha_descarga);

-- 5. WINCHAS (fase 2: por embarcación; un vehículo puede tener varias embarcaciones)
CREATE TABLE IF NOT EXISTS descarga_winchas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    descarga_id UUID NOT NULL REFERENCES descargas_materia_prima(id) ON DELETE CASCADE,
    numero_wincha VARCHAR(100),
    hora_inicio TIME,
    hora_final TIME,
    matricula_embarcacion VARCHAR(100),
    nombre_embarcacion VARCHAR(255),
    peso_kg DECIMAL(12, 3),
    peso_por_caja DECIMAL(12, 3),
    cajas INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER update_descarga_winchas_updated_at
    BEFORE UPDATE ON descarga_winchas
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_descarga_winchas_descarga ON descarga_winchas(descarga_id);
