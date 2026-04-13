import { useState, useEffect } from 'react'
import { Factory, Loader2 } from 'lucide-react'
import PaginationBar from '../../components/PaginationBar'
import { produccionApi } from '../../api/produccion'
import { useConfig } from '../../contexts/ConfigContext'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'

const Produccion = () => {
  const { registrosPorPagina } = useConfig()
  const { isAdmin } = useAuth()
  const [list, setList] = useState([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [refreshKey, setRefreshKey] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const limit = registrosPorPagina || 50
    setLoading(true)
    produccionApi
      .listar({ limit, offset: Number(offset) })
      .then(({ data }) => {
        if (cancelled) return
        setList(data?.data ?? data ?? [])
        setTotal(data?.total ?? 0)
      })
      .catch(() => {
        if (!cancelled) {
          toast.error('Error al cargar órdenes de producción')
          setList([])
          setTotal(0)
        }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [offset, registrosPorPagina, refreshKey])

  const refreshLista = () => setRefreshKey((k) => k + 1)

  const reabrirOrden = async (item) => {
    if (!window.confirm('¿Reabrir esta orden de producción? Volverá a estado Pendiente. Solo un administrador puede hacer esto.')) return
    try {
      await produccionApi.actualizar(item.id, { estado: 'Pendiente' })
      toast.success('Orden reabierta')
      refreshLista()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al reabrir')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-10 h-10 animate-spin text-primary-600" />
      </div>
    )
  }

  return (
    <div className="min-w-0 max-w-full">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5 sm:mb-6">
        <div className="flex items-center gap-3 min-w-0">
          <Factory className="w-7 h-7 sm:w-8 sm:h-8 text-[var(--color-primary,#2563eb)] shrink-0" />
          <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">Producción</h1>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
        <div className="wms-table-scroll">
        <table className="min-w-[52rem] w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Fecha</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Producto final</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Materia prima (lote)</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Cantidad</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Operario</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Estado</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {list.map((item) => (
              <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{item.fecha_orden?.slice?.(0, 16) || '—'}</td>
                <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{item.producto_final_nombre} ({item.producto_final_codigo})</td>
                <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{item.lote_producto_codigo || '—'}</td>
                <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">{Number(item.cantidad_producida)}</td>
                <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{item.operario_nombre}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 text-xs rounded-full ${item.estado === 'Completado' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : item.estado === 'Anulado' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'}`}>
                    {item.estado}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  {item.estado === 'Completado' && isAdmin() && (
                    <button type="button" onClick={() => reabrirOrden(item)} className="min-h-[40px] px-3 py-2 text-xs bg-amber-600 text-white rounded-lg hover:bg-amber-700" title="Reabrir orden (solo Admin)">Reabrir</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {list.length > 0 && (
        <div className="mt-4 py-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <PaginationBar total={total} limit={registrosPorPagina || 50} offset={offset} onPageChange={setOffset} />
        </div>
      )}
      {list.length === 0 && !loading && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-12 text-center text-gray-500 dark:text-gray-400">
          No hay órdenes de producción. Cree recepciones y lotes, luego podrá registrar órdenes desde la API o desde una pantalla de alta.
        </div>
      )}
    </div>
  )
}

export default Produccion
