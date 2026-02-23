# Guía de Instalación - Sistema de Gestión de Almacenes

## Prerrequisitos

Antes de comenzar, asegúrate de tener instalado:

- **Node.js** (versión 18 o superior)
- **PostgreSQL** (versión 14 o superior)
- **npm** o **yarn**

## Paso 1: Configurar la Base de Datos

1. Abre PostgreSQL y crea una nueva base de datos:

```sql
CREATE DATABASE wms_db;
```

2. Ejecuta el script de esquema SQL:

```bash
# Desde la raíz del proyecto
psql -U postgres -d wms_db -f database/schema.sql
```

O desde pgAdmin o cualquier cliente PostgreSQL, ejecuta el contenido del archivo `database/schema.sql`.

## Paso 2: Configurar el Backend

1. Navega a la carpeta del backend:

```bash
cd backend
```

2. Instala las dependencias:

```bash
npm install
```

3. Crea el archivo de configuración `.env`:

```bash
# Copia el archivo de ejemplo
cp .env.example .env
```

4. Edita el archivo `.env` con tus credenciales:

```env
PORT=5000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=wms_db
DB_USER=postgres
DB_PASSWORD=tu_contraseña_postgres
JWT_SECRET=tu_secreto_jwt_muy_seguro_aqui_cambiar_en_produccion
NODE_ENV=development
```

5. Crea el usuario administrador inicial:

```bash
npm run init-admin
```

Esto creará un usuario con:
- **Email**: admin@wms.com
- **Contraseña**: admin123

⚠️ **IMPORTANTE**: Cambia la contraseña después del primer inicio de sesión.

6. Inicia el servidor backend:

```bash
npm run dev
```

El servidor estará disponible en `http://localhost:5000`

## Paso 3: Configurar el Frontend

1. Abre una nueva terminal y navega a la carpeta del frontend:

```bash
cd frontend
```

2. Instala las dependencias:

```bash
npm install
```

3. Inicia el servidor de desarrollo:

```bash
npm run dev
```

La aplicación estará disponible en `http://localhost:3000`

## Paso 4: Acceder a la Aplicación

1. Abre tu navegador y ve a `http://localhost:3000`
2. Inicia sesión con las credenciales:
   - **Email**: admin@wms.com
   - **Contraseña**: admin123

## Verificación

Para verificar que todo está funcionando correctamente:

1. **Backend**: Visita `http://localhost:5000/api/health` - Deberías ver un mensaje de estado OK
2. **Frontend**: Deberías poder iniciar sesión y ver el Dashboard

## Solución de Problemas

### Error de conexión a la base de datos

- Verifica que PostgreSQL esté corriendo
- Revisa las credenciales en el archivo `.env`
- Asegúrate de que la base de datos `wms_db` exista

### Error al iniciar sesión

- Verifica que el usuario administrador haya sido creado (`npm run init-admin`)
- Revisa la consola del backend para ver errores

### Error de módulos no encontrados

- Ejecuta `npm install` nuevamente en ambas carpetas (backend y frontend)
- Elimina `node_modules` y `package-lock.json` y vuelve a instalar

## Próximos Pasos

Una vez que tengas el sistema funcionando:

1. Cambia la contraseña del administrador
2. Crea usuarios adicionales según sea necesario
3. Configura las especies, clientes y productos iniciales
4. Crea tu primer almacén

## Estructura de Carpetas

```
wms-system/
├── backend/              # API REST
│   ├── config/          # Configuración (base de datos)
│   ├── middleware/      # Middlewares (autenticación)
│   ├── routes/          # Rutas de la API
│   ├── scripts/         # Scripts de utilidad
│   └── server.js        # Punto de entrada
├── frontend/            # Aplicación React
│   ├── src/
│   │   ├── components/  # Componentes reutilizables
│   │   ├── contexts/    # Contextos de React
│   │   ├── pages/       # Páginas/Vistas
│   │   └── App.jsx      # Componente principal
│   └── package.json
├── database/            # Scripts SQL
│   └── schema.sql       # Esquema completo
└── README.md
```
