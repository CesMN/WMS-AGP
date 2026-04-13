-- Reparto de bultos imputados desde stock (cantidad_cargada) por celda contenedor/línea.
ALTER TABLE ordenes_exportacion_contenedor_contenido
  ADD COLUMN IF NOT EXISTS cantidad_bultos_stock NUMERIC(12, 2) NOT NULL DEFAULT 0
  CHECK (cantidad_bultos_stock >= 0);

COMMENT ON COLUMN ordenes_exportacion_contenedor_contenido.cantidad_bultos_stock IS
  'Bultos desde stock ya imputados a la OP repartidos en este contenedor; suma por línea ≤ cantidad_cargada de la línea y ≤ cantidad_bultos de la celda.';
