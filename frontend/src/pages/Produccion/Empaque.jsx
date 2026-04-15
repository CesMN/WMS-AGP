import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Package, Loader2, CheckCircle, RotateCcw, Plus, Truck, FileText, Pencil, Trash2, Save } from 'lucide-react'
import { empaqueApi } from '../../api/empaque'
import { plantillasProcesoApi } from '../../api/plantillas-proceso'
import { parihuelasApi } from '../../api/parihuelas'
import { useAuth } from '../../contexts/AuthContext'
import RotuloParihuela from '../../components/RotuloParihuela'
import Modal from '../../components/Modal'
import { exportMatrixVerticalPdf, exportMatrixExcelSingleSheet } from '../../utils/exportReport'
import ExportMatrixModal from '../../components/ExportMatrixModal'
import toast from 'react-hot-toast'

const MSJ_CAMBIO_PLANTILLA = 'Al cambiar la plantilla se perderá todo el progreso de este registro. ¿Continuar?'

const HORAS_OPCIONES = Array.from({ length: 24 }, (_, i) => i)
const turnoHora = (h) => (h >= 7 && h <= 18 ? 'Día' : 'Noche')
const etiquetaHora = (h) => {
  if (h === 0) return '12-1 AM'
  if (h < 12) return `${h}-${h + 1} AM`
  if (h === 12) return '12-1 PM'
  return `${h - 12}-${h - 11} PM`
}

const MSJ_SIN_GUARDAR_MANUAL = 'Hay cambios sin guardar en la planilla manual. ¿Continuar?'
const DEFAULT_COLUMNAS_EMPAQUE = 5
const createColumnasEmpaqueInicial = () =>
  Array.from({ length: DEFAULT_COLUMNAS_EMPAQUE }, (_, i) => ({ id: `col-${i}-${Date.now()}`, hora: 7 + i }))

