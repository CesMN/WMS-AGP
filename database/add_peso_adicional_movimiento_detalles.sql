-- Peso adicional en detalles de movimiento (siempre en kg) para mostrar en ingresos, salidas y movimientos
ALTER TABLE movimiento_detalles
ADD COLUMN IF NOT EXISTS peso_adicional DECIMAL(10, 2) DEFAULT 0;

COMMENT ON COLUMN movimiento_detalles.peso_adicional IS 'Peso adicional en kg de la línea (saldo); se muestra junto a bultos y total_kg en detalles';
