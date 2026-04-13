import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Package, Loader2, CheckCircle, RotateCcw, Plus, Truck, FileText, Pencil, Trash2 } from 'lucide-react'
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
  const [rotuloParihuelaId, setRotuloParihuelaId] = useState(null)
  const [editandoParihuela, setEditandoParihuela] = useState(null)
  const [editCantidad, setEditCantidad] = useState('')
  const [editHora, setEditHora] = useState(0)
  const [editReferencia, setEditReferencia] = useState('')
  const [guardandoEdit, setGuardandoEdit] = useState(false)
  const [eliminandoId, setEliminandoId] = useState(null)

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
      setParihuelaProductoId('')
      setParihuelaProductoQuery('')
      setParihuelaProductoComboOpen(false)
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
      horasTablaEmpaque.map((h) => ({
        key: `h_${h}`,
        label: `${String(h).padStart(2, '0')}:00`,
        hora: h,
      })),
    [horasTablaEmpaque]
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
            row[h.key] = cantidadPorHoraProducto(p, h.hora)
          }
          row.total_bultos = totalBultos
          row.total_kg = Number(totalKg.toFixed(2))
          return row
        })
      ),
    [empaqueData, horasExport, cantidadPorHoraProducto]
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
              <div className="flex items-center gap-2">
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
                  disabled={readonly || saving}
                  className="px-3 py-1.5 border border-gray-300 dark:border-gray-500 rounded-lg text-sm min-w-[180px] bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500"
                >
                  {plantillas.map((p) => (
                    <option key={p.id} value={p.id}>{p.titulo}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 dark:border-gray-600 p-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Truck className="w-4 h-4" />
                Enviar a cámara (parihuelas)
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Ingrese producto, cantidad y hora. Al generar la parihuela se registrará en la tabla por hora. El supervisor de cámaras recepcionará en Recepción de parihuelas.
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <div className="relative min-w-[220px] max-w-[min(100%,28rem)]">
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
                    className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-500 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
                  />
                  {parihuelaProductoComboOpen && !readonly && (
                    <ul className="absolute z-30 left-0 right-0 mt-1 max-h-52 overflow-auto rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-lg">
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
                    className="px-3 py-1.5 border border-gray-300 dark:border-gray-500 rounded-lg text-sm w-24 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
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
                    className="px-3 py-1.5 border border-gray-300 dark:border-gray-500 rounded-lg text-sm w-28 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
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
                    className="px-3 py-1.5 border border-gray-300 dark:border-gray-500 rounded-lg text-sm min-w-[120px] bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
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
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
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
                      {horasTablaEmpaque.map((h) => (
                        <th key={h} className="px-1 py-2 text-center min-w-[3rem] bg-slate-100/90 dark:bg-slate-800/80 text-xs font-medium text-gray-900 dark:text-gray-100 border-l border-slate-200/80 dark:border-slate-600/60" title={`${String(h).padStart(2, '0')}:00 — Turno ${turnoHora(h)}`}>
                          {String(h).padStart(2, '0')}:00
                          <span className="block text-[10px] font-normal text-gray-500 dark:text-gray-400">{etiquetaHora(h)}</span>
                        </th>
                      ))}
                      <th className="px-2 py-2 text-center font-medium text-gray-900 dark:text-gray-100 sticky z-20 bg-gray-50 dark:bg-gray-600 w-16 min-w-[4rem] shadow-[4px_0_6px_-2px_rgba(0,0,0,0.08)]" style={{ right: '5rem' }}>
                        Total bult.
                      </th>
                      <th className="px-2 py-2 text-center font-medium text-gray-900 dark:text-gray-100 sticky right-0 z-20 bg-gray-50 dark:bg-gray-600 w-16 min-w-[4rem] shadow-[2px_0_6px_-2px_rgba(0,0,0,0.08)]">
                        Total kg
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                    {productosAgrupados().length === 0 ? (
                      <tr>
                        <td colSpan={horasTablaEmpaque.length + 4} className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                          Envíe parihuelas a cámara para que se genere el resumen por hora.
                        </td>
                      </tr>
                    ) : horasTablaEmpaque.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-6 text-center text-sm text-amber-800 dark:text-amber-200/90 bg-amber-50/80 dark:bg-amber-900/20 border border-amber-200/80 dark:border-amber-800/50 rounded-none">
                          Aún no hay envíos de parihuelas con hora registrada. Genere una parihuela con hora de envío para ver columnas por hora.
                        </td>
                      </tr>
                    ) : (
                      productosAgrupados().map(({ nombreProducto, productos }) =>
                        productos.map((p, idx) => {
                          const { totalBultos, totalKg } = totalesPorFila(p)
                          const linea = [p.codigo, p.descripcion, p.presentacion].filter(Boolean).join(' · ')
                          const isFirst = idx === 0
                          return (
                            <tr key={p.producto_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                              {isFirst ? (
                                <td rowSpan={productos.length} className="px-2 py-1 align-top sticky left-0 z-10 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 font-medium shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]" style={{ minWidth: '90px' }}>
                                  {nombreProducto}
                                </td>
                              ) : null}
                              <td className="px-2 py-1 whitespace-nowrap overflow-hidden text-ellipsis sticky z-10 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-xs shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]" style={{ left: '90px' }} title={linea}>
                                {linea}
                              </td>
                              {horasTablaEmpaque.map((h) => {
                                const q = cantidadPorHoraProducto(p, h)
                                return (
                                <td key={h} className="px-1 py-1 text-center text-sm tabular-nums text-gray-900 dark:text-gray-100 w-12 bg-slate-50/60 dark:bg-slate-900/25">
                                  {q > 0 ? q : <span className="text-gray-400 dark:text-gray-500">—</span>}
                                </td>
                                )
                              })}
                              <td className="px-2 py-1 text-center font-medium sticky z-10 bg-white dark:bg-gray-800 w-16 text-gray-900 dark:text-gray-100 shadow-[4px_0_6px_-2px_rgba(0,0,0,0.08)]" style={{ right: '5rem' }}>
                                {totalBultos}
                              </td>
                              <td className="px-2 py-1 text-center sticky right-0 z-10 bg-white dark:bg-gray-800 w-16 text-gray-900 dark:text-gray-100 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.08)]">
                                {totalKg.toFixed(1)}
                              </td>
                            </tr>
                          )
                        })
                      )
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
