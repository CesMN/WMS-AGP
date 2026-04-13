# Diagrama Entidad-Relación: Integración ERP/WMS

## Tablas existentes (WMS Almacenamiento de Congelados) relevantes

```
usuarios (id, nombre, email, password_hash, rol, activo, ...)
clientes (id, nombre, descripcion, ...)
especies (id, nombre, ...)
productos (id, codigo, cliente_id, especie_id, producto, descripcion, formato, unidad_medida, activo, ...)
almacenes → carriles → niveles → posiciones
stock_posiciones (id, posicion_id, producto_id, lote, referencia, fecha_ingreso, cantidad_bultos, peso_adicional, total_kg, ...)
movimientos (id, tipo_movimiento, usuario_id, fecha_hora, motivo, numero_guia, ...)
movimiento_detalles (id, movimiento_id, producto_id, cantidad_bultos, total_kg, posicion_id, stock_posicion_id, ...)
despachos (id, tipo_salida, cliente_destino, destino, movimiento_id, usuario_id, estado, ...)
despacho_detalles (id, despacho_id, stock_posicion_id, cantidad_bultos, total_kg, ...)
tipos_referencia (id, nombre, tipo)  -- 'Compra', 'Transferencia', etc.
```

---

## Nuevas tablas y relaciones

### 1) Logística de Entrada

```
┌─────────────────────┐
│ recepciones         │
├─────────────────────┤
│ id (PK)             │
│ proveedor           │  VARCHAR
│ fecha               │  DATE
│ guia_remision       │  VARCHAR
│ estado              │  Pendiente | Recibido | Parcial | Anulado
│ created_at          │
│ updated_at          │
└──────────┬──────────┘
           │ 1
           │
           │ N
┌──────────▼──────────┐         ┌─────────────────────┐
│ lotes               │    N    │ productos (exist.)  │
├─────────────────────┤────────┤                     │
│ id (PK)             │    1    │ id (PK)             │
│ recepcion_id (FK)   │─────────│ codigo, cliente_id,  │
│ producto_id (FK)    │─────────│ especie_id, formato, │
│ cantidad_inicial    │         │ unidad_medida, ...   │
│ cantidad_actual     │         └─────────────────────┘
│ fecha_vencimiento   │
│ created_at          │
│ updated_at          │
└──────────┬──────────┘
           │
           │ Puente con almacenamiento:
           │ stock_posiciones.lote (VARCHAR) puede almacenar código/ref del lote;
           │ opcional: stock_posiciones.lote_id (FK → lotes.id) para trazabilidad.
           ▼
┌─────────────────────┐
│ stock_posiciones    │  (existente)
│ + lote_id (FK)      │  opcional, ref a lotes.id
└─────────────────────┘

┌─────────────────────┐
│ insumos             │  (catálogo + stock para planta)
├─────────────────────┤
│ id (PK)             │
│ nombre              │
│ stock_minimo        │
│ stock_actual        │  para alertas y consumo
│ unidad_medida        │  KG, L, UN, etc.
│ created_at          │
│ updated_at          │
└─────────────────────┘
```

### 2) Planta (Producción)

```
┌─────────────────────┐
│ produccion_ordenes  │
├─────────────────────┤
│ id (PK)             │
│ lote_mp_id (FK)     │──────► lotes.id     (materia prima)
│ producto_final_id   │──────► productos.id (producto terminado)
│ cantidad_producida  │
│ operario_id (FK)    │──────► usuarios.id
│ fecha_orden         │
│ estado              │  Pendiente | En Proceso | Completado | Anulado
│ created_at          │
│ updated_at          │
└──────────┬──────────┘
           │
           │ Cuando estado = 'Completado':
           │ se genera una entrada pendiente en WMS.
           ▼
┌─────────────────────┐
│ entradas_pendientes │  (cola para WMS)
├─────────────────────┤
│ id (PK)             │
│ produccion_orden_id │──────► produccion_ordenes.id
│ producto_id (FK)    │──────► productos.id
│ cantidad            │       (cantidad a ingresar a cámara)
│ estado              │  Pendiente | Convertido
│ movimiento_id (FK)  │──────► movimientos.id  (cuando se convierte en ingreso real)
│ created_at          │
│ updated_at          │
└─────────────────────┘
```

### 3) Logística de Salida

```
┌─────────────────────┐
│ salidas             │
├─────────────────────┤
│ id (PK)             │
│ cliente_destino     │  VARCHAR (o FK a clientes si se unifica)
│ destino             │  VARCHAR
│ fecha_despacho      │  DATE
│ estado              │  Registrado | Despachado
│ usuario_id (FK)     │──────► usuarios.id
│ created_at          │
│ updated_at          │
└─────────────────────┘
```

Opcional: `salida_detalles (salida_id, producto_id, lote_id, cantidad)` para ítems despachados.  
Opcional: vincular `salidas` con `despachos` (ej. despacho_id) si una salida se materializa en un despacho del WMS.

---

## Resumen de relaciones con el modelo existente

| Nueva tabla           | Relación con existentes                                      |
|-----------------------|--------------------------------------------------------------|
| recepciones           | — (independiente; origen de lotes)                          |
| lotes                 | producto_id → productos; puente a stock_posiciones vía lote/lote_id |
| insumos               | — (catálogo independiente para planta)                      |
| produccion_ordenes     | lote_mp_id → lotes; producto_final_id → productos; operario_id → usuarios |
| entradas_pendientes   | produccion_orden_id → produccion_ordenes; producto_id → productos; movimiento_id → movimientos |
| salidas               | usuario_id → usuarios; opcional cliente_id → clientes        |

---

## Flujo: Salida de Producción → Entrada pendiente en WMS

1. Se completa una **produccion_orden** (estado = 'Completado').
2. El sistema inserta uno o más registros en **entradas_pendientes** (producto_final_id, cantidad_producida, estado = 'Pendiente').
3. En el módulo **WMS (Cámaras de Congelado)** se listan las entradas pendientes.
4. El usuario elige posición, referencia de ingreso, etc., y confirma: se crea un **movimiento** tipo 'Ingreso', sus **movimiento_detalles** y los **stock_posiciones** correspondientes.
5. Se actualiza **entradas_pendientes**: estado = 'Convertido', movimiento_id = id del movimiento creado.

---

## Notas para la migración

- Crear **recepciones**, **lotes**, **insumos**, **produccion_ordenes**, **entradas_pendientes**, **salidas** en ese orden por FKs.
- Añadir **stock_posiciones.lote_id** (FK a lotes, nullable) en la misma migración o en una posterior para trazabilidad.
- Usar `uuid_generate_v4()` y triggers `update_updated_at_column()` coherentes con el resto del esquema.
