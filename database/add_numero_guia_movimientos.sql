-- Número de guía para agrupar ingresos/salidas (verificación con guía física)
ALTER TABLE movimientos ADD COLUMN IF NOT EXISTS numero_guia VARCHAR(255);
