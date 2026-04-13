import { useState, useEffect } from 'react'
import { LayoutGrid, Loader2, RefreshCw, AlertTriangle } from 'lucide-react'
import { insumosApi } from '../../api/insumos'
import ExportDropdown from '../../components/ExportDropdown'
import toast from 'react-hot-toast'

const StockInsumos = () => {
  const [data, setData] = useState({ data: [], resumen: {} })
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    insumosApi
      .stockResumen()
      .then(({ data: d }) => setData({ data: d?.data ?? [], resumen: d?.resumen ?? {} }))
      .catch(() => {
        toast.error('Error al cargar stock')
        setData({ data: [], resumen: {} })
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])
  const filasExport = (data.data || []).map((row) => ({
    insumo: row.nombre || '',
    codigo: row.codigo || '',
    proveedor: row.proveedor_nombre || '',
    stock: Number(row.stock_actual || 0),
    minimo: Number(row.stock_minimo || 0),
    unidad: row.unidad_medida || '',
    estado: row.bajo_minimo ? 'Bajo mínimo' : 'OK',
  }))

  return (
    <div className="min-w-0 max-w-full">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-5 sm:mb-6">
        <div className="flex items-start gap-3 min-w-0">
          <div className="p-2 rounded-lg bg-primary-100 dark:bg-primary-900/40 shrink-0">
            <LayoutGrid className="w-6 h-6 text-primary-600 dark:text-primary-400" />
          </div>
          <div className="min-w-0">
            <p className="text-sm text-gray-500 dark:text-gray-400">Insumos</p>
            <h1 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white leading-tight">Stock de insumos</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
              Posición según movimientos. {data.resumen?.bajo_minimo > 0 && (
                <span className="text-amber-600 dark:text-amber-400 font-medium">{data.resumen.bajo_minimo} bajo mínimo</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2 shrink-0">
        <button type="button" onClick={load} className="inline-flex items-center justify-center gap-2 min-h-[44px] px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Actualizar
        </button>
        <ExportDropdown
          disabled={!filasExport.length}
          getExportConfig={() => ({
            fetchData: async () => ({ data: filasExport }),
            columns: [
              { key: 'insumo', label: 'Insumo' },
              { key: 'codigo', label: 'Código' },
              { key: 'proveedor', label: 'Proveedor' },
              { key: 'stock', label: 'Stock' },
              { key: 'minimo', label: 'Mínimo' },
              { key: 'unidad', label: 'Unidad' },
              { key: 'estado', label: 'Estado' },
            ],
            title: 'Stock de insumos',
          })}
        />
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-10 h-10 animate-spin text-primary-600" /></div>
        ) : (
          <div className="wms-table-scroll">
            <table className="min-w-[44rem] w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Insumo</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Código</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Proveedor</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Stock</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Mínimo</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Und.</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {data.data.map((row) => (
                  <tr key={row.id} className={row.bajo_minimo ? 'bg-amber-50/80 dark:bg-amber-900/10' : ''}>
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{row.nombre}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{row.codigo || '—'}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{row.proveedor_nombre || '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">{Number(row.stock_actual)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-600 dark:text-gray-400">{Number(row.stock_minimo)}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{row.unidad_medida}</td>
                    <td className="px-4 py-3 text-center">
                      {row.bajo_minimo ? (
                        <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400 text-xs font-medium">
                          <AlertTriangle className="w-4 h-4" /> Bajo mínimo
                        </span>
                      ) : (
                        <span className="text-emerald-600 dark:text-emerald-400 text-xs">OK</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && data.data.length === 0 && (
          <p className="p-8 text-center text-gray-500 dark:text-gray-400">No hay insumos en catálogo.</p>
        )}
      </div>
    </div>
  )
}

export default StockInsumos
