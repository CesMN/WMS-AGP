import React, { useState, useEffect } from 'react'
import { History, Loader2, FileText } from 'lucide-react'
import { parihuelasApi } from '../../api/parihuelas'
import RotuloParihuela from '../../components/RotuloParihuela'
import ExportDropdown from '../../components/ExportDropdown'
import toast from 'react-hot-toast'

const formatFecha = (d) => {
  if (!d) return '—'
  const dt = new Date(d)
  return dt.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const HistorialParihuelas = () => {
  const [lotes, setLotes] = useState([])
  const [loteSeleccionado, setLoteSeleccionado] = useState(null)
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingLista, setLoadingLista] = useState(false)
  const [rotuloId, setRotuloId] = useState(null)

  const loadLotes = () => {
    setLoading(true)
    parihuelasApi.lotes()
      .then(({ data }) => setLotes(data?.data ?? data ?? []))
      .catch(() => toast.error('Error al cargar lotes'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadLotes()
  }, [])

  useEffect(() => {
    if (!loteSeleccionado?.id) {
      setList([])
      return
    }
    setLoadingLista(true)
    parihuelasApi.listar({ lote_id: loteSeleccionado.id, limit: 500 })
      .then(({ data }) => setList(data?.data ?? data ?? []))
      .catch(() => {
        toast.error('Error al cargar parihuelas')
        setList([])
      })
      .finally(() => setLoadingLista(false))
  }, [loteSeleccionado?.id])

  const productoLabel = (p) =>
    [p.producto_codigo, p.producto_descripcion || p.producto_nombre, p.producto_presentacion].filter(Boolean).join(' · ')
  const filasExport = [...list]
    .sort((a, b) => new Date(b.fecha_envio || b.created_at) - new Date(a.fecha_envio || a.created_at))
    .map((p) => ({
      lote: loteSeleccionado?.codigo || '',
      fecha_envio: formatFecha(p.fecha_envio || p.created_at),
      producto: productoLabel(p),
      cantidad: p.cantidad ?? 0,
      unidad: p.unidad_parihuela === 'CAJAS' ? 'Cajas' : 'Bultos',
      estado: p.estado === 'ALMACENADA' ? 'Recepcionada' : 'En tránsito',
      ubicacion: p.ubicacion ?? '—',
    }))

  return (
    <div className="min-w-0 max-w-full space-y-4">
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="p-2 rounded-lg bg-primary-100 dark:bg-primary-900/40 shrink-0">
            <History className="w-6 h-6 text-primary-600 dark:text-primary-400" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white leading-tight">Historial de parihuelas por lote</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Consulte y exporte parihuelas recepcionadas o en tránsito por lote.</p>
          </div>
        </div>
        <div className="w-full sm:w-auto sm:ml-auto shrink-0">
          <ExportDropdown
            disabled={!loteSeleccionado || !filasExport.length}
            getExportConfig={() => ({
              fetchData: async () => ({ data: filasExport }),
              columns: [
                { key: 'lote', label: 'Lote' },
                { key: 'fecha_envio', label: 'Fecha envío' },
                { key: 'producto', label: 'Producto' },
                { key: 'cantidad', label: 'Cantidad' },
                { key: 'unidad', label: 'Unidad' },
                { key: 'estado', label: 'Estado' },
                { key: 'ubicacion', label: 'Ubicación' },
              ],
              title: `Historial parihuelas ${loteSeleccionado?.codigo || ''}`.trim(),
              filtersSummary: `Lote: ${loteSeleccionado?.codigo || '—'}`,
            })}
          />
        </div>
      </div>

      {/* Lotes */}
      <div className="flex flex-wrap gap-2">
        {loading ? (
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin" /> Cargando lotes…
          </div>
        ) : lotes.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No hay lotes con parihuelas.</p>
        ) : (
          lotes.map((lote) => (
            <button
              key={lote.id}
              type="button"
              onClick={() => setLoteSeleccionado((prev) => (prev?.id === lote.id ? null : lote))}
              className={`min-h-[44px] px-4 py-2.5 rounded-xl text-sm font-medium transition-colors border ${
                loteSeleccionado?.id === lote.id
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-600 hover:border-primary-500 dark:hover:border-primary-500'
              }`}
            >
              {lote.codigo}
              {lote.cliente_nombre || lote.especie_nombre ? ` · ${[lote.cliente_nombre, lote.especie_nombre].filter(Boolean).join(' — ')}` : ''}
              <span className="ml-1.5 opacity-80">({(lote.en_transito || 0) + (lote.almacenadas || 0)} parih.)</span>
            </button>
          ))
        )}
      </div>

      {/* Tabla por lote */}
      {loteSeleccionado && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden shadow-sm">
          <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
              Lote: {loteSeleccionado.codigo}
              {loteSeleccionado.cliente_nombre || loteSeleccionado.especie_nombre
                ? ` — ${[loteSeleccionado.cliente_nombre, loteSeleccionado.especie_nombre].filter(Boolean).join(' · ')}`
                : ''}
            </span>
          </div>
          {loadingLista ? (
            <div className="p-8 flex items-center justify-center gap-2 text-gray-500 dark:text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin" /> Cargando parihuelas…
            </div>
          ) : list.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">No hay parihuelas para este lote.</div>
          ) : (
            <div className="wms-table-scroll">
              <table className="min-w-[56rem] w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-700/50 text-left text-gray-600 dark:text-gray-300">
                    <th className="px-3 py-2 font-medium">Nº</th>
                    <th className="px-3 py-2 font-medium">Fecha envío</th>
                    <th className="px-3 py-2 font-medium">Producto</th>
                    <th className="px-3 py-2 font-medium">Cantidad</th>
                    <th className="px-3 py-2 font-medium">Unidad</th>
                    <th className="px-3 py-2 font-medium">Estado</th>
                    <th className="px-3 py-2 font-medium">Ubicación</th>
                    <th className="px-3 py-2 font-medium w-24">Rótulo</th>
                  </tr>
                </thead>
                <tbody>
                  {[...list]
                    .sort((a, b) => new Date(b.fecha_envio || b.created_at) - new Date(a.fecha_envio || a.created_at))
                    .map((p, idx) => (
                      <tr
                        key={p.id}
                        className="border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/30"
                      >
                        <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{list.length - idx}</td>
                        <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{formatFecha(p.fecha_envio || p.created_at)}</td>
                        <td className="px-3 py-2 text-gray-900 dark:text-gray-100">{productoLabel(p)}</td>
                        <td className="px-3 py-2">{p.cantidad ?? '—'}</td>
                        <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{p.unidad_parihuela === 'CAJAS' ? 'Cajas' : 'Bultos'}</td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                              p.estado === 'ALMACENADA'
                                ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
                                : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                            }`}
                          >
                            {p.estado === 'ALMACENADA' ? 'Recepcionada' : 'En tránsito'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{p.ubicacion ?? '—'}</td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => setRotuloId(p.id)}
                            className="inline-flex items-center gap-1 min-h-[40px] sm:min-h-0 py-1 text-primary-600 dark:text-primary-400 hover:underline"
                          >
                            <FileText className="w-4 h-4" /> Ver
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {rotuloId && (
        <RotuloParihuela
          parihuelaId={rotuloId}
          onClose={() => setRotuloId(null)}
          clienteNombre={loteSeleccionado?.cliente_nombre ?? null}
          especieNombre={loteSeleccionado?.especie_nombre ?? null}
        />
      )}
    </div>
  )
}

export default HistorialParihuelas
