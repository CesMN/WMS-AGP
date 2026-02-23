import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { LayoutDashboard, Warehouse, Package, Truck, ArrowRight } from 'lucide-react'
import LoadingSpinner from '../components/LoadingSpinner'
import { almacenesApi } from '../api/almacenes'
import { stockApi } from '../api/stock'
import { movimientosApi } from '../api/movimientos'
import { despachosApi } from '../api/despachos'
import toast from 'react-hot-toast'

const Dashboard = () => {
  const [loading, setLoading] = useState(true)
  const [almacenes, setAlmacenes] = useState([])
  const [resumenStock, setResumenStock] = useState(null)
  const [resumenPorCliente, setResumenPorCliente] = useState([])
  const [ultimosMovimientos, setUltimosMovimientos] = useState([])
  const [ultimosDespachos, setUltimosDespachos] = useState([])

  useEffect(() => {
    cargaTodo()
  }, [])

  const cargaTodo = async () => {
    setLoading(true)
    try {
      const [almRes, stockRes, resumenClienteRes, movRes, despRes] = await Promise.allSettled([
        almacenesApi.listar(),
        stockApi.resumen(),
        stockApi.resumenPorCliente(),
        movimientosApi.listar({ limit: 5 }),
        despachosApi.listar(),
      ])
      const almData = almRes.status === 'fulfilled' ? almRes.value?.data : null
      const movData = movRes.status === 'fulfilled' ? movRes.value?.data : null
      const despData = despRes.status === 'fulfilled' ? despRes.value?.data : null
      setAlmacenes(Array.isArray(almData) ? almData : [])
      setResumenStock(stockRes.status === 'fulfilled' ? stockRes.value?.data || null : null)
      setResumenPorCliente(Array.isArray(resumenClienteRes.value?.data) ? resumenClienteRes.value.data : [])
      setUltimosMovimientos(Array.isArray(movData) ? movData.slice(0, 5) : Array.isArray(movData?.data) ? movData.data.slice(0, 5) : [])
      setUltimosDespachos(Array.isArray(despData) ? despData.slice(0, 5) : Array.isArray(despData?.data) ? despData.data.slice(0, 5) : [])
      const failed = [almRes, stockRes, movRes, despRes].filter((r) => r.status === 'rejected')
      if (failed.length > 0) {
        const msg = failed[0].reason?.response?.data?.message || failed[0].reason?.message
        toast.error(msg || 'Error al cargar parte del dashboard')
      }
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Error al cargar el dashboard')
    } finally {
      setLoading(false)
    }
  }

  const totalEspacios = almacenes.reduce((s, a) => s + (a.espacios_totales || 0), 0)
  const totalOcupados = almacenes.reduce((s, a) => s + (a.espacios_ocupados || 0), 0)
  const porcentajeGlobal = totalEspacios > 0 ? Math.round((totalOcupados / totalEspacios) * 100) : 0

  const formatFecha = (f) => (f ? new Date(f).toLocaleDateString('es-ES', { dateStyle: 'short' }) : '-')
  const formatFechaHora = (f) => (f ? new Date(f).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : '-')

  if (loading) {
    return <LoadingSpinner size="lg" className="py-20" />
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <LayoutDashboard className="w-8 h-8 text-primary-600" />
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">Resumen</p>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="wms-card bg-white dark:bg-gray-800 rounded-xl shadow border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Almacenes</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{almacenes.length}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {totalOcupados} / {totalEspacios} posiciones ocupadas
              </p>
            </div>
            <div className="p-3 rounded-lg bg-primary-100 dark:bg-primary-900/30">
              <Warehouse className="w-8 h-8 text-primary-600 dark:text-primary-400" />
            </div>
          </div>
          <Link
            to="/almacenes"
            className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline"
          >
            Ver almacenes <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="wms-card bg-white dark:bg-gray-800 rounded-xl shadow border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Ocupación global</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{porcentajeGlobal}%</p>
              <div className="mt-2 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary-600 rounded-full transition-all"
                  style={{ width: `${Math.min(100, porcentajeGlobal)}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="wms-card bg-white dark:bg-gray-800 rounded-xl shadow border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Stock total</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                {resumenStock ? `${resumenStock.total_bultos} bultos` : '-'}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {resumenStock ? `${Number(resumenStock.total_kg).toFixed(1)} kg` : ''} en {resumenStock?.cantidad_registros ?? 0} registros
              </p>
            </div>
            <div className="p-3 rounded-lg bg-green-100 dark:bg-green-900/30">
              <Package className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
          </div>
          <Link
            to="/stock"
            className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline"
          >
            Ver stock <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="wms-card bg-white dark:bg-gray-800 rounded-xl shadow border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Despachos (lista)</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{ultimosDespachos.length}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">últimos mostrados</p>
            </div>
            <div className="p-3 rounded-lg bg-amber-100 dark:bg-amber-900/30">
              <Truck className="w-8 h-8 text-amber-600 dark:text-amber-400" />
            </div>
          </div>
          <Link
            to="/despachos"
            className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline"
          >
            Ver despachos <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {resumenPorCliente.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow border border-gray-200 dark:border-gray-700 overflow-hidden mb-8">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Stock por cliente</h2>
            <Link to="/stock" className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline">
              Ver stock
            </Link>
          </div>
          <div className="overflow-x-auto max-h-80">
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
                    <td className="px-4 py-2 font-medium text-gray-900 dark:text-white">
                      <Link to={`/stock?cliente_id=${row.cliente_id}`} className="text-primary-600 dark:text-primary-400 hover:underline">
                        {row.cliente_nombre}
                      </Link>
                    </td>
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Últimos movimientos</h2>
            <Link
              to="/movimientos"
              className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline"
            >
              Ver todos
            </Link>
          </div>
          <div className="overflow-x-auto max-h-64">
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
                      <td className="px-4 py-2">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                            m.tipo_movimiento === 'Ingreso'
                              ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                              : m.tipo_movimiento === 'Salida'
                              ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'
                              : 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300'
                          }`}
                        >
                          {m.tipo_movimiento}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-gray-900 dark:text-white">{m.usuario_nombre || '-'}</td>
                      <td className="px-4 py-2 text-gray-600 dark:text-gray-400 max-w-[180px] truncate" title={m.motivo}>
                        {m.motivo || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Últimos despachos</h2>
            <Link
              to="/despachos"
              className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline"
            >
              Ver todos
            </Link>
          </div>
          <div className="overflow-x-auto max-h-64">
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
                      <td className="px-4 py-2 text-gray-900 dark:text-white">
                        {d.tipo_salida} {d.guia_salida ? `- ${d.guia_salida}` : ''}
                      </td>
                      <td className="px-4 py-2 text-right font-medium text-gray-900 dark:text-white">{d.total_bultos ?? '-'}</td>
                      <td className="px-4 py-2 text-right text-gray-600 dark:text-gray-400">{d.total_kg != null ? Number(d.total_kg).toFixed(1) : '-'}</td>
                      <td className="px-4 py-2">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                            d.estado === 'Despachado'
                              ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                              : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                          }`}
                        >
                          {d.estado}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Dashboard
