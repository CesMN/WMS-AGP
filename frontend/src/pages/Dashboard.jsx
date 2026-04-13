import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Warehouse, Package, Truck, ArrowRight, BookOpen, Fish, Boxes, Activity, Factory, ClipboardList, AlertTriangle, RefreshCw, Ship } from 'lucide-react'
import LoadingSpinner from '../components/LoadingSpinner'
import { useAuth } from '../contexts/AuthContext'
import { almacenesApi } from '../api/almacenes'
import { stockApi } from '../api/stock'
import { movimientosApi } from '../api/movimientos'
import { despachosApi } from '../api/despachos'
import { ingresosMpApi } from '../api/ingresos-mp'
import { ordenesExportacionApi } from '../api/ordenes-exportacion'
import { insumosApi } from '../api/insumos'
import { controlProduccionApi } from '../api/control-produccion'
import { adminActividadApi } from '../api/admin-actividad'
import toast from 'react-hot-toast'

const Dashboard = () => {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [almacenes, setAlmacenes] = useState([])
  const [resumenStock, setResumenStock] = useState(null)
  const [resumenPorCliente, setResumenPorCliente] = useState([])
  const [ultimosMovimientos, setUltimosMovimientos] = useState([])
  const [ultimosDespachos, setUltimosDespachos] = useState([])
  const [lotesMp, setLotesMp] = useState([])
  const [ordenesExportacion, setOrdenesExportacion] = useState([])
  const [stockInsumos, setStockInsumos] = useState({ data: [], resumen: {} })
  const [lotesActivosProduccion, setLotesActivosProduccion] = useState([])
  const [actividadResumen, setActividadResumen] = useState(null)
  const [pedidosListos, setPedidosListos] = useState([])

  useEffect(() => {
    cargaTodo()
  }, [])

  const getRows = (payload) => (Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [])

  const cargaTodo = async (silent = false) => {
    if (silent) setUpdating(true)
    else setLoading(true)
    try {
      const desde = new Date()
      desde.setDate(desde.getDate() - 7)
      const fechaDesde = desde.toISOString().slice(0, 10)
      const fechaHasta = new Date().toISOString().slice(0, 10)

      const [almRes, stockRes, resumenClienteRes, movRes, despRes, lotesRes, ordenesRes, insumosRes, lotesActivosRes, actividadRes, pedidosListosRes] = await Promise.allSettled([
        almacenesApi.listar(),
        stockApi.resumen(),
        stockApi.resumenPorCliente(),
        movimientosApi.listar({ limit: 8 }),
        despachosApi.listar({ limit: 8 }),
        ingresosMpApi.lotesListar({ limit: 200, offset: 0 }),
        ordenesExportacionApi.listar({ limit: 200, offset: 0 }),
        insumosApi.stockResumen(),
        controlProduccionApi.lotesActivos(),
        adminActividadApi.resumen({ fecha_desde: fechaDesde, fecha_hasta: fechaHasta }),
        ordenesExportacionApi.pedidosListos({ limit: 100, offset: 0 }),
      ])

      setAlmacenes(Array.isArray(almRes.value?.data) ? almRes.value.data : [])
      setResumenStock(stockRes.status === 'fulfilled' ? stockRes.value?.data || null : null)
      setResumenPorCliente(Array.isArray(resumenClienteRes.value?.data) ? resumenClienteRes.value.data : [])
      setUltimosMovimientos(getRows(movRes.value?.data).slice(0, 8))
      setUltimosDespachos(getRows(despRes.value?.data).slice(0, 8))
      setLotesMp(getRows(lotesRes.value?.data))
      setOrdenesExportacion(getRows(ordenesRes.value?.data))
      setStockInsumos({ data: getRows(insumosRes.value?.data?.data), resumen: insumosRes.value?.data?.resumen || {} })
      setLotesActivosProduccion(getRows(lotesActivosRes.value?.data))
      setActividadResumen(actividadRes.value?.data || null)
      setPedidosListos(getRows(pedidosListosRes.value?.data))

      const failed = [almRes, stockRes, resumenClienteRes, movRes, despRes, lotesRes, ordenesRes, insumosRes, lotesActivosRes, actividadRes, pedidosListosRes].filter((r) => r.status === 'rejected')
      if (failed.length) {
        const msg = failed[0].reason?.response?.data?.message || failed[0].reason?.message
        toast.error(msg || 'Error al cargar una parte del panel')
      }
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Error al cargar el dashboard')
    } finally {
      if (silent) setUpdating(false)
      else setLoading(false)
    }
  }

  const totalEspacios = useMemo(() => almacenes.reduce((s, a) => s + (a.espacios_totales || 0), 0), [almacenes])
  const totalOcupados = useMemo(() => almacenes.reduce((s, a) => s + (a.espacios_ocupados || 0), 0), [almacenes])
  const porcentajeGlobal = totalEspacios > 0 ? Math.round((totalOcupados / totalEspacios) * 100) : 0
  const lotesTerminado = useMemo(() => lotesMp.filter((l) => String(l.estado || '').trim() === 'Terminado').length, [lotesMp])
  const lotesEnProceso = useMemo(() => lotesMp.filter((l) => ['Iniciado', 'En proceso'].includes(String(l.estado || '').trim())).length, [lotesMp])
  const ordenesPendientes = useMemo(() => ordenesExportacion.filter((o) => !['completo', 'embarcado'].includes(String(o.estado || '').trim().toLowerCase())).length, [ordenesExportacion])
  const despachosDespachados = useMemo(() => ultimosDespachos.filter((d) => String(d.estado || '').trim().toLowerCase() === 'despachado').length, [ultimosDespachos])
  const insumosBajoMinimo = Number(stockInsumos?.resumen?.bajo_minimo || 0)

  const formatFecha = (f) => (f ? new Date(f).toLocaleDateString('es-ES', { dateStyle: 'short' }) : '-')
  const formatFechaHora = (f) => (f ? new Date(f).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : '-')

  if (loading) return <LoadingSpinner size="lg" className="py-20" />

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="wms-card bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white leading-tight break-words">
            Bienvenido de nuevo, {user?.nombre?.split(' ')[0] || 'Usuario'}!
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400 text-sm max-w-xl">Vista integral de Ingresos MP, Producción, Insumos, Almacenamiento y Exportaciones.</p>
          <button type="button" onClick={() => cargaTodo(true)} disabled={updating} className="mt-4 inline-flex min-h-[44px] items-center gap-2 px-4 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-medium text-sm shadow-soft transition-colors disabled:opacity-50 w-full sm:w-auto justify-center">
            {updating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Actualizar panel
          </button>
        </div>
        <div className="hidden sm:flex w-24 h-24 rounded-2xl bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center flex-shrink-0">
          <BookOpen className="w-12 h-12 text-primary-600 dark:text-primary-400" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-5">
        <MetricCard title="Almacenamiento" value={almacenes.length} subtitle={`${totalOcupados} / ${totalEspacios} posiciones`} link="/almacenes" linkText="Ver almacenes" Icon={Warehouse} color="primary" />
        <MetricCard title="Stock total" value={resumenStock ? `${resumenStock.total_bultos} bultos` : '-'} subtitle={`${resumenStock ? Number(resumenStock.total_kg).toFixed(1) : 0} kg`} link="/stock" linkText="Ver stock" Icon={Package} color="green" />
        <MetricCard title="Producción" value={lotesTerminado} subtitle={`lotes terminados · ${lotesEnProceso} en proceso`} link="/ingresos-mp/lotes" linkText="Ver lotes" Icon={Factory} color="indigo" />
        <MetricCard title="Exportaciones" value={ordenesPendientes} subtitle={`OP pendientes · ${pedidosListos.length} listos`} link="/exportaciones/ordenes-produccion" linkText="Ver órdenes" Icon={Ship} color="cyan" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-5">
        <div className="wms-card bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Ocupación global</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{porcentajeGlobal}%</p>
          <div className="mt-2 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
            <div className="h-full bg-primary-600 rounded-full transition-all" style={{ width: `${Math.min(100, porcentajeGlobal)}%` }} />
          </div>
        </div>
        <MetricCard title="Despachos" value={ultimosDespachos.length} subtitle={`${despachosDespachados} despachado(s) recientes`} link="/despachos" linkText="Ver despachos" Icon={Truck} color="amber" />
        <MetricCard title="Insumos" value={stockInsumos.data.length} subtitle={`${insumosBajoMinimo} bajo mínimo`} link="/insumos/stock" linkText="Ver stock insumos" Icon={Boxes} color="orange" />
        <MetricCard title="Control producción" value={lotesActivosProduccion.length} subtitle="lotes activos para aplicar OP" link="/produccion/control-produccion" linkText="Ir a control" Icon={ClipboardList} color="violet" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 sm:gap-5">
        <div className="xl:col-span-2 wms-card bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Accesos rápidos por módulo</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
            <QuickLink to="/ingresos-mp/lotes" Icon={Fish} title="Ingresos MP" desc="Lotes, vehículos, descargas y validación." />
            <QuickLink to="/produccion/control-produccion" Icon={Factory} title="Producción" desc="Control por lote, envasado, congelado y empaque." />
            <QuickLink to="/insumos/stock" Icon={Boxes} title="Insumos" desc="Stock, entradas, salidas y conciliación." />
            <QuickLink to="/almacenes" Icon={Warehouse} title="Almacenamiento" desc="Posiciones, recepciones y movimientos físicos." />
            <QuickLink to="/exportaciones/ordenes-produccion" Icon={Ship} title="Exportaciones" desc="Órdenes, listos para despacho y embarques." />
            <QuickLink to="/admin/registro-actividad" Icon={Activity} title="Trazabilidad" desc="Resumen de actividad operativa del sistema." />
          </div>
        </div>
        <div className="wms-card bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Alertas</h2>
          <div className="space-y-2 text-sm">
            <div className={`rounded-lg px-3 py-2 border ${insumosBajoMinimo > 0 ? 'border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800' : 'border-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-800'}`}>
              <p className="font-medium text-gray-900 dark:text-white flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Insumos bajo mínimo</p>
              <p className="text-gray-600 dark:text-gray-300">{insumosBajoMinimo} item(s) con alerta.</p>
            </div>
            <div className="rounded-lg px-3 py-2 border border-gray-200 dark:border-gray-700">
              <p className="font-medium text-gray-900 dark:text-white">Órdenes de exportación pendientes</p>
              <p className="text-gray-600 dark:text-gray-300">{ordenesPendientes} orden(es) por completar.</p>
            </div>
            <div className="rounded-lg px-3 py-2 border border-gray-200 dark:border-gray-700">
              <p className="font-medium text-gray-900 dark:text-white">Actividad últimos 7 días</p>
              <p className="text-gray-600 dark:text-gray-300">{actividadResumen?.total_eventos ?? 0} evento(s), {(actividadResumen?.por_modulo || []).length} módulo(s).</p>
            </div>
          </div>
        </div>
      </div>

      {resumenPorCliente.length > 0 && (
        <div className="wms-card bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Stock por cliente</h2>
            <Link to="/stock" className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline">Ver stock</Link>
          </div>
          <div className="wms-table-scroll max-h-80">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/50 sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Cliente</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Especies</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Productos</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Bultos</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Total kg</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {resumenPorCliente.map((row) => (
                  <tr key={row.cliente_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-2 font-medium text-gray-900 dark:text-white"><Link to={`/stock?cliente_id=${row.cliente_id}`} className="text-primary-600 dark:text-primary-400 hover:underline">{row.cliente_nombre}</Link></td>
                    <td className="px-4 py-2 text-right text-gray-600 dark:text-gray-400">{row.cantidad_especies}</td>
                    <td className="px-4 py-2 text-right text-gray-600 dark:text-gray-400">{row.cantidad_productos}</td>
                    <td className="px-4 py-2 text-right font-medium text-gray-900 dark:text-white">{row.total_bultos}</td>
                    <td className="px-4 py-2 text-right text-gray-600 dark:text-gray-400">{Number(row.total_kg).toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-5">
        <HistoryTable title="Últimos movimientos" to="/movimientos/ingresos">
          {ultimosMovimientos.length === 0 ? (
            <p className="p-4 text-gray-500 dark:text-gray-400 text-sm">No hay movimientos recientes.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/50 sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Fecha</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Tipo</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Usuario</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Motivo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {ultimosMovimientos.map((m) => (
                  <tr key={m.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-2 text-gray-600 dark:text-gray-400 whitespace-nowrap">{formatFechaHora(m.fecha_hora)}</td>
                    <td className="px-4 py-2">{m.tipo_movimiento || '-'}</td>
                    <td className="px-4 py-2 text-gray-900 dark:text-white">{m.usuario_nombre || '-'}</td>
                    <td className="px-4 py-2 text-gray-600 dark:text-gray-400 max-w-[180px] truncate" title={m.motivo}>{m.motivo || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </HistoryTable>

        <HistoryTable title="Últimos despachos" to="/despachos">
          {ultimosDespachos.length === 0 ? (
            <p className="p-4 text-gray-500 dark:text-gray-400 text-sm">No hay despachos recientes.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/50 sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Fecha</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Tipo / Ref.</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Bultos</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Kg</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {ultimosDespachos.map((d) => (
                  <tr key={d.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-2 text-gray-600 dark:text-gray-400 whitespace-nowrap">{formatFecha(d.fecha_salida || d.created_at)}</td>
                    <td className="px-4 py-2 text-gray-900 dark:text-white">{d.tipo_salida} {d.guia_salida ? `- ${d.guia_salida}` : ''}</td>
                    <td className="px-4 py-2 text-right font-medium text-gray-900 dark:text-white">{d.total_bultos ?? '-'}</td>
                    <td className="px-4 py-2 text-right text-gray-600 dark:text-gray-400">{d.total_kg != null ? Number(d.total_kg).toFixed(1) : '-'}</td>
                    <td className="px-4 py-2">{d.estado || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </HistoryTable>
      </div>
    </div>
  )
}

const colorMap = {
  primary: 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400',
  green: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400',
  indigo: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400',
  cyan: 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400',
  amber: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
  orange: 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400',
  violet: 'bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400',
}

const MetricCard = ({ title, value, subtitle, link, linkText, Icon, color = 'primary' }) => (
  <div className="wms-card bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</p>
        <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{value}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{subtitle}</p>
      </div>
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${colorMap[color] || colorMap.primary}`}>
        <Icon className="w-6 h-6" />
      </div>
    </div>
    <Link to={link} className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline">
      {linkText} <ArrowRight className="w-4 h-4" />
    </Link>
  </div>
)

const QuickLink = ({ to, Icon, title, desc }) => (
  <Link to={to} className="block rounded-xl border border-gray-200 dark:border-gray-700 p-3 sm:p-3.5 min-h-[44px] hover:bg-gray-50 dark:hover:bg-gray-700/40 active:bg-gray-100 dark:active:bg-gray-600/50">
    <div className="flex items-center gap-2 font-medium text-gray-900 dark:text-white"><Icon className="w-4 h-4 text-primary-500" /> {title}</div>
    <p className="text-gray-500 dark:text-gray-400 mt-1">{desc}</p>
  </Link>
)

const HistoryTable = ({ title, to, children }) => (
  <div className="wms-card bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
    <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
      <Link to={to} className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline">Ver todos</Link>
    </div>
    <div className="wms-table-scroll max-h-64">{children}</div>
  </div>
)

export default Dashboard
