# Guía de Inicio Rápido

**¿Vas a usar la app en otro PC?** → Ver **[DESPLIEGUE.md](DESPLIEGUE.md)** para empaquetar y ejecutar en equipo destino.  
**¿Prefieres subirla a internet para pruebas?** → Ver **[SUBIR-INTERNET.md](SUBIR-INTERNET.md)** (Render.com, gratis).

## Prerrequisitos

Antes de ejecutar el proyecto, asegúrate de tener instalado:

1. **Node.js** (versión 18 o superior) - [Descargar aquí](https://nodejs.org/)
2. **PostgreSQL** (versión 14 o superior) - [Descargar aquí](https://www.postgresql.org/download/)

## Pasos para Ejecutar

### 1. Instalar Node.js (si no lo tienes)

Descarga e instala Node.js desde https://nodejs.org/
- Esto también instalará npm automáticamente
- Verifica la instalación ejecutando: `node --version` y `npm --version`

### 2. Configurar Base de Datos

1. Abre PostgreSQL y crea la base de datos:
```sql
CREATE DATABASE wms_db;
```

2. Ejecuta el script de esquema:
```bash
psql -U postgres -d wms_db -f database/schema.sql
```

Si ya tenías la base creada, ejecuta además estas migraciones (en este orden):
```bash
cd database
# o desde la raíz del proyecto: psql -U postgres -d wms_db -f database/nombre.sql
psql -U postgres -d wms_db -f add_posicion_bloqueada.sql
psql -U postgres -d wms_db -f add_despachos_movimiento_id.sql
psql -U postgres -d wms_db -f add_peso_adicional_despacho_detalles.sql
psql -U postgres -d wms_db -f add_peso_adicional_movimiento_detalles.sql
psql -U postgres -d wms_db -f allow_zero_bultos_despacho_detalles.sql
psql -U postgres -d wms_db -f allow_zero_bultos_stock_posiciones.sql
psql -U postgres -d wms_db -f add_numero_guia_movimientos.sql
psql -U postgres -d wms_db -f add_tipo_linea_movimiento_detalles.sql
psql -U postgres -d wms_db -f add_config_fuentes.sql
```

**Desde la raíz del proyecto** (reemplaza `postgres` y `wms_db` si usas otros):
```bash
psql -U postgres -d wms_db -f database/add_posicion_bloqueada.sql
psql -U postgres -d wms_db -f database/add_despachos_movimiento_id.sql
psql -U postgres -d wms_db -f database/add_peso_adicional_despacho_detalles.sql
psql -U postgres -d wms_db -f database/add_peso_adicional_movimiento_detalles.sql
psql -U postgres -d wms_db -f database/allow_zero_bultos_despacho_detalles.sql
psql -U postgres -d wms_db -f database/allow_zero_bultos_stock_posiciones.sql
psql -U postgres -d wms_db -f database/add_numero_guia_movimientos.sql
psql -U postgres -d wms_db -f database/add_tipo_linea_movimiento_detalles.sql
psql -U postgres -d wms_db -f database/add_config_fuentes.sql
```

**Script rápido (Windows):** desde la carpeta `database`, ejecuta `run-migrations.bat` (edita usuario y base dentro del .bat si hace falta).  
**Linux/Mac:** `cd database && chmod +x run-migrations.sh && ./run-migrations.sh`

**Nota:** La tabla `configuracion_usuario` y las opciones de tamaños de texto en Configuración se crean automáticamente al arrancar el backend. No es obligatorio ejecutar `configuracion_usuario.sql` ni `add_config_fuentes.sql` a mano.

### 3. Configurar Variables de Entorno

El archivo `.env` ya está creado en `backend/.env`. Si necesitas cambiarlo, edítalo con tus credenciales de PostgreSQL.

### 4. Instalar Dependencias

**Backend:**
```bash
cd backend
npm install
```

**Frontend:**
```bash
cd frontend
npm install
```

### 5. Crear Usuario Administrador

```bash
cd backend
npm run init-admin
```

Esto creará un usuario con:
- Email: admin@wms.com
- Contraseña: admin123

### 6. Iniciar Servidores

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
```
El servidor estará en: http://localhost:5000

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```
La aplicación estará en: http://localhost:3000

### 7. Acceder a la Aplicación

1. Abre tu navegador en: http://localhost:3000
2. Inicia sesión con:
   - Email: admin@wms.com
   - Contraseña: admin123

## Scripts de Inicio Rápido (Windows)

Si prefieres usar scripts, puedes crear estos archivos:

**iniciar-backend.bat:**
```batch
@echo off
cd backend
npm run dev
pause
```

**iniciar-frontend.bat:**
```batch
@echo off
cd frontend
npm run dev
pause
```

## Solución de Problemas

### Error: "npm no se reconoce"
- Node.js no está instalado o no está en el PATH
- Reinstala Node.js y asegúrate de marcar la opción "Add to PATH"

### Error de conexión a PostgreSQL
- Verifica que PostgreSQL esté corriendo
- Revisa las credenciales en `backend/.env`
- Asegúrate de que la base de datos `wms_db` exista

### Error al iniciar sesión
- Verifica que el usuario administrador haya sido creado (`npm run init-admin`)
- Revisa la consola del backend para ver errores

## Estructura de Navegación Implementada

✅ **Almacenes** → Lista de almacenes con barras de progreso
✅ **Crear Almacén** → Formulario modal para crear nuevos almacenes
✅ **Carriles** → Vista de carriles por almacén con estadísticas
✅ **Nivel-Posición** → Matriz visual con colores por estado
✅ **Posición** → Detalle de posición (placeholder)

## Funcionalidades de Almacenes

### Crear Almacén
- Botón "Crear Almacén" en la vista principal
- Formulario con validación completa:
  - Nombre del almacén (mínimo 3 caracteres)
  - Cantidad de carriles (1-50)
  - Cantidad de niveles (1-20)
  - Posiciones por nivel (1-30)
- Resumen en tiempo real del total de espacios
- Validación de límites (máximo 10,000 espacios totales)
- Generación automática de carriles, niveles y posiciones

### Navegación Jerárquica
- **Almacenes** → Click en almacén → **Carriles**
- **Carriles** → Click en carril → **Nivel-Posición**
- **Nivel-Posición** → Click en posición → **Detalle Posición**
- Botón "Regresar" en cada nivel para volver atrás

### Lógica de Colores
- 🟢 **Verde**: Posición disponible
- 🔴 **Rojo**: Ocupada por un solo producto/lote
- 🟠 **Naranja/Amarillo**: Mixta (varios productos o lotes)

---

## Checklist para pruebas

Después de aplicar las migraciones y levantar backend y frontend, puedes probar:

### Despachos
- **Bultos + saldo**: Ingresar producto con bultos y peso adicional (kg). Al agregar a “Productos a dar salida”, debe cargarse bultos y saldo completo.
- **Solo saldo**: En una línea de despacho poner 0 bultos y solo “Saldo (kg)” → debe permitir guardar y marcar Despachado.
- **Resto con saldo**: Ingresar ej. 5 cajas + 3 kg, despachar 3 cajas + 2 kg → debe quedar 2 cajas + 1 kg en Vista posición.
- **Tipo “Otros”**: En nuevo despacho elegir tipo “Otros” → debe mostrarse el campo “Fecha de salida”.

### Movimientos
- **Ajuste en posición**: En una posición, editar un producto (cambiar bultos o peso adicional) y guardar. En **Movimientos** abrir ese movimiento → debe verse una fila **Antes** y una **Después** con los valores correspondientes.

### Stock y posiciones
- En **Stock** y en **Vista posición** deben verse bultos, peso adj. (kg) y total kg por línea.
- Después de un despacho parcial, la posición debe mostrar el resto (bultos + saldo) correcto.

¡Listo para probar la creación y navegación de almacenes!
