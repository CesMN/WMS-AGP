# Siguientes pasos – Producción y Almacenamiento

## Lo que ya está implementado

- **Empaque**: Enviar a cámara (parihuelas), tabla por hora, editar/eliminar en tránsito, múltiples parihuelas por capacidad.
- **Recepción de parihuelas**: Lotes arriba, en tránsito/recepcionadas, ubicación, reabrir, selector de posición con “Nivel + Posición” y estado (Vacía/Ocupada/Mix).
- **Rótulo**: QR, ubicación, contenido, Cliente + Especie (desde lote de la vista), tabla, total.
- **Control de producción**: Totales envasado/congelado/empaque, env. cámara, validado cámara, asignación OP, “Validar y aplicar a OP” (con totales coincidentes, empaque finalizado y todo recepcionado en cámara).
- **Integración**: Stock se actualiza al recepcionar; al aplicar a OP se descuenta de las líneas de orden de exportación.
- **Validación cámara**: No se puede “Validar y aplicar a OP” si hay parihuelas en tránsito; no se puede “Finalizar empaque” si hay parihuelas en tránsito.
- **Historial de parihuelas**: Vista por lote con listado de todas las parihuelas (en tránsito + recepcionadas), fecha, producto, cantidad, estado, ubicación y opción de ver rótulo.
- **Recepción de parihuelas**: Refresco automático cada 30 s cuando hay ítems en tránsito y al volver a la pestaña (visibilitychange).

---

## Sugerencias para continuar (por prioridad)

### 1. **Validar “todo en cámara” antes de aplicar a OP** (recomendado)

- **Qué**: No permitir “Validar y aplicar a OP” si algún producto del lote tiene **validado_camara === false** (hay parihuelas enviadas a cámara que aún no están recepcionadas).
- **Por qué**: Así solo se aplica a la OP producción que ya está físicamente en almacén.
- **Dónde**: En Control de producción (frontend y backend en `aplicar-op`): añadir comprobación de que todos los productos con envío a cámara tengan `validado_camara === true` (o null si no enviaron nada).

### 2. **Bloquear “Finalizar empaque” si hay parihuelas en tránsito**

- No permitir finalizar empaque mientras existan parihuelas del lote en estado EN_TRANSITO.
- Opcional: permitir finalizar pero mostrar advertencia clara de que quedan parihuelas sin recepcionar.

### 3. **Vista o reporte de historial de parihuelas por lote** ✅

- Listado/filtro por lote de todas las parihuelas (en tránsito + recepcionadas) con fecha, producto, cantidad, ubicación.
- Útil para trazabilidad y auditoría.
- *Implementado: vista "Historial parihuelas" en Almacenamiento.*

### 4. **Despachos y stock de producción** ✅

- Verificar que los despachos puedan elegir stock que proviene de parihuelas recepcionadas (posiciones con ese producto/lote).
- Si hace falta, ajustar filtros o criterios de selección de stock por cliente/especie/lote.
- *Implementado: GET /api/stock/lineas usa LEFT JOIN cliente/especie para no excluir stock; filtro opcional por "lote" (código lote producción). En Despachos se añadió filtro "Lote prod." al selector de stock.*

### 5. **Ajustes de UX** (parcial ✅)

- En Recepción de parihuelas: refrescar automáticamente la lista al volver a la pestaña o cada 30 s si hay ítems en tránsito. *Implementado.*
- En Control de producción: tooltip o mensaje claro cuando “Validar y aplicar a OP” está deshabilitado por totales o por cámara no validada. *Implementado (tooltip en el botón).*

### 6. **Pruebas y documentación**

- Documentar en un flujo (o README) el camino: Empaque → Enviar a cámara → Recepción de parihuelas → Control de producción → Aplicar a OP.
- Pruebas manuales de ese flujo y de reabrir recepción / reabrir empaque (si aplica).

---

## Orden recomendado

1. Implementar **validación de “validado cámara”** antes de aplicar a OP (ítem 1).
2. Luego, según necesidad: bloqueo o advertencia al **finalizar empaque con parihuelas en tránsito** (ítem 2).
3. Después, **historial de parihuelas** y revisión de **despachos/stock** (ítems 3 y 4).

Si indicas por cuál quieres empezar (por ejemplo “el 1”), se puede bajar a tareas concretas de backend y frontend y escribir el código paso a paso.
