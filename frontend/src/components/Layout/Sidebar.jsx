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
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ArrowDownToLine,
  ArrowUpFromLine,
  History,
  PackagePlus,
  Boxes,
  Factory,
  Inbox,
  Layers,
  TruckIcon,
  Download,
  Store,
  FlaskConical,
  Snowflake,
  PackageCheck,
  Ship,
  LayoutTemplate,
  ClipboardList,
  FileText,
  LayoutGrid,
  Archive,
} from 'lucide-react'

const Sidebar = ({ collapsed, onToggle, darkMode }) => {
  const { user, canView } = useAuth()
  const { logoEmpresa, tamañoLogo } = useConfig()
  const path = useLocation().pathname

  const [entradaOpen, setEntradaOpen] = useState(() => path.startsWith('/ingresos-mp'))
  const [produccionOpen, setProduccionOpen] = useState(() => path.startsWith('/produccion'))
  const [almacenamientoOpen, setAlmacenamientoOpen] = useState(() => path.startsWith('/almacenes') || path.startsWith('/stock') || path.startsWith('/movimientos'))
  const [movimientosOpen, setMovimientosOpen] = useState(() => path.startsWith('/movimientos'))
  const [exportacionesOpen, setExportacionesOpen] = useState(() => path.startsWith('/exportaciones') || path.startsWith('/despachos'))
  const [insumosOpen, setInsumosOpen] = useState(() => path.startsWith('/insumos'))

  useEffect(() => { if (path.startsWith('/ingresos-mp')) setEntradaOpen(true) }, [path])
  useEffect(() => { if (path.startsWith('/produccion')) setProduccionOpen(true) }, [path])
  useEffect(() => { if (path.startsWith('/almacenes') || path.startsWith('/stock') || path.startsWith('/movimientos')) setAlmacenamientoOpen(true) }, [path])
  useEffect(() => { if (path.startsWith('/movimientos')) setMovimientosOpen(true) }, [path])
  useEffect(() => { if (path.startsWith('/exportaciones') || path.startsWith('/despachos')) setExportacionesOpen(true) }, [path])
  useEffect(() => { if (path.startsWith('/insumos')) setInsumosOpen(true) }, [path])

  const navLinkClass = ({ isActive }) =>
    `flex items-center gap-3 px-4 py-1.5 rounded-xl text-sm font-medium transition-colors ${
      isActive
        ? 'bg-primary-600 text-white shadow-soft'
        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'
    } ${collapsed ? 'justify-center px-3' : ''}`

  const subLinkClass = ({ isActive }) =>
    `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
      isActive ? 'bg-primary-600 text-white' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
    }`

  const SectionLabel = ({ children }) => (
    !collapsed && (
      <p className="px-4 pt-4 pb-2 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
        {children}
      </p>
    )
  )

  const link = (to, Icon, label, resource = null) => {
    if (resource && !canView(resource)) return null
    return (
    <NavLink to={to} className={navLinkClass} title={collapsed ? label : ''}>
      <Icon className="w-5 h-5 flex-shrink-0" />
      {!collapsed && <span className="flex-1">{label}</span>}
      {!collapsed && <ChevronRight className="w-4 h-4 opacity-60" />}
    </NavLink>
    )
  }

  const subLink = (to, Icon, label, resource = null) => {
    if (resource && !canView(resource)) return null
    return (
    <NavLink to={to} className={subLinkClass}>
      <Icon className="w-4 h-4 flex-shrink-0" />
      {label}
    </NavLink>
    )
  }

  const esAdmin = (user?.rol || '').toLowerCase() === 'administrador'

  return (
    <aside
      className={`fixed left-0 top-0 h-full flex flex-col transition-all duration-300 border-r shadow-soft ${
        darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'
      } ${collapsed ? 'w-20' : 'w-64'}`}
    >
      <div className="flex items-center justify-between gap-2 p-4 border-b border-gray-100 dark:border-gray-700">
        {!collapsed && (
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {logoEmpresa && logoEmpresa.trim() ? (
              <img src={logoEmpresa.trim()} alt="Logo" className="h-9 w-auto object-contain" style={{ height: `${tamañoLogo || 40}px` }} />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-primary-600 flex items-center justify-center flex-shrink-0 text-white font-bold text-lg">W</div>
            )}
            <span className="font-semibold text-gray-900 dark:text-white text-sm leading-tight truncate">Panel WMS</span>
          </div>
        )}
        <button onClick={onToggle} className="p-2 rounded-xl text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700" title={collapsed ? 'Expandir menú' : 'Colapsar menú'}>
          {collapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto p-2.5">
        <ul className="space-y-0.5">
          <li>{link('/dashboard', LayoutDashboard, 'Panel de Control', 'dashboard')}</li>
          <SectionLabel>Ingresos de materia prima</SectionLabel>
          {collapsed ? (
            <>
              <li>{link('/ingresos-mp/lotes', Layers, 'Lote de Producción', 'ingresos_mp.lotes')}</li>
              <li>{link('/ingresos-mp/vehiculos', TruckIcon, 'Vehículos', 'ingresos_mp.vehiculos')}</li>
              <li>{link('/ingresos-mp/descargas', Download, 'Descarga MP', 'ingresos_mp.descargas')}</li>
              <li>{link('/ingresos-mp/proveedores', Store, 'Proveedores MP', 'ingresos_mp.proveedores')}</li>
              <li>{link('/ingresos-mp/validacion-descargas', Inbox, 'Validación Desc.', 'ingresos_mp.validacion_descargas')}</li>
            </>
          ) : (
            <li>
              <button type="button" onClick={() => setEntradaOpen((o) => !o)} className="flex items-center gap-3 px-4 py-2.5 rounded-xl w-full text-left text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700">
                <Inbox className="w-5 h-5 flex-shrink-0" />
                <span className="flex-1 font-medium">Recepcion de MP</span>
                <ChevronDown className={`w-4 h-4 ${entradaOpen ? 'rotate-180' : ''}`} />
              </button>
              {entradaOpen && (
                <ul className="mt-1 ml-2 pl-4 border-l border-gray-200 dark:border-gray-600 space-y-0.5">
                  <li>{subLink('/ingresos-mp/lotes', Layers, 'Lote de Producción', 'ingresos_mp.lotes')}</li>
                  <li>{subLink('/ingresos-mp/vehiculos', TruckIcon, 'Vehículos', 'ingresos_mp.vehiculos')}</li>
                  <li>{subLink('/ingresos-mp/descargas', Download, 'Descarga Materia Prima', 'ingresos_mp.descargas')}</li>
                  <li>{subLink('/ingresos-mp/proveedores', Store, 'Proveedores MP', 'ingresos_mp.proveedores')}</li>
                  <li>{subLink('/ingresos-mp/validacion-descargas', PackagePlus, 'Validación de Descargas', 'ingresos_mp.validacion_descargas')}</li>
                </ul>
              )}
            </li>
          )}
          <SectionLabel>Producción</SectionLabel>
          {collapsed ? (
            <>
              <li>{link('/produccion/plantillas-proceso', LayoutTemplate, 'Plantillas', 'produccion.plantillas_proceso')}</li>
              {esAdmin && <li>{link('/produccion/plantillas-snapshots', Archive, 'Snap. plantillas', 'produccion.plantillas_snapshots')}</li>}
              <li>{link('/produccion/envasado', FlaskConical, 'Envasado', 'produccion.envasado')}</li>
              <li>{link('/produccion/congelado', Snowflake, 'Congelado', 'produccion.congelado')}</li>
              <li>{link('/produccion/empaque', PackageCheck, 'Empaque', 'produccion.empaque')}</li>
              <li>{link('/produccion/control-produccion', ClipboardList, 'Control producción', 'produccion.control')}</li>
              <li>{link('/produccion/stock-pptt', Boxes, 'Stock PPTT', 'produccion.stock_pptt')}</li>
              <li>{link('/produccion/reporte-produccion', FileText, 'Reporte prod.', 'produccion.reporte')}</li>
            </>
          ) : (
            <li>
              <button type="button" onClick={() => setProduccionOpen((o) => !o)} className="flex items-center gap-3 px-4 py-2.5 rounded-xl w-full text-left text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700">
                <Factory className="w-5 h-5 flex-shrink-0" />
                <span className="flex-1 font-medium">Producción</span>
                <ChevronDown className={`w-4 h-4 ${produccionOpen ? 'rotate-180' : ''}`} />
              </button>
              {produccionOpen && (
                <ul className="mt-1 ml-2 pl-4 border-l border-gray-200 dark:border-gray-600 space-y-0.5">
                  <li>{subLink('/produccion/plantillas-proceso', LayoutTemplate, 'Plantillas de proceso', 'produccion.plantillas_proceso')}</li>
                  {esAdmin && (
                    <li>{subLink('/produccion/plantillas-snapshots', Archive, 'Snapshots de plantillas (finalizados)', 'produccion.plantillas_snapshots')}</li>
                  )}
                  <li>{subLink('/produccion/envasado', FlaskConical, 'Envasado', 'produccion.envasado')}</li>
                  <li>{subLink('/produccion/congelado', Snowflake, 'Congelado', 'produccion.congelado')}</li>
                  <li>{subLink('/produccion/empaque', PackageCheck, 'Empaque', 'produccion.empaque')}</li>
                  <li>{subLink('/produccion/control-produccion', ClipboardList, 'Control de producción', 'produccion.control')}</li>
                  <li>{subLink('/produccion/stock-pptt', Boxes, 'Stock de PPTT', 'produccion.stock_pptt')}</li>
                  <li>{subLink('/produccion/reporte-produccion', FileText, 'Reporte de producción', 'produccion.reporte')}</li>
                </ul>
              )}
            </li>
          )}
          <SectionLabel>Insumos</SectionLabel>
          {collapsed ? (
            <>
              <li>{link('/insumos/proveedores', Store, 'Prov. insumos', 'insumos.proveedores')}</li>
              <li>{link('/insumos/catalogo', Boxes, 'Cat. insumos', 'insumos.catalogo')}</li>
              <li>{link('/insumos/ingresos', ArrowDownToLine, 'Ing. insumos', 'insumos.ingresos')}</li>
              <li>{link('/insumos/salidas', ArrowUpFromLine, 'Sal. insumos', 'insumos.salidas')}</li>
              <li>{link('/insumos/stock', LayoutGrid, 'Stock insumos', 'insumos.stock')}</li>
              <li>{link('/insumos/plantillas-empaque', LayoutTemplate, 'Plant. empaque', 'insumos.plantillas_empaque')}</li>
              <li>{link('/insumos/conciliacion-empaque', FileText, 'Conciliación', 'insumos.conciliacion')}</li>
            </>
          ) : (
            <li>
              <button type="button" onClick={() => setInsumosOpen((o) => !o)} className="flex items-center gap-3 px-4 py-2.5 rounded-xl w-full text-left text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700">
                <Boxes className="w-5 h-5 flex-shrink-0" />
                <span className="flex-1 font-medium">Insumos</span>
                <ChevronDown className={`w-4 h-4 ${insumosOpen ? 'rotate-180' : ''}`} />
              </button>
              {insumosOpen && (
                <ul className="mt-1 ml-2 pl-4 border-l border-gray-200 dark:border-gray-600 space-y-0.5">
                  <li>{subLink('/insumos/proveedores', Store, 'Proveedores de insumos', 'insumos.proveedores')}</li>
                  <li>{subLink('/insumos/catalogo', Boxes, 'Catálogo de insumos', 'insumos.catalogo')}</li>
                  <li>{subLink('/insumos/ingresos', ArrowDownToLine, 'Ingreso de insumos', 'insumos.ingresos')}</li>
                  <li>{subLink('/insumos/salidas', ArrowUpFromLine, 'Salidas de insumos', 'insumos.salidas')}</li>
                  <li>{subLink('/insumos/stock', LayoutGrid, 'Stock de insumos', 'insumos.stock')}</li>
                  <li>{subLink('/insumos/plantillas-empaque', LayoutTemplate, 'Plantillas de empaque', 'insumos.plantillas_empaque')}</li>
                  <li>{subLink('/insumos/conciliacion-empaque', FileText, 'Conciliación empaque', 'insumos.conciliacion')}</li>
                </ul>
              )}
            </li>
          )}
          <SectionLabel>Almacenamiento</SectionLabel>
          {collapsed ? (
            <>
              <li>{link('/almacenes', Warehouse, 'Almacenes', 'almacenamiento.almacenes')}</li>
              <li>{link('/almacenes/recepcion-parihuelas', Truck, 'Recepción parih.', 'almacenamiento.recepcion_parihuelas')}</li>
              <li>{link('/almacenes/historial-parihuelas', History, 'Historial parih.', 'almacenamiento.historial_parihuelas')}</li>
              <li>{link('/stock', Package, 'Stock Físico', 'almacenamiento.stock_fisico')}</li>
              <li>{link('/movimientos/ingresos', ArrowDownToLine, 'Mov. Ingresos', 'almacenamiento.mov_ingresos')}</li>
              <li>{link('/movimientos/salidas', ArrowUpFromLine, 'Mov. Salidas', 'almacenamiento.mov_salidas')}</li>
            </>
          ) : (
            <li>
              <button type="button" onClick={() => setAlmacenamientoOpen((o) => !o)} className="flex items-center gap-3 px-4 py-2.5 rounded-xl w-full text-left text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700">
                <Warehouse className="w-5 h-5 flex-shrink-0" />
                <span className="flex-1 font-medium">Almacenamiento</span>
                <ChevronDown className={`w-4 h-4 ${almacenamientoOpen ? 'rotate-180' : ''}`} />
              </button>
              {almacenamientoOpen && (
                <ul className="mt-1 ml-2 pl-4 border-l border-gray-200 dark:border-gray-600 space-y-0.5">
                  <li>{subLink('/almacenes', Warehouse, 'Almacenes', 'almacenamiento.almacenes')}</li>
                  <li>{subLink('/almacenes/recepcion-parihuelas', Truck, 'Recepción parihuelas', 'almacenamiento.recepcion_parihuelas')}</li>
                  <li>{subLink('/almacenes/historial-parihuelas', History, 'Historial parihuelas', 'almacenamiento.historial_parihuelas')}</li>
                  <li>{subLink('/stock', Package, 'Stock Físico', 'almacenamiento.stock_fisico')}</li>
                  <li>
                    <button type="button" onClick={() => setMovimientosOpen((o) => !o)} className="flex items-center gap-2 px-3 py-2 rounded-lg w-full text-left text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700">
                      <Move className="w-4 h-4" />
                      Movimientos
                      <ChevronDown className={`w-3 h-3 ml-auto ${movimientosOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {movimientosOpen && (
                      <ul className="ml-4 mt-0.5 space-y-0.5">
                        <li>{subLink('/movimientos/ingresos', ArrowDownToLine, 'Mov. Ingresos', 'almacenamiento.mov_ingresos')}</li>
                        <li>{subLink('/movimientos/salidas', ArrowUpFromLine, 'Mov. Salidas', 'almacenamiento.mov_salidas')}</li>
                      </ul>
                    )}
                  </li>
                </ul>
              )}
            </li>
          )}
          <SectionLabel>Exportaciones</SectionLabel>
          {collapsed ? (
            <>
              <li>{link('/exportaciones/ordenes-produccion', Ship, 'Órdenes de prod.', 'exportaciones.ordenes')}</li>
              <li>{link('/despachos', Truck, 'Despachos', 'exportaciones.despachos')}</li>
            </>
          ) : (
            <li>
              <>
                <button type="button" onClick={() => setExportacionesOpen((o) => !o)} className="flex items-center gap-3 px-4 py-2.5 rounded-xl w-full text-left text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700">
                  <Ship className="w-5 h-5 flex-shrink-0" />
                  <span className="flex-1 font-medium">Exportaciones</span>
                  <ChevronDown className={`w-4 h-4 ${exportacionesOpen ? 'rotate-180' : ''}`} />
                </button>
                {exportacionesOpen && (
                  <ul className="mt-1 ml-2 pl-4 border-l border-gray-200 dark:border-gray-600 space-y-0.5">
                    <li>{subLink('/exportaciones/clientes', Building2, 'Clientes exportación', 'exportaciones.clientes')}</li>
                    <li>{subLink('/exportaciones/ordenes-produccion', PackagePlus, 'Órdenes de producción', 'exportaciones.ordenes')}</li>
                    <li>{subLink('/exportaciones/listos', Ship, 'Listos para despacho', 'exportaciones.listos')}</li>
                    <li>{subLink('/despachos', Truck, 'Despachos', 'exportaciones.despachos')}</li>
                  </ul>
                )}
              </>
            </li>
          )}
          <SectionLabel>Administración</SectionLabel>
          <li>{link('/usuarios', Users, 'Usuarios', 'admin.usuarios')}</li>
          <li>{link('/admin/registro-actividad', History, 'Registro de actividad', 'admin.registro_actividad')}</li>
          <li>{link('/especies', Fish, 'Especies', 'admin.especies')}</li>
          <li>{link('/productos', Box, 'Productos', 'admin.productos')}</li>
          <li>{link('/clientes', Building2, 'Clientes', 'admin.clientes')}</li>
        </ul>
      </nav>
    </aside>
  )
}

export default Sidebar
