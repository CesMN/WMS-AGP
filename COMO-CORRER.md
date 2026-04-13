# Cómo correr el proyecto en local

## 1. Base de datos PostgreSQL

- **PostgreSQL** debe estar instalado y en ejecución (puerto 5432).
- Crea la base de datos y el usuario si aún no existen:

```sql
CREATE USER postgres WITH PASSWORD 'postgres';  -- si usas otro usuario/contraseña, ajusta backend/.env
CREATE DATABASE wms_db OWNER postgres;
```

- Si tu usuario o contraseña son distintos, edita `backend/.env` (DB_USER, DB_PASSWORD).

### Aplicar el esquema y migraciones

Desde la raíz del proyecto, con `psql` o un cliente PostgreSQL conectado a `wms_db`:

```bash
# Entrar a la base
psql -U postgres -d wms_db

# Ejecutar esquema base (en orden)
\i database/schema.sql

# Migraciones adicionales (si existen en database/)
\i database/configuracion_usuario.sql
\i database/add_config_fuentes.sql
# ... y el resto de add_*.sql si los hay
```

O desde PowerShell (ajusta usuario/contraseña si no son postgres/postgres):

```powershell
cd c:\Users\Admin\wms-system-desarrollo
$env:PGPASSWORD = "postgres"; psql -U postgres -d wms_db -f database/schema.sql
```

### Crear usuario administrador

Después de tener las tablas creadas:

```powershell
cd backend
npm run init-admin
```

Credenciales por defecto: **admin@wms.com** / **admin123**

---

## 2. Arrancar backend y frontend

**Terminal 1 – Backend (API):**

```powershell
cd c:\Users\Admin\wms-system-desarrollo\backend
npm run dev
```

API: http://localhost:5000

**Terminal 2 – Frontend (Vite):**

```powershell
cd c:\Users\Admin\wms-system-desarrollo\frontend
npm run dev
```

App web: http://localhost:5173 (Vite usa proxy al backend en 5000).

---

## Resumen rápido

1. PostgreSQL corriendo → crear `wms_db` y usuario (o ajustar `.env`).
2. Ejecutar `database/schema.sql` (y migraciones si aplica).
3. `cd backend` → `npm run init-admin`.
4. Terminal 1: `cd backend` → `npm run dev`.
5. Terminal 2: `cd frontend` → `npm run dev`.
6. Abrir http://localhost:5173 e iniciar sesión con admin@wms.com / admin123.
