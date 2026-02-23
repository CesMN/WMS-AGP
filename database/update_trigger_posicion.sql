-- Script de migración para actualizar el trigger de estado de posiciones
-- Este script mejora la lógica para considerar también los lotes diferentes
-- Ejecutar: psql -U postgres -d wms_db -f database/update_trigger_posicion.sql

-- Eliminar el trigger y función existentes
DROP TRIGGER IF EXISTS update_posicion_estado_trigger ON stock_posiciones;
DROP FUNCTION IF EXISTS update_posicion_estado();

-- Crear la función mejorada para actualizar estado de posición
-- Incluye actualización de la posición de ORIGEN cuando se mueve un producto (UPDATE posicion_id)
CREATE OR REPLACE FUNCTION update_posicion_estado()
RETURNS TRIGGER AS $$
DECLARE
    productos_count INTEGER;
    productos_lotes_count INTEGER;
    pos_id UUID;
    pos_id_orig UUID;
BEGIN
    pos_id := COALESCE(NEW.posicion_id, OLD.posicion_id);

    SELECT 
        COUNT(DISTINCT producto_id),
        COUNT(DISTINCT (producto_id::text || '-' || COALESCE(lote, '')))
    INTO productos_count, productos_lotes_count
    FROM stock_posiciones
    WHERE posicion_id = pos_id;

    IF productos_count = 0 THEN
        UPDATE posiciones SET estado = 'Disponible' WHERE id = pos_id;
    ELSIF productos_count = 1 AND productos_lotes_count = 1 THEN
        UPDATE posiciones SET estado = 'Ocupado' WHERE id = pos_id;
    ELSE
        UPDATE posiciones SET estado = 'Mix' WHERE id = pos_id;
    END IF;

    -- Si es UPDATE y cambió de posición (mover producto), actualizar también la posición de origen
    IF TG_OP = 'UPDATE' AND OLD.posicion_id IS DISTINCT FROM NEW.posicion_id THEN
        pos_id_orig := OLD.posicion_id;
        SELECT 
            COUNT(DISTINCT producto_id),
            COUNT(DISTINCT (producto_id::text || '-' || COALESCE(lote, '')))
        INTO productos_count, productos_lotes_count
        FROM stock_posiciones
        WHERE posicion_id = pos_id_orig;

        IF productos_count = 0 THEN
            UPDATE posiciones SET estado = 'Disponible' WHERE id = pos_id_orig;
        ELSIF productos_count = 1 AND productos_lotes_count = 1 THEN
            UPDATE posiciones SET estado = 'Ocupado' WHERE id = pos_id_orig;
        ELSE
            UPDATE posiciones SET estado = 'Mix' WHERE id = pos_id_orig;
        END IF;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ language 'plpgsql';

-- Recrear el trigger
CREATE TRIGGER update_posicion_estado_trigger
AFTER INSERT OR UPDATE OR DELETE ON stock_posiciones
FOR EACH ROW EXECUTE FUNCTION update_posicion_estado();

-- Actualizar estados de todas las posiciones existentes basándose en el stock actual
DO $$
DECLARE
    posicion_record RECORD;
    productos_count INTEGER;
    productos_lotes_count INTEGER;
BEGIN
    FOR posicion_record IN SELECT id FROM posiciones LOOP
        SELECT 
            COUNT(DISTINCT producto_id),
            COUNT(DISTINCT (producto_id::text || '-' || COALESCE(lote, '')))
        INTO productos_count, productos_lotes_count
        FROM stock_posiciones
        WHERE posicion_id = posicion_record.id;
        
        IF productos_count = 0 THEN
            UPDATE posiciones SET estado = 'Disponible' WHERE id = posicion_record.id;
        ELSIF productos_count = 1 AND productos_lotes_count = 1 THEN
            UPDATE posiciones SET estado = 'Ocupado' WHERE id = posicion_record.id;
        ELSE
            UPDATE posiciones SET estado = 'Mix' WHERE id = posicion_record.id;
        END IF;
    END LOOP;
END $$;

-- Mensaje de confirmación
DO $$
BEGIN
    RAISE NOTICE 'Trigger actualizado correctamente. Estados de posiciones recalculados.';
END $$;
