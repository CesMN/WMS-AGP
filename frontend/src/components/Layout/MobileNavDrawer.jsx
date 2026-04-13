import { useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Warehouse,
  Package,
  Truck,
  Users,
  Fish,
  Box,
  Building2,
  Layers,
  TruckIcon,
  Download,
  Store,
  PackagePlus,
  FileCheck,
  LayoutTemplate,
  ArrowDownToLine,
  ArrowUpFromLine,
  History,
  Ship,
  FlaskConical,
  Snowflake,
  PackageCheck,
  Boxes,
  ClipboardList,
  LayoutGrid,
  FileText,
  Archive,
  X,
  Inbox,
  Settings,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

const Section = ({ title, children }) => (
  <div className="mb-5 last:mb-0">
    <p className="px-1 mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">{title}</p>
    <div className="space-y-0.5">{children}</div>
  </div>
)

const Item = ({ to, icon: Icon, label, onNavigate }) => (
  <NavLink
    to={to}
    onClick={onNavigate}
    className={({ isActive }) =>
      `flex items-center gap-3 min-h-[48px] px-3 py-2.5 rounded-xl text-[15px] font-medium transition-colors ${
        isActive
          ? 'bg-primary-600 text-white shadow-soft'
          : 'text-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700/80 active:bg-gray-200 dark:active:bg-gray-600'
      }`
    }
  >
    {Icon && <Icon className="w-5 h-5 shrink-0 opacity-90" />}
    <span className="leading-snug">{label}</span>
  </NavLink>
)

/**
 * Menú lateral completo para móvil y tablet pequeña (reemplaza la barra horizontal).
 */
const MobileNavDrawer = ({ open, onClose, esAdmin }) => {
  const { canView } = useAuth()

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const go = () => onClose()

  return (
    <div className="fixed inset-0 z-[200] lg:hidden" role="dialog" aria-modal="true" aria-label="Menú de navegación">
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="Cerrar menú"
      />
      <div
        className="absolute left-0 top-0 flex h-full w-[min(100vw,22rem)] max-w-[100vw] flex-col bg-white shadow-2xl dark:bg-gray-900 dark:shadow-black/40"
        style={{
          paddingTop: 'max(0.75rem, env(safe-area-inset-top))',
          paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))',
          paddingLeft: 'max(0.75rem, env(safe-area-inset-left))',
        }}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-2 pb-3 dark:border-gray-800">
          <span className="px-2 text-base font-semibold text-gray-900 dark:text-white">Menú</span>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
            aria-label="Cerrar"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto overscroll-contain px-2 py-4">
          <Section title="Principal">
            <Item to="/dashboard" icon={LayoutDashboard} label="Panel de control" onNavigate={go} />
            {canView('recepcion.general') && <Item to="/recepcion" icon={Inbox} label="Recepción" onNavigate={go} />}
            {canView('configuracion') && <Item to="/configuracion" icon={Settings} label="Configuración" onNavigate={go} />}
          </Section>

          <Section title="Ingresos MP">
            {canView('ingresos_mp.lotes') && <Item to="/ingresos-mp/lotes" icon={Layers} label="Lotes de producción" onNavigate={go} />}
            {canView('ingresos_mp.vehiculos') && <Item to="/ingresos-mp/vehiculos" icon={TruckIcon} label="Vehículos" onNavigate={go} />}
            {canView('ingresos_mp.descargas') && <Item to="/ingresos-mp/descargas" icon={Download} label="Descarga MP" onNavigate={go} />}
            {canView('ingresos_mp.proveedores') && <Item to="/ingresos-mp/proveedores" icon={Store} label="Proveedores MP" onNavigate={go} />}
            {canView('ingresos_mp.validacion_descargas') && (
              <Item to="/ingresos-mp/validacion-descargas" icon={FileCheck} label="Validación de descargas" onNavigate={go} />
            )}
          </Section>

          <Section title="Producción">
            {canView('produccion.plantillas_proceso') && (
              <Item to="/produccion/plantillas-proceso" icon={LayoutTemplate} label="Plantillas de proceso" onNavigate={go} />
            )}
            {(esAdmin || canView('produccion.plantillas_snapshots')) && (
              <Item to="/produccion/plantillas-snapshots" icon={Archive} label="Snapshots plantillas" onNavigate={go} />
            )}
            {canView('produccion.envasado') && <Item to="/produccion/envasado" icon={FlaskConical} label="Envasado" onNavigate={go} />}
            {canView('produccion.congelado') && <Item to="/produccion/congelado" icon={Snowflake} label="Congelado" onNavigate={go} />}
            {canView('produccion.empaque') && <Item to="/produccion/empaque" icon={PackageCheck} label="Empaque" onNavigate={go} />}
            {canView('produccion.control') && (
              <Item to="/produccion/control-produccion" icon={ClipboardList} label="Control de producción" onNavigate={go} />
            )}
            {canView('produccion.stock_pptt') && <Item to="/produccion/stock-pptt" icon={Boxes} label="Stock PPTT" onNavigate={go} />}
            {canView('produccion.reporte') && (
              <Item to="/produccion/reporte-produccion" icon={PackagePlus} label="Reporte de producción" onNavigate={go} />
            )}
          </Section>

          <Section title="Almacenamiento">
            {canView('almacenamiento.almacenes') && <Item to="/almacenes" icon={Warehouse} label="Almacenes" onNavigate={go} />}
            {canView('almacenamiento.recepcion_parihuelas') && (
              <Item to="/almacenes/recepcion-parihuelas" icon={Truck} label="Recepción parihuelas" onNavigate={go} />
            )}
            {canView('almacenamiento.historial_parihuelas') && (
              <Item to="/almacenes/historial-parihuelas" icon={History} label="Historial parihuelas" onNavigate={go} />
            )}
            {canView('almacenamiento.stock_fisico') && <Item to="/stock" icon={Package} label="Stock físico" onNavigate={go} />}
            {canView('almacenamiento.mov_ingresos') && (
              <Item to="/movimientos/ingresos" icon={ArrowDownToLine} label="Mov. ingresos" onNavigate={go} />
            )}
            {canView('almacenamiento.mov_salidas') && (
              <Item to="/movimientos/salidas" icon={ArrowUpFromLine} label="Mov. salidas" onNavigate={go} />
            )}
          </Section>

          <Section title="Insumos">
            {canView('insumos.proveedores') && <Item to="/insumos/proveedores" icon={Store} label="Proveedores" onNavigate={go} />}
            {canView('insumos.catalogo') && <Item to="/insumos/catalogo" icon={Boxes} label="Catálogo" onNavigate={go} />}
            {canView('insumos.ingresos') && <Item to="/insumos/ingresos" icon={ArrowDownToLine} label="Ingresos" onNavigate={go} />}
            {canView('insumos.salidas') && <Item to="/insumos/salidas" icon={ArrowUpFromLine} label="Salidas" onNavigate={go} />}
            {canView('insumos.stock') && <Item to="/insumos/stock" icon={LayoutGrid} label="Stock insumos" onNavigate={go} />}
            {canView('insumos.plantillas_empaque') && (
              <Item to="/insumos/plantillas-empaque" icon={LayoutTemplate} label="Plantillas empaque" onNavigate={go} />
            )}
            {canView('insumos.conciliacion') && (
              <Item to="/insumos/conciliacion-empaque" icon={FileText} label="Conciliación empaque" onNavigate={go} />
            )}
          </Section>

          <Section title="Exportaciones">
            {canView('exportaciones.clientes') && (
              <Item to="/exportaciones/clientes" icon={Building2} label="Clientes exportación" onNavigate={go} />
            )}
            {canView('exportaciones.ordenes') && (
              <Item to="/exportaciones/ordenes-produccion" icon={PackagePlus} label="Órdenes de producción" onNavigate={go} />
            )}
            {canView('exportaciones.listos') && <Item to="/exportaciones/listos" icon={Ship} label="Listos para despacho" onNavigate={go} />}
            {canView('exportaciones.despachos') && <Item to="/despachos" icon={Truck} label="Despachos" onNavigate={go} />}
          </Section>

          <Section title="Administración">
            {canView('admin.usuarios') && <Item to="/usuarios" icon={Users} label="Usuarios" onNavigate={go} />}
            {canView('admin.registro_actividad') && (
              <Item to="/admin/registro-actividad" icon={History} label="Registro de actividad" onNavigate={go} />
            )}
            {canView('admin.especies') && <Item to="/especies" icon={Fish} label="Especies" onNavigate={go} />}
            {canView('admin.productos') && <Item to="/productos" icon={Box} label="Productos" onNavigate={go} />}
            {canView('admin.clientes') && <Item to="/clientes" icon={Building2} label="Clientes" onNavigate={go} />}
          </Section>
        </nav>
      </div>
    </div>
  )
}

export default MobileNavDrawer
