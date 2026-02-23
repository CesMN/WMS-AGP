-- Cliente de origen en despachos (distinto del cliente destino)
ALTER TABLE despachos
ADD COLUMN IF NOT EXISTS cliente_origen_id UUID REFERENCES clientes(id) ON DELETE SET NULL;

COMMENT ON COLUMN despachos.cliente_origen_id IS 'Cliente de origen del producto despachado';
