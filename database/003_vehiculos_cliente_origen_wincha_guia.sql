-- Añadir cliente_id y origen a vehiculos_lote; numero_guia_remitente a descarga_winchas (guía por embarcación)
ALTER TABLE vehiculos_lote
  ADD COLUMN IF NOT EXISTS cliente_id UUID REFERENCES clientes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS origen VARCHAR(255);

ALTER TABLE descarga_winchas
  ADD COLUMN IF NOT EXISTS numero_guia_remitente VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_vehiculos_lote_cliente ON vehiculos_lote(cliente_id);
