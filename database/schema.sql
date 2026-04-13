-- Sistema de Gestión de Almacenes (WMS) - Esquema de Base de Datos
-- PostgreSQL

-- Extensiones
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tabla de Usuarios
CREATE TABLE usuarios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    rol VARCHAR(50) NOT NULL CHECK (rol IN (
      'Administrador',
      'Jefe Planta',
      'Gerencia',
      'Area Contable',
      'Almacen',
      'Produccion',
      'Supervisor de Envasado',
      'Supervisor de Congelado',
      'Supervisor de Empaque',
      'Camaras de Almacenamiento',
      'Recepcion',
      'Garita',
      'Supervisor de Proceso',
      'Supervisor de Calidad',
      'Exportaciones'
    )),
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Especies
CREATE TABLE especies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre VARCHAR(255) NOT NULL UNIQUE,
    observaciones TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Clientes
CREATE TABLE clientes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre VARCHAR(255) NOT NULL,
    descripcion TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de relación Cliente-Especies (Muchos a Muchos)
CREATE TABLE cliente_especies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    especie_id UUID NOT NULL REFERENCES especies(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(cliente_id, especie_id)
);

-- Tabla de Productos
CREATE TABLE productos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    codigo VARCHAR(255) NOT NULL UNIQUE,
    cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
    especie_id UUID NOT NULL REFERENCES especies(id) ON DELETE RESTRICT,
    producto VARCHAR(255) NOT NULL,
    descripcion TEXT NOT NULL,
    presentacion VARCHAR(255),
    formato DECIMAL(10, 2) NOT NULL, -- Peso por bulto
    unidad_medida VARCHAR(10) NOT NULL CHECK (unidad_medida IN ('KG', 'LB')),
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Almacenes
CREATE TABLE almacenes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre VARCHAR(255) NOT NULL,
    cantidad_carriles INTEGER NOT NULL CHECK (cantidad_carriles > 0),
    cantidad_niveles INTEGER NOT NULL CHECK (cantidad_niveles > 0),
    cantidad_posiciones INTEGER NOT NULL CHECK (cantidad_posiciones > 0),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Carriles
CREATE TABLE carriles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    almacen_id UUID NOT NULL REFERENCES almacenes(id) ON DELETE CASCADE,
    nombre VARCHAR(255) NOT NULL,
    numero_carril INTEGER NOT NULL,
    cantidad_niveles INTEGER NOT NULL CHECK (cantidad_niveles > 0),
    cantidad_posiciones INTEGER NOT NULL CHECK (cantidad_posiciones > 0),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(almacen_id, numero_carril)
);

-- Tabla de Niveles
CREATE TABLE niveles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    carril_id UUID NOT NULL REFERENCES carriles(id) ON DELETE CASCADE,
    numero_nivel INTEGER NOT NULL,
    cantidad_posiciones INTEGER NOT NULL CHECK (cantidad_posiciones > 0),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(carril_id, numero_nivel)
);

-- Tabla de Posiciones
CREATE TABLE posiciones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nivel_id UUID NOT NULL REFERENCES niveles(id) ON DELETE CASCADE,
    nombre VARCHAR(255) NOT NULL,
    numero_posicion INTEGER NOT NULL,
    estado VARCHAR(50) DEFAULT 'Disponible' CHECK (estado IN ('Disponible', 'Ocupado', 'Mix')),
    bloqueada BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(nivel_id, numero_posicion)
);

-- Tabla de Ingresos/Stock (Productos almacenados en posiciones)
CREATE TABLE stock_posiciones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    posicion_id UUID NOT NULL REFERENCES posiciones(id) ON DELETE RESTRICT,
    producto_id UUID NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
    lote VARCHAR(255),
    referencia VARCHAR(255) NOT NULL, -- Tipo de referencia de ingreso
    fecha_ingreso DATE NOT NULL,
    cantidad_bultos NUMERIC(12, 2) NOT NULL CHECK (cantidad_bultos > 0),
    peso_adicional DECIMAL(10, 2) DEFAULT 0,
    total_kg DECIMAL(10, 2) NOT NULL, -- Calculado: (bultos * formato) + peso_adicional (convertido si es LB)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Tipos de Referencia
