# Despliegue y pruebas en otro equipo (WMS)

Esta guía permite empaquetar el sistema y ejecutarlo en un PC distinto para pruebas.

---

## En el PC de desarrollo (origen)

### 1. Empaquetar

Ejecuta en la raíz del proyecto:

```batch
empaquetar.bat
```

Eso hará:

- `npm install` en backend y frontend
- `npm run build` en frontend (genera `frontend/dist`)

### 2. Qué copiar al PC destino

Copia **toda la carpeta del proyecto** `wms-system` al otro equipo (USB, red, etc.), incluyendo:

- `backend/` (con `node_modules` para no tener que instalar en destino si no hay internet)
- `frontend/` (con `node_modules` y **con la carpeta `dist`** ya generada)
- `database/`
- Archivos de la raíz: `iniciar-produccion.bat`, `build-frontend.bat`, `DESPLIEGUE.md`, `INICIAR.md`, etc.

**Opcional (si prefieres ahorrar espacio):** Copia sin `node_modules` y en el PC destino ejecuta `npm install` en `backend` y en `frontend`, y luego `npm run build` en `frontend` (o ejecuta de nuevo `empaquetar.bat` en destino si tienes Node allí).

---

## En el PC destino

### Requisitos

1. **Node.js** (v18 o superior): https://nodejs.org/
2. **PostgreSQL** (v14 o superior): https://www.postgresql.org/download/

### Pasos

#### 1. Instalar Node.js y PostgreSQL

- Instala Node.js (incluye npm).
- Instala PostgreSQL y anota la contraseña del usuario `postgres`.

#### 2. Crear la base de datos

Abre **psql** o **pgAdmin** y ejecuta:

```sql
CREATE DATABASE wms_db;
```

#### 3. Ejecutar esquema e iniciales

Desde la carpeta del proyecto (donde está `database/`):

**Windows (PowerShell o CMD):**

```batch
psql -U postgres -d wms_db -f database\schema.sql
```

**Linux/Mac:**

```bash
psql -U postgres -d wms_db -f database/schema.sql
```

Ajusta `-U postgres` si tu usuario de PostgreSQL es otro.

#### 4. Aplicar migraciones

**Windows:** desde la carpeta `database`, ejecuta:

```batch
run-migrations.bat
```

(Edita dentro del `.bat` las variables `USUARIO` y `BASE` si no usas `postgres` / `wms_db`.)

**Linux/Mac:**

```bash
cd database
chmod +x run-migrations.sh
./run-migrations.sh
```

#### 5. Configurar variables de entorno

En la carpeta `backend`:

- Copia `.env.example` a `.env` (si no existe ya).
- Edita `.env` con los datos de PostgreSQL del PC destino, por ejemplo:

```env
PORT=5000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=wms_db
DB_USER=postgres
DB_PASSWORD=tu_contraseña_postgres
JWT_SECRET=un_secreto_cualquiera_muy_largo_y_seguro
NODE_ENV=production
```

#### 6. (Opcional) Instalar dependencias en destino

Si **no** copiaste `node_modules`:

```batch
cd backend
npm install
cd ..\frontend
npm install
npm run build
cd ..
```

#### 7. Crear usuario administrador

Solo la primera vez:

```batch
cd backend
npm run init-admin
```

Se crea un usuario:

- **Email:** admin@wms.com  
- **Contraseña:** admin123  

(cámbiala después desde la app.)

#### 8. Iniciar la aplicación

En la raíz del proyecto ejecuta:

```batch
iniciar-produccion.bat
```

Se abrirá el servidor en **http://localhost:5000**. La misma URL sirve la API y la interfaz web.

#### 9. Acceder

1. Abre el navegador en: **http://localhost:5000**
2. Inicia sesión con `admin@wms.com` / `admin123`

---

## Resumen rápido (PC destino)

1. Instalar Node.js y PostgreSQL.  
2. Crear BD `wms_db`, ejecutar `schema.sql` y `run-migrations.bat` (o `.sh`).  
3. En `backend`, copiar `.env.example` a `.env` y configurarlo.  
4. `cd backend` → `npm run init-admin` (solo primera vez).  
5. En la raíz: `iniciar-produccion.bat`.  
6. Abrir **http://localhost:5000** e iniciar sesión.

---

## Solución de problemas

- **"Error de conexión a la base de datos"**: Revisa que PostgreSQL esté en ejecución y que `backend\.env` tenga bien `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`.
- **Página en blanco o 404**: Asegúrate de haber ejecutado `build-frontend.bat` (o `npm run build` en `frontend`) para que exista `frontend/dist`. Luego inicia con `iniciar-produccion.bat`.
- **"npm no se reconoce"**: Node.js no está en el PATH; reinstala Node.js y marca "Add to PATH".
