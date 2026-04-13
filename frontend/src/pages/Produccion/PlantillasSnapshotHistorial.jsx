import React, { useEffect, useState } from 'react'
import { Loader2, Archive, ChevronDown, ChevronRight } from 'lucide-react'
import { plantillasProcesoApi } from '../../api/plantillas-proceso'
import toast from 'react-hot-toast'

const fmtFecha = (v) => {
  if (!v) return '—'
  try {
    const d = new Date(v)
    return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString()
  } catch {
    return String(v)
  }
}

const PlantillasSnapshotHistorial = () => {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    plantillasProcesoApi
      .historialSnapshots()
      .then((r) => {
        if (!cancelled) setRows(r.data?.data ?? [])
      })
      .catch(() => {
        if (!cancelled) toast.error('No se pudo cargar el historial')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const rowKey = (r) => `${r.proceso}-${r.registro_id}`

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex items-start gap-3 mb-6">
        <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/40">
          <Archive className="w-6 h-6 text-amber-700 dark:text-amber-300" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Snapshots de plantillas (finalizados)</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Copias guardadas al finalizar envasado, congelado o empaque, asociadas al código de lote. Solo administración.
          </p>
        </div>
      </div>

      {loading && rows.length === 0 ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-10 h-10 animate-spin text-primary-600" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400">Aún no hay snapshots registrados.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-600 text-left text-gray-600 dark:text-gray-400">
                <th className="px-3 py-2 font-medium">Proceso</th>
                <th className="px-3 py-2 font-medium">Lote</th>
                <th className="px-3 py-2 font-medium">Finalizado</th>
                <th className="px-3 py-2 font-medium">Título plantilla (actual)</th>
                <th className="px-3 py-2 w-10" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const k = rowKey(r)
                const open = openId === k
                const snap = r.plantilla_snapshot
                const tituloSnap = snap && typeof snap === 'object' ? snap.titulo : null
                const loteSnap = snap && typeof snap === 'object' ? snap.lote_codigo : null
                return (
                  <React.Fragment key={k}>
                    <tr className="border-b border-gray-100 dark:border-gray-700/80 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                      <td className="px-3 py-2 capitalize text-gray-900 dark:text-gray-100">{r.proceso}</td>
                      <td className="px-3 py-2 font-mono text-xs">{r.lote_codigo || '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{fmtFecha(r.finalizado_at)}</td>
                      <td className="px-3 py-2 text-gray-700 dark:text-gray-300">
                        {r.plantilla_titulo_actual || '—'}
                        {tituloSnap && tituloSnap !== r.plantilla_titulo_actual ? (
                          <span className="block text-xs text-gray-500">Snapshot título: {tituloSnap}</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          className="p-1 rounded text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600"
                          onClick={() => setOpenId(open ? null : k)}
                          title="Ver JSON"
                        >
                          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                      </td>
                    </tr>
                    {open && (
                      <tr className="bg-gray-50 dark:bg-gray-900/40">
                        <td colSpan={5} className="px-3 py-3">
                          <pre className="text-xs overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap break-all">
                            {JSON.stringify({ lote_codigo: r.lote_codigo, lote_en_snapshot: loteSnap, snapshot: snap }, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default PlantillasSnapshotHistorial
