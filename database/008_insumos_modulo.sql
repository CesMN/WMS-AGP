-- Módulo insumos: proveedores, movimientos, receta por producto (producto_insumo)
-- Ejecutar después de 001/002 (insumos, lotes_produccion, productos, usuarios).

CREATE TABLE IF NOT EXISTS proveedores_insumos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    razon_social VARCHAR(255) NOT NULL,
    ruc VARCHAR(32),
    contacto VARCHAR(255),
    direccion TEXT,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

DROP TRIGGER IF EXISTS update_proveedores_insumos_updated_at ON proveedores_insumos;
CREATE TRIGGER update_proveedores_insumos_updated_at
    BEFORE UPDATE ON proveedores_insumos
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_proveedores_insumos_razon ON proveedores_insumos(razon_social);

ALTER TABLE insumos ADD COLUMN IF NOT EXISTS codigo VARCHAR(64);
ALTER TABLE insumos ADD COLUMN IF NOT EXISTS proveedor_id UUID REFERENCES proveedores_insumos(id) ON DELETE SET NULL;
ALTER TABLE insumos ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_insumos_proveedor ON insumos(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_insumos_activo ON insumos(activo);

CREATE TABLE IF NOT EXISTS producto_insumo (
    producto_id UUID NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    insumo_id UUID NOT NULL REFERENCES insumos(id) ON DELETE CASCADE,
    cantidad_por_kg_producto NUMERIC(14, 6) NOT NULL CHECK (cantidad_por_kg_producto >= 0),
    PRIMARY KEY (producto_id, insumo_id)
);

CREATE INDEX IF NOT EXISTS idx_producto_insumo_producto ON producto_insumo(producto_id);

CREATE TABLE IF NOT EXISTS insumo_movimientos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    insumo_id UUID NOT NULL REFERENCES insumos(id) ON DELETE RESTRICT,
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('INGRESO', 'SALIDA')),
    cantidad NUMERIC(14, 3) NOT NULL CHECK (cantidad > 0),
    lote_produccion_id UUID REFERENCES lotes_produccion(id) ON DELETE SET NULL,
    referencia VARCHAR(128),
    observaciones TEXT,
    usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT insumo_movimientos_lote_check CHECK (
        (tipo = 'INGRESO' AND lote_produccion_id IS NULL)
        OR (tipo = 'SALIDA' AND lote_produccion_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_insumo_mov_insumo ON insumo_movimientos(insumo_id);
CREATE INDEX IF NOT EXISTS idx_insumo_mov_lote ON insumo_movimientos(lote_produccion_id);
CREATE INDEX IF NOT EXISTS idx_insumo_mov_created ON insumo_movimientos(created_at DESC);

COMMENT ON TABLE proveedores_insumos IS 'Proveedores de insumos de planta (distintos de proveedores MP).';
COMMENT ON TABLE producto_insumo IS 'Consumo teórico por bulto de producto; ver migración 009 / cantidad_por_bulto.';
COMMENT ON TABLE insumo_movimientos IS 'Ingresos y salidas de insumo; salidas obligatorias con lote de producción.';
