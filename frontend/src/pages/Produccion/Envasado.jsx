import React, { useState, useEffect } from 'react'
import { FlaskConical, Loader2, Save, CheckCircle, RotateCcw, Plus, FileText } from 'lucide-react'
import { envasadoApi } from '../../api/envasado'
import { plantillasProcesoApi } from '../../api/plantillas-proceso'
import { useAuth } from '../../contexts/AuthContext'
import { exportMatrixVerticalPdf, exportMatrixExcelSingleSheet } from '../../utils/exportReport'
import ExportMatrixModal from '../../components/ExportMatrixModal'
import toast from 'react-hot-toast'

const MSJ_SIN_GUARDAR = 'Hay cambios sin guardar. ¿Salir sin guardar?'
const MSJ_CAMBIO_PLANTILLA = 'Al cambiar la plantilla se perderá todo el progreso de este registro. ¿Continuar?'

const HORAS_OPCIONES = Array.from({ length: 24 }, (_, i) => i)
const DEFAULT_COLUMNAS = 5
const turnoHora = (h) => (h >= 7 && h <= 18 ? 'Día' : 'Noche')

const pesoBandeja = (formato) => {
  const f = Number(formato)
  if (f === 20) return 10
  if (f === 15) return 7.5
  if (f > 0) return f / 2
  return 0
}

const createColumnasInicial = () =>
  Array.from({ length: DEFAULT_COLUMNAS }, (_, i) => ({ id: `col-${i}-${Date.now()}`, hora: 7 + i }))

/** Columnas guardadas en BD o, si no hay, horas por defecto + horas que ya tienen datos (evita perder columnas al recargar). */
const columnasDesdeRespuesta = (data) => {
  const saved = data?.columnas_hora
  if (Array.isArray(saved) && saved.length > 0) {
    return saved.map((c, i) => ({
      id: c.id != null ? String(c.id) : `col-srv-${i}`,
      hora: Math.min(23, Math.max(0, Number(c.hora) || 0)),
    }))
  }
  const keys = new Set()
  ;(data?.productos || []).forEach((p) => {
    Object.keys(p.datos_horas || {}).forEach((k) => {
      const n = parseInt(k, 10)
      if (!Number.isNaN(n) && n >= 0 && n <= 23) keys.add(n)
    })
  })
  const def = [7, 8, 9, 10, 11]
  const merged = [...new Set([...def, ...keys])].sort((a, b) => a - b)
  return merged.map((h) => ({ id: `hora-${h}`, hora: h }))
}

