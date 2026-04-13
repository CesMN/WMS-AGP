-- =============================================================================
-- Migración: Módulos ERP/WMS (Recepción, Insumos, Producción, Salidas)
-- Conecta con el módulo de Almacenamiento de Congelados existente.
-- Ejecutar desde la raíz del proyecto: psql -U postgres -d wms_db -f database/001_modulos_erp_wms.sql
-- O desde la carpeta database:     psql -U postgres -d wms_db -f 001_modulos_erp_wms.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. RECEPCIONES (Logística de Entrada)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recepciones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    proveedor VARCHAR(255) NOT NULL,
    fecha DATE NOT NULL,
    guia_remision VARCHAR(255),
    estado VARCHAR(50) NOT NULL DEFAULT 'Pendiente'
        CHECK (estado IN ('Pendiente', 'Recibido', 'Parcial', 'Anulado')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER update_recepciones_updated_at
    BEFORE UPDATE ON recepciones
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_recepciones_fecha ON recepciones(fecha);
CREATE INDEX idx_recepciones_estado ON recepciones(estado);

-- -----------------------------------------------------------------------------
-- 2. LOTES (puente Recepción ↔ Productos; trazabilidad con almacenamiento)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lotes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recepcion_id UUID NOT NULL REFERENCES recepciones(id) ON DELETE RESTRICT,
    producto_id UUID NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
    cantidad_inicial DECIMAL(12, 3) NOT NULL CHECK (cantidad_inicial >= 0),
    cantidad_actual DECIMAL(12, 3) NOT NULL CHECK (cantidad_actual >= 0),
    fecha_vencimiento DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER update_lotes_updated_at
    BEFORE UPDATE ON lotes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_lotes_recepcion ON lotes(recepcion_id);
CREATE INDEX idx_lotes_producto ON lotes(producto_id);
CREATE INDEX idx_lotes_vencimiento ON lotes(fecha_vencimiento);

-- Opcional: vincular stock en posiciones con un lote concreto (trazabilidad)
ALTER TABLE stock_posiciones
    ADD COLUMN IF NOT EXISTS lote_id UUID REFERENCES lotes(id) ON DELETE SET NULL;
COMMENT ON COLUMN stock_posiciones.lote_id IS 'Lote de recepción asociado a este stock (trazabilidad ERP-WMS)';

-- -----------------------------------------------------------------------------
-- 3. INSUMOS (catálogo para Planta; stock para alertas)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS insumos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre VARCHAR(255) NOT NULL,
    stock_minimo DECIMAL(12, 3) NOT NULL DEFAULT 0 CHECK (stock_minimo >= 0),
    stock_actual DECIMAL(12, 3) NOT NULL DEFAULT 0 CHECK (stock_actual >= 0),
    unidad_medida VARCHAR(20) NOT NULL DEFAULT 'UN',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER update_insumos_updated_at
    BEFORE UPDATE ON insumos
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_insumos_nombre ON insumos(nombre);

-- -----------------------------------------------------------------------------
-- 4. ÓRDENES DE PRODUCCIÓN (Planta)
-- Al completarse generan entrada pendiente en WMS.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS produccion_ordenes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lote_mp_id UUID NOT NULL REFERENCES lotes(id) ON DELETE RESTRICT,
    producto_final_id UUID NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
    cantidad_producida DECIMAL(12, 3) NOT NULL CHECK (cantidad_producida > 0),
    operario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
    fecha_orden TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    estado VARCHAR(50) NOT NULL DEFAULT 'Pendiente'
        CHECK (estado IN ('Pendiente', 'En Proceso', 'Completado', 'Anulado')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER update_produccion_ordenes_updated_at
    BEFORE UPDATE ON produccion_ordenes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_produccion_ordenes_lote_mp ON produccion_ordenes(lote_mp_id);
CREATE INDEX idx_produccion_ordenes_producto_final ON produccion_ordenes(producto_final_id);
CREATE INDEX idx_produccion_ordenes_operario ON produccion_ordenes(operario_id);
CREATE INDEX idx_produccion_ordenes_estado ON produccion_ordenes(estado);
CREATE INDEX idx_produccion_ordenes_fecha ON produccion_ordenes(fecha_orden);

-- -----------------------------------------------------------------------------
-- 5. ENTRADAS PENDIENTES (cola para WMS: Salida de Producción → Entrada en cámara)
-- Cuando una orden de producción se completa, se inserta aquí.
-- El módulo WMS convierte cada fila en movimiento + stock_posiciones.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS entradas_pendientes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    produccion_orden_id UUID NOT NULL REFERENCES produccion_ordenes(id) ON DELETE RESTRICT,
    producto_id UUID NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
    cantidad DECIMAL(12, 3) NOT NULL CHECK (cantidad > 0),
    estado VARCHAR(50) NOT NULL DEFAULT 'Pendiente'
        CHECK (estado IN ('Pendiente', 'Convertido')),
    movimiento_id UUID REFERENCES movimientos(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER update_entradas_pendientes_updated_at
    BEFORE UPDATE ON entradas_pendientes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE UNIQUE INDEX idx_entradas_pendientes_orden_producto
    ON entradas_pendientes(produccion_orden_id, producto_id)
    WHERE estado = 'Pendiente';
CREATE INDEX idx_entradas_pendientes_estado ON entradas_pendientes(estado);
CREATE INDEX idx_entradas_pendientes_movimiento ON entradas_pendientes(movimiento_id);

-- -----------------------------------------------------------------------------
-- 6. SALIDAS (Logística de Salida / Despacho-Ventas)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS salidas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cliente_destino VARCHAR(255) NOT NULL,
    destino VARCHAR(255),
    fecha_despacho DATE NOT NULL,
    estado VARCHAR(50) NOT NULL DEFAULT 'Registrado'
        CHECK (estado IN ('Registrado', 'Despachado')),
    usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER update_salidas_updated_at
    BEFORE UPDATE ON salidas
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_salidas_fecha ON salidas(fecha_despacho);
CREATE INDEX idx_salidas_estado ON salidas(estado);
CREATE INDEX idx_salidas_usuario ON salidas(usuario_id);

-- -----------------------------------------------------------------------------
-- Comentarios para documentación
-- -----------------------------------------------------------------------------
COMMENT ON TABLE recepciones IS 'Recepción de mercadería (guía, proveedor). Origen de lotes.';
COMMENT ON TABLE lotes IS 'Lotes por recepción y producto; puente con stock_posiciones vía lote_id.';
COMMENT ON TABLE insumos IS 'Insumos para producción; stock_minimo y stock_actual para alertas.';
COMMENT ON TABLE produccion_ordenes IS 'Órdenes de producción; al completarse generan entradas_pendientes en WMS.';
COMMENT ON TABLE entradas_pendientes IS 'Entradas pendientes de ubicación en cámara; generadas por producción completada.';
COMMENT ON TABLE salidas IS 'Registro de salidas/despachos (cliente, destino, fecha).';
