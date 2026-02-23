import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useConfig } from '../../contexts/ConfigContext'
import { useState, useEffect } from 'react'
import {
  LayoutDashboard,
  Warehouse,
  Package,
  Truck,
  Move,
  Users,
  Fish,
  Box,
  Building2,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Moon,
  Sun,
  LogOut,
  ArrowDownToLine,
  ArrowUpFromLine,
  History,
} from 'lucide-react'
import toast from 'react-hot-toast'

const Sidebar = ({ collapsed, onToggle, darkMode, onToggleDarkMode }) => {
  const { user, logout } = useAuth()
  const { logoEmpresa, tamañoLogo } = useConfig()
  const location = useLocation()
  const [movimientosOpen, setMovimientosOpen] = useState(() => location.pathname.startsWith('/movimientos'))
  useEffect(() => {
    if (location.pathname.startsWith('/movimientos')) setMovimientosOpen(true)
  }, [location.pathname])

  const handleLogout = () => {
    logout()
    toast.success('Sesión cerrada exitosamente')
  }

  const esSoloUsuario = (user?.rol || '').toLowerCase() === 'usuario'

  const menuItems = [
    { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/almacenes', icon: Warehouse, label: 'Almacenes' },
    { path: '/stock', icon: Package, label: 'Stock' },
    { path: '/despachos', icon: Truck, label: 'Despachos' },
    ...(esSoloUsuario ? [] : [{ path: '/usuarios', icon: Users, label: 'Usuarios' }]),
    { path: '/especies', icon: Fish, label: 'Especies' },
    { path: '/productos', icon: Box, label: 'Productos' },
    { path: '/clientes', icon: Building2, label: 'Clientes' },
    { path: '/configuracion', icon: Settings, label: 'Configuración' }
  ]

  return (
    <aside
      className={`fixed left-0 top-0 h-full bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transition-all duration-300 flex flex-col ${
        collapsed ? 'w-20' : 'w-64'
      }`}
    >
      {/* Header */}
{/* Cambiamos p-4 por pt-1 (padding-top) pb-4 (padding-bottom) px-4 (padding horizontal) */}
<div className="pt-1 pb-0 px-4 border-b border-gray-200 dark:border-gray-700">
  <div className="flex items-center justify-between gap-1">
    {!collapsed && (
      <div className="flex flex-col gap-1 min-w-0 flex-1">
        {logoEmpresa && logoEmpresa.trim() ? (
          <img 
            src={logoEmpresa.trim()} 
            alt="Logo" 
            className="w-auto max-w-[200px] object-contain object-left -ml-1" // Agregué -ml-1 por si quieres pegarlo un poco más a la izquierda
            style={{ height: `${tamañoLogo || 48}px` }} 
          />
        ) : null}
        <h2 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">
          Sistema de Gestión de Almacenes
        </h2>
      </div>
    )}
          <button
            onClick={onToggle}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            title={collapsed ? 'Expandir menú' : 'Colapsar menú'}
          >
            {collapsed ? (
              <ChevronRight className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            ) : (
              <ChevronLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            )}
          </button>
        </div>
      </div>

      {/* Menú de navegación */}
      <nav className="flex-1 overflow-y-auto p-4">
        <ul className="space-y-2">
          {menuItems.slice(0, 4).map((item) => {
            const Icon = item.icon
            return (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      isActive
                        ? 'text-white'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    } ${collapsed ? 'justify-center' : ''}`
                  }
                  style={({ isActive }) => (isActive ? { backgroundColor: 'var(--color-primary, #2563eb)' } : undefined)}
                  title={collapsed ? item.label : ''}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  {!collapsed && <span className="font-medium">{item.label}</span>}
                </NavLink>
              </li>
            )
          })}
          {/* Movimientos desplegable */}
          <li>
            {collapsed ? (
              <NavLink
                to="/movimientos"
                className={({ isActive }) =>
                  `flex items-center justify-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive ? 'text-white' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`
                }
                style={({ isActive }) => (isActive ? { backgroundColor: 'var(--color-primary, #2563eb)' } : undefined)}
                title="Movimientos"
              >
                <Move className="w-5 h-5 flex-shrink-0" />
              </NavLink>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setMovimientosOpen((o) => !o)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors w-full text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700`}
                >
                  <Move className="w-5 h-5 flex-shrink-0" />
                  <span className="font-medium flex-1">Movimientos</span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${movimientosOpen ? 'rotate-180' : ''}`} />
                </button>
                {movimientosOpen && (
                  <ul className="mt-1 ml-4 pl-4 border-l-2 border-gray-200 dark:border-gray-600 space-y-1">
                    <li>
                      <NavLink
                        to="/movimientos/ingresos"
                        className={({ isActive }) =>
                          `flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                            isActive ? 'text-white' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                          }`
                        }
                        style={({ isActive }) => (isActive ? { backgroundColor: 'var(--color-primary, #2563eb)' } : undefined)}
                      >
                        <ArrowDownToLine className="w-4 h-4" />
                        Ingresos
                      </NavLink>
                    </li>
                    <li>
                      <NavLink
                        to="/movimientos/salidas"
                        className={({ isActive }) =>
                          `flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                            isActive ? 'text-white' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                          }`
                        }
                        style={({ isActive }) => (isActive ? { backgroundColor: 'var(--color-primary, #2563eb)' } : undefined)}
                      >
                        <ArrowUpFromLine className="w-4 h-4" />
                        Salidas
                      </NavLink>
                    </li>
                    {!esSoloUsuario && (
                    <li>
                      <NavLink
                        to="/movimientos"
                        className={({ isActive }) =>
                          `flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                            isActive ? 'text-white' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                          }`
                        }
                        style={({ isActive }) => (isActive ? { backgroundColor: 'var(--color-primary, #2563eb)' } : undefined)}
                      >
                        <History className="w-4 h-4" />
                        Historial
                      </NavLink>
                    </li>
                    )}
                  </ul>
                )}
              </>
            )}
          </li>
          {menuItems.slice(4).map((item) => {
            const Icon = item.icon
            return (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      isActive
                        ? 'text-white'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    } ${collapsed ? 'justify-center' : ''}`
                  }
                  style={({ isActive }) => (isActive ? { backgroundColor: 'var(--color-primary, #2563eb)' } : undefined)}
                  title={collapsed ? item.label : ''}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  {!collapsed && <span className="font-medium">{item.label}</span>}
                </NavLink>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Footer con info de usuario */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
        {/* Toggle Dark Mode */}
        <button
          onClick={onToggleDarkMode}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
            collapsed ? 'justify-center' : ''
          } text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700`}
          title={collapsed ? (darkMode ? 'Modo claro' : 'Modo oscuro') : ''}
        >
          {darkMode ? (
            <Sun className="w-5 h-5 flex-shrink-0" />
          ) : (
            <Moon className="w-5 h-5 flex-shrink-0" />
          )}
          {!collapsed && (
            <span className="font-medium">
              {darkMode ? 'Modo Claro' : 'Modo Oscuro'}
            </span>
          )}
        </button>

        {/* Información del usuario */}
        {!collapsed && user && (
          <div className="px-4 py-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">
              {user.nombre}
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-400 truncate">
              {user.email}
            </p>
            <p className="text-xs text-primary-600 dark:text-primary-400 mt-1">
              {user.rol}
            </p>
          </div>
        )}

        {/* Botón de cerrar sesión */}
        <button
          onClick={handleLogout}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 ${
            collapsed ? 'justify-center' : ''
          }`}
          title={collapsed ? 'Cerrar sesión' : ''}
        >
          <LogOut className="w-5 h-5 flex-shrink-0" />
          {!collapsed && <span className="font-medium">Cerrar Sesión</span>}
        </button>
      </div>
    </aside>
  )
}

export default Sidebar