const Envasado = () => {
  const { isAdmin } = useAuth()
  const [lotesActivos, setLotesActivos] = useState([])
  const [envasados, setEnvasados] = useState([])
  const [loading, setLoading] = useState(true)
  const [loteSeleccionado, setLoteSeleccionado] = useState(null)
  const [envasadoActual, setEnvasadoActual] = useState(null)
  const [envasadoData, setEnvasadoData] = useState(null)
  const [plantillas, setPlantillas] = useState([])
  const [columnasHoras, setColumnasHoras] = useState(createColumnasInicial)
  const [iniciando, setIniciando] = useState(false)
  const [saving, setSaving] = useState(false)
  const [finalizando, setFinalizando] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [reabriendo, setReabriendo] = useState(null)
  const [exporting, setExporting] = useState(null)
  const [openExport, setOpenExport] = useState(false)
  const [exportOrientation, setExportOrientation] = useState('portrait')

  /** Al cambiar la hora de una columna, migrar datos_horas de todas las filas (clave = hora) y marcar sucio. */
  const setHoraColumna = (colId, oldHora, nuevaHoraStr) => {
    const newH = Number(nuevaHoraStr)
    const oldH = Number(oldHora)
    if (oldH === newH || Number.isNaN(newH)) return
    const oldK = String(oldH)
    const newK = String(newH)
    setColumnasHoras((prev) => prev.map((c) => (c.id === colId ? { ...c, hora: newH } : c)))
    setEnvasadoData((prev) => {
      if (!prev?.productos) return prev
      const productos = prev.productos.map((p) => {
        const dh = { ...(p.datos_horas || {}) }
        const vOld = Number(dh[oldK]) || 0
        delete dh[oldK]
        if (vOld > 0) dh[newK] = (Number(dh[newK]) || 0) + vOld
        return { ...p, datos_horas: dh }
      })
      return { ...prev, productos }
    })
    setDirty(true)
  }
  const agregarColumnaHora = () => {
    const usadas = new Set(columnasHoras.map((c) => c.hora))
    let next = 0
    for (let i = 0; i < 24; i++) if (!usadas.has(i)) { next = i; break }
    setColumnasHoras((prev) => [...prev, { id: `col-${Date.now()}`, hora: next }])
    setDirty(true)
  }
  const quitarColumnaHora = (colId, hora) => {
    if (columnasHoras.length <= 1) return
    setColumnasHoras((prev) => prev.filter((c) => c.id !== colId))
    const hk = String(hora)
    setEnvasadoData((prev) => {
      if (!prev?.productos) return prev
      return {
        ...prev,
        productos: prev.productos.map((p) => {
          const dh = { ...(p.datos_horas || {}) }
          delete dh[hk]
          return { ...p, datos_horas: dh }
        }),
      }
    })
    setDirty(true)
  }

  const loadLotesYEnvasados = () => {
    setLoading(true)
    Promise.all([envasadoApi.lotesActivos(), envasadoApi.listar()])
      .then(([r1, r2]) => {
        setLotesActivos(r1.data?.data ?? r1.data ?? [])
        setEnvasados(r2.data?.data ?? r2.data ?? [])
      })
      .catch(() => toast.error('Error al cargar'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadLotesYEnvasados()
  }, [])

  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (dirty) e.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  const envasadoPorLote = (loteId) => envasados.find((e) => e.lote_id === loteId)

  const handleClickLote = (lote) => {
    if (dirty && !window.confirm(MSJ_SIN_GUARDAR)) return
    const ev = envasadoPorLote(lote.id)
    if (ev) {
      setLoteSeleccionado(lote)
      setEnvasadoActual(ev)
      loadEnvasado(ev.id)
    } else {
      setLoteSeleccionado(lote)
      setEnvasadoActual(null)
      setEnvasadoData(null)
    }
    setDirty(false)
  }

  const loadEnvasado = (id) => {
    envasadoApi.obtener(id).then(({ data }) => {
      setEnvasadoData(data)
      setColumnasHoras(columnasDesdeRespuesta(data))
      setDirty(false)
      if (data?.plantilla_id && data?.cliente_id && data?.especie_id) {
        plantillasProcesoApi.listar().then(({ data: list }) => {
          const all = list?.data ?? list ?? []
          setPlantillas(all.filter((p) => p.cliente_id === data.cliente_id && p.especie_id === data.especie_id))
        }).catch(() => setPlantillas([]))
      } else {
        setPlantillas([])
      }
    }).catch(() => toast.error('Error al cargar envasado'))
  }

  const handleIniciarEnvasado = () => {
    if (!loteSeleccionado) return
    setIniciando(true)
    envasadoApi.iniciar(loteSeleccionado.id)
      .then(({ data }) => {
        toast.success('Envasado iniciado')
        loadLotesYEnvasados()
        setEnvasadoActual(data)
        loadEnvasado(data.id)
      })
      .catch((err) => toast.error(err.response?.data?.message || 'Error al iniciar'))
      .finally(() => setIniciando(false))
  }

  const handleCambiarPlantilla = (e) => {
    const plantilla_id = e.target.value
    if (!plantilla_id || !envasadoActual?.id) return
    if (envasadoData?.plantilla_id !== plantilla_id && !window.confirm(MSJ_CAMBIO_PLANTILLA)) return
    setSaving(true)
    envasadoApi.actualizar(envasadoActual.id, { plantilla_id })
      .then(() => {
        toast.success('Plantilla actualizada')
        loadEnvasado(envasadoActual.id)
      })
      .catch(() => toast.error('Error al cambiar plantilla'))
      .finally(() => setSaving(false))
  }

  const setBandejas = (productoId, hora, value) => {
    const num = Math.max(0, parseInt(value, 10) || 0)
    setEnvasadoData((prev) => {
      if (!prev?.productos) return prev
      const productos = prev.productos.map((p) =>
        p.producto_id === productoId
          ? { ...p, datos_horas: { ...p.datos_horas, [String(hora)]: num } }
          : p
      )
      return { ...prev, productos }
    })
    setDirty(true)
  }

  const handleGuardar = () => {
    if (!envasadoActual?.id || !envasadoData?.productos) return
    setSaving(true)
    const productos = envasadoData.productos.map((p) => ({
      producto_id: p.producto_id,
      datos_horas: p.datos_horas || {},
    }))
    const columnas_horas = columnasHoras.map((c) => ({ id: c.id, hora: c.hora }))
    envasadoApi.actualizar(envasadoActual.id, { productos, columnas_horas })
      .then(() => {
        toast.success('Cambios guardados')
        setDirty(false)
        loadEnvasado(envasadoActual.id)
      })
      .catch(() => toast.error('Error al guardar'))
      .finally(() => setSaving(false))
  }

  const handleFinalizar = () => {
    if (!envasadoActual?.id) return
    if (!window.confirm('¿Finalizar envasado? No se podrá editar después.')) return
    setFinalizando(true)
    envasadoApi.finalizar(envasadoActual.id)
      .then(() => {
        toast.success('Envasado finalizado')
        setEnvasadoData((prev) => (prev ? { ...prev, estado: 'finalizado' } : null))
        setEnvasadoActual((prev) => (prev ? { ...prev, estado: 'finalizado' } : null))
        loadLotesYEnvasados()
      })
      .catch(() => toast.error('Error al finalizar'))
      .finally(() => setFinalizando(false))
  }

  const handleReabrir = () => {
    if (!envasadoActual?.id) return
    if (!window.confirm('Reabrir envasado (solo administrador). ¿Continuar?')) return
    setReabriendo(envasadoActual.id)
    envasadoApi.reabrir(envasadoActual.id)
      .then(() => {
        toast.success('Envasado reabierto')
        loadEnvasado(envasadoActual.id)
        loadLotesYEnvasados()
        setEnvasadoActual((prev) => (prev ? { ...prev, estado: 'en_proceso' } : null))
        setEnvasadoData((prev) => (prev ? { ...prev, estado: 'en_proceso' } : null))
      })
      .catch(() => toast.error('Error al reabrir'))
      .finally(() => setReabriendo(null))
  }

  const readonly = envasadoData?.estado === 'finalizado'
  const horasExport = (columnasHoras || []).map((col) => ({
    key: `h_${col.hora}`,
    label: `${String(col.hora).padStart(2, '0')}:00`,
    hora: col.hora,
  }))

  const filasExportEnvasado = productosAgrupados().flatMap(({ nombreProducto, productos }) =>
    productos.map((p, idx) => {
      const { totalBandejas, totalKg } = totalesPorFila(p)
      const row = {
        producto_grupo: idx === 0 ? nombreProducto : '',
        linea: [p.codigo, p.descripcion || p.producto || '', p.presentacion || ''].filter(Boolean).join(' · '),
      }
      for (const h of horasExport) {
        row[h.key] = Number((p.datos_horas || {})[String(h.hora)] || 0)
      }
      row.total_bandejas = totalBandejas
      row.total_kg = Number(totalKg.toFixed(2))
      return row
    })
  )
  const colsExportEnvasado = [
    { key: 'producto_grupo', label: 'Producto' },
    { key: 'linea', label: 'Código · Descripción' },
    ...horasExport.map((h) => ({ key: h.key, label: h.label })),
    { key: 'total_bandejas', label: 'Total B.' },
    { key: 'total_kg', label: 'Total kg' },
  ]
  const exportarPdf = (orientation = 'portrait') => {
    if (!filasExportEnvasado.length) return
    setExporting('pdf')
    try {
      exportMatrixVerticalPdf(
        filasExportEnvasado,
        colsExportEnvasado,
        `Envasado ${envasadoData?.lote_codigo || ''}`.trim(),
        `Lote: ${envasadoData?.lote_codigo || '—'} · Plantilla: ${envasadoData?.plantilla_titulo || '—'}`,
        { totalColumnKeys: ['total_bandejas', 'total_kg'], orientation }
      )
      toast.success('PDF exportado')
    } catch (e) {
      toast.error('No se pudo exportar PDF')
    } finally {
      setExporting(null)
    }
  }
  const exportarExcel = () => {
    if (!filasExportEnvasado.length) return
    setExporting('excel')
    try {
      exportMatrixExcelSingleSheet(
        filasExportEnvasado,
        colsExportEnvasado,
        `Envasado ${envasadoData?.lote_codigo || ''}`.trim(),
        `Lote: ${envasadoData?.lote_codigo || '—'} · Plantilla: ${envasadoData?.plantilla_titulo || '—'}`
      )
      toast.success('Excel exportado')
    } catch (e) {
      toast.error('No se pudo exportar Excel')
    } finally {
      setExporting(null)
    }
  }
  function totalesPorFila(producto) {
    const horas = producto.datos_horas || {}
    const totalBandejas = Object.entries(horas).reduce((s, [, v]) => s + (Number(v) || 0), 0)
    const peso = pesoBandeja(producto.formato)
    const totalKg = totalBandejas * peso
    return { totalBandejas, totalKg }
  }
  const totalesGeneral = () => {
    if (!envasadoData?.productos) return { bandejas: 0, kg: 0 }
    return envasadoData.productos.reduce(
      (acc, p) => {
        const { totalBandejas, totalKg } = totalesPorFila(p)
        return { bandejas: acc.bandejas + totalBandejas, kg: acc.kg + totalKg }
      },
      { bandejas: 0, kg: 0 }
    )
  }

  function productosAgrupados() {
    if (!envasadoData?.productos?.length) return []
    const orderIdx = new Map()
    envasadoData.productos.forEach((p, i) => {
      if (!orderIdx.has(p.producto_id)) orderIdx.set(p.producto_id, i)
    })
    const byProducto = new Map()
    envasadoData.productos.forEach((p) => {
      const nombreProducto = (p.producto || '').trim() || 'Sin producto'
      if (!byProducto.has(nombreProducto)) byProducto.set(nombreProducto, [])
      byProducto.get(nombreProducto).push(p)
    })
    const groups = Array.from(byProducto.entries()).map(([nombreProducto, productos]) => ({
      nombreProducto,
      productos: [...productos].sort((a, b) => (orderIdx.get(a.producto_id) ?? 0) - (orderIdx.get(b.producto_id) ?? 0)),
    }))
    return groups.sort((a, b) => {
      const minA = Math.min(...a.productos.map((p) => orderIdx.get(p.producto_id) ?? 999999))
      const minB = Math.min(...b.productos.map((p) => orderIdx.get(p.producto_id) ?? 999999))
      if (minA !== minB) return minA - minB
      return (a.nombreProducto || '').localeCompare(b.nombreProducto || '', 'es')
    })
  }

  if (loading && lotesActivos.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-10 h-10 animate-spin text-primary-600" />
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-primary-100 dark:bg-primary-900/40 shrink-0">
          <FlaskConical className="w-6 h-6 text-primary-600 dark:text-primary-400" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Envasado</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Bandejas por hora</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 ml-auto">
          {lotesActivos.length === 0 ? (
            <span className="text-sm text-gray-500 dark:text-gray-400">No hay lotes activos.</span>
          ) : (
            lotesActivos.map((lote) => {
              const ev = envasadoPorLote(lote.id)
              const selected = loteSeleccionado?.id === lote.id
              return (
                <button
                  key={lote.id}
                  type="button"
                  onClick={() => handleClickLote(lote)}
                  className={`text-left px-4 py-2.5 rounded-xl border-2 min-w-[200px] transition-colors ${
                    selected
                      ? 'border-primary-500 bg-primary-500/20 dark:bg-primary-500/30 text-gray-900 dark:text-white'
                      : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:border-gray-300 dark:hover:border-gray-500'
                  }`}
                >
                  <div className="font-semibold text-base">{lote.codigo}</div>
                  <div className="text-xs mt-0.5 text-gray-600 dark:text-gray-400">
                    {lote.cliente_nombre} — {lote.especie_nombre}
                  </div>
                  <div className="text-xs mt-1">
                    {ev ? (
                      <span className={ev.estado === 'finalizado' ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}>
                        Envasado {ev.estado === 'finalizado' ? 'finalizado' : 'en proceso'}
                      </span>
                    ) : (
                      <span className="text-gray-500 dark:text-gray-500">Sin envasado</span>
                    )}
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>

      <div className="w-full">
          {!loteSeleccionado && (
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-8 text-center text-gray-500 dark:text-gray-400">
              Seleccione un lote para iniciar envasado o ver el envasado en curso.
            </div>
          )}

          {loteSeleccionado && !envasadoActual && (
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <p className="text-gray-700 dark:text-gray-300 mb-4">
                Lote <strong>{loteSeleccionado.codigo}</strong> — {loteSeleccionado.cliente_nombre} / {loteSeleccionado.especie_nombre}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Este lote aún no tiene envasado. Se usará la plantilla predeterminada del cliente y especie.</p>
              <button
                type="button"
                onClick={handleIniciarEnvasado}
                disabled={iniciando}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium disabled:opacity-50"
              >
                {iniciando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                Iniciar envasado
              </button>
            </div>
          )}

          {envasadoActual && envasadoData && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {envasadoData.lote_codigo} — {envasadoData.cliente_nombre} — {envasadoData.especie_nombre}
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                    Plantilla: {envasadoData.plantilla_titulo}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setOpenExport(true)}
                    disabled={!filasExportEnvasado.length}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                  >
                    <FileText className="w-4 h-4" />
                    Exportar
                  </button>
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">Otra plantilla:</label>
                    <select
                      value={envasadoData.plantilla_id}
                      onChange={handleCambiarPlantilla}
                      disabled={readonly || saving}
                      className="px-3 py-1.5 border border-gray-300 dark:border-gray-500 rounded-lg text-sm min-w-[180px] bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500"
                    >
                      {plantillas.map((p) => (
                        <option key={p.id} value={p.id}>{p.titulo}</option>
                      ))}
                    </select>
                  </div>
                  {!readonly && (
                    <button
                      type="button"
                      onClick={agregarColumnaHora}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-100 hover:bg-gray-300 dark:hover:bg-gray-500"
                    >
                      <Plus className="w-4 h-4" />
                      Agregar columna
                    </button>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden">
                <div className="overflow-x-auto" style={{ overflowX: 'auto' }}>
                  <table className="min-w-full text-sm border-collapse">
                    <colgroup>
                      <col style={{ width: '90px' }} />
                      <col style={{ width: '180px', minWidth: '160px' }} />
                    </colgroup>
                    <thead>
                      <tr className="bg-gray-100 dark:bg-gray-700">
                        <th className="px-2 py-2 text-left font-medium text-gray-900 dark:text-gray-100 sticky left-0 z-20 bg-gray-100 dark:bg-gray-700 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]" style={{ minWidth: '90px' }}>
                          Producto
                        </th>
                        <th className="px-2 py-2 text-left font-medium text-gray-900 dark:text-gray-100 sticky z-20 bg-gray-100 dark:bg-gray-700 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]" style={{ left: '90px' }}>
                          Código · Descripción
                        </th>
                        {columnasHoras.map((col) => (
                          <th key={col.id} className="px-0 py-1 text-center w-12 bg-gray-100 dark:bg-gray-700">
                            <select
                              value={col.hora}
                              onChange={(e) => setHoraColumna(col.id, col.hora, e.target.value)}
                              disabled={readonly}
                              className="w-full text-xs font-medium bg-white dark:bg-gray-600 border-0 rounded py-0.5 text-gray-900 dark:text-gray-100 cursor-pointer"
                              title={`${col.hora}:00 — Turno ${turnoHora(col.hora)}`}
                            >
                              {HORAS_OPCIONES.map((h) => (
                                <option key={h} value={h}>{h}:00 {turnoHora(h)}</option>
                              ))}
                            </select>
                          </th>
                        ))}
                        <th className="px-2 py-2 text-center font-medium text-gray-900 dark:text-gray-100 sticky z-20 bg-gray-50 dark:bg-gray-600 w-16 min-w-[4rem] shadow-[4px_0_6px_-2px_rgba(0,0,0,0.08)]" style={{ right: '5rem' }}>
                          Total B.
                        </th>
                        <th className="px-2 py-2 text-center font-medium text-gray-900 dark:text-gray-100 sticky right-0 z-20 bg-gray-50 dark:bg-gray-600 w-16 min-w-[4rem] shadow-[2px_0_6px_-2px_rgba(0,0,0,0.08)]">
                          Total kg
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                      {productosAgrupados().map(({ nombreProducto, productos }) =>
                        productos.map((p, idx) => {
                          const { totalBandejas, totalKg } = totalesPorFila(p)
                          const linea = [p.codigo, p.descripcion, p.presentacion].filter(Boolean).join(' · ')
                          const isFirst = idx === 0
                          return (
                            <tr key={p.producto_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                              {isFirst ? (
                                <td rowSpan={productos.length} className="px-2 py-1 align-center sticky left-0 z-10 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 text-x shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]" style={{ minWidth: '90px' }}>
                                  {nombreProducto}
                                </td>
                              ) : null}
                              <td className="px-2 py-1 whitespace-nowrap overflow-hidden text-ellipsis sticky z-10 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-xs shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]" style={{ left: '90px' }} title={linea}>
                                {linea}
                              </td>
                              {columnasHoras.map((col) => (
                                <td key={col.id} className="px-0.5 py-0.5 w-12">
                                  <input
                                    type="number"
                                    min="0"
                                    step="1"
                                    value={(p.datos_horas || {})[String(col.hora)] ?? ''}
                                    onChange={(e) => setBandejas(p.producto_id, col.hora, e.target.value)}
                                    disabled={readonly}
                                    className="w-11 h-7 text-center text-xs border border-gray-300 dark:border-gray-500 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                                  />
                                </td>
                              ))}
                              <td className="px-2 py-1 text-center font-medium sticky z-10 bg-white dark:bg-gray-800 w-16 text-gray-900 dark:text-gray-100 shadow-[4px_0_6px_-2px_rgba(0,0,0,0.08)]" style={{ right: '5rem' }}>
                                {totalBandejas}
                              </td>
                              <td className="px-2 py-1 text-center sticky right-0 z-10 bg-white dark:bg-gray-800 w-16 text-gray-900 dark:text-gray-100 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.08)]">
                                {totalKg.toFixed(1)}
                              </td>
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-gray-200 dark:border-gray-600">
                <div className="flex items-center gap-6">
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-100">
                    Total bandejas: <strong>{totalesGeneral().bandejas}</strong>
                  </span>
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-100">
                    Total kg: <strong>{totalesGeneral().kg.toFixed(1)}</strong>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {readonly && isAdmin() && (
                    <button
                      type="button"
                      onClick={handleReabrir}
                      disabled={!!reabriendo}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm disabled:opacity-50"
                    >
                      {reabriendo ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                      Reabrir
                    </button>
                  )}
                  {!readonly && (
                    <>
                      <button
                        type="button"
                        onClick={handleGuardar}
                        disabled={!dirty || saving}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                      >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Guardar cambios
                      </button>
                      <button
                        type="button"
                        onClick={handleFinalizar}
                        disabled={finalizando}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                      >
                        {finalizando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                        Finalizar envasado
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
      </div>
      <ExportMatrixModal
        isOpen={openExport}
        onClose={() => setOpenExport(false)}
        title={`Envasado ${envasadoData?.lote_codigo || ''}`.trim()}
        rows={filasExportEnvasado}
        columns={colsExportEnvasado}
        orientation={exportOrientation}
        onChangeOrientation={setExportOrientation}
        exporting={exporting}
        onExportPdf={() => {
          exportarPdf(exportOrientation)
          setOpenExport(false)
        }}
        onExportExcel={() => {
          exportarExcel()
          setOpenExport(false)
        }}
      />
    </div>
  )
}

export default Envasado
