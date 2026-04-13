import { pool } from '../config/database.js';

let done = null;

/**
 * Crea tablas/columnas del módulo insumos si no existen (equivalente a database/008_insumos_modulo.sql).
 * Evita fallos si la migración SQL no se ejecutó manualmente.
 */
export async function ensureInsumosModuleSchema() {
  if (done) return done;
  done = (async () => {
    const client = await pool.connect();
    try {
      await client.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`).catch(() => {});

      await client.query(`
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS proveedores_insumos (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          razon_social VARCHAR(255) NOT NULL,
          ruc VARCHAR(32),
          contacto VARCHAR(255),
          direccion TEXT,
          activo BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      await client.query(`DROP TRIGGER IF EXISTS update_proveedores_insumos_updated_at ON proveedores_insumos;`);
      await client.query(`
        CREATE TRIGGER update_proveedores_insumos_updated_at
          BEFORE UPDATE ON proveedores_insumos
          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      `);

      await client.query(`CREATE INDEX IF NOT EXISTS idx_proveedores_insumos_razon ON proveedores_insumos(razon_social);`);

      await client.query(`ALTER TABLE insumos ADD COLUMN IF NOT EXISTS codigo VARCHAR(64);`);
      await client.query(`
        DO $$ BEGIN
          ALTER TABLE insumos ADD COLUMN proveedor_id UUID REFERENCES proveedores_insumos(id) ON DELETE SET NULL;
        EXCEPTION WHEN duplicate_column THEN NULL;
        END $$;
      `);
      await client.query(`
        DO $$ BEGIN
          ALTER TABLE insumos ADD COLUMN activo BOOLEAN NOT NULL DEFAULT TRUE;
        EXCEPTION WHEN duplicate_column THEN NULL;
        END $$;
      `);

      await client.query(`CREATE INDEX IF NOT EXISTS idx_insumos_proveedor ON insumos(proveedor_id);`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_insumos_activo ON insumos(activo);`);

      await client.query(`
        CREATE TABLE IF NOT EXISTS producto_insumo (
          producto_id UUID NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
          insumo_id UUID NOT NULL REFERENCES insumos(id) ON DELETE CASCADE,
          cantidad_por_bulto NUMERIC(14, 6) NOT NULL DEFAULT 0 CHECK (cantidad_por_bulto >= 0),
          PRIMARY KEY (producto_id, insumo_id)
        );
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_producto_insumo_producto ON producto_insumo(producto_id);`);

      const { rows: piColRows } = await client.query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'producto_insumo'`
      );
      const piCol = new Set(piColRows.map((r) => r.column_name));
      if (piCol.size > 0) {
        if (!piCol.has('cantidad_por_bulto')) {
          await client.query(
            'ALTER TABLE producto_insumo ADD COLUMN cantidad_por_bulto NUMERIC(14, 6)'
          );
        }
        if (piCol.has('cantidad_por_kg_producto')) {
          await client
            .query(
              'ALTER TABLE producto_insumo ALTER COLUMN cantidad_por_kg_producto DROP NOT NULL'
            )
            .catch(() => {});
          await client.query(`
            UPDATE producto_insumo pi
            SET cantidad_por_bulto = ROUND((pi.cantidad_por_kg_producto * p.formato)::numeric, 6)
            FROM productos p
            WHERE p.id = pi.producto_id
              AND pi.cantidad_por_bulto IS NULL
              AND pi.cantidad_por_kg_producto IS NOT NULL
              AND COALESCE(p.formato::numeric, 0) > 0
          `);
          await client.query(`
            UPDATE producto_insumo
            SET cantidad_por_bulto = COALESCE(cantidad_por_kg_producto, 0)
            WHERE cantidad_por_bulto IS NULL
          `);
        }
        await client.query(`
          UPDATE producto_insumo SET cantidad_por_bulto = 0 WHERE cantidad_por_bulto IS NULL
        `);
      }

      await client.query(`
        CREATE TABLE IF NOT EXISTS insumo_movimientos (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          insumo_id UUID NOT NULL REFERENCES insumos(id) ON DELETE RESTRICT,
          tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('INGRESO', 'SALIDA')),
          cantidad NUMERIC(14, 3) NOT NULL CHECK (cantidad > 0),
          lote_produccion_id UUID REFERENCES lotes_produccion(id) ON DELETE SET NULL,
          referencia VARCHAR(128),
          observaciones TEXT,
          usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT insumo_movimientos_lote_check CHECK (
            (tipo = 'INGRESO' AND lote_produccion_id IS NULL)
            OR (tipo = 'SALIDA' AND lote_produccion_id IS NOT NULL)
          )
        );
      `);

      await client.query(`CREATE INDEX IF NOT EXISTS idx_insumo_mov_insumo ON insumo_movimientos(insumo_id);`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_insumo_mov_lote ON insumo_movimientos(lote_produccion_id);`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_insumo_mov_created ON insumo_movimientos(created_at DESC);`);

      await client.query(`
        CREATE TABLE IF NOT EXISTS insumo_movimiento_documentos (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('INGRESO', 'SALIDA')),
          lote_produccion_id UUID REFERENCES lotes_produccion(id) ON DELETE RESTRICT,
          fecha_movimiento DATE NOT NULL DEFAULT CURRENT_DATE,
          referencia VARCHAR(128),
          observaciones TEXT,
          usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT insumo_doc_lote_check CHECK (
            (tipo = 'INGRESO' AND lote_produccion_id IS NULL)
            OR (tipo = 'SALIDA' AND lote_produccion_id IS NOT NULL)
          )
        );
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_insumo_doc_tipo_fecha ON insumo_movimiento_documentos(tipo, fecha_movimiento DESC, created_at DESC);`);
      await client.query(`
        DO $$ BEGIN
          ALTER TABLE insumo_movimiento_documentos ADD COLUMN ingreso_origen VARCHAR(20);
        EXCEPTION WHEN duplicate_column THEN NULL;
        END $$;
      `);
      await client.query(`
        DO $$ BEGIN
          ALTER TABLE insumo_movimiento_documentos ADD COLUMN proveedor_id UUID REFERENCES proveedores_insumos(id) ON DELETE SET NULL;
        EXCEPTION WHEN duplicate_column THEN NULL;
        END $$;
      `);
      await client.query(`
        UPDATE insumo_movimiento_documentos
        SET ingreso_origen = 'PRODUCCION'
        WHERE tipo = 'INGRESO' AND ingreso_origen IS NULL;
      `);
      await client.query(`
        DO $$ BEGIN
          ALTER TABLE insumo_movimientos ADD COLUMN documento_id UUID REFERENCES insumo_movimiento_documentos(id) ON DELETE RESTRICT;
        EXCEPTION WHEN duplicate_column THEN NULL;
        END $$;
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_insumo_mov_documento ON insumo_movimientos(documento_id);`);

      await client.query(`
        CREATE TABLE IF NOT EXISTS empaque_componentes (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          insumo_id UUID NOT NULL REFERENCES insumos(id) ON DELETE RESTRICT,
          categoria VARCHAR(20) NOT NULL DEFAULT 'PRINCIPAL'
            CHECK (categoria IN ('PRINCIPAL', 'SECUNDARIO', 'EXTRA')),
          tipo VARCHAR(20) NOT NULL
            CHECK (tipo IN ('SACO', 'CAJA', 'RAFIA', 'CINTA', 'LAMINA', 'OTRO')),
          subtipo VARCHAR(60),
          con_logo BOOLEAN NOT NULL DEFAULT FALSE,
          medida VARCHAR(60),
          descripcion VARCHAR(255),
          activo BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_empaque_componentes_insumo ON empaque_componentes(insumo_id);`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_empaque_componentes_tipo ON empaque_componentes(tipo);`);

      await client.query(`DROP TRIGGER IF EXISTS update_empaque_componentes_updated_at ON empaque_componentes;`);
      await client.query(`
        CREATE TRIGGER update_empaque_componentes_updated_at
          BEFORE UPDATE ON empaque_componentes
          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS especie_empaque_plantillas (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          especie_id UUID NOT NULL REFERENCES especies(id) ON DELETE CASCADE,
          nombre VARCHAR(120) NOT NULL,
          version INTEGER NOT NULL DEFAULT 1,
          activa BOOLEAN NOT NULL DEFAULT TRUE,
          observaciones TEXT,
          created_by UUID REFERENCES usuarios(id) ON DELETE SET NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_esp_empaque_plantillas_especie ON especie_empaque_plantillas(especie_id);`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_esp_empaque_plantillas_activa ON especie_empaque_plantillas(activa);`);

      await client.query(`DROP TRIGGER IF EXISTS update_especie_empaque_plantillas_updated_at ON especie_empaque_plantillas;`);
      await client.query(`
        CREATE TRIGGER update_especie_empaque_plantillas_updated_at
          BEFORE UPDATE ON especie_empaque_plantillas
          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS especie_empaque_plantilla_items (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          plantilla_id UUID NOT NULL REFERENCES especie_empaque_plantillas(id) ON DELETE CASCADE,
          componente_id UUID NOT NULL REFERENCES empaque_componentes(id) ON DELETE RESTRICT,
          unidad_base VARCHAR(20) NOT NULL DEFAULT 'BULTO'
            CHECK (unidad_base IN ('BULTO', 'CAJA')),
          cantidad_por_unidad NUMERIC(14, 6) NOT NULL CHECK (cantidad_por_unidad >= 0),
          obligatorio BOOLEAN NOT NULL DEFAULT TRUE,
          condicion VARCHAR(30) NOT NULL DEFAULT 'DEFECTO'
            CHECK (condicion IN ('DEFECTO', 'DEFORME', 'SIN_LOGO', 'PEDIDO_ESPECIAL', 'OTRO')),
          orden INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (plantilla_id, componente_id, unidad_base, condicion)
        );
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_esp_empaque_items_plantilla ON especie_empaque_plantilla_items(plantilla_id);`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_esp_empaque_items_comp ON especie_empaque_plantilla_items(componente_id);`);

      await client.query(`
        CREATE TABLE IF NOT EXISTS lote_empaque_ajustes (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          lote_produccion_id UUID NOT NULL REFERENCES lotes_produccion(id) ON DELETE CASCADE,
          item_plantilla_id UUID REFERENCES especie_empaque_plantilla_items(id) ON DELETE SET NULL,
          componente_id UUID NOT NULL REFERENCES empaque_componentes(id) ON DELETE RESTRICT,
          unidad_base VARCHAR(20) NOT NULL DEFAULT 'BULTO'
            CHECK (unidad_base IN ('BULTO', 'CAJA')),
          cantidad_por_unidad NUMERIC(14, 6) NOT NULL CHECK (cantidad_por_unidad >= 0),
          obligatorio BOOLEAN NOT NULL DEFAULT FALSE,
          motivo VARCHAR(30) NOT NULL
            CHECK (motivo IN ('DEFORME', 'SIN_LOGO', 'PEDIDO_ESPECIAL', 'CORRECCION', 'OTRO')),
          observaciones TEXT,
          usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_lote_empaque_ajustes_lote ON lote_empaque_ajustes(lote_produccion_id);`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_lote_empaque_ajustes_comp ON lote_empaque_ajustes(componente_id);`);

      await client.query(`
        CREATE TABLE IF NOT EXISTS empaque_plantilla_proceso_items (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          plantilla_proceso_id UUID NOT NULL REFERENCES plantillas_proceso(id) ON DELETE CASCADE,
          producto_id UUID NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
          categoria VARCHAR(20) NOT NULL
            CHECK (categoria IN ('PRIMARIO', 'SECUNDARIO', 'OTROS')),
          insumo_id UUID NOT NULL REFERENCES insumos(id) ON DELETE RESTRICT,
          cantidad_por_unidad NUMERIC(14, 6) NOT NULL CHECK (cantidad_por_unidad >= 0),
          unidad_base VARCHAR(20) NOT NULL DEFAULT 'BULTO'
            CHECK (unidad_base IN ('BULTO', 'CAJA')),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (plantilla_proceso_id, producto_id, categoria, insumo_id, unidad_base)
        );
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_emp_proc_items_plantilla ON empaque_plantilla_proceso_items(plantilla_proceso_id);`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_emp_proc_items_producto ON empaque_plantilla_proceso_items(producto_id);`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_emp_proc_items_insumo ON empaque_plantilla_proceso_items(insumo_id);`);

      await client.query(`DROP TRIGGER IF EXISTS update_empaque_plantilla_proceso_items_updated_at ON empaque_plantilla_proceso_items;`);
      await client.query(`
        CREATE TRIGGER update_empaque_plantilla_proceso_items_updated_at
          BEFORE UPDATE ON empaque_plantilla_proceso_items
          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      `);
    } finally {
      client.release();
    }
  })();
  return done;
}
