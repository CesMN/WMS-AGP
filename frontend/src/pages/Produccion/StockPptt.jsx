import { useState, useEffect, useMemo } from 'react'
import { Boxes, Loader2, RefreshCw } from 'lucide-react'
import { stockApi } from '../../api/stock'
import toast from 'react-hot-toast'

function celdaKey(loteCodigo, productoId) {
  return `${loteCodigo}\0${productoId}`
}

function lineaCodigoDescripcion(p) {
  const parts = [p.codigo, p.descripcion, p.presentacion].filter((x) => (x || '').toString().trim())
  return parts.length ? parts.join(' · ') : '—'
}

const StockPptt = () => {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState({ productos: [], lotes: [], celdas: [] })
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    stockApi
      .matrizLoteProduccion()
      .then(({ data: d }) => {
        if (!cancelled) {
          setData({
            productos: d?.productos ?? [],
            lotes: d?.lotes ?? [],
            celdas: d?.celdas ?? [],
          })
        }
      })
      .catch(() => {
        if (!cancelled) {
          toast.error('Error al cargar stock por lote')
          setData({ productos: [], lotes: [], celdas: [] })
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  const mapaCeldas = useMemo(() => {
    const m = new Map()
    for (const c of data.celdas || []) {
      m.set(celdaKey(c.lote_codigo, c.producto_id), { bultos: c.bultos, kg: c.kg })
    }
    return m
  }, [data.celdas])

  const gruposProductos = useMemo(() => {
    const map = new Map()
    for (const p of data.productos || []) {
      const cat = (p.producto || '').trim() || 'Sin categoría'
      if (!map.has(cat)) map.set(cat, [])
      map.get(cat).push(p)
    }
    const entries = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es'))
    return entries.map(([categoria, items]) => ({
      categoria,
      items: items.slice().sort((a, b) => (a.codigo || '').localeCompare(b.codigo || '', 'es')),
    }))
  }, [data.productos])

  const totalesPorProducto = useMemo(() => {
    const m = new Map()
    const lotes = data.lotes || []
    for (const p of data.productos || []) {
      let bultos = 0
      let kg = 0
      for (const l of lotes) {
        const v = mapaCeldas.get(celdaKey(l.codigo, p.producto_id))
        if (v) {
          bultos += Number(v.bultos) || 0
          kg += Number(v.kg) || 0
        }
      }
      m.set(p.producto_id, { bultos, kg })
    }
    return m
  }, [data.productos, data.lotes, mapaCeldas])

  const totalesPorLote = useMemo(() => {
    const m = new Map()
    for (const l of data.lotes || []) {
      m.set(l.codigo, { kg: 0, bultos: 0 })
    }
    for (const c of data.celdas || []) {
      const cur = m.get(c.lote_codigo) || { kg: 0, bultos: 0 }
      cur.kg += Number(c.kg) || 0
      cur.bultos += Number(c.bultos) || 0
      m.set(c.lote_codigo, cur)
    }
    return m
  }, [data.lotes, data.celdas])

  const granTotalMatriz = useMemo(() => {
    let kg = 0
    let bultos = 0
    for (const c of data.celdas || []) {
      kg += Number(c.kg) || 0
      bultos += Number(c.bultos) || 0
    }
    return { kg, bultos }
  }, [data.celdas])

  const fmt = (n) => {
    const x = Number(n)
    if (Number.isNaN(x)) return '0'
    return Number.isInteger(x) ? String(x) : x.toFixed(2).replace(/\.?0+$/, '')
  }

  const stickyCat =
    'sticky left-0 z-20 min-w-[12rem] max-w-[12rem] w-[12rem] border-r border-gray-200 dark:border-gray-700 shadow-[3px_0_8px_-4px_rgba(0,0,0,0.12)]'
  const stickyDesc =
    'sticky z-20 left-[12rem] min-w-[16rem] max-w-[28rem] border-r border-gray-200 dark:border-gray-700 shadow-[3px_0_8px_-4px_rgba(0,0,0,0.08)]'

  return (
    <div className="min-w-0 max-w-full">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-5 sm:mb-6">
        <div className="min-w-0">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Producción</p>
          <h1 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Boxes className="w-6 h-6 text-primary-600 dark:text-primary-400 shrink-0" />
            Stock de PPTT
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 max-w-2xl">
            Stock por lote (kg en cada celda). Productos agrupados por tipo; la última columna resume kg y bultos en todos los
            lotes.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setRefreshKey((k) => k + 1)}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 shrink-0"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Actualizar
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-10 h-10 animate-spin text-primary-600" />
        </div>
      ) : data.lotes.length === 0 || data.productos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-600 p-8 text-center text-gray-600 dark:text-gray-400">
          No hay stock con lote informado en posiciones, o no hay cantidades mayores a cero.
        </div>
      ) : (
        <div className="wms-table-scroll rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm bg-white dark:bg-gray-950">
          <table className="min-w-max text-sm border-collapse w-full">
            <thead>
              <tr className="bg-gray-100 dark:bg-gray-800/95 text-gray-900 dark:text-white">
                <th
                  className={`${stickyCat} px-3 py-3 text-left text-xs font-bold uppercase tracking-wide bg-gray-100 dark:bg-gray-800/95`}
                >
                  Producto
                </th>
                <th
                  className={`${stickyDesc} px-3 py-3 text-left text-xs font-bold uppercase tracking-wide bg-gray-100 dark:bg-gray-800/95`}
                >
                  Código · Descripción
                </th>
                {data.lotes.map((row) => (
                  <th
                    key={row.codigo}
                    className="px-2 py-2 text-center text-xs font-semibold border-b border-gray-200 dark:border-gray-700 align-bottom min-w-[5.5rem] max-w-[8rem] text-gray-800 dark:text-gray-100"
                    title={row.estado ? `${row.codigo} · ${row.estado}` : row.codigo}
                  >
                    <div className="text-[11px] font-bold text-primary-600 dark:text-primary-400 truncate">{row.codigo}</div>
                    {row.estado ? (
                      <div className="text-[10px] font-normal text-gray-600 dark:text-gray-400 line-clamp-2 leading-tight mt-0.5">
                        {row.estado}
                      </div>
                    ) : null}
                  </th>
                ))}
                <th className="sticky right-0 z-30 px-3 py-3 text-right text-xs font-bold uppercase tracking-wide border-l border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800/95 min-w-[9rem] shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.12)]">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {gruposProductos.map((grupo) =>
                grupo.items.map((p, idx) => {
                  const t = totalesPorProducto.get(p.producto_id) || { kg: 0, bultos: 0 }
                  const isFirst = idx === 0
                  return (
                    <tr
                      key={p.producto_id}
                      className="border-b border-gray-200 dark:border-gray-700/80 bg-white dark:bg-gray-950 hover:bg-gray-50/80 dark:hover:bg-gray-900/80"
                    >
                      {isFirst ? (
                        <td
                          rowSpan={grupo.items.length}
                          className={`${stickyCat} align-top px-3 py-2.5 bg-white dark:bg-gray-950 text-xs font-bold text-gray-900 dark:text-white uppercase tracking-tight`}
                        >
                          {grupo.categoria}
                        </td>
                      ) : null}
                      <td
                        className={`${stickyDesc} px-3 py-2.5 text-xs text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-950 leading-snug`}
                      >
                        {lineaCodigoDescripcion(p)}
                      </td>
                      {data.lotes.map((row) => {
                        const v = mapaCeldas.get(celdaKey(row.codigo, p.producto_id))
                        const kg = v ? Number(v.kg) || 0 : 0
                        const has = v && (kg > 0 || (Number(v.bultos) || 0) > 0)
                        return (
                          <td
                            key={row.codigo}
                            className="px-2 py-2.5 text-center align-middle text-gray-800 dark:text-gray-200 tabular-nums text-xs"
                          >
                            {has ? <span>{fmt(kg)} kg</span> : <span className="text-gray-400 dark:text-gray-600">—</span>}
                          </td>
                        )
                      })}
                      <td className="sticky right-0 z-10 px-3 py-2.5 text-right border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.08)]">
                        <div className="flex items-center justify-end gap-2 flex-wrap text-xs tabular-nums">
                          <span className="font-semibold text-gray-900 dark:text-white">{fmt(t.kg)} kg</span>
                          <span className="text-gray-500 dark:text-gray-400 font-medium">{fmt(t.bultos)} b</span>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800/95 text-gray-900 dark:text-white font-semibold">
                <td
                  className={`${stickyCat} px-3 py-3 text-left text-xs uppercase tracking-wide bg-gray-100 dark:bg-gray-800/95 z-20`}
                >
                  Totales
                </td>
                <td
                  className={`${stickyDesc} px-3 py-3 text-left text-xs text-gray-500 dark:text-gray-500 bg-gray-100 dark:bg-gray-800/95 font-normal z-20`}
                >
                  —
                </td>
                {data.lotes.map((row) => {
                  const tl = totalesPorLote.get(row.codigo) || { kg: 0, bultos: 0 }
                  return (
                    <td
                      key={row.codigo}
                      className="px-2 py-3 text-center align-middle tabular-nums text-xs bg-gray-100 dark:bg-gray-800/95"
                    >
                      <div className="flex flex-col items-center gap-0.5 sm:flex-row sm:justify-center sm:gap-2">
                        <span>{fmt(tl.kg)} kg</span>
                        <span className="text-gray-600 dark:text-gray-400 font-medium">{fmt(tl.bultos)} b</span>
                      </div>
                    </td>
                  )
                })}
                <td className="sticky right-0 z-30 px-3 py-3 text-right border-l border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800/95 shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.12)]">
                  <div className="flex items-center justify-end gap-2 flex-wrap text-xs tabular-nums">
                    <span className="font-bold text-gray-900 dark:text-white">{fmt(granTotalMatriz.kg)} kg</span>
                    <span className="text-gray-600 dark:text-gray-400 font-semibold">{fmt(granTotalMatriz.bultos)} b</span>
                  </div>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

export default StockPptt
