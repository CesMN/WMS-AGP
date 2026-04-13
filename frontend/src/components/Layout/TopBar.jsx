import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import MobileNavDrawer from './MobileNavDrawer'
import {
  Bell,
  Settings,
  Moon,
  Sun,
  User,
  LogOut,
  LayoutDashboard,
  Warehouse,
  Package,
  Truck,
  Users,
  Fish,
  Box,
  Building2,
  ChevronDown,
  Inbox,
  Layers,
  TruckIcon,
  Download,
  Store,
  PackagePlus,
  FileCheck,
  Factory,
  LayoutTemplate,
  ArrowDownToLine,
  ArrowUpFromLine,
  History,
  Ship,
  Container,
  FlaskConical,
  Snowflake,
  PackageCheck,
  Boxes,
  ClipboardList,
  LayoutGrid,
  FileText,
  Archive,
  CheckCheck,
  Trash2,
  Menu,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useConfig } from '../../contexts/ConfigContext'
import { useNotifications } from '../../contexts/NotificationsContext'
import toast from 'react-hot-toast'

const TopBar = ({ darkMode, onToggleDarkMode }) => {
  const { user, logout, canView } = useAuth()
  const esAdmin = (user?.rol || '').toLowerCase() === 'administrador'
  const { logoEmpresa, tamañoLogo, nombreEmpresa } = useConfig()
  const { items: notificaciones, unreadCount, loading: notificationsLoading, connected, markAsRead, markAllAsRead, dismissOne, dismissAll } = useNotifications()
  const navigate = useNavigate()
  const location = useLocation()
  const path = location.pathname
  const [openDropdown, setOpenDropdown] = useState(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, minWidth: 0 })
  const navRef = useRef(null)
  const refIngresos = useRef(null)
  const refProduccion = useRef(null)
  const refAlmacenamiento = useRef(null)
  const refExportaciones = useRef(null)
  const refInsumos = useRef(null)
  const refAdmin = useRef(null)

  const isIngresosActive = path.startsWith('/ingresos-mp') || path === '/recepcion'
  const isProduccionActive = path.startsWith('/produccion')
  const isAlmacenamientoActive = path.startsWith('/almacenes') || path.startsWith('/stock') || path.startsWith('/movimientos')
  const isExportacionesActive = path.startsWith('/exportaciones') || path.startsWith('/despachos')
  const isInsumosActive = path.startsWith('/insumos')
  const isAdminActive =
    path.startsWith('/usuarios') ||
    path.startsWith('/especies') ||
    path.startsWith('/productos') ||
    path.startsWith('/clientes') ||
    path.startsWith('/admin')

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (navRef.current && !navRef.current.contains(e.target)) {
        setOpenDropdown(null)
        setNotificationsOpen(false)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  useEffect(() => {
    setMobileMenuOpen(false)
    setOpenDropdown(null)
  }, [location.pathname])

  const handleLogout = () => {
    logout()
    toast.success('Sesión cerrada')
  }

  const toggleDropdown = (id) => {
    if (openDropdown === id) {
      setOpenDropdown(null)
      return
    }
    const ref = id === 'ingresos' ? refIngresos : id === 'produccion' ? refProduccion : id === 'insumos' ? refInsumos : id === 'almacenamiento' ? refAlmacenamiento : id === 'exportaciones' ? refExportaciones : refAdmin
    const el = ref?.current
    if (el) {
      const rect = el.getBoundingClientRect()
      const w = id === 'admin' ? 180 : id === 'insumos' ? 220 : 200
      setDropdownPosition({
        top: rect.bottom + 4,
        left: id === 'admin' ? rect.right - w : rect.left,
        minWidth: w,
      })
    }
    setOpenDropdown(id)
  }

  const closeDropdown = () => setOpenDropdown(null)

  const openNotificacion = async (n) => {
    if (!n?.leida_at) {
      try { await markAsRead(n.id) } catch (_) {}
    }
    setNotificationsOpen(false)
    const modulo = String(n?.modulo || '').toLowerCase()
    if (modulo.includes('insumo')) return navigate('/insumos/stock')
    if (modulo.includes('despacho')) return navigate('/despachos')
    if (modulo.includes('export')) return navigate('/exportaciones/ordenes-produccion')
    if (modulo.includes('producción') || modulo.includes('produccion')) return navigate('/produccion/control-produccion')
    if (modulo.includes('ingresos')) return navigate('/ingresos-mp/lotes')
    if (modulo.includes('admin')) return navigate('/admin/registro-actividad')
    return navigate('/dashboard')
  }

  const linkClass = ({ isActive }) =>
    `flex items-center gap-1.5 px-2.5 py-1.5 rounded-md transition-colors whitespace-nowrap ${
      isActive
        ? 'bg-primary-600 text-white'
        : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
    }`
  const linkStyle = { fontSize: 'var(--font-size-text, 13px)' }

  return (
    <header
      ref={navRef}
      className="sticky top-0 z-30 flex items-center justify-between gap-2 px-2 sm:px-3 py-2 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm min-h-[52px] safe-area-pt"
      style={{ fontSize: 'var(--font-size-text, 13px)' }}
    >
      {/* Logo + Sistema */}
      <div className="flex items-center gap-1.5 shrink-0 min-w-0">
        <button
          type="button"
          onClick={() => {
            setMobileMenuOpen(true)
            setOpenDropdown(null)
          }}
          className="lg:hidden flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
          aria-label="Abrir menú"
        >
          <Menu className="h-6 w-6" />
        </button>
        {logoEmpresa && logoEmpresa.trim() ? (
          <img
            src={logoEmpresa.trim()}
            alt="Logo"
            className="h-8 w-auto object-contain"
            style={{ height: `${Math.min(40, Math.max(28, tamañoLogo || 32))}px` }}
          />
        ) : (
          <div
            className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center shrink-0 text-white font-semibold"
            style={{ fontSize: '12px' }}
          >
            W
          </div>
        )}
        <div className="hidden sm:flex items-center gap-1.5 text-gray-800 dark:text-white font-medium">
          <Warehouse className="w-4 h-4 text-primary-600 dark:text-primary-400 shrink-0" />
          <span className="truncate max-w-[120px]">{nombreEmpresa || 'Panel WMS'}</span>
        </div>
      </div>

      {/* Navegación horizontal (escritorio / tablet ancha) */}
      <nav className="hidden lg:flex items-center gap-0.5 overflow-x-auto scrollbar-thin flex-1 justify-center min-w-0">
        <NavLink to="/dashboard" className={linkClass} style={linkStyle} onClick={closeDropdown}>
          <LayoutDashboard className="w-4 h-4 shrink-0" />
          Panel
        </NavLink>

        {/* Ingresos MP */}
        <div className="relative">
          <button
            ref={refIngresos}
            type="button"
            onClick={() => toggleDropdown('ingresos')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md transition-colors whitespace-nowrap ${
              openDropdown === 'ingresos' || isIngresosActive
                ? 'bg-primary-600 text-white'
                : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
            style={linkStyle}
          >
            <Truck className="w-4 h-4 shrink-0" />
            Ingresos MP
            <ChevronDown className="w-3.5 h-3.5 shrink-0" />
          </button>
        </div>

        {/* Producción */}
        <div className="relative">
          <button
            ref={refProduccion}
            type="button"
            onClick={() => toggleDropdown('produccion')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md transition-colors whitespace-nowrap ${
              openDropdown === 'produccion' || isProduccionActive
                ? 'bg-primary-600 text-white'
                : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
            style={linkStyle}
          >
            <Factory className="w-4 h-4 shrink-0" />
            Producción
            <ChevronDown className="w-3.5 h-3.5 shrink-0" />
          </button>
        </div>

        {/* Almacenamiento */}
        <div className="relative">
          <button
            ref={refAlmacenamiento}
            type="button"
            onClick={() => toggleDropdown('almacenamiento')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md transition-colors whitespace-nowrap ${
              openDropdown === 'almacenamiento' || isAlmacenamientoActive
                ? 'bg-primary-600 text-white'
                : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
            style={linkStyle}
          >
            <Warehouse className="w-4 h-4 shrink-0" />
            Almacenamiento
            <ChevronDown className="w-3.5 h-3.5 shrink-0" />
          </button>
        </div>

        {/* Insumos */}
        <div className="relative">
          <button
            ref={refInsumos}
            type="button"
            onClick={() => toggleDropdown('insumos')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md transition-colors whitespace-nowrap ${
              openDropdown === 'insumos' || isInsumosActive
                ? 'bg-primary-600 text-white'
                : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
            style={linkStyle}
          >
            <Boxes className="w-4 h-4 shrink-0" />
            Insumos
            <ChevronDown className="w-3.5 h-3.5 shrink-0" />
          </button>
        </div>

        

        {/* Exportaciones */}
        <div className="relative">
          <button
            ref={refExportaciones}
            type="button"
            onClick={() => toggleDropdown('exportaciones')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md transition-colors whitespace-nowrap ${
              openDropdown === 'exportaciones' || isExportacionesActive
                ? 'bg-primary-600 text-white'
                : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
            style={linkStyle}
          >
            <Ship className="w-4 h-4 shrink-0" />
            Exportaciones
            <ChevronDown className="w-3.5 h-3.5 shrink-0" />
          </button>
        </div>

        {/* Administración */}
        <div className="relative">
          <button
            ref={refAdmin}
            type="button"
            onClick={() => toggleDropdown('admin')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md transition-colors whitespace-nowrap ${
              openDropdown === 'admin' || isAdminActive
                ? 'bg-primary-600 text-white'
                : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
            style={linkStyle}
          >
            <Building2 className="w-4 h-4 shrink-0" />
            Admin
            <ChevronDown className="w-3.5 h-3.5 shrink-0" />
          </button>
        </div>
      </nav>

      {/* Derecha: notificaciones, tema, config, usuario */}
      <div className="flex items-center gap-0.5 shrink-0 [&_button]:min-h-[44px] [&_button]:min-w-[44px] [&_button]:shrink-0 [&_button]:inline-flex [&_button]:items-center [&_button]:justify-center lg:[&_button]:min-h-0 lg:[&_button]:min-w-0">
        <div className="relative">
          <button
            type="button"
            onClick={() => setNotificationsOpen((v) => !v)}
            className="rounded-xl text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 relative"
            title="Notificaciones"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-600 text-white text-[10px] leading-4 text-center">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
          {notificationsOpen && (
            <div className="absolute right-0 mt-1 w-[360px] max-w-[86vw] rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-xl z-[120]">
              <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">Notificaciones</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">{connected ? 'Tiempo real conectado' : 'Reconectando SSE...'}</p>
                </div>
                <button
                  type="button"
                  title="Marcar todas como leídas"
                  onClick={() => markAllAsRead().catch(() => {})}
                  className="p-1.5 rounded text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/30"
                >
                  <CheckCheck className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  title="Borrar todas"
                  onClick={() => dismissAll().catch(() => {})}
                  className="p-1.5 rounded text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="max-h-[360px] overflow-y-auto">
                {notificationsLoading ? (
                  <p className="px-3 py-4 text-xs text-gray-500 dark:text-gray-400">Cargando...</p>
                ) : notificaciones.length === 0 ? (
                  <p className="px-3 py-4 text-xs text-gray-500 dark:text-gray-400">Sin notificaciones.</p>
                ) : (
                  notificaciones.map((n) => (
                    <div
                      key={n.id}
                      className={`w-full text-left px-3 py-2 border-b border-gray-100 dark:border-gray-700 ${
                        !n.leida_at ? 'bg-blue-50/70 dark:bg-blue-900/10' : ''
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => openNotificacion(n)}
                        className="w-full text-left hover:bg-gray-50 dark:hover:bg-gray-700/60 rounded"
                      >
                        <p className="text-[12px] font-medium text-gray-900 dark:text-white">{n.titulo || 'Notificación'}</p>
                        <p className="text-[11px] text-gray-600 dark:text-gray-300 truncate">{n.mensaje || 'Sin detalle'}</p>
                        <div className="mt-0.5 text-[10px] text-gray-500 dark:text-gray-400 flex items-center justify-between">
                          <span>{n.modulo || 'Sistema'}</span>
                          <span>{n.created_at ? new Date(n.created_at).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' }) : ''}</span>
                        </div>
                      </button>
                      <div className="mt-1 flex justify-end">
                        <button
                          type="button"
                          title="Borrar notificación"
                          onClick={() => dismissOne(n.id).catch(() => {})}
                          className="p-1 rounded text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
        <button type="button" onClick={onToggleDarkMode} className="p-2 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700" title={darkMode ? 'Modo claro' : 'Modo oscuro'}>
          {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
        <button type="button" onClick={() => navigate('/configuracion')} className="p-2 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700" title="Configuración">
          <Settings className="w-4 h-4" />
        </button>
        <div className="w-px h-6 bg-gray-200 dark:bg-gray-600 mx-0.5" />
        <div className="flex items-center gap-1.5">
          <div className="w-7 h-7 rounded-lg bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center shrink-0">
            <User className="w-4 h-4 text-primary-600 dark:text-primary-400" />
          </div>
          <div className="hidden md:block text-left min-w-0">
            <p className="font-medium text-gray-900 dark:text-white truncate max-w-[100px] leading-tight" style={{ fontSize: 'var(--font-size-text, 13px)' }}>{user?.nombre || 'Usuario'}</p>
            <p className="text-gray-500 dark:text-gray-400 truncate max-w-[100px] leading-tight" style={{ fontSize: '11px' }}>{user?.email}</p>
          </div>
          <button type="button" onClick={handleLogout} className="p-2 rounded-md text-gray-500 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600" title="Cerrar sesión">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Menús desplegables en portal: salen de la barra sin recortes */}
      {openDropdown && createPortal(
        <div
          className="fixed py-1.5 px-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl z-[100] flex flex-col gap-0.5"
          style={{
            top: dropdownPosition.top,
            left: dropdownPosition.left,
            minWidth: dropdownPosition.minWidth,
          }}
        >
          {openDropdown === 'ingresos' && (
            <>
              {canView('ingresos_mp.lotes') && <NavLink to="/ingresos-mp/lotes" className={linkClass} style={linkStyle} onClick={closeDropdown}>
                <Layers className="w-4 h-4" /> Lote de Producción
              </NavLink>}
              {canView('ingresos_mp.vehiculos') && <NavLink to="/ingresos-mp/vehiculos" className={linkClass} style={linkStyle} onClick={closeDropdown}>
                <TruckIcon className="w-4 h-4" /> Vehículos
              </NavLink>}
              {canView('ingresos_mp.descargas') && <NavLink to="/ingresos-mp/descargas" className={linkClass} style={linkStyle} onClick={closeDropdown}>
                <Download className="w-4 h-4" /> Descarga MP
              </NavLink>}
              {canView('ingresos_mp.proveedores') && <NavLink to="/ingresos-mp/proveedores" className={linkClass} style={linkStyle} onClick={closeDropdown}>
                <Store className="w-4 h-4" /> Proveedores MP
              </NavLink>}
              {canView('ingresos_mp.validacion_descargas') && <NavLink to="/ingresos-mp/validacion-descargas" className={linkClass} style={linkStyle} onClick={closeDropdown}>
                <FileCheck className="w-4 h-4" /> Validación de Descargas
              </NavLink>}
            </>
          )}
          {openDropdown === 'produccion' && (
            <>
              {canView('produccion.plantillas_proceso') && <NavLink to="/produccion/plantillas-proceso" className={linkClass} style={linkStyle} onClick={closeDropdown}>
                <LayoutTemplate className="w-4 h-4" /> Plantillas de proceso
              </NavLink>}
              {(esAdmin || canView('produccion.plantillas_snapshots')) && (
                <NavLink to="/produccion/plantillas-snapshots" className={linkClass} style={linkStyle} onClick={closeDropdown}>
                  <Archive className="w-4 h-4" /> Snapshots plantillas
                </NavLink>
              )}
              {canView('produccion.envasado') && <NavLink to="/produccion/envasado" className={linkClass} style={linkStyle} onClick={closeDropdown}>
                <FlaskConical className="w-4 h-4" /> Envasado
              </NavLink>}
              {canView('produccion.congelado') && <NavLink to="/produccion/congelado" className={linkClass} style={linkStyle} onClick={closeDropdown}>
                <Snowflake className="w-4 h-4" /> Congelado
              </NavLink>}
              {canView('produccion.empaque') && <NavLink to="/produccion/empaque" className={linkClass} style={linkStyle} onClick={closeDropdown}>
                <PackageCheck className="w-4 h-4" /> Empaque
              </NavLink>}
              {canView('produccion.control') && <NavLink to="/produccion/control-produccion" className={linkClass} style={linkStyle} onClick={closeDropdown}>
                <ClipboardList className="w-4 h-4" /> Control de producción
              </NavLink>}
              {canView('produccion.stock_pptt') && <NavLink to="/produccion/stock-pptt" className={linkClass} style={linkStyle} onClick={closeDropdown}>
                <Boxes className="w-4 h-4" /> Stock de PPTT
              </NavLink>}
              {canView('produccion.reporte') && <NavLink to="/produccion/reporte-produccion" className={linkClass} style={linkStyle} onClick={closeDropdown}>
                <PackagePlus className="w-4 h-4" /> Reporte de producción
              </NavLink>}
            </>
          )}
          {openDropdown === 'almacenamiento' && (
            <>
              {canView('almacenamiento.almacenes') && <NavLink to="/almacenes" className={linkClass} style={linkStyle} onClick={closeDropdown}>
                <Warehouse className="w-4 h-4" /> Almacenes
              </NavLink>}
              {canView('almacenamiento.recepcion_parihuelas') && <NavLink to="/almacenes/recepcion-parihuelas" className={linkClass} style={linkStyle} onClick={closeDropdown}>
                <Truck className="w-4 h-4" /> Recepción parihuelas
              </NavLink>}
              {canView('almacenamiento.historial_parihuelas') && <NavLink to="/almacenes/historial-parihuelas" className={linkClass} style={linkStyle} onClick={closeDropdown}>
                <History className="w-4 h-4" /> Historial parihuelas
              </NavLink>}
              {canView('almacenamiento.stock_fisico') && <NavLink to="/stock" className={linkClass} style={linkStyle} onClick={closeDropdown}>
                <Package className="w-4 h-4" /> Stock Físico
              </NavLink>}
              {canView('almacenamiento.mov_ingresos') && <NavLink to="/movimientos/ingresos" className={linkClass} style={linkStyle} onClick={closeDropdown}>
                <ArrowDownToLine className="w-4 h-4" /> Mov. Ingresos
              </NavLink>}
              {canView('almacenamiento.mov_salidas') && <NavLink to="/movimientos/salidas" className={linkClass} style={linkStyle} onClick={closeDropdown}>
                <ArrowUpFromLine className="w-4 h-4" /> Mov. Salidas
              </NavLink>}
            </>
          )}
          {openDropdown === 'insumos' && (
            <>
              {canView('insumos.proveedores') && <NavLink to="/insumos/proveedores" className={linkClass} style={linkStyle} onClick={closeDropdown}>
                <Store className="w-4 h-4" /> Proveedores de insumos
              </NavLink>}
              {canView('insumos.catalogo') && <NavLink to="/insumos/catalogo" className={linkClass} style={linkStyle} onClick={closeDropdown}>
                <Boxes className="w-4 h-4" /> Catálogo de insumos
              </NavLink>}
              {canView('insumos.ingresos') && <NavLink to="/insumos/ingresos" className={linkClass} style={linkStyle} onClick={closeDropdown}>
                <ArrowDownToLine className="w-4 h-4" /> Ingreso de insumos
              </NavLink>}
              {canView('insumos.salidas') && <NavLink to="/insumos/salidas" className={linkClass} style={linkStyle} onClick={closeDropdown}>
                <ArrowUpFromLine className="w-4 h-4" /> Salidas de insumos
              </NavLink>}
              {canView('insumos.stock') && <NavLink to="/insumos/stock" className={linkClass} style={linkStyle} onClick={closeDropdown}>
                <LayoutGrid className="w-4 h-4" /> Stock de insumos
              </NavLink>}
              {canView('insumos.plantillas_empaque') && <NavLink to="/insumos/plantillas-empaque" className={linkClass} style={linkStyle} onClick={closeDropdown}>
                <LayoutTemplate className="w-4 h-4" /> Plantillas de empaque
              </NavLink>}
              {canView('insumos.conciliacion') && <NavLink to="/insumos/conciliacion-empaque" className={linkClass} style={linkStyle} onClick={closeDropdown}>
                <FileText className="w-4 h-4" /> Conciliación empaque
              </NavLink>}
            </>
          )}
          
          {openDropdown === 'exportaciones' && (
            <>
              {canView('exportaciones.clientes') && <NavLink to="/exportaciones/clientes" className={linkClass} style={linkStyle} onClick={closeDropdown}>
                <Building2 className="w-4 h-4" /> Clientes exportación
              </NavLink>}
              {canView('exportaciones.ordenes') && <NavLink to="/exportaciones/ordenes-produccion" className={linkClass} style={linkStyle} onClick={closeDropdown}>
                <PackagePlus className="w-4 h-4" /> Órdenes de producción
              </NavLink>}
              {canView('exportaciones.listos') && <NavLink to="/exportaciones/listos" className={linkClass} style={linkStyle} onClick={closeDropdown}>
                <Ship className="w-4 h-4" /> Listos para despacho
              </NavLink>}
              {canView('exportaciones.despachos') && <NavLink to="/despachos" className={linkClass} style={linkStyle} onClick={closeDropdown}>
                <Truck className="w-4 h-4" /> Despachos
              </NavLink>}
            </>
          )}
          {openDropdown === 'admin' && (
            <>
              {canView('admin.usuarios') && (
                <NavLink to="/usuarios" className={linkClass} style={linkStyle} onClick={closeDropdown}>
                  <Users className="w-4 h-4" /> Usuarios
                </NavLink>
              )}
              {canView('admin.registro_actividad') && (
                <NavLink to="/admin/registro-actividad" className={linkClass} style={linkStyle} onClick={closeDropdown}>
                  <History className="w-4 h-4" /> Registro de actividad
                </NavLink>
              )}
              {canView('admin.especies') && <NavLink to="/especies" className={linkClass} style={linkStyle} onClick={closeDropdown}>
                <Fish className="w-4 h-4" /> Especies
              </NavLink>}
              {canView('admin.productos') && <NavLink to="/productos" className={linkClass} style={linkStyle} onClick={closeDropdown}>
                <Box className="w-4 h-4" /> Productos
              </NavLink>}
              {canView('admin.clientes') && <NavLink to="/clientes" className={linkClass} style={linkStyle} onClick={closeDropdown}>
                <Building2 className="w-4 h-4" /> Clientes
              </NavLink>}
            </>
          )}
        </div>,
        document.body
      )}

      <MobileNavDrawer open={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} esAdmin={esAdmin} />
    </header>
  )
}

export default TopBar
