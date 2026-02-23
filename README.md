# Sistema de Gestión de Almacenes (WMS)

Sistema completo de gestión de almacenes para cámaras de congelamiento.

## Stack Tecnológico

- **Frontend**: React.js + Vite + Tailwind CSS + Lucide React
- **Backend**: Node.js + Express.js
- **Base de Datos**: PostgreSQL
- **Autenticación**: JWT

## Estructura del Proyecto

```
wms-system/
├── backend/          # API REST con Express
├── frontend/         # Aplicación React
└── database/         # Scripts SQL
```

## Instalación

### Prerrequisitos

- Node.js 18+ 
- PostgreSQL 14+
- npm o yarn

### Base de Datos

1. Crear una base de datos PostgreSQL:
```sql
CREATE DATABASE wms_db;
```

2. Ejecutar el script de esquema:
```bash
psql -U postgres -d wms_db -f database/schema.sql
```

### Backend

1. Navegar a la carpeta backend:
```bash
cd backend
```

2. Instalar dependencias:
```bash
npm install
```

3. Configurar variables de entorno:
```bash
cp .env.example .env
# Editar .env con tus credenciales de PostgreSQL
```

4. Iniciar el servidor:
```bash
npm run dev
```

El servidor estará disponible en `http://localhost:5000`

### Frontend

1. Navegar a la carpeta frontend:
```bash
cd frontend
```

2. Instalar dependencias:
```bash
npm install
```

3. Iniciar el servidor de desarrollo:
```bash
npm run dev
```

La aplicación estará disponible en `http://localhost:3000`

## Credenciales por Defecto

- **Email**: admin@wms.com
- **Contraseña**: admin123 (debe cambiarse en producción)

## Características Implementadas

✅ Esquema de base de datos completo
✅ Sistema de autenticación con JWT
✅ Login funcional
✅ Layout principal con Sidebar colapsable
✅ Modo oscuro/claro global
✅ Información de usuario en el footer del menú
✅ Navegación entre vistas

## Próximos Pasos

- Implementar todas las vistas restantes
- Agregar gráficos al Dashboard
- Implementar CRUD completo para todas las entidades
- Agregar exportación a PDF y Excel
- Implementar sistema de permisos por roles

## Licencia

ISC
