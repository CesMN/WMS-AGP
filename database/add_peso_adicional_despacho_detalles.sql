-- Añadir columna peso_adicional (saldo en kg) a despacho_detalles
-- Total salida = (kg por bultos) + peso_adicional
ALTER TABLE despacho_detalles
ADD COLUMN IF NOT EXISTS peso_adicional DECIMAL(10, 2) DEFAULT 0;

COMMENT ON COLUMN despacho_detalles.peso_adicional IS 'Kg adicionales (saldo) sobre los bultos para la línea de despacho';
