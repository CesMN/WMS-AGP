-- Consumo de insumos por producto: de "por kg de producto" a "por bulto" (unidad = la del insumo).
-- Ejecutar si no usa el auto-migrate del backend (ensureInsumosModule).

ALTER TABLE producto_insumo ADD COLUMN IF NOT EXISTS cantidad_por_bulto NUMERIC(14, 6);

DO $$ BEGIN
  ALTER TABLE producto_insumo ALTER COLUMN cantidad_por_kg_producto DROP NOT NULL;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

UPDATE producto_insumo pi
SET cantidad_por_bulto = ROUND((pi.cantidad_por_kg_producto * p.formato)::numeric, 6)
FROM productos p
WHERE p.id = pi.producto_id
  AND pi.cantidad_por_bulto IS NULL
  AND pi.cantidad_por_kg_producto IS NOT NULL
  AND COALESCE(p.formato::numeric, 0) > 0;

UPDATE producto_insumo
SET cantidad_por_bulto = COALESCE(cantidad_por_kg_producto, 0)
WHERE cantidad_por_bulto IS NULL;

UPDATE producto_insumo SET cantidad_por_bulto = 0 WHERE cantidad_por_bulto IS NULL;

COMMENT ON TABLE producto_insumo IS 'Consumo teórico: cantidad de insumo (en su unidad) por cada bulto de producto terminado.';