CREATE TABLE tipos_referencia (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre VARCHAR(255) NOT NULL UNIQUE,
    tipo VARCHAR(50) NOT NULL CHECK (tipo IN ('Ingreso', 'Salida')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Movimientos (Historial de ingresos y salidas)
CREATE TABLE movimientos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tipo_movimiento VARCHAR(50) NOT NULL CHECK (tipo_movimiento IN ('Ingreso', 'Salida', 'Movimiento')),
    usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
    fecha_hora TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    motivo TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Detalles de Movimientos
CREATE TABLE movimiento_detalles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    movimiento_id UUID NOT NULL REFERENCES movimientos(id) ON DELETE CASCADE,
    producto_id UUID NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
    cantidad_bultos NUMERIC(12, 2) NOT NULL,
    total_kg DECIMAL(10, 2) NOT NULL,
    peso_adicional DECIMAL(10, 2) DEFAULT 0,
    almacen_id UUID REFERENCES almacenes(id) ON DELETE SET NULL,
    carril_id UUID REFERENCES carriles(id) ON DELETE SET NULL,
    nivel_id UUID REFERENCES niveles(id) ON DELETE SET NULL,
    posicion_id UUID REFERENCES posiciones(id) ON DELETE SET NULL,
    stock_posicion_id UUID REFERENCES stock_posiciones(id) ON DELETE SET NULL, -- Para rastrear el stock específico
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Despachos
CREATE TABLE despachos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tipo_salida VARCHAR(50) NOT NULL CHECK (tipo_salida IN (
        'Embarque', 'Venta Local', 'Reempaque', 'Reproceso', 
        'Etiquetado', 'Muestreo', 'Otros'
    )),
    fecha_salida DATE,
    orden_produccion VARCHAR(255),
    cliente_destino VARCHAR(255),
    pais_destino VARCHAR(255),
    destino VARCHAR(255),
    contenedor VARCHAR(255),
    guia_salida VARCHAR(255),
    observaciones TEXT,
    estado VARCHAR(50) DEFAULT 'Registrado' CHECK (estado IN ('Registrado', 'Despachado')),
    movimiento_id UUID REFERENCES movimientos(id) ON DELETE SET NULL,
    usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Detalles de Despachos
CREATE TABLE despacho_detalles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    despacho_id UUID NOT NULL REFERENCES despachos(id) ON DELETE CASCADE,
    stock_posicion_id UUID NOT NULL REFERENCES stock_posiciones(id) ON DELETE RESTRICT,
    cantidad_bultos NUMERIC(12, 2) NOT NULL CHECK (cantidad_bultos > 0),
    total_kg DECIMAL(10, 2) NOT NULL,
    peso_adicional DECIMAL(10, 2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Configuración del Sistema
CREATE TABLE configuracion (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clave VARCHAR(255) NOT NULL UNIQUE,
    valor TEXT NOT NULL,
    tipo VARCHAR(50) NOT NULL CHECK (tipo IN ('string', 'number', 'boolean', 'json')),
    descripcion TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- RBAC
CREATE TABLE rbac_recursos (
    codigo VARCHAR(120) PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    seccion VARCHAR(120) NOT NULL,
    orden INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE rbac_roles_permisos (
    rol VARCHAR(80) NOT NULL,
    recurso_codigo VARCHAR(120) NOT NULL REFERENCES rbac_recursos(codigo) ON DELETE CASCADE,
    puede_ver BOOLEAN NOT NULL DEFAULT FALSE,
    puede_operar BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (rol, recurso_codigo)
);

CREATE TABLE rbac_usuarios_overrides (
    usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    recurso_codigo VARCHAR(120) NOT NULL REFERENCES rbac_recursos(codigo) ON DELETE CASCADE,
    override_ver BOOLEAN,
    override_operar BOOLEAN,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (usuario_id, recurso_codigo)
);

-- Índices para mejorar rendimiento
CREATE INDEX idx_stock_posiciones_posicion ON stock_posiciones(posicion_id);
CREATE INDEX idx_stock_posiciones_producto ON stock_posiciones(producto_id);
CREATE INDEX idx_movimientos_usuario ON movimientos(usuario_id);
CREATE INDEX idx_movimientos_fecha ON movimientos(fecha_hora);
CREATE INDEX idx_despachos_usuario ON despachos(usuario_id);
CREATE INDEX idx_despachos_estado ON despachos(estado);
CREATE INDEX idx_productos_codigo ON productos(codigo);
CREATE INDEX idx_productos_cliente ON productos(cliente_id);
CREATE INDEX idx_productos_especie ON productos(especie_id);
CREATE INDEX idx_rbac_roles_rol ON rbac_roles_permisos(rol);
CREATE INDEX idx_rbac_overrides_usuario ON rbac_usuarios_overrides(usuario_id);

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers para updated_at
CREATE TRIGGER update_usuarios_updated_at BEFORE UPDATE ON usuarios
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_especies_updated_at BEFORE UPDATE ON especies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_clientes_updated_at BEFORE UPDATE ON clientes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_productos_updated_at BEFORE UPDATE ON productos
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_almacenes_updated_at BEFORE UPDATE ON almacenes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_carriles_updated_at BEFORE UPDATE ON carriles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_niveles_updated_at BEFORE UPDATE ON niveles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_posiciones_updated_at BEFORE UPDATE ON posiciones
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_stock_posiciones_updated_at BEFORE UPDATE ON stock_posiciones
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_despachos_updated_at BEFORE UPDATE ON despachos
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Función para actualizar estado de posición
CREATE OR REPLACE FUNCTION update_posicion_estado()
RETURNS TRIGGER AS $$
DECLARE
    productos_count INTEGER;
    productos_lotes_count INTEGER;
    pos_id UUID;
    pos_id_orig UUID;
BEGIN
    -- Posición afectada: destino en INSERT/UPDATE, o la única en DELETE
    pos_id := COALESCE(NEW.posicion_id, OLD.posicion_id);

    -- Actualizar estado de esa posición
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

-- Trigger para actualizar estado de posición cuando cambia el stock
CREATE TRIGGER update_posicion_estado_trigger
AFTER INSERT OR UPDATE OR DELETE ON stock_posiciones
FOR EACH ROW EXECUTE FUNCTION update_posicion_estado();

-- Datos iniciales
INSERT INTO tipos_referencia (nombre, tipo) VALUES
('Compra', 'Ingreso'),
('Transferencia', 'Ingreso'),
('Devolución', 'Ingreso'),
('Ajuste Inventario', 'Ingreso'),
('Otros', 'Ingreso');

INSERT INTO configuracion (clave, valor, tipo, descripcion) VALUES
('registros_por_pagina', '10', 'number', 'Cantidad de registros por página en las tablas'),
('tema', 'claro', 'string', 'Tema de la aplicación (claro/oscuro)'),
('tamaño_fuente', '14', 'number', 'Tamaño de fuente base en px'),
('color_primario', '#3B82F6', 'string', 'Color primario de la aplicación'),
('logo_empresa', '', 'string', 'URL o path del logo de la empresa');

-- Nota: El usuario administrador se crea mediante el script init-admin.js
-- Ejecutar: node backend/scripts/init-admin.js

-- Notificaciones (feed central)
CREATE TABLE IF NOT EXISTS notificaciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    tipo VARCHAR(120) NOT NULL,
    modulo VARCHAR(120) NOT NULL,
    severidad VARCHAR(20) NOT NULL DEFAULT 'info' CHECK (severidad IN ('info', 'success', 'warning', 'error')),
    titulo VARCHAR(255) NOT NULL,
    mensaje TEXT,
    origen_tabla VARCHAR(80),
    origen_id VARCHAR(80),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS notificaciones_usuarios (
    notificacion_id UUID NOT NULL REFERENCES notificaciones(id) ON DELETE CASCADE,
    usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    leida_at TIMESTAMPTZ,
    descartada_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (notificacion_id, usuario_id)
);

CREATE INDEX IF NOT EXISTS idx_notificaciones_fecha ON notificaciones (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notificaciones_modulo ON notificaciones (modulo);
CREATE INDEX IF NOT EXISTS idx_notificaciones_severidad ON notificaciones (severidad);
CREATE INDEX IF NOT EXISTS idx_notif_usuario_estado ON notificaciones_usuarios (usuario_id, leida_at, descartada_at);
