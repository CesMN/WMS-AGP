-- Para ajustes: distinguir fila "Antes" y "Después" en el detalle del movimiento
ALTER TABLE movimiento_detalles ADD COLUMN IF NOT EXISTS tipo_linea VARCHAR(10) DEFAULT NULL;
COMMENT ON COLUMN movimiento_detalles.tipo_linea IS 'Antes | Despues: solo en movimientos de tipo Ajuste';
