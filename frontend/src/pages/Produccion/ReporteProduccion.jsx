import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { FileText, Loader2, FileSpreadsheet } from 'lucide-react'
import { reportesProduccionApi } from '../../api/reportes-produccion'
import { ingresosMpApi } from '../../api/ingresos-mp'
import { useConfig } from '../../contexts/ConfigContext'
import { useAuth } from '../../contexts/AuthContext'
import { exportParteProduccionPdf, exportParteProduccionExcel } from '../../utils/exportReport'
import toast from 'react-hot-toast'

const formatDate = (d) => (d ? new Date(d).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—')
const formatHora = (val) => (val == null || val === '' ? '—' : String(val))

const ReporteProduccion = () => {
  const { nombreEmpresa, logoEmpresa } = useConfig()
  const { user, isAdmin } = useAuth()
  const [lotes, setLotes] = useState([])
  const [loteSeleccionado, setLoteSeleccionado] = useState(null)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadingReporte, setLoadingReporte] = useState(false)
  const [exporting, setExporting] = useState(null)
  const [observacionReporte, setObservacionReporte] = useState('')
  const [savingObs, setSavingObs] = useState(false)

  useEffect(() => {
    setLoading(true)
    reportesProduccionApi.lotes()
      .then(({ data: res }) => setLotes(res?.data ?? res ?? []))
      .catch(() => toast.error('Error al cargar lotes'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!loteSeleccionado?.id) {
      setData(null)
      setObservacionReporte('')
      return
    }
    setLoadingReporte(true)
    reportesProduccionApi.reporteLote(loteSeleccionado.id)
      .then(({ data: res }) => setData(res))
      .catch(() => {
        toast.error('Error al cargar reporte')
        setData(null)
      })
      .finally(() => setLoadingReporte(false))
  }, [loteSeleccionado?.id])

  useEffect(() => {
    setObservacionReporte(data?.lote?.observaciones || '')
  }, [data?.lote?.id, data?.lote?.observaciones])

  const handleExportPdf = () => {
    if (!data) return
    setExporting('pdf')
    try {
      const dataExport = {
        ...data,
        lote: { ...(data.lote || {}), observaciones: observacionReporte || '' },
      }
      exportParteProduccionPdf(dataExport, {
        nombreEmpresa: nombreEmpresa || 'Sistema WMS',
        usuario: user?.nombre || user?.email || '',
        logoUrl: logoEmpresa || '',
      })
      toast.success('PDF descargado')
    } catch (e) {
      toast.error('Error al generar PDF')
    }
    setExporting(null)
  }

  const handleExportExcel = () => {
    if (!data) return
    setExporting('excel')
    try {
      const dataExport = {
        ...data,
        lote: { ...(data.lote || {}), observaciones: observacionReporte || '' },
      }
      exportParteProduccionExcel(dataExport, {
        nombreEmpresa: nombreEmpresa || 'Sistema WMS',
        usuario: user?.nombre || user?.email || '',
      })
      toast.success('Excel descargado')
    } catch (e) {
      toast.error('Error al generar Excel')
    }
    setExporting(null)
  }

  const totalKgMp = data?.recepcion_mp?.resumen?.total_kg ?? 0
  const resultados = data?.resultados_produccion || []
  const totalProdKg = resultados.reduce((s, p) => s + (Number(p.empaque_kg) || 0), 0)
  const guardarObservacion = async () => {
    if (!data?.lote?.id) return
    setSavingObs(true)
    try {
      await ingresosMpApi.loteActualizar(data.lote.id, { observaciones: observacionReporte || '' })
      setData((prev) => (prev ? { ...prev, lote: { ...(prev.lote || {}), observaciones: observacionReporte || '' } } : prev))
      toast.success('Observación guardada')
    } catch (e) {
      toast.error(e?.response?.data?.message || 'No se pudo guardar la observación')
    } finally {
      setSavingObs(false)
    }
  }

  // Agrupar por nombre de producto (categoría), manteniendo el orden de la plantilla (orden de aparición en resultados).
  const gruposProducto = React.useMemo(() => {
    const map = new Map()
    resultados.forEach((p, idx) => {
      const nombreProducto = (p.producto || '').trim() || 'Sin producto'
      if (!map.has(nombreProducto)) {
        map.set(nombreProducto, { items: [], firstIdx: idx })
      }
      map.get(nombreProducto).items.push(p)
    })
    return Array.from(map.entries())
      .map(([nombreProducto, { items, firstIdx }]) => {
        const totalBultos = items.reduce((s, i) => s + (Number(i.empaque_bultos) || 0), 0)
        const totalKg = items.reduce((s, i) => s + (Number(i.empaque_kg) || 0), 0)
        const rendimiento = totalKgMp > 0 ? Number(((totalKg / totalKgMp) * 100).toFixed(1)) : 0
        return { nombreProducto, items, firstIdx, totalBultos, totalKg, rendimiento }
      })
      .sort((a, b) => a.firstIdx - b.firstIdx)
  }, [resultados, totalKgMp])

  return (
    <div className="min-w-0 max-w-full space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <FileText className="w-6 h-6 text-primary-600 dark:text-primary-400 shrink-0" />
            <h1 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">Parte de producción</h1>
          </div>
          {isAdmin() && (
            <p className="text-xs text-gray-500 dark:text-gray-400 pl-8 max-w-2xl">
              Las plantillas guardadas al <strong className="font-medium text-gray-600 dark:text-gray-300">finalizar empaque</strong> (orden y productos) se listan en{' '}
              <Link to="/produccion/plantillas-snapshots" className="text-primary-600 dark:text-primary-400 hover:underline">
                Producción → Snapshots de plantillas (finalizados)
              </Link>
              .
            </p>
          )}
        </div>
        {data && (
          <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2 w-full lg:w-auto">
            <button
              type="button"
              onClick={handleExportPdf}
              disabled={!!exporting}
              className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 py-2.5 sm:py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 w-full sm:w-auto"
            >
              {exporting === 'pdf' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              Exportar PDF
            </button>
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={!!exporting}
              className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 py-2.5 sm:py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 w-full sm:w-auto"
            >
              {exporting === 'excel' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
              Exportar Excel
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-nowrap gap-2 pb-2 wms-table-scroll sm:flex-wrap sm:overflow-visible sm:pb-0">
        {loading ? (
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin" /> Cargando lotes…
          </div>
        ) : lotes.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No hay lotes.</p>
        ) : (
          lotes.map((lote) => (
            <button
              key={lote.id}
              type="button"
              onClick={() => setLoteSeleccionado((prev) => (prev?.id === lote.id ? null : lote))}
              className={`shrink-0 min-h-[44px] px-4 py-2.5 rounded-xl text-sm font-medium transition-colors border ${
                loteSeleccionado?.id === lote.id
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-600 hover:border-primary-500 dark:hover:border-primary-500'
              }`}
            >
              {lote.codigo}
              {(lote.cliente_nombre || lote.especie_nombre) ? ` · ${[lote.cliente_nombre, lote.especie_nombre].filter(Boolean).join(' — ')}` : ''}
            </button>
          ))
        )}
      </div>

      {loteSeleccionado && (
        <div className="space-y-6">
          {loadingReporte ? (
            <div className="p-8 flex items-center justify-center gap-2 text-gray-500 dark:text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin" /> Cargando reporte…
            </div>
          ) : data ? (
            <div className="space-y-6">
              {/* Encabezado simple */}
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
                <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                  Lote {data.lote?.codigo}
                  {(data.lote?.cliente_nombre || data.lote?.especie_nombre)
                    ? ` — ${[data.lote.cliente_nombre, data.lote.especie_nombre].filter(Boolean).join(' · ')}`
                    : ''}
                </h2>
                <div className="flex flex-wrap gap-4 text-sm text-gray-600 dark:text-gray-400">
                  <span>Estado: {data.lote?.estado ?? '—'}</span>
                  <span>Creación: {formatDate(data.lote?.fecha_creacion)}</span>
                  <span>Inicio: {formatDate(data.lote?.fecha_inicio)}</span>
                  <span>Término: {formatDate(data.lote?.fecha_terminado)}</span>
                </div>
              </div>

              {/* Recepción MP (resumen + tabla simple) */}
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
                <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                  <span className="font-medium text-gray-700 dark:text-gray-200">Recepción de materia prima</span>
                </div>
                <div className="p-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Total descargas</p>
                      <p className="text-lg font-semibold text-gray-900 dark:text-white">{data.recepcion_mp?.resumen?.total_descargas ?? 0}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Total kg (winchas)</p>
                      <p className="text-lg font-semibold text-gray-900 dark:text-white">{data.recepcion_mp?.resumen?.total_kg ?? 0}</p>
                    </div>
                  </div>
                  {data.recepcion_mp?.descargas?.length > 0 && (
                    <div className="wms-table-scroll">
                      <table className="min-w-[36rem] w-full text-sm">
                        <thead>
                          <tr className="text-left text-gray-700 dark:text-gray-100 border-b border-gray-200 dark:border-gray-600">
                            <th className="pb-2 pr-2 font-medium">Guía</th>
                            <th className="pb-2 pr-2 font-medium">Fecha</th>
                            <th className="pb-2 pr-2 font-medium">Placas</th>
                            <th className="pb-2 pr-2 font-medium">Proveedor</th>
                            <th className="pb-2 text-right font-medium">Kg</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.recepcion_mp.descargas.map((d) => (
                            <tr key={d.id} className="border-b border-gray-100 dark:border-gray-700">
                              <td className="py-1.5 pr-2 text-gray-900 dark:text-gray-100">{d.numero_guia_interna || '—'}</td>
                              <td className="py-1.5 pr-2 text-gray-600 dark:text-gray-400">{formatDate(d.fecha_descarga)}</td>
                              <td className="py-1.5 pr-2 text-gray-800 dark:text-gray-200">{d.placas_vehiculo || '—'}</td>
                              <td className="py-1.5 pr-2 text-gray-800 dark:text-gray-200">{d.proveedor_razon_social || '—'}</td>
                              <td className="py-1.5 text-right text-gray-900 dark:text-gray-100">{Number(d.total_kg) || 0}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* Resultados producción: agrupado por Producto (estilo imagen) */}
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
                <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                  <span className="font-medium text-gray-700 dark:text-gray-200">Resultados de producción (resumen empaque)</span>
                </div>
                {gruposProducto.length > 0 ? (
                  <div className="wms-table-scroll">
                    <table className="min-w-[52rem] w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-gray-600 text-left text-gray-800 dark:text-gray-100 bg-gray-100/80 dark:bg-gray-700/60">
                          <th className="px-3 py-2 font-semibold w-44">Producto</th>
                          <th className="px-3 py-2 font-semibold">Código · Descripción</th>
                          <th className="px-3 py-2 font-semibold text-right w-20">Bultos</th>
                          <th className="px-3 py-2 font-semibold text-right w-20">Total (kg)</th>
                          <th className="px-3 py-2 font-semibold text-right w-24">TOTAL GENERAL</th>
                          <th className="px-3 py-2 font-semibold text-right w-20">REND. %</th>
                          <th className="px-3 py-2 font-semibold text-right w-24">REND GRAL %</th>
                        </tr>
                      </thead>
                      <tbody className="text-gray-900 dark:text-gray-100">
                        {gruposProducto.map((grupo) => (
                          <React.Fragment key={grupo.nombreProducto}>
                            {grupo.items.map((p, idx) => {
                              const kg = Number(p.empaque_kg) || 0
                              const rendItem = totalProdKg > 0 ? ((kg / totalProdKg) * 100).toFixed(2) : '0.00'
                              return (
                                <tr
                                  key={p.producto_id}
                                  className={`border-b border-gray-100 dark:border-gray-700 ${idx === 0 ? 'border-t-2 border-gray-300 dark:border-gray-500' : ''}`}
                                >
                                  {idx === 0 && (
                                    <td
                                      rowSpan={grupo.items.length}
                                      className="px-3 py-2 align-top font-bold uppercase text-gray-900 dark:text-gray-50 bg-gray-50 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-600"
                                    >
                                      {grupo.nombreProducto}
                                    </td>
                                  )}
                                  <td className="px-3 py-1.5 text-gray-700 dark:text-gray-200">
                                    {[p.codigo, p.descripcion || p.producto, p.presentacion].filter(Boolean).join(' · ')}
                                  </td>
                                  <td className="px-3 py-1.5 text-right">{Number(p.empaque_bultos) || 0}</td>
                                  <td className="px-3 py-1.5 text-right">{kg}</td>
                                  {idx === 0 && (
                                    <td
                                      rowSpan={grupo.items.length}
                                      className="px-3 py-2 text-right font-bold bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-50 align-top border-l border-gray-200 dark:border-gray-600"
                                    >
                                      {grupo.totalKg.toFixed(1)}
                                    </td>
                                  )}
                                  <td className="px-3 py-1.5 text-right bg-gray-50 dark:bg-gray-800/80 text-gray-900 dark:text-gray-100">{rendItem}%</td>
                                  {idx === 0 && (
                                    <td
                                      rowSpan={grupo.items.length}
                                      className="px-3 py-2 text-right font-bold bg-amber-100 dark:bg-amber-950/50 text-primary-800 dark:text-sky-300 align-top border-l border-gray-200 dark:border-gray-600"
                                    >
                                      {grupo.rendimiento}%
                                    </td>
                                  )}
                                </tr>
                              )
                            })}
                          </React.Fragment>
                        ))}
                        <tr className="border-t-2 border-gray-300 dark:border-gray-500 bg-gray-200 dark:bg-gray-800 font-bold text-gray-900 dark:text-gray-50">
                          <td className="px-3 py-2">Total general</td>
                          <td className="px-3 py-2" />
                          <td className="px-3 py-2 text-right">{resultados.reduce((s, p) => s + (Number(p.empaque_bultos) || 0), 0)}</td>
                          <td className="px-3 py-2 text-right">{totalProdKg.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right">{totalProdKg.toFixed(1)}</td>
                          <td className="px-3 py-2 text-right">100%</td>
                          <td className="px-3 py-2 text-right text-primary-700 dark:text-sky-300">{data.rendimiento_pct != null ? `${data.rendimiento_pct}%` : '—'}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-6 text-sm text-gray-500 dark:text-gray-400">Sin datos de producción para este lote.</div>
                )}
              </div>

              {/* III. Solo insumos de empaque (conciliación / icono verde) */}
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
                <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                  <span className="font-medium text-gray-700 dark:text-gray-200">III. Insumos de empaque (plantilla)</span>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 font-normal">
                    Lo que eligió con el icono verde en conciliación. No incluye agua, hielo ni bunker.
                  </p>
                </div>
                {(data.insumos || []).length > 0 ? (
                  <div className="wms-table-scroll">
                    <table className="min-w-[32rem] w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-700 dark:text-gray-100 border-b border-gray-200 dark:border-gray-600">
                          <th className="px-3 py-2 font-medium">Código</th>
                          <th className="px-3 py-2 font-medium">Descripción</th>
                          <th className="px-3 py-2 text-right font-medium">Cantidad</th>
                          <th className="px-3 py-2 font-medium">Unid.</th>
                          <th className="px-3 py-2 text-right font-medium">Ratio TM</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.insumos.map((i, idx) => (
                          <tr key={`${i.codigo}-${idx}`} className="border-b border-gray-100 dark:border-gray-700">
                            <td className="px-3 py-1.5 text-gray-900 dark:text-gray-100">{i.codigo || '—'}</td>
                            <td className="px-3 py-1.5 text-gray-800 dark:text-gray-200">{i.descripcion || '—'}</td>
                            <td className="px-3 py-1.5 text-right text-gray-900 dark:text-gray-100">{i.cantidad ?? '—'}</td>
                            <td className="px-3 py-1.5 text-gray-600 dark:text-gray-400">{i.unidad_medida || '—'}</td>
                            <td className="px-3 py-1.5 text-right text-gray-800 dark:text-gray-200">
                              {i.ratio_tm != null ? i.ratio_tm : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-6 text-sm text-gray-500 dark:text-gray-400">
                    (Sin datos.) Guarde la selección con &quot;Agregar a producción&quot; en conciliación empaque (misma plantilla del lote).
                  </div>
                )}
              </div>

              {/* IV. Insumos operativos generales (planta) — aparte de empaque */}
              <div className="rounded-xl border-2 border-indigo-200 dark:border-indigo-800 bg-indigo-50/30 dark:bg-indigo-950/20 overflow-hidden">
                <div className="px-4 py-2 border-b border-indigo-200 dark:border-indigo-800 bg-indigo-100/40 dark:bg-indigo-950/40">
                  <span className="font-medium text-indigo-950 dark:text-indigo-100">IV. Insumos operativos generales</span>
                  <p className="text-xs text-indigo-900/85 dark:text-indigo-200/90 mt-1 font-normal">
                    Agua y hielo: plantilla × TM de materia prima. Bunker: galones registrados en conciliación (resumen manual). No forman parte de la tabla de empaque.
                  </p>
                </div>
                {(data.insumos_operativos || []).length > 0 ? (
                  <div className="wms-table-scroll bg-white/80 dark:bg-gray-900/40">
                    <table className="min-w-[40rem] w-full text-sm">
                      <thead>
                        <tr className="text-left text-indigo-900 dark:text-indigo-200 border-b border-indigo-200 dark:border-indigo-800">
                          <th className="px-3 py-2 font-medium">Código</th>
                          <th className="px-3 py-2 font-medium">Descripción</th>
                          <th className="px-3 py-2 font-medium">Origen</th>
                          <th className="px-3 py-2 text-right font-medium">Cantidad</th>
                          <th className="px-3 py-2 font-medium">Unid.</th>
                          <th className="px-3 py-2 text-right font-medium">Ratio TM</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(data.insumos_operativos || []).map((i, idx) => (
                          <tr key={`op-${idx}`} className="border-b border-indigo-100 dark:border-indigo-900/40">
                            <td className="px-3 py-1.5 text-gray-900 dark:text-gray-100">{i.codigo || '—'}</td>
                            <td className="px-3 py-1.5 text-gray-800 dark:text-gray-200">
                              {i.descripcion || '—'}
                              {i.detalle && (
                                <span className="block text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{i.detalle}</span>
                              )}
                            </td>
                            <td className="px-3 py-1.5 text-gray-600 dark:text-gray-400 text-xs">
                              {i.fuente === 'calculado_tm_mp'
                                ? 'TM MP'
                                : i.fuente === 'manual_resumen'
                                  ? 'Resumen manual'
                                  : i.fuente === 'salidas_documento'
                                    ? 'Documento'
                                    : i.fuente || '—'}
                            </td>
                            <td className="px-3 py-1.5 text-right text-gray-900 dark:text-gray-100">{i.cantidad ?? '—'}</td>
                            <td className="px-3 py-1.5 text-gray-600 dark:text-gray-400">{i.unidad_medida || '—'}</td>
                            <td className="px-3 py-1.5 text-right text-gray-800 dark:text-gray-200">
                              {i.ratio_tm != null ? i.ratio_tm : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-6 text-sm text-gray-600 dark:text-gray-400">
                    (Sin datos.) Configure en <strong className="font-medium text-gray-800 dark:text-gray-200">Plantillas de proceso</strong> el apartado de insumos operativos (agua, hielo, bunker).
                  </div>
                )}
              </div>

              {/* Stock y rendimiento */}
              <div className="grid md:grid-cols-2 gap-4">
                <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
                  <h3 className="font-medium text-gray-700 dark:text-gray-200 mb-2">Stock en almacén (por este lote)</h3>
                  <div className="flex gap-6">
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Total bultos</p>
                      <p className="text-xl font-semibold text-gray-900 dark:text-white">{data.stock_almacen?.total_bultos ?? 0}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Total kg</p>
                      <p className="text-xl font-semibold text-gray-900 dark:text-white">{data.stock_almacen?.total_kg ?? 0}</p>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
                  <h3 className="font-medium text-gray-700 dark:text-gray-200 mb-2">Rendimiento general</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Kg producto terminado / Kg materia prima × 100</p>
                  <p className="text-2xl font-semibold text-primary-600 dark:text-primary-400">
                    {data.rendimiento_pct != null ? `${data.rendimiento_pct} %` : '—'}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
                <h3 className="font-medium text-gray-700 dark:text-gray-200 mb-2">Observación para exportación</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                  Esta observación se incluye en la sección final del PDF y Excel del parte.
                </p>
                <textarea
                  rows={3}
                  value={observacionReporte}
                  onChange={(e) => setObservacionReporte(e.target.value)}
                  placeholder="Escriba una observación para el reporte..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                />
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={guardarObservacion}
                    disabled={savingObs}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm disabled:opacity-50"
                  >
                    {savingObs ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Guardar observación
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

export default ReporteProduccion
