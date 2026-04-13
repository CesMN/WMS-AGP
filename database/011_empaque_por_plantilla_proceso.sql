-- Esquema práctico: insumos de empaque por plantilla de proceso y producto.
-- Columnas lógicas: primario, secundario y otros (con múltiples insumos por columna).

CREATE TABLE IF NOT EXISTS empaque_plantilla_proceso_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plantilla_proceso_id UUID NOT NULL REFERENCES plantillas_proceso(id) ON DELETE CASCADE,
    producto_id UUID NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    categoria VARCHAR(20) NOT NULL
        CHECK (categoria IN ('PRIMARIO', 'SECUNDARIO', 'OTROS')),
    insumo_id UUID NOT NULL REFERENCES insumos(id) ON DELETE RESTRICT,
    cantidad_por_unidad NUMERIC(14, 6) NOT NULL CHECK (cantidad_por_unidad >= 0),
    unidad_base VARCHAR(20) NOT NULL DEFAULT 'BULTO'
        CHECK (unidad_base IN ('BULTO', 'CAJA')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (plantilla_proceso_id, producto_id, categoria, insumo_id, unidad_base)
);

CREATE INDEX IF NOT EXISTS idx_emp_proc_items_plantilla ON empaque_plantilla_proceso_items(plantilla_proceso_id);
CREATE INDEX IF NOT EXISTS idx_emp_proc_items_producto ON empaque_plantilla_proceso_items(producto_id);
CREATE INDEX IF NOT EXISTS idx_emp_proc_items_insumo ON empaque_plantilla_proceso_items(insumo_id);

DROP TRIGGER IF EXISTS update_empaque_plantilla_proceso_items_updated_at ON empaque_plantilla_proceso_items;
CREATE TRIGGER update_empaque_plantilla_proceso_items_updated_at
    BEFORE UPDATE ON empaque_plantilla_proceso_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

