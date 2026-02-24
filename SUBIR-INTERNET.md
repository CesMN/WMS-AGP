# Subir WMS a internet para pruebas

Puedes dejar la app en la nube y acceder con un enlace (por ejemplo **https://tu-app.onrender.com**) sin instalar nada en otro PC.

Usamos **Render.com** (plan gratuito): backend + frontend + base de datos PostgreSQL en un solo lugar.

---

## Requisitos

- Cuenta en **GitHub** (gratis): https://github.com
- Cuenta en **Render** (gratis): https://render.com

---

## Pasos (resumen)

1. Subir el proyecto a GitHub.
2. En Render, crear un **Web Service** + **PostgreSQL** conectados al repo.
3. Configurar variables de entorno y comando de inicio.
4. Una vez desplegado, ejecutar **una sola vez** el esquema y migraciones en la base de datos.
5. Crear el usuario admin y abrir la URL de la app.

---

## 1. Subir el proyecto a GitHub

1. Crea un repositorio nuevo en GitHub (por ejemplo `wms-system`), **sin** inicializar con README.
2. En la carpeta del proyecto (donde está `backend`, `frontend`, etc.) abre terminal y ejecuta:

```bash
git init
git add .
git commit -m "Initial commit - WMS"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/wms-system.git
git push -u origin main
```

(Sustituye `TU_USUARIO` por tu usuario de GitHub.)

Si ya usas Git, solo asegúrate de tener un `git remote` apuntando a ese repo y haz `git push`.

---

## 2. Crear el servicio en Render

1. Entra en https://dashboard.render.com e inicia sesión (puedes usar “Sign in with GitHub”).
2. **Crear base de datos**
   - Clic en **New** → **PostgreSQL**.
   - **Name:** `wms-db` (o el que quieras).
   - **Region:** el más cercano (por ejemplo Oregon).
   - **Plan:** Free.
   - **Create Database**.
   - Cuando esté creada, entra al servicio y en **Info** copia:
     - **Internal Database URL** (la usarás en el backend).

3. **Crear Web Service (la app)**
   - **New** → **Web Service**.
   - Conecta tu cuenta de GitHub si no lo has hecho y elige el repositorio `wms-system`.
   - Configura:
     - **Name:** `wms-app` (o el que quieras).
     - **Region:** la misma que la base de datos.
     - **Branch:** `main`.
     - **Runtime:** Node.
     - **Build Command** (usa **--include=dev** en frontend para que se instale Vite; en Render con NODE_ENV=production si no, falla "vite: not found"):
       ```bash
       cd frontend && npm install --include=dev && npm run build && cd ../backend && npm install
       ```
     - **Start Command:**
       ```bash
       cd backend && node server.js
       ```
     - Si prefieres usar el script de la raíz (ya hay un `package.json` en la raíz):  
       Build: `npm run build`  
       Start: `npm start`
     - **Plan:** Free.

4. **Variables de entorno** (en el Web Service, pestaña **Environment**):
   - `NODE_ENV` = `production`
   - `SERVE_FRONTEND` = `1`
   - `DATABASE_URL` = pega aquí la **Internal Database URL** que copiaste del PostgreSQL.
   - `JWT_SECRET` = un texto largo y aleatorio (por ejemplo generado en https://generate-secret.vercel.app/32).

5. **Create Web Service**. Render construirá la app y la desplegará. La primera vez puede tardar unos minutos.

---

## 3. Ejecutar esquema y migraciones (solo la primera vez)

La base de datos en Render empieza vacía. Hay que crear tablas y migraciones **una sola vez**.

**Opción A – Desde tu PC (recomendado)**

1. En el servicio **PostgreSQL** de Render, en **Info** copia la **External Database URL** (permite conexión desde fuera de Render).
2. En tu PC, en la carpeta del proyecto:

```bash
# Crear tablas (ajusta la URL con tu External Database URL)
set PGPASSWORD=xxx
psql "postgres://usuario:contraseña@dpg-xxxx-a.oregon-postgres.render.com/wms_db?sslmode=require" -f database/schema.sql
```

En Windows (PowerShell), con `psql` en el PATH:

```powershell
cd database
$url = "postgres://USUARIO:CONTRA@host.render.com/wms_db?sslmode=require"   # Pega tu External Database URL
psql $url -f schema.sql
psql $url -f add_posicion_bloqueada.sql
psql $url -f add_despachos_movimiento_id.sql
psql $url -f add_peso_adicional_despacho_detalles.sql
psql $url -f add_peso_adicional_movimiento_detalles.sql
psql $url -f allow_zero_bultos_despacho_detalles.sql
psql $url -f allow_zero_bultos_stock_posiciones.sql
psql $url -f add_tipo_linea_movimiento_detalles.sql
psql $url -f add_config_fuentes.sql
psql $url -f add_numero_guia_movimientos.sql
psql $url -f add_cliente_origen_despachos.sql
psql $url -f despacho_detalles_allow_null_stock_posicion.sql
```

(Sustituye `$url` por tu **External Database URL** completa de Render.)

**Opción B – Desde Render Shell**

1. En el **Web Service** (wms-app), pestaña **Shell**.
2. Ahí no suele estar `psql`. La opción más sencilla es usar la **Opción A** desde tu máquina con la External Database URL.

Cuando hayas ejecutado `schema.sql` y las migraciones, las tablas ya quedarán creadas.

---

## 4. Crear usuario administrador

Desde tu PC, con la **External Database URL** de la base de Render:

1. En la carpeta del proyecto, crea en `backend` un `.env` que solo tenga (temporalmente) la URL de Render:
   ```env
   DATABASE_URL=postgres://... (External Database URL de Render)
   ```
2. En esa misma carpeta:

```bash
cd backend
npm run init-admin
```

Eso crea el usuario **admin@wms.com** / **admin123**. Después puedes borrar o cambiar ese `.env` local si no quieres usarlo más.

---

## 5. Usar la app en internet

1. En Render, en tu **Web Service** (wms-app), en **Info** verás la URL pública, por ejemplo:
   - `https://wms-app-xxxx.onrender.com`
2. Ábrela en el navegador.
3. Inicia sesión con **admin@wms.com** / **admin123**.

Cualquier persona con el enlace puede hacer pruebas (si quieres restringir acceso después, se puede añadir autenticación extra o restricción por IP en Render).

---

## Cómo agregar estos cambios al entorno en internet

Cuando modifiques el código (por ejemplo: permitir 0 bultos + saldo en el formulario de ingreso) y quieras que se refleje en la app desplegada en Render:

1. **Sube los cambios a GitHub** desde tu PC:
   ```bash
   git add .
   git commit -m "Descripción del cambio (ej: permitir 0 bultos con peso adicional)"
   git push origin main
   ```

2. **Render** suele tener activado el **auto-deploy**: al hacer push a `main`, vuelve a construir y desplegar la app. Espera unos minutos y recarga la URL de tu Web Service.

3. Si el auto-deploy está desactivado: en el Dashboard de Render → tu **Web Service** → **Manual Deploy** → **Deploy latest commit**.

No hace falta tocar la base de datos ni las variables de entorno para cambios solo de código (frontend/backend). Solo vuelve a ejecutar migraciones si añadiste nuevas.

---

## Notas

- **Plan gratuito de Render:** el servicio se “duerme” tras unos minutos sin uso; la primera petición puede tardar ~30–50 segundos en responder.
- **Base de datos:** el PostgreSQL gratuito tiene límites de uso; para pruebas suele ser suficiente.
- Si cambias código y vuelves a hacer **push** a `main`, Render puede estar configurado para redesplegar solo; si no, en el Dashboard del Web Service usa **Manual Deploy** → **Deploy latest commit**.

### Si sale "Could not read package.json" o "ENOENT package.json"

- **Causa:** El Build Command tiene `npm install` al principio; en la raíz no había `package.json`.
- **Solución 1:** Usa este Build Command **sin** nada delante: `cd frontend && npm install --include=dev && npm run build && cd ../backend && npm install`
- **Solución 2:** Con el `package.json` en la raíz que ya tiene el proyecto: Build = `npm run build`, Start = `npm start`.

### Si sale "vite: not found" o "Build failed" al hacer `vite build`

- **Causa:** En Render, con `NODE_ENV=production`, `npm install` no instala **devDependencies**, y Vite está en devDependencies del frontend.
- **Solución:** En el Build Command, en la parte del frontend usa `npm install --include=dev` (no solo `npm install`):
  ```bash
  cd frontend && npm install --include=dev && npm run build && cd ../backend && npm install
  ```
  O si usas el script de la raíz, el `package.json` de la raíz ya lleva `--include=dev`; sube ese cambio a GitHub y vuelve a desplegar.

Si prefieres no usar GitHub, Render también permite deploy desde **zip**: en **New** → **Web Service** puedes elegir “Deploy from ZIP” y subir el proyecto empaquetado (sin `node_modules`), y configurar Build/Start y variables igual que arriba.
