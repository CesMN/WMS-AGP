import React, { useState, useEffect } from 'react'
import { Snowflake, Loader2, Save, CheckCircle, RotateCcw, Plus, FileText } from 'lucide-react'
import { congeladoApi } from '../../api/congelado'
import { plantillasProcesoApi } from '../../api/plantillas-proceso'
import { useAuth } from '../../contexts/AuthContext'
import { exportMatrixVerticalPdf, exportMatrixExcelSingleSheet } from '../../utils/exportReport'
import ExportMatrixModal from '../../components/ExportMatrixModal'
import toast from 'react-hot-toast'
import { parseBandejasValor } from '../../utils/parseBandejasValor'

const MSJ_SIN_GUARDAR = 'Hay cambios sin guardar. ¿Salir sin guardar?'
const MSJ_CAMBIO_PLANTILLA = 'Al cambiar la plantilla se perderá todo el progreso de este registro. ¿Continuar?'

const TIPOS_CONGE = [{ value: 'tunel', label: 'Túnel' }, { value: 'placa', label: 'Placa' }]
const DEFAULT_COLUMNAS = 5
const turnoHora = (h) => (h >= 7 && h <= 18 ? 'Día' : 'Noche')

/** HH:mm 24h */
const normalizarHoraInicio = (s) => {
  if (typeof s !== 'string' || !s.trim()) return null
  const m = s.trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return null
  const hh = Math.min(23, Math.max(0, parseInt(m[1], 10)))
  const mm = Math.min(59, Math.max(0, parseInt(m[2], 10)))
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

const horaInicioDesdeColumna = (col) => {
  const n = normalizarHoraInicio(col?.hora_inicio)
  if (n) return n
  const hr = Number(col?.hora)
  if (!Number.isNaN(hr) && hr >= 0 && hr <= 23) return `${String(hr).padStart(2, '0')}:00`
  return '07:00'
}

const etiquetaTurnoDesdeHoraStr = (hi) => {
  const h = parseInt((hi || '0').split(':')[0], 10) || 0
  return turnoHora(h)
}

const pesoBandeja = (formato) => {
  const f = Number(formato)
  if (f === 20) return 10
  if (f === 15) return 7.5
  if (f > 0) return f / 2
  return 0
}

const createColumnasInicial = () =>
  Array.from({ length: DEFAULT_COLUMNAS }, (_, i) => {
    const h = 7 + i
    return {
      id: `col-${i}-${Date.now()}`,
      tipo: 'tunel',
      numero: 1,
      hora: h,
      hora_inicio: `${String(h).padStart(2, '0')}:00`,
    }
  })

const normalizarColumnasDesdeServidor = (cols) => {
  if (!Array.isArray(cols) || cols.length === 0) return createColumnasInicial()
  return cols.map((c, i) => {
    const hi = normalizarHoraInicio(c.hora_inicio) || (Number(c.hora) >= 0 && Number(c.hora) <= 23
      ? `${String(Number(c.hora)).padStart(2, '0')}:00`
      : '07:00')
    const hh = parseInt(hi.split(':')[0], 10) || 0
    return {
      ...c,
      id: c.id != null ? String(c.id) : `col-${i}`,
      hora_inicio: hi,
      hora: hh,
    }
  })
}

const Congelado = () => {
  const { isAdmin } = useAuth()
  const [lotesActivos, setLotesActivos] = useState([])
  const [congelados, setCongelados] = useState([])
  const [loading, setLoading] = useState(true)
  const [loteSeleccionado, setLoteSeleccionado] = useState(null)
  const [congeladoActual, setCongeladoActual] = useState(null)
  const [congeladoData, setCongeladoData] = useState(null)
  const [plantillas, setPlantillas] = useState([])
  const [columnas, setColumnas] = useState(createColumnasInicial)
  const [iniciando, setIniciando] = useState(false)
  const [saving, setSaving] = useState(false)
  const [finalizando, setFinalizando] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [reabriendo, setReabriendo] = useState(null)
  const [exporting, setExporting] = useState(null)
  const [openExport, setOpenExport] = useState(false)
  const [exportOrientation, setExportOrientation] = useState('portrait')
  const [colWidths, setColWidths] = useState({})

  const setTipoColumna = (colId, tipo) => {
    setColumnas((prev) => prev.map((c) => (c.id === colId ? { ...c, tipo } : c)))
    setDirty(true)
  }
  const setNumeroColumna = (colId, numero) => {
    const n = Math.max(1, parseInt(numero, 10) || 1)
    setColumnas((prev) => prev.map((c) => (c.id === colId ? { ...c, numero: n } : c)))
    setDirty(true)
  }
  const setHoraInicioColumna = (colId, value) => {
    const hi = normalizarHoraInicio(value) || '00:00'
    const hh = parseInt(hi.split(':')[0], 10) || 0
    setColumnas((prev) => prev.map((c) => (c.id === colId ? { ...c, hora_inicio: hi, hora: hh } : c)))
    setDirty(true)
  }
  const agregarColumna = () => {
    setColumnas((prev) => {
      const usadas = new Set(prev.map((c) => horaInicioDesdeColumna(c)))
      let hi = '12:00'
      for (let t = 0; t < 24 * 60; t++) {
        const h = Math.floor(t / 60)
        const m = t % 60
        const candidate = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
        if (!usadas.has(candidate)) {
          hi = candidate
          break
        }
      }
      const hh = parseInt(hi.split(':')[0], 10) || 0
      return [...prev, { id: `col-${Date.now()}`, tipo: 'tunel', numero: 1, hora: hh, hora_inicio: hi }]
    })
    setDirty(true)
  }

  const loadLotesYCongelados = () => {
    setLoading(true)
    Promise.all([congeladoApi.lotesActivos(), congeladoApi.listar()])
      .then(([r1, r2]) => {
        setLotesActivos(r1.data?.data ?? r1.data ?? [])
        setCongelados(r2.data?.data ?? r2.data ?? [])
      })
      .catch(() => toast.error('Error al cargar'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadLotesYCongelados()
  }, [])

  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (dirty) e.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  const congeladoPorLote = (loteId) => congelados.find((e) => e.lote_id === loteId)

  const handleClickLote = (lote) => {
    if (dirty && !window.confirm(MSJ_SIN_GUARDAR)) return
    const cv = congeladoPorLote(lote.id)
    if (cv) {
      setLoteSeleccionado(lote)
      setCongeladoActual(cv)
      loadCongelado(cv.id)
    } else {
      setLoteSeleccionado(lote)
      setCongeladoActual(null)
      setCongeladoData(null)
    }
    setDirty(false)
  }

  const loadCongelado = (id) => {
    congeladoApi.obtener(id).then(({ data }) => {
      setCongeladoData(data)
      setColumnas(normalizarColumnasDesdeServidor(data?.columnas))
      setDirty(false)
      if (data?.plantilla_id && data?.cliente_id && data?.especie_id) {
        plantillasProcesoApi.listar().then(({ data: list }) => {
          const all = list?.data ?? list ?? []
          setPlantillas(all.filter((p) => p.cliente_id === data.cliente_id && p.especie_id === data.especie_id))
        }).catch(() => setPlantillas([]))
      } else {
        setPlantillas([])
      }
    }).catch(() => toast.error('Error al cargar congelado'))
  }

  const handleIniciar = () => {
    if (!loteSeleccionado) return
    setIniciando(true)
    congeladoApi.iniciar(loteSeleccionado.id)
      .then(({ data }) => {
        toast.success('Congelado iniciado')
        loadLotesYCongelados()
        setCongeladoActual(data)
        loadCongelado(data.id)
      })
      .catch((err) => toast.error(err.response?.data?.message || 'Error al iniciar'))
      .finally(() => setIniciando(false))
  }

  const handleCambiarPlantilla = (e) => {
    const plantilla_id = e.target.value
    if (!plantilla_id || !congeladoActual?.id) return
    if (congeladoData?.plantilla_id !== plantilla_id && !window.confirm(MSJ_CAMBIO_PLANTILLA)) return
    setSaving(true)
    congeladoApi.actualizar(congeladoActual.id, { plantilla_id })
      .then(() => {
        toast.success('Plantilla actualizada')
        loadCongelado(congeladoActual.id)
      })
      .catch(() => toast.error('Error al cambiar plantilla'))
      .finally(() => setSaving(false))
  }

  const setCantidad = (productoId, colId, value) => {
    const r = parseBandejasValor(value)
    if (r.skip) return
    setCongeladoData((prev) => {
      if (!prev?.productos) return prev
      const productos = prev.productos.map((p) => {
        if (p.producto_id !== productoId) return p
        const datos_columnas = { ...p.datos_columnas }
        if (r.clear) delete datos_columnas[colId]
        else datos_columnas[colId] = r.num
        return { ...p, datos_columnas }
      })
      return { ...prev, productos }
    })
    setDirty(true)
  }

  const handleGridArrowNav = (e, gridId, row, col, maxRow, maxCol) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (row >= maxRow) return
      const nextRow = row + 1
      const next = document.querySelector(`[data-grid="${gridId}"][data-row="${nextRow}"][data-col="${col}"]`)
      if (next) {
        next.focus()
        if (typeof next.select === 'function') next.select()
      }
      return
    }
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return
    e.preventDefault()
    let nextRow = row
    let nextCol = col
    if (e.key === 'ArrowUp') nextRow = Math.max(0, row - 1)
    if (e.key === 'ArrowDown') nextRow = Math.min(maxRow, row + 1)
    if (e.key === 'ArrowLeft') nextCol = Math.max(0, col - 1)
    if (e.key === 'ArrowRight') nextCol = Math.min(maxCol, col + 1)
    const next = document.querySelector(`[data-grid="${gridId}"][data-row="${nextRow}"][data-col="${nextCol}"]`)
    if (next) {
      next.focus()
      if (typeof next.select === 'function') next.select()
    }
  }

  const getClientX = (ev) => (ev?.touches?.length ? ev.touches[0].clientX : ev.clientX)
  const startResize = (ev, key, min = 44, max = 420) => {
    ev.preventDefault()
    const startX = getClientX(ev)
    const base = Number(colWidths[key] ?? min)
    const onMove = (moveEv) => {
      if (moveEv.cancelable) moveEv.preventDefault()
      const clientX = getClientX(moveEv)
      if (typeof clientX !== 'number') return
      const width = Math.max(min, Math.min(max, Math.round(base + (clientX - startX))))
      setColWidths((prev) => ({ ...prev, [key]: width }))
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onUp)
  }

  const handleGuardar = () => {
    if (!congeladoActual?.id || !congeladoData?.productos) return
    setSaving(true)
    congeladoApi.actualizar(congeladoActual.id, {
      columnas,
      productos: congeladoData.productos.map((p) => ({
        producto_id: p.producto_id,
        datos_columnas: p.datos_columnas || {},
      })),
    })
      .then(() => {
        toast.success('Cambios guardados')
        setDirty(false)
        loadCongelado(congeladoActual.id)
      })
      .catch((err) => toast.error(err.response?.data?.message || err.response?.data?.detail || err.message || 'Error al guardar'))
      .finally(() => setSaving(false))
  }

  const handleFinalizar = () => {
    if (!congeladoActual?.id) return
    if (!window.confirm('¿Finalizar congelado? No se podrá editar después.')) return
    setFinalizando(true)
    congeladoApi.finalizar(congeladoActual.id)
      .then(() => {
        toast.success('Congelado finalizado')
        setCongeladoData((prev) => (prev ? { ...prev, estado: 'finalizado' } : null))
        setCongeladoActual((prev) => (prev ? { ...prev, estado: 'finalizado' } : null))
        loadLotesYCongelados()
      })
      .catch(() => toast.error('Error al finalizar'))
      .finally(() => setFinalizando(false))
  }

  const handleReabrir = () => {
    if (!congeladoActual?.id) return
    if (!window.confirm('Reabrir congelado (solo administrador). ¿Continuar?')) return
    setReabriendo(congeladoActual.id)
    congeladoApi.reabrir(congeladoActual.id)
      .then(() => {
        toast.success('Congelado reabierto')
        loadCongelado(congeladoActual.id)
        loadLotesYCongelados()
        setCongeladoActual((prev) => (prev ? { ...prev, estado: 'en_proceso' } : null))
        setCongeladoData((prev) => (prev ? { ...prev, estado: 'en_proceso' } : null))
      })
      .catch(() => toast.error('Error al reabrir'))
      .finally(() => setReabriendo(null))
  }

  const readonly = congeladoData?.estado === 'finalizado'
  const widthProducto = Number(colWidths.producto ?? 90)
  const widthDetalle = Number(colWidths.detalle ?? 180)
  const widthTotalB = Number(colWidths.totalB ?? 64)
  const widthTotalKg = Number(colWidths.totalKg ?? 64)
  const widthCol = (id) => Number(colWidths[`c-${id}`] ?? 52)
  const totalesPorFila = (producto) => {
    const datos = producto.datos_columnas || {}
    const totalBandejas = Object.entries(datos).reduce((s, [, v]) => s + (Number(v) || 0), 0)
    const peso = pesoBandeja(producto.formato)
    const totalKg = totalBandejas * peso
    return { totalBandejas, totalKg }
  }
  const totalesGeneral = () => {
    if (!congeladoData?.productos) return { bandejas: 0, kg: 0 }
    return congeladoData.productos.reduce(
      (acc, p) => {
        const { totalBandejas, totalKg } = totalesPorFila(p)
        return { bandejas: acc.bandejas + totalBandejas, kg: acc.kg + totalKg }
      },
      { bandejas: 0, kg: 0 }
    )
  }
  const etiquetaEquipoColumna = (col) =>
    `${col.tipo === 'tunel' ? 'Túnel' : 'Placa'} ${Number(col.numero) > 0 ? col.numero : 1}`

  const colsExportCongelado = [
    { key: 'producto', label: 'Producto', headerRow1: 'Producto', headerRow2: '' },
    { key: 'linea', label: 'Código · Descripción', headerRow1: 'Código · Descripción', headerRow2: '' },
    ...(columnas || []).map((c) => {
      const eq = etiquetaEquipoColumna(c)
      const hi = horaInicioDesdeColumna(c)
      return {
        key: `c_${c.id}`,
        label: `${eq}\n${hi}`,
        headerRow1: eq,
        headerRow2: hi,
      }
    }),
    { key: 'total_bandejas', label: 'Total B.', headerRow1: 'Total B.', headerRow2: '' },
    { key: 'total_kg', label: 'Total kg', headerRow1: 'Total kg', headerRow2: '' },
  ]
  const filasMatrizCongelado = productosAgrupados().flatMap(({ nombreProducto, productos }) =>
    productos.map((p, idx) => {
      const { totalBandejas, totalKg } = totalesPorFila(p)
      const row = {
        producto: idx === 0 ? nombreProducto : '',
        linea: [p.codigo, p.descripcion || p.producto || '', p.presentacion || ''].filter(Boolean).join(' · '),
      }
      ;(columnas || []).forEach((c) => {
        row[`c_${c.id}`] = Number((p.datos_columnas || {})[c.id] || 0)
      })
      row.total_bandejas = totalBandejas
      row.total_kg = Number(totalKg.toFixed(2))
      return row
    })
  )
  const exportarPdf = (orientation = 'portrait') => {
    if (!filasMatrizCongelado.length) return
    setExporting('pdf')
    try {
      exportMatrixVerticalPdf(
        filasMatrizCongelado,
        colsExportCongelado,
        `Congelado ${congeladoData?.lote_codigo || ''}`.trim(),
        `Lote: ${congeladoData?.lote_codigo || '—'} · Plantilla: ${congeladoData?.plantilla_titulo || '—'}`,
        { totalColumnKeys: ['total_bandejas', 'total_kg'], orientation }
      )
      toast.success('PDF exportado')
    } catch (_) {
      toast.error('No se pudo exportar PDF')
    } finally {
      setExporting(null)
    }
  }
  const exportarExcel = () => {
    if (!filasMatrizCongelado.length) return
    setExporting('excel')
    try {
      exportMatrixExcelSingleSheet(
        filasMatrizCongelado,
        colsExportCongelado,
        `Congelado ${congeladoData?.lote_codigo || ''}`.trim(),
        `Lote: ${congeladoData?.lote_codigo || '—'} · Plantilla: ${congeladoData?.plantilla_titulo || '—'}`
      )
      toast.success('Excel exportado')
    } catch (_) {
      toast.error('No se pudo exportar Excel')
    } finally {
      setExporting(null)
    }
  }

  /** Totales por columna (bachada / túnel o placa en ese instante) */
  const totalesPorColumnaBachada = () =>
    columnas.map((col) => {
      let bandejas = 0
      let kg = 0
      ;(congeladoData?.productos || []).forEach((p) => {
        const v = Number((p.datos_columnas || {})[col.id]) || 0
        bandejas += v
        kg += v * pesoBandeja(p.formato)
      })
      return { col, bandejas, kg }
    })

  function productosAgrupados() {
    if (!congeladoData?.productos?.length) return []
    const orderIdx = new Map()
    congeladoData.productos.forEach((p, i) => {
      if (!orderIdx.has(p.producto_id)) orderIdx.set(p.producto_id, i)
    })
    const byProducto = new Map()
    congeladoData.productos.forEach((p) => {
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

  const bgColumnaTipo = (tipo) =>
    tipo === 'tunel'
      ? 'bg-sky-100 dark:bg-sky-900/40'
      : 'bg-emerald-100 dark:bg-emerald-900/40'

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
          <Snowflake className="w-6 h-6 text-primary-600 dark:text-primary-400" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Congelado</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Bachadas por túnel o placa · Hora y minuto de inicio</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 ml-auto">
          {lotesActivos.length === 0 ? (
            <span className="text-sm text-gray-500 dark:text-gray-400">No hay lotes activos.</span>
          ) : (
            lotesActivos.map((lote) => {
              const cv = congeladoPorLote(lote.id)
              const selected = loteSeleccionado?.id === lote.id
              return (
                <button
                  key={lote.id}
                  type="button"
                  onClick={() => handleClickLote(lote)}
                  className={`text-left px-4 py-2.5 rounded-xl border-2 w-full sm:min-w-[200px] sm:w-auto transition-colors ${
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
                    {cv ? (
                      <span className={cv.estado === 'finalizado' ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}>
                        Congelado {cv.estado === 'finalizado' ? 'finalizado' : 'en proceso'}
                      </span>
                    ) : (
                      <span className="text-gray-500 dark:text-gray-500">Sin congelado</span>
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
            Seleccione un lote para iniciar congelado o ver el congelado en curso.
          </div>
        )}

        {loteSeleccionado && !congeladoActual && (
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              Lote <strong>{loteSeleccionado.codigo}</strong> — {loteSeleccionado.cliente_nombre} / {loteSeleccionado.especie_nombre}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Este lote aún no tiene congelado. Se usará la plantilla predeterminada.</p>
            <button
              type="button"
              onClick={handleIniciar}
              disabled={iniciando}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium disabled:opacity-50"
            >
              {iniciando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              Iniciar congelado
            </button>
          </div>
        )}

        {congeladoActual && congeladoData && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {congeladoData.lote_codigo} — {congeladoData.cliente_nombre} — {congeladoData.especie_nombre}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  Plantilla: {congeladoData.plantilla_titulo}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <button
                  type="button"
                  onClick={() => setOpenExport(true)}
                  disabled={!filasMatrizCongelado.length}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  <FileText className="w-4 h-4" />
                  Exportar
                </button>
                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                  <label className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">Otra plantilla:</label>
                  <select
                    value={congeladoData.plantilla_id}
                    onChange={handleCambiarPlantilla}
                    disabled={readonly || saving}
                    className="min-h-[40px] px-3 py-1.5 border border-gray-300 dark:border-gray-500 rounded-lg text-sm w-full sm:w-auto sm:min-w-[180px] bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500"
                  >
                    {plantillas.map((p) => (
                      <option key={p.id} value={p.id}>{p.titulo}</option>
                    ))}
                  </select>
                </div>
                {!readonly && (
                  <button
                    type="button"
                    onClick={agregarColumna}
                    className="inline-flex items-center gap-1.5 min-h-[40px] px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-100 hover:bg-gray-300 dark:hover:bg-gray-500"
                  >
                    <Plus className="w-4 h-4" />
                    Agregar columna
                  </button>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 dark:border-gray-600">
              <div className="px-3 py-1.5 text-[11px] text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/40">
                Vista tipo hoja de cálculo: deslice horizontalmente para ver túneles/placas y totales.
              </div>
              <div className="wms-table-scroll wms-table-mobile" style={{ overflowX: 'auto' }}>
                <table className="min-w-[50rem] md:min-w-[58rem] w-full text-sm border-separate border-spacing-0 table-fixed">
                  <colgroup>
                    <col style={{ width: `${widthProducto}px` }} />
                    <col style={{ width: `${widthDetalle}px`, minWidth: `${Math.min(widthDetalle, 160)}px` }} />
                    {columnas.map((col) => (
                      <col key={`col-celda-${col.id}`} style={{ width: `${widthCol(col.id)}px`, minWidth: `${widthCol(col.id)}px`, maxWidth: `${widthCol(col.id)}px` }} />
                    ))}
                    <col style={{ width: `${widthTotalB}px`, minWidth: `${widthTotalB}px`, maxWidth: `${widthTotalB}px` }} />
                    <col style={{ width: `${widthTotalKg}px`, minWidth: `${widthTotalKg}px`, maxWidth: `${widthTotalKg}px` }} />
                  </colgroup>
                  <thead>
                    <tr className="bg-gray-100 dark:bg-gray-700">
                      <th rowSpan={2} className="relative px-2 py-2 text-left text-[11px] font-semibold text-gray-900 dark:text-gray-100 md:sticky max-md:!static md:left-0 top-0 z-30 bg-gray-100 dark:bg-gray-700 border-b border-r border-gray-200 dark:border-gray-600 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)] align-middle" style={{ minWidth: `${widthProducto}px` }}>
                        Producto
                        <div className="absolute right-0 top-0 h-full w-2 cursor-col-resize touch-none" onMouseDown={(e) => startResize(e, 'producto', 70, 260)} onTouchStart={(e) => startResize(e, 'producto', 70, 260)} />
                      </th>
                      <th rowSpan={2} className="relative px-2 py-2 text-left text-[11px] font-semibold text-gray-900 dark:text-gray-100 md:sticky max-md:!static top-0 z-30 bg-gray-100 dark:bg-gray-700 border-b border-r border-gray-200 dark:border-gray-600 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)] align-middle" style={{ left: `${widthProducto}px` }}>
                        Código · Descripción
                        <div className="absolute right-0 top-0 h-full w-2 cursor-col-resize touch-none" onMouseDown={(e) => startResize(e, 'detalle', 140, 420)} onTouchStart={(e) => startResize(e, 'detalle', 140, 420)} />
                      </th>
                      {columnas.map((col) => (
                        <th key={`${col.id}-equipo`} className={`relative px-1 py-2 text-center text-xs font-semibold md:sticky max-md:!static md:top-0 z-20 border-b border-r border-gray-200 dark:border-gray-600 ${bgColumnaTipo(col.tipo)}`} style={{ width: `${widthCol(col.id)}px` }}>
                          {etiquetaEquipoColumna(col)}
                          <div className="absolute right-0 top-0 h-full w-2 cursor-col-resize touch-none" onMouseDown={(e) => startResize(e, `c-${col.id}`, 44, 160)} onTouchStart={(e) => startResize(e, `c-${col.id}`, 44, 160)} />
                        </th>
                      ))}
                      <th rowSpan={2} className="relative px-2 py-2 text-center text-[11px] font-semibold text-gray-900 dark:text-gray-100 md:sticky max-md:!static top-0 z-30 bg-gray-50 dark:bg-gray-600 border-b border-r border-gray-200 dark:border-gray-600 shadow-[4px_0_6px_-2px_rgba(0,0,0,0.08)] align-middle" style={{ width: `${widthTotalB}px`, minWidth: `${widthTotalB}px`, right: `${widthTotalKg}px` }}>
                        Total B.
                        <div className="absolute right-0 top-0 h-full w-2 cursor-col-resize touch-none" onMouseDown={(e) => startResize(e, 'totalB', 56, 160)} onTouchStart={(e) => startResize(e, 'totalB', 56, 160)} />
                      </th>
                      <th rowSpan={2} className="relative px-2 py-2 text-center text-[11px] font-semibold text-gray-900 dark:text-gray-100 md:sticky max-md:!static md:right-0 top-0 z-30 bg-gray-50 dark:bg-gray-600 border-b border-gray-200 dark:border-gray-600 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.08)] align-middle" style={{ width: `${widthTotalKg}px`, minWidth: `${widthTotalKg}px` }}>
                        Total kg
                        <div className="absolute right-0 top-0 h-full w-2 cursor-col-resize touch-none" onMouseDown={(e) => startResize(e, 'totalKg', 56, 160)} onTouchStart={(e) => startResize(e, 'totalKg', 56, 160)} />
                      </th>
                    </tr>
                    <tr className="bg-gray-100 dark:bg-gray-700">
                      {columnas.map((col) => (
                        <th key={`${col.id}-hora`} className={`px-0 py-1 text-center md:sticky max-md:!static md:top-[34px] z-20 border-b border-r border-gray-200 dark:border-gray-600 ${bgColumnaTipo(col.tipo)}`} style={{ width: `${widthCol(col.id)}px` }}>
                          <select
                            value={col.tipo}
                            onChange={(e) => setTipoColumna(col.id, e.target.value)}
                            disabled={readonly}
                            className="w-full text-[10px] font-medium bg-transparent border-0 rounded py-0 text-gray-900 dark:text-gray-100 cursor-pointer"
                          >
                            {TIPOS_CONGE.map((t) => (
                              <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                          </select>
                          <select
                            value={col.numero}
                            onChange={(e) => setNumeroColumna(col.id, e.target.value)}
                            disabled={readonly}
                            className="w-full text-[10px] mt-0.5 bg-white/80 dark:bg-black/20 border-0 rounded text-gray-900 dark:text-gray-100"
                          >
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                              <option key={n} value={n}>{n}</option>
                            ))}
                          </select>
                          <div className="mt-0.5 px-0.5">
                            <input
                              type="time"
                              step={60}
                              value={horaInicioDesdeColumna(col)}
                              onChange={(e) => setHoraInicioColumna(col.id, e.target.value)}
                              disabled={readonly}
                              title={`Inicio de congelado · Turno ${etiquetaTurnoDesdeHoraStr(horaInicioDesdeColumna(col))}`}
                              className="w-full min-w-0 text-[10px] font-medium rounded border border-gray-300 dark:border-gray-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 py-0 px-0.5 [color-scheme:dark]"
                            />
                            <div className="text-[9px] text-gray-600 dark:text-gray-400 mt-0.5 leading-tight">
                              {horaInicioDesdeColumna(col)} · {etiquetaTurnoDesdeHoraStr(horaInicioDesdeColumna(col))}
                            </div>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      let rowCursor = -1
                      const maxRow = Math.max((congeladoData?.productos?.length || 1) - 1, 0)
                      const maxCol = Math.max((columnas?.length || 0) + 3, 3)
                      return productosAgrupados().map(({ nombreProducto, productos }) =>
                      productos.map((p, idx) => {
                        rowCursor += 1
                        const rowIndex = rowCursor
                        const { totalBandejas, totalKg } = totalesPorFila(p)
                        const linea = [p.codigo, p.descripcion, p.presentacion].filter(Boolean).join(' · ')
                        const isFirst = idx === 0
                        return (
                          <tr key={p.producto_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 odd:bg-white even:bg-gray-50/40 dark:odd:bg-gray-800 dark:even:bg-gray-800/70">
                            {isFirst ? (
                              <td
                                rowSpan={productos.length}
                                tabIndex={0}
                                onKeyDown={(e) => handleGridArrowNav(e, 'congelado-grid', rowIndex, 0, maxRow, maxCol)}
                                data-grid="congelado-grid"
                                data-row={rowIndex}
                                data-col={0}
                                className="px-2 py-1 align-top md:sticky max-md:!static md:left-0 z-20 bg-inherit text-gray-800 dark:text-gray-200 font-medium border-b border-r border-gray-200 dark:border-gray-600 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)] focus:outline-none focus:ring-1 focus:ring-primary-500"
                                style={{ minWidth: `${widthProducto}px` }}
                              >
                                {nombreProducto}
                              </td>
                            ) : null}
                            <td
                              tabIndex={0}
                              onKeyDown={(e) => handleGridArrowNav(e, 'congelado-grid', rowIndex, 1, maxRow, maxCol)}
                              data-grid="congelado-grid"
                              data-row={rowIndex}
                              data-col={1}
                              className="px-2 py-1 whitespace-normal break-words md:whitespace-nowrap md:overflow-hidden md:text-ellipsis md:sticky max-md:!static z-20 bg-inherit text-gray-900 dark:text-gray-100 text-xs border-b border-r border-gray-200 dark:border-gray-600 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)] focus:outline-none focus:ring-1 focus:ring-primary-500"
                              style={{ left: `${widthProducto}px` }}
                              title={linea}
                            >
                              {linea}
                            </td>
                            {columnas.map((col, colIdx) => (
                              <td key={col.id} className={`p-0 border-b border-r border-gray-200 dark:border-gray-600 ${bgColumnaTipo(col.tipo)}`} style={{ width: `${widthCol(col.id)}px` }}>
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  inputMode="decimal"
                                  value={
                                    (() => {
                                      const v = (p.datos_columnas || {})[col.id]
                                      return v === undefined || v === null ? '' : String(v)
                                    })()
                                  }
                                  onChange={(e) => setCantidad(p.producto_id, col.id, e.target.value)}
                                  onKeyDown={(e) => handleGridArrowNav(e, 'congelado-grid', rowIndex, colIdx + 2, maxRow, maxCol)}
                                  data-grid="congelado-grid"
                                  data-row={rowIndex}
                                  data-col={colIdx + 2}
                                  disabled={readonly}
                                  className="w-full h-9 md:h-7 text-center text-sm md:text-xs border-0 rounded-none bg-transparent focus:bg-white dark:focus:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-primary-500 text-gray-900 dark:text-gray-100 tabular-nums"
                                />
                              </td>
                            ))}
                            <td
                              tabIndex={0}
                              onKeyDown={(e) => handleGridArrowNav(e, 'congelado-grid', rowIndex, (columnas?.length || 0) + 2, maxRow, maxCol)}
                              data-grid="congelado-grid"
                              data-row={rowIndex}
                              data-col={(columnas?.length || 0) + 2}
                              className="px-2 py-1 text-center font-medium tabular-nums md:sticky max-md:!static z-20 bg-inherit text-gray-900 dark:text-gray-100 border-b border-r border-gray-200 dark:border-gray-600 shadow-[4px_0_6px_-2px_rgba(0,0,0,0.08)] focus:outline-none focus:ring-1 focus:ring-primary-500"
                              style={{ width: `${widthTotalB}px`, right: `${widthTotalKg}px` }}
                            >
                              {totalBandejas}
                            </td>
                            <td
                              tabIndex={0}
                              onKeyDown={(e) => handleGridArrowNav(e, 'congelado-grid', rowIndex, (columnas?.length || 0) + 3, maxRow, maxCol)}
                              data-grid="congelado-grid"
                              data-row={rowIndex}
                              data-col={(columnas?.length || 0) + 3}
                              className="px-2 py-1 text-center tabular-nums md:sticky max-md:!static md:right-0 z-20 bg-inherit text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-600 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.08)] focus:outline-none focus:ring-1 focus:ring-primary-500"
                              style={{ width: `${widthTotalKg}px` }}
                            >
                              {totalKg.toFixed(1)}
                            </td>
                          </tr>
                        )
                      })
                    )
                    })()}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-400 dark:border-gray-500 bg-gray-200/90 dark:bg-gray-700/90 font-semibold text-gray-900 dark:text-gray-100">
                      <td
                        colSpan={2}
                        className="px-2 py-2 text-left md:sticky max-md:!static md:left-0 z-10 bg-gray-200 dark:bg-gray-700 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.12)]"
                        style={{ minWidth: `${widthProducto}px` }}
                      >
                        Total por bachada
                        <span className="block text-[10px] font-normal text-gray-600 dark:text-gray-400">
                          (suma bandejas por túnel/placa — llenar para pedir congelación)
                        </span>
                      </td>
                      {totalesPorColumnaBachada().map(({ col, bandejas, kg }) => (
                        <td
                          key={`foot-${col.id}`}
                          className={`px-1 py-2 text-center align-middle ${bgColumnaTipo(col.tipo)}`}
                        >
                          <div className="text-sm">{bandejas}</div>
                          <div className="text-[10px] font-normal text-gray-700 dark:text-gray-300">B.</div>
                          <div className="text-xs mt-0.5">{kg.toFixed(1)}</div>
                          <div className="text-[9px] font-normal opacity-80">kg</div>
                        </td>
                      ))}
                      <td className="px-2 py-2 text-center md:sticky max-md:!static z-10 bg-gray-200 dark:bg-gray-700 shadow-[4px_0_6px_-2px_rgba(0,0,0,0.08)]" style={{ width: `${widthTotalB}px`, right: `${widthTotalKg}px` }}>
                        {totalesGeneral().bandejas}
                      </td>
                      <td className="px-2 py-2 text-center md:sticky max-md:!static md:right-0 z-10 bg-gray-200 dark:bg-gray-700 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.08)]" style={{ width: `${widthTotalKg}px` }}>
                        {totalesGeneral().kg.toFixed(1)}
                      </td>
                    </tr>
                  </tfoot>
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
                      Finalizar congelado
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
        title={`Congelado ${congeladoData?.lote_codigo || ''}`.trim()}
        rows={filasMatrizCongelado}
        columns={colsExportCongelado}
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

export default Congelado
