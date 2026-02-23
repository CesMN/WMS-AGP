-- Vincular despachos al movimiento de salida para poder listar líneas aunque el stock se haya eliminado
-- Ejecutar: psql -U postgres -d wms_db -f database/add_despachos_movimiento_id.sql

ALTER TABLE despachos
ADD COLUMN IF NOT EXISTS movimiento_id UUID REFERENCES movimientos(id) ON DELETE SET NULL;

COMMENT ON COLUMN despachos.movimiento_id IS 'Movimiento de tipo Salida asociado a este despacho';