/** Columnas guardadas en BD o horas por defecto + horas con datos (como Envasado). */
const columnasDesdeRespuestaEmpaque = (data) => {
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

const pesoBulto = (formato) => {
  const f = Number(formato)
  return f > 0 ? f : 0
}

const labelProductoEmpaque = (p) =>
  `${p.codigo} — ${p.descripcion || p.producto}${p.presentacion ? ` (${p.presentacion})` : ''}`

/** Cantidad de bultos/cajas por parihuela: permite decimales (ej. 0.5); debe ser > 0. */
const cantidadParihuelaValida = (raw) => {
  if (raw === '' || raw == null) return false
  const n = Number(raw)
  return !Number.isNaN(n) && n > 0
}

const Empaque = () => {
  const { isAdmin } = useAuth()
  const [lotesActivos, setLotesActivos] = useState([])
  const [empaques, setEmpaques] = useState([])
  const [loading, setLoading] = useState(true)
  const [loteSeleccionado, setLoteSeleccionado] = useState(null)
  const [empaqueActual, setEmpaqueActual] = useState(null)
  const [empaqueData, setEmpaqueData] = useState(null)
  const [plantillas, setPlantillas] = useState([])
  const [iniciando, setIniciando] = useState(false)
  const [saving, setSaving] = useState(false)
  const [finalizando, setFinalizando] = useState(false)
  const [reabriendo, setReabriendo] = useState(null)
  const [parihuelasLote, setParihuelasLote] = useState([])
  const [parihuelaProductoId, setParihuelaProductoId] = useState('')
  const [parihuelaProductoQuery, setParihuelaProductoQuery] = useState('')
  const [parihuelaProductoComboOpen, setParihuelaProductoComboOpen] = useState(false)
  const [parihuelaCantidad, setParihuelaCantidad] = useState('')
  const [parihuelaHora, setParihuelaHora] = useState(() => new Date().getHours())
  const [parihuelaReferencia, setParihuelaReferencia] = useState('')
  const [creandoParihuela, setCreandoParihuela] = useState(false)
  const [exporting, setExporting] = useState(null)
  const [openExport, setOpenExport] = useState(false)
  const [exportOrientation, setExportOrientation] = useState('portrait')
  const [colWidths, setColWidths] = useState({})
  const [rotuloParihuelaId, setRotuloParihuelaId] = useState(null)
  const [editandoParihuela, setEditandoParihuela] = useState(null)
  const [editCantidad, setEditCantidad] = useState('')
  const [editHora, setEditHora] = useState(0)
  const [editReferencia, setEditReferencia] = useState('')
  const [guardandoEdit, setGuardandoEdit] = useState(false)
  const [eliminandoId, setEliminandoId] = useState(null)
  const [modoManual, setModoManual] = useState(false)
  const [columnasHoras, setColumnasHoras] = useState(createColumnasEmpaqueInicial)
  const [dirtyManual, setDirtyManual] = useState(false)
  const [savingManual, setSavingManual] = useState(false)
  const [enviandoPlanilla, setEnviandoPlanilla] = useState(false)

  const horasTablaEmpaque = useMemo(() => {
    const fromData = new Set()

    // 1) Horas que ya quedaron consolidadas por producto.
    if (empaqueData?.productos?.length) {
      empaqueData.productos.forEach((p) => {
        Object.entries(p.datos_horas || {}).forEach(([k, v]) => {
          const n = parseInt(k, 10)
          if (Number.isNaN(n) || n < 0 || n > 23) return
          if ((Number(v) || 0) > 0) fromData.add(n)
        })
      })
    }

    // 2) Fallback robusto: horas reales de envíos (parihuelas), incluso si datos_horas viene vacío.
    if (parihuelasLote?.length) {
      parihuelasLote.forEach((p) => {
        const n = Number(p?.hora)
        if (!Number.isNaN(n) && n >= 0 && n <= 23) fromData.add(n)
      })
    }

    return Array.from(fromData).sort((a, b) => a - b)
  }, [empaqueData, parihuelasLote])

  const horasTablaVisual = useMemo(() => {
    if (modoManual && columnasHoras.length > 0) return columnasHoras.map((c) => c.hora)
    return horasTablaEmpaque
  }, [modoManual, columnasHoras, horasTablaEmpaque])

  /** Columnas unificadas para la grilla: en modo lectura cada hora tiene id estable `h-{hora}`. */
  const columnasParaTabla = useMemo(() => {
    if (modoManual) return columnasHoras
    return horasTablaEmpaque.map((h) => ({ id: `h-${h}`, hora: h }))
  }, [modoManual, columnasHoras, horasTablaEmpaque])

  const cantidadesHoraDesdeParihuelas = useMemo(() => {
    const acc = new Map()
    ;(parihuelasLote || []).forEach((pa) => {
      const h = Number(pa?.hora)
      if (Number.isNaN(h) || h < 0 || h > 23) return
      const cantidad = Number(pa?.cantidad) || 0
      if (cantidad <= 0) return
      const productoId = pa?.producto_id != null ? String(pa.producto_id) : ''
      if (!productoId) return
      const key = `${productoId}|${h}`
      acc.set(key, (acc.get(key) || 0) + cantidad)
    })
    return acc
  }, [parihuelasLote])

  const cantidadPorHoraProducto = useCallback(
    (producto, hora) => {
      const hKey = String(hora)
      const fromDetalle = Number((producto?.datos_horas || {})[hKey] ?? 0)
      if (fromDetalle > 0) return fromDetalle
      const pId = producto?.producto_id != null ? String(producto.producto_id) : ''
      if (!pId) return 0
      return Number(cantidadesHoraDesdeParihuelas.get(`${pId}|${hora}`) || 0)
    },
    [cantidadesHoraDesdeParihuelas]
  )

  const loadLotesYEmpaques = () => {
    setLoading(true)
    Promise.all([empaqueApi.lotesActivos(), empaqueApi.listar()])
      .then(([r1, r2]) => {
        setLotesActivos(r1.data?.data ?? r1.data ?? [])
        setEmpaques(r2.data?.data ?? r2.data ?? [])
      })
      .catch(() => toast.error('Error al cargar'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadLotesYEmpaques()
  }, [])

  const productosParihuelaFiltrados = useMemo(() => {
    const list = empaqueData?.productos || []
    const q = parihuelaProductoQuery.trim().toLowerCase()
    if (!q) return list
    return list.filter((p) => {
      const blob = `${p.codigo ?? ''} ${p.descripcion ?? ''} ${p.producto ?? ''} ${p.presentacion ?? ''}`.toLowerCase()
      return blob.includes(q)
    })
  }, [empaqueData?.productos, parihuelaProductoQuery])

  useEffect(() => {
    if (!parihuelaProductoId || !empaqueData?.productos?.length) return
    const ok = empaqueData.productos.some((x) => String(x.producto_id) === String(parihuelaProductoId))
    if (!ok) {
      setParihuelaProductoId('')
      setParihuelaProductoQuery('')
    }
  }, [empaqueData?.productos, parihuelaProductoId])

  const empaquePorLote = (loteId) => empaques.find((e) => e.lote_id === loteId)

  const handleClickLote = (lote) => {
    if (lote.id !== loteSeleccionado?.id) {
      if (modoManual && dirtyManual && !window.confirm(MSJ_SIN_GUARDAR_MANUAL)) return
      setParihuelaProductoId('')
      setParihuelaProductoQuery('')
      setParihuelaProductoComboOpen(false)
      setModoManual(false)
    }
    const ev = empaquePorLote(lote.id)
    if (ev) {
      setLoteSeleccionado(lote)
      setEmpaqueActual(ev)
      loadEmpaque(ev.id)
    } else {
      setLoteSeleccionado(lote)
      setEmpaqueActual(null)
      setEmpaqueData(null)
    }
  }

  const loadEmpaque = (id) => {
    empaqueApi.obtener(id).then(({ data }) => {
      setEmpaqueData(data)
      setColumnasHoras(columnasDesdeRespuestaEmpaque(data))
      setDirtyManual(false)
      if (data?.lote_id) parihuelasApi.listar({ lote_id: data.lote_id }).then(({ data: pr }) => setParihuelasLote(pr?.data ?? pr ?? [])).catch(() => setParihuelasLote([]))
      else setParihuelasLote([])
      if (data?.plantilla_id && data?.cliente_id && data?.especie_id) {
        plantillasProcesoApi.listar().then(({ data: list }) => {
          const all = list?.data ?? list ?? []
          setPlantillas(all.filter((p) => p.cliente_id === data.cliente_id && p.especie_id === data.especie_id))
        }).catch(() => setPlantillas([]))
      } else {
        setPlantillas([])
      }
    }).catch(() => toast.error('Error al cargar empaque'))
  }

  const handleIniciar = () => {
    if (!loteSeleccionado) return
    setIniciando(true)
    empaqueApi.iniciar(loteSeleccionado.id)
      .then(({ data }) => {
        toast.success('Empaque iniciado')
        loadLotesYEmpaques()
        setEmpaqueActual(data)
        loadEmpaque(data.id)
      })
      .catch((err) => toast.error(err.response?.data?.message || 'Error al iniciar'))
      .finally(() => setIniciando(false))
  }

  const handleCambiarPlantilla = (e) => {
    const plantilla_id = e.target.value
    if (!plantilla_id || !empaqueActual?.id) return
    if (empaqueData?.plantilla_id !== plantilla_id && !window.confirm(MSJ_CAMBIO_PLANTILLA)) return
    setSaving(true)
    empaqueApi.actualizar(empaqueActual.id, { plantilla_id })
      .then(() => {
        toast.success('Plantilla actualizada')
        loadEmpaque(empaqueActual.id)
      })
      .catch(() => toast.error('Error al cambiar plantilla'))
      .finally(() => setSaving(false))
  }

  const hayParihuelasEnTransito = (parihuelasLote || []).some((p) => p.estado === 'EN_TRANSITO')
  const horasExport = useMemo(
    () =>
      horasTablaVisual.map((h) => ({
        key: `h_${h}`,
        label: `${String(h).padStart(2, '0')}:00`,
        hora: h,
      })),
    [horasTablaVisual]
  )
  const filasExportEmpaque = useMemo(
    () =>
      productosAgrupados().flatMap(({ nombreProducto, productos }) =>
        productos.map((p, idx) => {
          const { totalBultos, totalKg } = totalesPorFila(p)
          const row = {
            producto_grupo: idx === 0 ? nombreProducto : '',
            linea: [p.codigo, p.descripcion || p.producto || '', p.presentacion || ''].filter(Boolean).join(' · '),
          }
          for (const h of horasExport) {
            row[h.key] = modoManual
              ? Number((p.datos_horas || {})[String(h.hora)] ?? 0)
              : cantidadPorHoraProducto(p, h.hora)
          }
          row.total_bultos = totalBultos
          row.total_kg = Number(totalKg.toFixed(2))
          return row
        })
      ),
    [empaqueData, horasExport, cantidadPorHoraProducto, modoManual]
  )
  const colsExportEmpaque = [
    { key: 'producto_grupo', label: 'Producto' },
    { key: 'linea', label: 'Código · Descripción' },
    ...horasExport.map((h) => ({ key: h.key, label: h.label })),
    { key: 'total_bultos', label: 'Total B.' },
    { key: 'total_kg', label: 'Total kg' },
  ]
  const exportarPdf = (orientation = 'portrait') => {
    if (!filasExportEmpaque.length) return
    setExporting('pdf')
    try {
      exportMatrixVerticalPdf(
        filasExportEmpaque,
        colsExportEmpaque,
        `Empaque ${empaqueData?.lote_codigo || ''}`.trim(),
        `Lote: ${empaqueData?.lote_codigo || '—'} · Plantilla: ${empaqueData?.plantilla_titulo || '—'}`,
        { totalColumnKeys: ['total_bultos', 'total_kg'], orientation }
      )
      toast.success('PDF exportado')
    } catch (_) {
      toast.error('No se pudo exportar PDF')
    } finally {
      setExporting(null)
    }
  }
  const exportarExcel = () => {
    if (!filasExportEmpaque.length) return
    setExporting('excel')
    try {
      exportMatrixExcelSingleSheet(
        filasExportEmpaque,
        colsExportEmpaque,
        `Empaque ${empaqueData?.lote_codigo || ''}`.trim(),
        `Lote: ${empaqueData?.lote_codigo || '—'} · Plantilla: ${empaqueData?.plantilla_titulo || '—'}`
      )
      toast.success('Excel exportado')
    } catch (_) {
      toast.error('No se pudo exportar Excel')
    } finally {
      setExporting(null)
    }
  }

  const handleFinalizar = () => {
    if (!empaqueActual?.id) return
    if (hayParihuelasEnTransito) {
      toast.error('No se puede finalizar: hay parihuelas en tránsito. Recepcione todas en Recepción de parihuelas.')
      return
    }
    if (!window.confirm('¿Finalizar empaque? No se podrá editar después.')) return
    setFinalizando(true)
    empaqueApi.finalizar(empaqueActual.id)
      .then(() => {
        toast.success('Empaque finalizado')
        setEmpaqueData((prev) => (prev ? { ...prev, estado: 'finalizado' } : null))
        setEmpaqueActual((prev) => (prev ? { ...prev, estado: 'finalizado' } : null))
        loadLotesYEmpaques()
      })
      .catch((err) => toast.error(err.response?.data?.message || 'Error al finalizar'))
      .finally(() => setFinalizando(false))
  }

  const handleReabrir = () => {
    if (!empaqueActual?.id) return
    if (!window.confirm('Reabrir empaque (solo administrador). ¿Continuar?')) return
    setReabriendo(empaqueActual.id)
    empaqueApi.reabrir(empaqueActual.id)
      .then(() => {
        toast.success('Empaque reabierto')
        loadEmpaque(empaqueActual.id)
        loadLotesYEmpaques()
        setEmpaqueActual((prev) => (prev ? { ...prev, estado: 'en_proceso' } : null))
        setEmpaqueData((prev) => (prev ? { ...prev, estado: 'en_proceso' } : null))
      })
      .catch(() => toast.error('Error al reabrir'))
      .finally(() => setReabriendo(null))
  }

  const readonly = empaqueData?.estado === 'finalizado'
  const widthProducto = Number(colWidths.producto ?? 90)
  const widthDetalle = Number(colWidths.detalle ?? 180)
  const widthTotalB = Number(colWidths.totalB ?? 64)
  const widthTotalKg = Number(colWidths.totalKg ?? 64)
  const widthHora = (key) => Number(colWidths[`h-${key}`] ?? 52)
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

  const setHoraColumna = (colId, oldHora, nuevaHoraStr) => {
    const newH = Number(nuevaHoraStr)
    const oldH = Number(oldHora)
    if (oldH === newH || Number.isNaN(newH)) return
    const oldK = String(oldH)
    const newK = String(newH)
    setColumnasHoras((prev) => prev.map((c) => (c.id === colId ? { ...c, hora: newH } : c)))
    setEmpaqueData((prev) => {
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
    setDirtyManual(true)
  }

  const agregarColumnaHora = () => {
    const usadas = new Set(columnasHoras.map((c) => c.hora))
    let next = 0
    for (let i = 0; i < 24; i += 1) if (!usadas.has(i)) {
      next = i
      break
    }
    setColumnasHoras((prev) => [...prev, { id: `col-${Date.now()}`, hora: next }])
    setDirtyManual(true)
  }

  const quitarColumnaHora = (colId, hora) => {
    if (columnasHoras.length <= 1) return
    setColumnasHoras((prev) => prev.filter((c) => c.id !== colId))
    const hk = String(hora)
    setEmpaqueData((prev) => {
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
    setDirtyManual(true)
  }

  const setBultosManual = (productoId, hora, value) => {
    const raw = String(value).trim()
    setEmpaqueData((prev) => {
      if (!prev?.productos) return prev
      const productos = prev.productos.map((p) => {
        if (p.producto_id !== productoId) return p
        const datos_horas = { ...p.datos_horas }
        if (raw === '') {
          delete datos_horas[String(hora)]
        } else {
          const n = Number(raw)
          if (Number.isNaN(n) || n < 0) return p
          if (n === 0) delete datos_horas[String(hora)]
          else datos_horas[String(hora)] = n
        }
        return { ...p, datos_horas }
      })
      return { ...prev, productos }
    })
    setDirtyManual(true)
  }

  const persistManual = () => {
    if (!empaqueActual?.id || !empaqueData?.productos) return Promise.resolve()
    const productos = empaqueData.productos.map((p) => ({
      producto_id: p.producto_id,
      datos_horas: p.datos_horas || {},
    }))
    const columnas_horas = columnasHoras.map((c) => ({ id: c.id, hora: c.hora }))
    return empaqueApi.actualizar(empaqueActual.id, { productos, columnas_horas })
  }

  const handleGuardarManual = () => {
    if (!empaqueActual?.id) return
    setSavingManual(true)
    persistManual()
      .then(() => {
        toast.success('Planilla guardada')
        setDirtyManual(false)
        loadEmpaque(empaqueActual.id)
      })
      .catch(() => toast.error('Error al guardar'))
      .finally(() => setSavingManual(false))
  }

  const handleEnviarPlanillaRecepcion = () => {
    if (!empaqueActual?.id) return
    if (!window.confirm('Se generarán parihuelas en tránsito desde los bultos ingresados por hora (reemplaza envíos anteriores hechos con «planilla manual»). ¿Continuar?')) return
    setEnviandoPlanilla(true)
    const run = async () => {
      if (dirtyManual) {
        await persistManual()
        setDirtyManual(false)
      }
      await empaqueApi.enviarPlanillaRecepcion(empaqueActual.id)
    }
    run()
      .then((res) => {
        const c = res?.data?.creadas
        toast.success(typeof c === 'number' ? `Enviado a recepción: ${c} parihuela(s).` : 'Enviado a recepción.')
        loadEmpaque(empaqueActual.id)
      })
      .catch((err) => toast.error(err.response?.data?.message || 'Error al enviar a recepción'))
      .finally(() => setEnviandoPlanilla(false))
  }

  const toggleModoManual = () => {
    if (modoManual && dirtyManual && !window.confirm(MSJ_SIN_GUARDAR_MANUAL)) return
    if (!modoManual) {
      setColumnasHoras((prev) => (prev.length ? prev : columnasDesdeRespuestaEmpaque(empaqueData)))
    }
    setModoManual((m) => !m)
  }

  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (dirtyManual && modoManual) e.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirtyManual, modoManual])

  function totalesPorFila(producto) {
    const horas = producto.datos_horas || {}
    const totalBultos = Object.entries(horas).reduce((s, [, v]) => s + (Number(v) || 0), 0)
    const peso = pesoBulto(producto.formato)
    const totalKg = totalBultos * peso
    return { totalBultos, totalKg }
  }
  const totalesGeneral = () => {
    if (!empaqueData?.productos) return { bultos: 0, kg: 0 }
    return empaqueData.productos.reduce(
      (acc, p) => {
        const { totalBultos, totalKg } = totalesPorFila(p)
        return { bultos: acc.bultos + totalBultos, kg: acc.kg + totalKg }
      },
      { bultos: 0, kg: 0 }
    )
  }

  function productosAgrupados() {
    if (!empaqueData?.productos?.length) return []
    const orderIdx = new Map()
    empaqueData.productos.forEach((p, i) => {
      if (!orderIdx.has(p.producto_id)) orderIdx.set(p.producto_id, i)
    })
    const byProducto = new Map()
    empaqueData.productos.forEach((p) => {
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
          <Package className="w-6 h-6 text-primary-600 dark:text-primary-400" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Empaque</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Bultos por hora</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 ml-auto">
          {lotesActivos.length === 0 ? (
            <span className="text-sm text-gray-500 dark:text-gray-400">No hay lotes activos.</span>
          ) : (
            lotesActivos.map((lote) => {
              const ev = empaquePorLote(lote.id)
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
                    {ev ? (
                      <span className={ev.estado === 'finalizado' ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}>
                        Empaque {ev.estado === 'finalizado' ? 'finalizado' : 'en proceso'}
                      </span>
                    ) : (
                      <span className="text-gray-500 dark:text-gray-500">Sin empaque</span>
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
            Seleccione un lote para iniciar empaque o ver el empaque en curso.
          </div>
        )}

        {loteSeleccionado && !empaqueActual && (
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              Lote <strong>{loteSeleccionado.codigo}</strong> — {loteSeleccionado.cliente_nombre} / {loteSeleccionado.especie_nombre}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Este lote aún no tiene empaque. Se usará la plantilla predeterminada.</p>
            <button
              type="button"
              onClick={handleIniciar}
              disabled={iniciando}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium disabled:opacity-50"
            >
              {iniciando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              Iniciar empaque
            </button>
          </div>
        )}

        {empaqueActual && empaqueData && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {empaqueData.lote_codigo} — {empaqueData.cliente_nombre} — {empaqueData.especie_nombre}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  Plantilla: {empaqueData.plantilla_titulo}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setOpenExport(true)}
                  disabled={!filasExportEmpaque.length}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  <FileText className="w-4 h-4" />
                  Exportar
                </button>
                <label className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">Otra plantilla:</label>
                <select
                  value={empaqueData.plantilla_id}
                  onChange={handleCambiarPlantilla}
                  disabled={readonly || saving || modoManual}
                  className="min-h-[40px] px-3 py-1.5 border border-gray-300 dark:border-gray-500 rounded-lg text-sm w-full sm:w-auto sm:min-w-[180px] bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500"
                >
                  {plantillas.map((p) => (
                    <option key={p.id} value={p.id}>{p.titulo}</option>
                  ))}
                </select>
                {!readonly && (
                  <button
                    type="button"
                    onClick={toggleModoManual}
                    className={`inline-flex items-center gap-1.5 min-h-[40px] px-3 py-1.5 rounded-lg text-sm font-medium border ${
                      modoManual
                        ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/30 text-amber-900 dark:text-amber-100'
                        : 'border-gray-300 dark:border-gray-500 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-600'
                    }`}
                  >
                    {modoManual ? 'Salir de llenado manual' : 'Llenado manual (planilla)'}
                  </button>
                )}
                {!readonly && modoManual && (
                  <>
                    <button
                      type="button"
                      onClick={handleGuardarManual}
                      disabled={savingManual || !dirtyManual}
                      className="inline-flex items-center gap-1.5 min-h-[40px] px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-600 text-white hover:bg-slate-700 disabled:opacity-50"
                    >
                      {savingManual ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      Guardar planilla
                    </button>
                    <button
                      type="button"
                      onClick={agregarColumnaHora}
                      className="inline-flex items-center gap-1.5 min-h-[40px] px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-100 hover:bg-gray-300 dark:hover:bg-gray-500"
                    >
                      <Plus className="w-4 h-4" />
                      Agregar hora
                    </button>
                    <button
                      type="button"
                      onClick={handleEnviarPlanillaRecepcion}
                      disabled={enviandoPlanilla}
                      className="inline-flex items-center gap-1.5 min-h-[40px] px-3 py-1.5 rounded-lg text-sm font-medium bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
                      title="Genera parihuelas en tránsito desde la planilla (visible en Recepción de parihuelas)"
                    >
                      {enviandoPlanilla ? <Loader2 className="w-4 h-4 animate-spin" /> : <Truck className="w-4 h-4" />}
                      Enviar a recepción
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 dark:border-gray-600 p-4 space-y-3 relative z-40 overflow-visible">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Truck className="w-4 h-4" />
                Enviar a cámara (parihuelas)
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {modoManual
                  ? 'Alternativa: el formulario de abajo sigue disponible si desea generar parihuelas una a una. En la tabla use Guardar planilla y Enviar a recepción para el flujo solo con planilla.'
                  : 'Ingrese producto, cantidad y hora. Al generar la parihuela se registrará en la tabla por hora. El supervisor de cámaras recepcionará en Recepción de parihuelas.'}
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <div className="relative min-w-[220px] max-w-[min(100%,28rem)] z-50">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-0.5">Producto</label>
                  <input
                    type="text"
                    value={parihuelaProductoQuery}
                    onChange={(e) => {
                      const v = e.target.value
                      setParihuelaProductoQuery(v)
                      setParihuelaProductoComboOpen(true)
                      const sel = empaqueData?.productos?.find((x) => String(x.producto_id) === String(parihuelaProductoId))
                      if (sel && labelProductoEmpaque(sel).trim() !== v.trim()) setParihuelaProductoId('')
                    }}
                    onFocus={() => setParihuelaProductoComboOpen(true)}
                    onBlur={() => {
                      window.setTimeout(() => setParihuelaProductoComboOpen(false), 180)
                    }}
                    placeholder="Buscar código o descripción…"
                    disabled={readonly}
                    autoComplete="off"
                  className="w-full min-h-[40px] px-3 py-1.5 border border-gray-300 dark:border-gray-500 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
                  />
                  {parihuelaProductoComboOpen && !readonly && (
                    <ul className="absolute z-[70] left-0 right-0 mt-1 max-h-52 overflow-auto rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-xl">
                      {productosParihuelaFiltrados.length === 0 ? (
                        <li className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">Sin coincidencias</li>
                      ) : (
                        productosParihuelaFiltrados.map((p) => (
                          <li key={p.producto_id}>
                            <button
                              type="button"
                              className="w-full px-3 py-2 text-left text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                setParihuelaProductoId(String(p.producto_id))
                                setParihuelaProductoQuery(labelProductoEmpaque(p))
                                setParihuelaProductoComboOpen(false)
                              }}
                            >
                              {labelProductoEmpaque(p)}
                            </button>
                          </li>
                        ))
                      )}
                    </ul>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-0.5">Hora (envío)</label>
                  <select
                    value={parihuelaHora}
                    onChange={(e) => setParihuelaHora(Number(e.target.value))}
                    disabled={readonly}
                    className="min-h-[40px] px-3 py-1.5 border border-gray-300 dark:border-gray-500 rounded-lg text-sm w-24 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    {HORAS_OPCIONES.map((h) => (
                      <option key={h} value={h}>{etiquetaHora(h)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-0.5">Cantidad (bultos/cajas)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={parihuelaCantidad}
                    onChange={(e) => setParihuelaCantidad(e.target.value)}
                    disabled={readonly}
                    className="min-h-[40px] px-3 py-1.5 border border-gray-300 dark:border-gray-500 rounded-lg text-sm w-28 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-0.5">Referencia rótulo (opcional)</label>
                  <input
                    type="text"
                    value={parihuelaReferencia}
                    onChange={(e) => setParihuelaReferencia(e.target.value)}
                    placeholder="Ej. Lote-001"
                    disabled={readonly}
                    className="min-h-[40px] px-3 py-1.5 border border-gray-300 dark:border-gray-500 rounded-lg text-sm min-w-[120px] bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                <button
                  type="button"
                  disabled={readonly || !parihuelaProductoId || !cantidadParihuelaValida(parihuelaCantidad) || creandoParihuela}
                  onClick={() => {
                    const cant = Number(parihuelaCantidad)
                    if (!cantidadParihuelaValida(parihuelaCantidad) || !loteSeleccionado?.id || !empaqueActual?.id) return
                    setCreandoParihuela(true)
                    const prod = empaqueData?.productos?.find((p) => p.producto_id === parihuelaProductoId)
                    parihuelasApi.crear({
                      lote_id: loteSeleccionado.id,
                      empaque_id: empaqueActual.id,
                      producto_id: parihuelaProductoId,
                      cantidad: cant,
                      unidad_parihuela: prod?.unidad_parihuela || 'BULTOS',
                      referencia: parihuelaReferencia.trim() || undefined,
                      hora: parihuelaHora,
                    })
                      .then(({ data }) => {
                        const n = Array.isArray(data) ? data.length : 1
                        toast.success(n === 1 ? 'Parihuela generada. En tránsito a cámara.' : `Se generaron ${n} parihuelas. En tránsito a cámara.`)
                        setParihuelaCantidad('')
                        setParihuelaReferencia('')
                        loadEmpaque(empaqueActual.id)
                        parihuelasApi.listar({ lote_id: loteSeleccionado.id }).then(({ data: pr }) => setParihuelasLote(pr?.data ?? pr ?? []))
                      })
                      .catch((err) => toast.error(err.response?.data?.message || 'Error al crear parihuela'))
                      .finally(() => setCreandoParihuela(false))
                  }}
                  className="inline-flex items-center gap-1.5 min-h-[40px] px-3 py-1.5 rounded-lg text-sm font-medium bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
                >
                  {creandoParihuela ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Generar parihuela
                </button>
              </div>
              {parihuelasLote.filter((p) => p.estado === 'EN_TRANSITO').length > 0 && (
                <div className="mt-2">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">En tránsito a cámara:</p>
                  <ul className="text-xs text-gray-700 dark:text-gray-300 space-y-1">
                    {(() => {
                      const enTransito = parihuelasLote.filter((p) => p.estado === 'EN_TRANSITO')
                      const total = enTransito.length
                      return enTransito.map((p, index) => {
                        const productoLinea = [p.producto_codigo, p.producto_descripcion || p.producto_nombre, p.producto_presentacion].filter(Boolean).join(' · ')
                        const numeroHistorial = total - index
                        return (
                      <li key={p.id} className="flex items-center justify-between gap-2">
                        <span>
                          <span className="font-medium text-gray-700 dark:text-gray-300">{numeroHistorial}.</span>{' '}
                          {productoLinea} — {p.cantidad} {p.unidad_parihuela === 'CAJAS' ? 'cajas' : 'bultos'}
                          {p.hora != null && ` · ${etiquetaHora(Number(p.hora))}`}
                          {p.referencia && ` · Ref: ${p.referencia}`}
                          {p.es_completa && ' · Completa'}
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                          <button type="button" onClick={() => setRotuloParihuelaId(p.id)} className="inline-flex items-center gap-0.5 text-primary-600 dark:text-primary-400 hover:underline" title="Ver / Imprimir rótulo">
                            <FileText className="w-3.5 h-3.5" />
                            Rótulo
                          </button>
                          {!readonly && (
                            <>
                              <button type="button" onClick={() => { setEditandoParihuela(p); setEditCantidad(String(p.cantidad)); setEditHora(p.hora != null ? Number(p.hora) : new Date().getHours()); setEditReferencia(p.referencia || ''); }} className="inline-flex items-center gap-0.5 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100" title="Editar">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button type="button" onClick={() => { if (window.confirm('¿Eliminar esta parihuela? Se revertirá la cantidad en la tabla por hora.')) { setEliminandoId(p.id); parihuelasApi.eliminar(p.id).then(() => { toast.success('Parihuela eliminada'); loadEmpaque(empaqueActual?.id); parihuelasApi.listar({ lote_id: loteSeleccionado?.id }).then(({ data: pr }) => setParihuelasLote(pr?.data ?? pr ?? [])); }).catch((err) => toast.error(err.response?.data?.message || 'Error al eliminar')).finally(() => setEliminandoId(null)); } }} disabled={eliminandoId === p.id} className="inline-flex items-center text-red-600 dark:text-red-400 hover:text-red-700" title="Eliminar">
                                {eliminandoId === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                              </button>
                            </>
                          )}
                        </div>
                      </li>
                        )
                      })
                    })()}
                  </ul>
                </div>
              )}
            </div>

            <div className="rounded-lg border border-gray-200 dark:border-gray-600">
              <div className="px-3 py-1.5 text-[11px] text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/40">
                {modoManual
                  ? 'Planilla manual: elija la hora en cada columna, escriba bultos/cajas y guarde. «Enviar a recepción» crea parihuelas en tránsito (almacén temporal) para asignar ubicación en Recepción de parihuelas.'
                  : 'Vista tipo hoja de cálculo: deslice horizontalmente para ver todas las horas y totales.'}
              </div>
              <div className="wms-table-scroll wms-table-mobile" style={{ overflowX: 'auto' }}>
                <table className="min-w-[50rem] md:min-w-[58rem] w-full text-sm border-separate border-spacing-0 table-fixed">
                  <colgroup>
                    <col style={{ width: `${widthProducto}px` }} />
                    <col style={{ width: `${widthDetalle}px`, minWidth: `${Math.min(widthDetalle, 160)}px` }} />
                    {columnasParaTabla.map((col) => (
                      <col key={`col-h-${col.id}`} style={{ width: `${widthHora(col.id)}px`, minWidth: `${widthHora(col.id)}px`, maxWidth: `${widthHora(col.id)}px` }} />
                    ))}
                    <col style={{ width: `${widthTotalB}px`, minWidth: `${widthTotalB}px`, maxWidth: `${widthTotalB}px` }} />
                    <col style={{ width: `${widthTotalKg}px`, minWidth: `${widthTotalKg}px`, maxWidth: `${widthTotalKg}px` }} />
                  </colgroup>
                  <thead>
                    <tr className="bg-gray-100 dark:bg-gray-700">
                      <th className="relative px-2 py-2 text-left text-[11px] font-semibold text-gray-900 dark:text-gray-100 md:sticky max-md:!static md:left-0 top-0 z-30 bg-gray-100 dark:bg-gray-700 border-b border-r border-gray-200 dark:border-gray-600 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]" style={{ minWidth: `${widthProducto}px` }}>
                        Producto
                        <div className="absolute right-0 top-0 h-full w-2 cursor-col-resize touch-none" onMouseDown={(e) => startResize(e, 'producto', 70, 260)} onTouchStart={(e) => startResize(e, 'producto', 70, 260)} />
                      </th>
                      <th className="relative px-2 py-2 text-left text-[11px] font-semibold text-gray-900 dark:text-gray-100 md:sticky max-md:!static top-0 z-30 bg-gray-100 dark:bg-gray-700 border-b border-r border-gray-200 dark:border-gray-600 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]" style={{ left: `${widthProducto}px` }}>
                        Código · Descripción
                        <div className="absolute right-0 top-0 h-full w-2 cursor-col-resize touch-none" onMouseDown={(e) => startResize(e, 'detalle', 140, 420)} onTouchStart={(e) => startResize(e, 'detalle', 140, 420)} />
                      </th>
                      {columnasParaTabla.map((col) => (
                        <th key={col.id} className="relative px-0.5 py-1 text-center bg-slate-100/90 dark:bg-slate-800/80 text-[11px] font-semibold text-gray-900 dark:text-gray-100 border-b border-r border-slate-200/80 dark:border-slate-600/60 md:sticky max-md:!static md:top-0 z-20" style={{ width: `${widthHora(col.id)}px` }} title={`${String(col.hora).padStart(2, '0')}:00 — Turno ${turnoHora(col.hora)}`}>
                          {modoManual ? (
                            <div className="flex flex-col items-stretch gap-0.5 px-0.5">
                              <select
                                value={col.hora}
                                onChange={(e) => setHoraColumna(col.id, col.hora, e.target.value)}
                                disabled={readonly}
                                className="w-full text-[10px] font-semibold bg-white dark:bg-gray-600 border border-slate-200 dark:border-slate-500 rounded py-0.5 text-gray-900 dark:text-gray-100"
                              >
                                {HORAS_OPCIONES.map((h) => (
                                  <option key={h} value={h}>{etiquetaHora(h)}</option>
                                ))}
                              </select>
                              {!readonly && columnasHoras.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => quitarColumnaHora(col.id, col.hora)}
                                  className="text-[10px] text-red-600 dark:text-red-400 hover:underline"
                                >
                                  Quitar
                                </button>
                              )}
                            </div>
                          ) : (
                            <>
                              {String(col.hora).padStart(2, '0')}:00
                              <span className="block text-[10px] font-normal text-gray-500 dark:text-gray-400">{etiquetaHora(col.hora)}</span>
                            </>
                          )}
                          <div className="absolute right-0 top-0 h-full w-2 cursor-col-resize touch-none" onMouseDown={(e) => startResize(e, `h-${col.id}`, 44, 160)} onTouchStart={(e) => startResize(e, `h-${col.id}`, 44, 160)} />
                        </th>
                      ))}
                      <th className="relative px-2 py-2 text-center text-[11px] font-semibold text-gray-900 dark:text-gray-100 md:sticky max-md:!static top-0 z-30 bg-gray-50 dark:bg-gray-600 border-b border-r border-gray-200 dark:border-gray-600 shadow-[4px_0_6px_-2px_rgba(0,0,0,0.08)]" style={{ width: `${widthTotalB}px`, minWidth: `${widthTotalB}px`, right: `${widthTotalKg}px` }}>
                        Total bult.
                        <div className="absolute right-0 top-0 h-full w-2 cursor-col-resize touch-none" onMouseDown={(e) => startResize(e, 'totalB', 56, 160)} onTouchStart={(e) => startResize(e, 'totalB', 56, 160)} />
                      </th>
                      <th className="relative px-2 py-2 text-center text-[11px] font-semibold text-gray-900 dark:text-gray-100 md:sticky max-md:!static md:right-0 top-0 z-30 bg-gray-50 dark:bg-gray-600 border-b border-gray-200 dark:border-gray-600 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.08)]" style={{ width: `${widthTotalKg}px`, minWidth: `${widthTotalKg}px` }}>
                        Total kg
                        <div className="absolute right-0 top-0 h-full w-2 cursor-col-resize touch-none" onMouseDown={(e) => startResize(e, 'totalKg', 56, 160)} onTouchStart={(e) => startResize(e, 'totalKg', 56, 160)} />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {productosAgrupados().length === 0 ? (
                      <tr>
                        <td colSpan={columnasParaTabla.length + 4} className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                          No hay productos en la plantilla de empaque.
                        </td>
                      </tr>
                    ) : modoManual && columnasHoras.length === 0 ? (
                      <tr>
                        <td colSpan={columnasParaTabla.length + 4} className="px-4 py-6 text-center text-sm text-amber-800 dark:text-amber-200/90 bg-amber-50/80 dark:bg-amber-900/20 border border-amber-200/80 dark:border-amber-800/50 rounded-none">
                          Agregue al menos una columna de hora con «Agregar hora».
                        </td>
                      </tr>
                    ) : !modoManual && horasTablaEmpaque.length === 0 ? (
                      <tr>
                        <td colSpan={columnasParaTabla.length + 4} className="px-4 py-6 text-center text-sm text-amber-800 dark:text-amber-200/90 bg-amber-50/80 dark:bg-amber-900/20 border border-amber-200/80 dark:border-amber-800/50 rounded-none">
                          Aún no hay envíos de parihuelas con hora registrada. Genere una parihuela con hora de envío, o active «Llenado manual» para cargar la planilla.
                        </td>
                      </tr>
                    ) : (
                      (() => {
                        let rowCursor = -1
                        const maxRow = Math.max((empaqueData?.productos?.length || 1) - 1, 0)
                        const nh = columnasParaTabla.length
                        const maxCol = Math.max(nh + 3, 3)
                        return productosAgrupados().map(({ nombreProducto, productos }) =>
                        productos.map((p, idx) => {
                          rowCursor += 1
                          const rowIndex = rowCursor
                          const { totalBultos, totalKg } = totalesPorFila(p)
                          const linea = [p.codigo, p.descripcion, p.presentacion].filter(Boolean).join(' · ')
                          const isFirst = idx === 0
                          return (
                            <tr key={p.producto_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 odd:bg-white even:bg-gray-50/40 dark:odd:bg-gray-800 dark:even:bg-gray-800/70">
                              {isFirst ? (
                                <td rowSpan={productos.length} tabIndex={0} onKeyDown={(e) => handleGridArrowNav(e, 'empaque-grid', rowIndex, 0, maxRow, maxCol)} data-grid="empaque-grid" data-row={rowIndex} data-col={0} className="px-2 py-1 align-top md:sticky max-md:!static md:left-0 z-20 bg-inherit text-gray-800 dark:text-gray-200 font-medium border-b border-r border-gray-200 dark:border-gray-600 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)] focus:outline-none focus:ring-1 focus:ring-primary-500" style={{ minWidth: `${widthProducto}px` }}>
                                  {nombreProducto}
                                </td>
                              ) : null}
                              <td tabIndex={0} onKeyDown={(e) => handleGridArrowNav(e, 'empaque-grid', rowIndex, 1, maxRow, maxCol)} data-grid="empaque-grid" data-row={rowIndex} data-col={1} className="px-2 py-1 whitespace-normal break-words md:whitespace-nowrap md:overflow-hidden md:text-ellipsis md:sticky max-md:!static z-20 bg-inherit text-gray-900 dark:text-gray-100 text-xs border-b border-r border-gray-200 dark:border-gray-600 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)] focus:outline-none focus:ring-1 focus:ring-primary-500" style={{ left: `${widthProducto}px` }} title={linea}>
                                {linea}
                              </td>
                              {columnasParaTabla.map((col, hIdx) => {
                                const h = col.hora
                                const q = modoManual
                                  ? Number((p.datos_horas || {})[String(h)] ?? 0)
                                  : cantidadPorHoraProducto(p, h)
                                const cellVal = q > 0 ? String(q) : ''
                                return (
                                <td key={col.id} className="px-0 py-0.5 text-center text-xs tabular-nums border-b border-r border-slate-200/80 dark:border-slate-700/60 bg-slate-50/60 dark:bg-slate-900/25" style={{ width: `${widthHora(col.id)}px` }}>
                                  {modoManual && !readonly ? (
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      inputMode="decimal"
                                      value={cellVal}
                                      onChange={(e) => setBultosManual(p.producto_id, h, e.target.value)}
                                      onKeyDown={(e) => handleGridArrowNav(e, 'empaque-grid', rowIndex, hIdx + 2, maxRow, maxCol)}
                                      data-grid="empaque-grid"
                                      data-row={rowIndex}
                                      data-col={hIdx + 2}
                                      className="w-full min-w-0 px-0.5 py-1 text-center text-xs tabular-nums bg-white dark:bg-gray-700 border border-transparent hover:border-primary-400 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 rounded text-gray-900 dark:text-gray-100"
                                    />
                                  ) : (
                                    <span tabIndex={0} onKeyDown={(e) => handleGridArrowNav(e, 'empaque-grid', rowIndex, hIdx + 2, maxRow, maxCol)} data-grid="empaque-grid" data-row={rowIndex} data-col={hIdx + 2} className="block py-1 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-primary-500">
                                      {q > 0 ? q : <span className="text-gray-400 dark:text-gray-500">—</span>}
                                    </span>
                                  )}
                                </td>
                                )
                              })}
                              <td tabIndex={0} onKeyDown={(e) => handleGridArrowNav(e, 'empaque-grid', rowIndex, nh + 2, maxRow, maxCol)} data-grid="empaque-grid" data-row={rowIndex} data-col={nh + 2} className="px-2 py-1 text-center font-medium tabular-nums md:sticky max-md:!static z-20 bg-inherit text-gray-900 dark:text-gray-100 border-b border-r border-gray-200 dark:border-gray-600 shadow-[4px_0_6px_-2px_rgba(0,0,0,0.08)] focus:outline-none focus:ring-1 focus:ring-primary-500" style={{ width: `${widthTotalB}px`, right: `${widthTotalKg}px` }}>
                                {totalBultos}
                              </td>
                              <td tabIndex={0} onKeyDown={(e) => handleGridArrowNav(e, 'empaque-grid', rowIndex, nh + 3, maxRow, maxCol)} data-grid="empaque-grid" data-row={rowIndex} data-col={nh + 3} className="px-2 py-1 text-center tabular-nums md:sticky max-md:!static md:right-0 z-20 bg-inherit text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-600 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.08)] focus:outline-none focus:ring-1 focus:ring-primary-500" style={{ width: `${widthTotalKg}px` }}>
                                {totalKg.toFixed(1)}
                              </td>
                            </tr>
                          )
                        })
                      )
                      })()
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-gray-200 dark:border-gray-600">
              <div className="flex items-center gap-6">
                <span className="text-sm font-medium text-gray-800 dark:text-gray-100">
                  Total bultos: <strong>{totalesGeneral().bultos}</strong>
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
                  <button
                    type="button"
                    onClick={handleFinalizar}
                    disabled={finalizando || hayParihuelasEnTransito}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                    title={hayParihuelasEnTransito ? 'Recepcione todas las parihuelas en Recepción de parihuelas antes de finalizar' : 'Finalizar empaque'}
                  >
                    {finalizando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                    Finalizar empaque
                  </button>
                )}
              </div>
            </div>

            {editandoParihuela && (
              <Modal isOpen onClose={() => setEditandoParihuela(null)} title="Editar parihuela" size="sm">
                <div className="space-y-3">
                  <p className="text-sm text-gray-600 dark:text-gray-400">{[editandoParihuela.producto_codigo, editandoParihuela.producto_descripcion || editandoParihuela.producto_nombre, editandoParihuela.producto_presentacion].filter(Boolean).join(' · ')}</p>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-0.5">Cantidad</label>
                    <input type="number" min="0" step="0.01" inputMode="decimal" value={editCantidad} onChange={(e) => setEditCantidad(e.target.value)} className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-500 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-0.5">Hora</label>
                    <select value={editHora} onChange={(e) => setEditHora(Number(e.target.value))} className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-500 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                      {HORAS_OPCIONES.map((h) => (<option key={h} value={h}>{etiquetaHora(h)}</option>))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-0.5">Referencia</label>
                    <input type="text" value={editReferencia} onChange={(e) => setEditReferencia(e.target.value)} className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-500 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <button type="button" onClick={() => setEditandoParihuela(null)} className="px-3 py-1.5 rounded-lg text-sm border border-gray-300 dark:border-gray-500 text-gray-700 dark:text-gray-300">Cancelar</button>
                    <button type="button" disabled={guardandoEdit || !cantidadParihuelaValida(editCantidad)} onClick={() => { if (!cantidadParihuelaValida(editCantidad)) return; setGuardandoEdit(true); parihuelasApi.actualizar(editandoParihuela.id, { cantidad: Number(editCantidad), hora: editHora, referencia: editReferencia.trim() || undefined }).then(() => { toast.success('Parihuela actualizada'); setEditandoParihuela(null); loadEmpaque(empaqueActual?.id); parihuelasApi.listar({ lote_id: loteSeleccionado?.id }).then(({ data: pr }) => setParihuelasLote(pr?.data ?? pr ?? [])); }).catch((err) => toast.error(err.response?.data?.message || 'Error')).finally(() => setGuardandoEdit(false)); }} className="px-3 py-1.5 rounded-lg text-sm font-medium bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50">
                      {guardandoEdit ? <Loader2 className="w-4 h-4 animate-spin inline" /> : null}
                      Guardar
                    </button>
                  </div>
                </div>
              </Modal>
            )}

            <RotuloParihuela
              parihuelaId={rotuloParihuelaId}
              onClose={() => setRotuloParihuelaId(null)}
              clienteNombre={loteSeleccionado?.cliente_nombre ?? null}
              especieNombre={loteSeleccionado?.especie_nombre ?? null}
            />
          </div>
        )}
      </div>
      <ExportMatrixModal
        isOpen={openExport}
        onClose={() => setOpenExport(false)}
        title={`Empaque ${empaqueData?.lote_codigo || ''}`.trim()}
        rows={filasExportEmpaque}
        columns={colsExportEmpaque}
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

export default Empaque
