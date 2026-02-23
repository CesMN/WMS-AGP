-- Permitir cantidad_bultos = 0 en stock_posiciones (para poder reabrir despachos sin perder la fila)
ALTER TABLE stock_posiciones DROP CONSTRAINT IF EXISTS stock_posiciones_cantidad_bultos_check;
ALTER TABLE stock_posiciones ADD CONSTRAINT stock_posiciones_cantidad_bultos_check CHECK (cantidad_bultos >= 0);
