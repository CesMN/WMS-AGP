import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Loader2,
  RefreshCw,
  Undo2,
  Pencil,
  Plus,
  Search,
  X,
  Trash2,
  FileText,
  Truck,
  Package,
} from 'lucide-react'
import Modal from '../../components/Modal'
import ExportDropdown from '../../components/ExportDropdown'
import { insumosApi } from '../../api/insumos'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'

const hoyISO = () => {
  const d = new Date()
  const z = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`
}

const accentBtn = {
  emerald: 'bg-emerald-600 hover:bg-emerald-700',
  amber: 'bg-amber-600 hover:bg-amber-700',
}

const accentRing = {
  emerald: 'ring-emerald-500/40 border-emerald-500/60',
  amber: 'ring-amber-500/40 border-amber-500/60',
}

const accentIcon = {
  emerald: 'text-emerald-600',
  amber: 'text-amber-600',
}

/** IDs de API (pg/json) pueden venir como string; unificamos para estado y comparaciones */
function normDocId(id) {
  if (id == null || id === '') return null
  const n = Number(id)
  return Number.isFinite(n) ? n : String(id)
}

function idsIguales(a, b) {
  if (a == null || b == null) return false
  return String(a) === String(b)
}

/** Solo nombre; si hay código de catálogo se muestra "CÓDIGO — nombre" */
function fmtDescInsumoLinea(m) {
  const nom = (m.insumo_nombre || '').trim()
  const cod = m.insumo_codigo != null && String(m.insumo_codigo).trim() !== '' ? String(m.insumo_codigo).trim() : ''
  if (cod) return `${cod} — ${nom}`
  return nom || '—'
}

/**
 * @param {'INGRESO'|'SALIDA'} tipo
 * @param {string} title
 * @param {string} subtitle
 * @param {React.ComponentType} Icon
 * @param {'emerald'|'amber'} accent
 */
export default function MovimientosInsumosPanel({ tipo, title, subtitle, Icon, accent }) {
  const { isAdmin } = useAuth()

  const [documentos, setDocumentos] = useState([])
  const [loadingList, setLoadingList] = useState(true)
  const [selectedId, setSelectedId] = useState(null)
  const [modo, setModo] = useState('lista')

  const [detalle, setDetalle] = useState(null)
  const [loadingDetalle, setLoadingDetalle] = useState(false)

  const [lotes, setLotes] = useState([])
  const [proveedores, setProveedores] = useState([])
  const [insumosCatalogo, setInsumosCatalogo] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [buscando, setBuscando] = useState(false)

  const [draft, setDraft] = useState({
    fecha_movimiento: hoyISO(),
    lote_produccion_id: '',
    referencia: '',
    observaciones: '',
    ingreso_origen: 'PRODUCCION',
    proveedor_id: '',
  })
  const [lineasDraft, setLineasDraft] = useState({})
  const [submitting, setSubmitting] = useState(false)

  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editMovId, setEditMovId] = useState(null)
  const [editLoading, setEditLoading] = useState(false)
  const [editSaving, setEditSaving] = useState(false)
  const [editForm, setEditForm] = useState({
    insumo_id: '',
    lote_produccion_id: '',
    cantidad: '',
    referencia: '',
    observaciones: '',
  })

  const loadDocumentos = useCallback(async () => {
    setLoadingList(true)
    try {
      const { data } = await insumosApi.documentosListar({ tipo, limit: 120 })
      setDocumentos(data?.data ?? [])
    } catch {
      toast.error('Error al cargar documentos')
      setDocumentos([])
    } finally {
      setLoadingList(false)
    }
  }, [tipo])

  const loadDetalle = async (docId) => {
    setLoadingDetalle(true)
    setDetalle(null)
    try {
      const { data } = await insumosApi.documentoObtener(docId)
      setDetalle(data)
    } catch {
      toast.error('No se pudo cargar el documento')
    } finally {
      setLoadingDetalle(false)
    }
  }

  useEffect(() => {
    loadDocumentos()
  }, [loadDocumentos])

  useEffect(() => {
    if (tipo === 'SALIDA') {
      insumosApi.lotesProduccionMeta().then(({ data }) => setLotes(data?.data ?? [])).catch(() => setLotes([]))
    }
    if (tipo === 'INGRESO') {
      insumosApi
        .proveedoresListar({ limit: 400 })
        .then(({ data }) => setProveedores(data?.data ?? []))
        .catch(() => setProveedores([]))
    }
  }, [tipo])

  useEffect(() => {
    const t = setTimeout(() => {
      const q = busqueda.trim()
      if (q.length < 2) {
        setInsumosCatalogo([])
        setBuscando(false)
        return
      }
      setBuscando(true)
      insumosApi
        .listar({ limit: 40, q })
        .then(({ data }) => setInsumosCatalogo(data?.data ?? []))
        .catch(() => setInsumosCatalogo([]))
        .finally(() => setBuscando(false))
    }, 320)
    return () => clearTimeout(t)
  }, [busqueda])

  const abrirNuevo = () => {
    setModo('nuevo')
    setSelectedId(null)
    setDetalle(null)
    setDraft({
      fecha_movimiento: hoyISO(),
      lote_produccion_id: '',
      referencia: '',
      observaciones: '',
      ingreso_origen: 'PRODUCCION',
      proveedor_id: '',
    })
    setLineasDraft({})
    setBusqueda('')
    setInsumosCatalogo([])
  }

  const seleccionarDocumento = (id) => {
    const nid = normDocId(id)
    setModo('detalle')
    setSelectedId(nid)
    loadDetalle(id)
  }

  const agregarInsumoLinea = (ins) => {
    const id = String(ins.id)
    setLineasDraft((prev) => {
      if (prev[id]) return prev
      return {
        ...prev,
        [id]: {
          insumo_id: ins.id,
          nombre: ins.nombre,
          unidad_medida: ins.unidad_medida,
          stock_actual: ins.stock_actual,
          cantidad: '',
        },
      }
    })
  }

  const quitarLineaDraft = (insumoId) => {
    setLineasDraft((prev) => {
      const next = { ...prev }
      delete next[String(insumoId)]
      return next
    })
  }

  const setCantidadDraft = (insumoId, val) => {
    setLineasDraft((prev) => ({
      ...prev,
      [String(insumoId)]: { ...prev[String(insumoId)], cantidad: val },
    }))
  }

  const lineasParaGuardar = useMemo(() => {
    return Object.values(lineasDraft)
      .map((l) => ({
        insumo_id: l.insumo_id,
        cantidad: Number(String(l.cantidad).replace(',', '.')),
      }))
      .filter((l) => Number.isFinite(l.cantidad) && l.cantidad > 0)
  }, [lineasDraft])

  const guardarDocumento = async (e) => {
    e.preventDefault()
    if (tipo === 'SALIDA' && !draft.lote_produccion_id) {
      toast.error('Seleccione un lote de producción')
      return
    }
    if (tipo === 'INGRESO' && draft.ingreso_origen === 'PROVEEDOR' && !draft.proveedor_id) {
      toast.error('Seleccione un proveedor de insumos')
      return
    }
    if (lineasParaGuardar.length === 0) {
      toast.error('Indique cantidades mayores a cero en al menos un insumo')
      return
    }
    setSubmitting(true)
    try {
      const { data: created } = await insumosApi.documentoCrear({
        tipo,
        lote_produccion_id: tipo === 'SALIDA' ? draft.lote_produccion_id : undefined,
        fecha_movimiento: draft.fecha_movimiento || undefined,
        referencia: draft.referencia?.trim() || undefined,
        observaciones: draft.observaciones?.trim() || undefined,
        lineas: lineasParaGuardar,
        ...(tipo === 'INGRESO'
          ? {
              ingreso_origen: draft.ingreso_origen,
              proveedor_id:
                draft.ingreso_origen === 'PROVEEDOR' ? draft.proveedor_id || undefined : undefined,
            }
          : {}),
      })
      toast.success('Documento registrado')
      await loadDocumentos()
      const newId = normDocId(created?.documento_id)
      if (newId != null) {
        setModo('detalle')
        setSelectedId(newId)
        await loadDetalle(created?.documento_id)
      } else {
        setModo('lista')
        setSelectedId(null)
        setDetalle(null)
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al guardar')
    } finally {
      setSubmitting(false)
    }
  }

  const abrirEditar = async (m) => {
    setEditMovId(m.id)
    setEditModalOpen(true)
    setEditLoading(true)
    setEditForm({
      insumo_id: m.insumo_id || '',
      lote_produccion_id: m.lote_produccion_id || detalle?.lote_produccion_id || '',
      cantidad: String(m.cantidad ?? ''),
      referencia: m.referencia || '',
      observaciones: m.observaciones || '',
    })
    try {
      const { data } = await insumosApi.movimientoObtener(m.id)
      if (data?.id) {
        setEditForm({
          insumo_id: data.insumo_id || '',
          lote_produccion_id: data.lote_produccion_id || '',
          cantidad: String(data.cantidad ?? ''),
          referencia: data.referencia || '',
          observaciones: data.observaciones || '',
        })
      }
    } catch {
      toast.error('No se pudo cargar el movimiento')
    } finally {
      setEditLoading(false)
    }
  }

  const cerrarEditar = () => {
    setEditModalOpen(false)
    setEditMovId(null)
  }

  const guardarEdicion = async (e) => {
    e.preventDefault()
    if (!editMovId) return
    if (tipo === 'SALIDA') {
      if (!editForm.insumo_id || !editForm.lote_produccion_id || !editForm.cantidad || Number(editForm.cantidad) <= 0) {
        toast.error('Complete lote, insumo y cantidad válida')
        return
      }
    } else if (!editForm.insumo_id || !editForm.cantidad || Number(editForm.cantidad) <= 0) {
      toast.error('Complete insumo y cantidad válida')
      return
    }
    setEditSaving(true)
    try {
      const payload = {
        insumo_id: editForm.insumo_id,
        cantidad: Number(editForm.cantidad),
        referencia: editForm.referencia || null,
        observaciones: editForm.observaciones || null,
      }
      if (tipo === 'SALIDA') payload.lote_produccion_id = editForm.lote_produccion_id
      await insumosApi.movimientoActualizar(editMovId, payload)
      toast.success('Línea actualizada')
      cerrarEditar()
      if (selectedId != null) {
        await loadDetalle(selectedId)
      }
      await loadDocumentos()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al guardar')
    } finally {
      setEditSaving(false)
    }
  }

  const anularMovimiento = async (m) => {
    if (!window.confirm('¿Anular esta línea? Se revertirá el stock.')) return
    try {
      const { data } = await insumosApi.movimientoEliminar(m.id)
      toast.success(data?.message || 'Línea anulada')
      if (selectedId != null) {
        await loadDetalle(selectedId)
      }
      await loadDocumentos()
    } catch (err) {
      toast.error(err.response?.data?.message || 'No se pudo anular')
    }
  }

  const anularDocumento = async () => {
    if (!detalle?.id) return
    if (
      !window.confirm(
        '¿Anular todo el documento? Se revertirán todas las líneas y se eliminará el encabezado.'
      )
    )
      return
    try {
      const { data } = await insumosApi.documentoEliminar(detalle.id)
      toast.success(data?.message || 'Documento anulado')
      setModo('lista')
      setSelectedId(null)
      setDetalle(null)
      await loadDocumentos()
    } catch (err) {
      toast.error(err.response?.data?.message || 'No se pudo anular el documento')
    }
  }

  const [insumosEdit, setInsumosEdit] = useState([])
  useEffect(() => {
    if (editModalOpen) {
      insumosApi.listar({ limit: 500 }).then(({ data }) => setInsumosEdit(data?.data ?? []))
    }
  }, [editModalOpen])

  const fmtFecha = (row) => {
    const raw = row.fecha_movimiento || row.created_at
    if (!raw) return '—'
    const d = new Date(raw)
    if (Number.isNaN(d.getTime())) return String(raw)
    return d.toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  const fmtCantidad = (n) => {
    const x = Number(n)
    if (!Number.isFinite(x)) return '—'
    return x.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
  }

  const tituloListaRegistrados = tipo === 'SALIDA' ? 'Salidas registradas' : 'Ingresos registrados'
  const tituloDetallePanel = tipo === 'SALIDA' ? 'Detalle de la salida' : 'Detalle del ingreso'
  const IconLista = tipo === 'SALIDA' ? Truck : Package
  const filasExport = (documentos || []).map((d) => ({
    referencia: d.referencia || '—',
    fecha: fmtFecha(d),
    origen: tipo === 'INGRESO'
      ? d.ingreso_origen === 'PROVEEDOR'
        ? (d.proveedor_nombre ? `Proveedor: ${d.proveedor_nombre}` : 'Proveedor')
        : 'Producción'
      : '',
    lote: d.lote_codigo || '—',
    observaciones: d.observaciones || '',
  }))

  return (
    <div className="min-w-0 max-w-full w-full box-border">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-5">
        <div className="flex items-start gap-3 min-w-0">
          <div className={`p-2 rounded-lg shrink-0 ${accent === 'emerald' ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-amber-100 dark:bg-amber-900/30'}`}>
            <Icon className={`w-6 h-6 ${accentIcon[accent]}`} />
          </div>
          <div className="min-w-0">
            <p className="text-sm text-gray-500 dark:text-gray-400">Insumos</p>
            <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white leading-tight">{title}</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">{subtitle}</p>
          </div>
        </div>
        <div className="w-full lg:w-auto shrink-0 min-h-[44px] lg:min-h-0 flex items-stretch lg:items-center [&_button]:min-h-[44px] lg:[&_button]:min-h-0">
        <ExportDropdown
          disabled={!filasExport.length}
          getExportConfig={() => ({
            fetchData: async () => ({ data: filasExport }),
            columns:
              tipo === 'INGRESO'
                ? [
                    { key: 'referencia', label: 'Referencia' },
                    { key: 'fecha', label: 'Fecha' },
                    { key: 'origen', label: 'Origen' },
                    { key: 'observaciones', label: 'Observaciones' },
                  ]
                : [
                    { key: 'referencia', label: 'Referencia' },
                    { key: 'fecha', label: 'Fecha' },
                    { key: 'lote', label: 'Lote' },
                    { key: 'observaciones', label: 'Observaciones' },
                  ],
            title: tipo === 'INGRESO' ? 'Ingresos de insumos' : 'Salidas de insumos',
          })}
        />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4 min-h-[520px]">
        {/* Lista izquierda — tabla maestra */}
        <aside className="flex flex-col rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden max-h-[calc(100vh-9rem)] shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 border-b border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-900/50">
            <div className="flex items-center gap-2 min-w-0">
              <IconLista className={`w-5 h-5 shrink-0 ${accentIcon[accent]}`} />
              <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">{tituloListaRegistrados}</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={abrirNuevo}
                className="inline-flex items-center justify-center gap-1 min-h-[40px] sm:min-h-0 px-2.5 py-2 sm:py-1.5 rounded-lg text-xs font-medium text-white bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="w-3.5 h-3.5" />
                Añadir
              </button>
              <button
                type="button"
                onClick={loadDocumentos}
                title="Actualizar lista"
                className="p-1.5 rounded-md text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
              >
                <RefreshCw className={`w-4 h-4 ${loadingList ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
          <div className="overflow-auto flex-1">
            {loadingList ? (
              <div className="flex justify-center py-16">
                <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
              </div>
            ) : documentos.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-12 px-4">Sin documentos aún. Use &quot;Añadir&quot; para crear uno.</p>
            ) : (
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 z-10 bg-gray-100 dark:bg-gray-900">
                  <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                    <th className="px-2 py-2">Referencia</th>
                    <th className="px-2 py-2 whitespace-nowrap">Fecha</th>
                    {tipo === 'INGRESO' && (
                      <th className="px-2 py-2 hidden sm:table-cell max-w-[100px]">Origen</th>
                    )}
                    {tipo === 'SALIDA' && (
                      <th className="px-2 py-2 hidden sm:table-cell whitespace-nowrap">Lote</th>
                    )}
                    <th className="px-2 py-2 hidden md:table-cell max-w-[140px]">Observaciones</th>
                  </tr>
                </thead>
                <tbody>
                  {documentos.map((d, idx) => {
                    const active = modo === 'detalle' && idsIguales(selectedId, d.id)
                    const origenTxt =
                      tipo === 'INGRESO'
                        ? d.ingreso_origen === 'PROVEEDOR'
                          ? d.proveedor_nombre
                            ? `Prov.: ${d.proveedor_nombre}`
                            : 'Proveedor'
                          : 'Producción'
                        : null
                    return (
                      <tr
                        key={d.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => seleccionarDocumento(d.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            seleccionarDocumento(d.id)
                          }
                        }}
                        className={`cursor-pointer border-b border-gray-100 dark:border-gray-700/80 transition-colors ${
                          idx % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50/70 dark:bg-gray-800/60'
                        } ${
                          active
                            ? `ring-2 ring-inset ${accentRing[accent]} ${
                                accent === 'amber' ? 'bg-amber-50/60 dark:bg-gray-900/90' : 'bg-emerald-50/60 dark:bg-gray-900/90'
                              }`
                            : 'hover:bg-gray-100/80 dark:hover:bg-gray-700/50'
                        }`}
                      >
                        <td className="px-2 py-2 font-medium text-gray-900 dark:text-white max-w-[140px] truncate" title={d.referencia || ''}>
                          {d.referencia || '—'}
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap text-gray-700 dark:text-gray-300">{fmtFecha(d)}</td>
                        {tipo === 'INGRESO' && (
                          <td
                            className="px-2 py-2 hidden sm:table-cell text-gray-600 dark:text-gray-400 max-w-[120px] truncate text-xs"
                            title={origenTxt || ''}
                          >
                            {origenTxt || '—'}
                          </td>
                        )}
                        {tipo === 'SALIDA' && (
                          <td className="px-2 py-2 hidden sm:table-cell text-gray-600 dark:text-gray-400">
                            {d.lote_codigo || '—'}
                          </td>
                        )}
                        <td className="px-2 py-2 hidden md:table-cell text-gray-500 dark:text-gray-500 max-w-[160px] truncate text-xs" title={d.observaciones || ''}>
                          {d.observaciones || '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </aside>

        {/* Detalle derecha */}
        <section className="flex flex-col rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden min-h-[420px] shadow-sm">
          {modo === 'nuevo' && (
            <form onSubmit={guardarDocumento} className="flex flex-col flex-1 min-h-0">
              <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-900/50">
                <Plus className={`w-5 h-5 ${accentIcon[accent]}`} />
                <span className="text-sm font-semibold text-gray-900 dark:text-white">Nuevo documento</span>
              </div>
              <div className="p-4 md:p-5 space-y-5 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Fecha del movimiento *
                  </label>
                  <input
                    type="date"
                    value={draft.fecha_movimiento}
                    onChange={(e) => setDraft((d) => ({ ...d, fecha_movimiento: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg"
                    required
                  />
                </div>
                {tipo === 'SALIDA' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Lote de producción *
                    </label>
                    <select
                      value={draft.lote_produccion_id}
                      onChange={(e) => setDraft((d) => ({ ...d, lote_produccion_id: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg"
                      required
                    >
                      <option value="">Seleccione lote...</option>
                      {lotes.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.codigo} · {l.estado || ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              {tipo === 'INGRESO' && (
                <div className="space-y-3">
                  <span className="block text-sm font-medium text-gray-700 dark:text-gray-300">Tipo de ingreso *</span>
                  <div className="flex flex-wrap gap-6">
                    <label className="inline-flex items-center gap-2 cursor-pointer text-sm text-gray-800 dark:text-gray-200">
                      <input
                        type="radio"
                        name="ingreso_origen"
                        className="rounded-full border-gray-400 text-emerald-600 focus:ring-emerald-500"
                        checked={draft.ingreso_origen === 'PRODUCCION'}
                        onChange={() =>
                          setDraft((d) => ({ ...d, ingreso_origen: 'PRODUCCION', proveedor_id: '' }))
                        }
                      />
                      Ingreso por producción
                    </label>
                    <label className="inline-flex items-center gap-2 cursor-pointer text-sm text-gray-800 dark:text-gray-200">
                      <input
                        type="radio"
                        name="ingreso_origen"
                        className="rounded-full border-gray-400 text-emerald-600 focus:ring-emerald-500"
                        checked={draft.ingreso_origen === 'PROVEEDOR'}
                        onChange={() => setDraft((d) => ({ ...d, ingreso_origen: 'PROVEEDOR' }))}
                      />
                      Ingreso por proveedor
                    </label>
                  </div>
                  {draft.ingreso_origen === 'PROVEEDOR' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Proveedor de insumos *
                      </label>
                      <select
                        value={draft.proveedor_id}
                        onChange={(e) => setDraft((d) => ({ ...d, proveedor_id: e.target.value }))}
                        className="w-full max-w-md px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg"
                        required={draft.ingreso_origen === 'PROVEEDOR'}
                      >
                        <option value="">Seleccione proveedor...</option>
                        {proveedores.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.razon_social}
                            {p.ruc ? ` · ${p.ruc}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Referencia</label>
                <input
                  value={draft.referencia}
                  onChange={(e) => setDraft((d) => ({ ...d, referencia: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg"
                  placeholder="OC, guía, etc."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Observaciones</label>
                <textarea
                  value={draft.observaciones}
                  onChange={(e) => setDraft((d) => ({ ...d, observaciones: e.target.value }))}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg"
                />
              </div>

              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <p className="text-sm font-medium text-gray-900 dark:text-white mb-2">Insumos</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                  Escriba al menos 2 caracteres para buscar; pulse un resultado para agregarlo y luego indique las
                  cantidades.
                </p>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="search"
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    placeholder="Buscar insumo por nombre o código..."
                    className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg"
                  />
                </div>
                {buscando && (
                  <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" /> Buscando...
                  </p>
                )}
                {busqueda.trim().length >= 2 && insumosCatalogo.length > 0 && (
                  <ul className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-600 divide-y divide-gray-100 dark:divide-gray-700">
                    {insumosCatalogo.map((ins) => {
                      const ya = lineasDraft[String(ins.id)]
                      return (
                        <li key={ins.id}>
                          <button
                            type="button"
                            disabled={!!ya}
                            onClick={() => agregarInsumoLinea(ins)}
                            className={`w-full text-left px-3 py-2 text-sm ${
                              ya
                                ? 'text-gray-400 cursor-not-allowed'
                                : 'hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-white'
                            }`}
                          >
                            <span className="font-medium">{ins.nombre}</span>
                            <span className="text-xs text-gray-500 ml-2">
                              stock {Number(ins.stock_actual)} {ins.unidad_medida}
                            </span>
                            {ya && <span className="text-xs ml-2">(ya agregado)</span>}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>

              {Object.keys(lineasDraft).length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-900/50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Insumo</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase w-36">
                          Cantidad *
                        </th>
                        <th className="w-10" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {Object.values(lineasDraft).map((l) => (
                        <tr key={l.insumo_id}>
                          <td className="px-3 py-2">
                            <span className="text-gray-900 dark:text-white">{l.nombre}</span>
                            <span className="text-xs text-gray-500 ml-1">({l.unidad_medida})</span>
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min="0.001"
                              step="any"
                              value={l.cantidad}
                              onChange={(e) => setCantidadDraft(l.insumo_id, e.target.value)}
                              className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg text-right tabular-nums"
                              placeholder="0"
                            />
                          </td>
                          <td className="px-1 py-2">
                            <button
                              type="button"
                              title="Quitar"
                              onClick={() => quitarLineaDraft(l.insumo_id)}
                              className="p-1 text-gray-500 hover:text-red-600"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setModo('lista')
                    setSelectedId(null)
                  }}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting || lineasParaGuardar.length === 0}
                  className={`px-4 py-2 text-white rounded-lg font-medium disabled:opacity-50 inline-flex items-center gap-2 ${accentBtn[accent]}`}
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Guardar documento
                </button>
              </div>
              </div>
            </form>
          )}

          {modo === 'detalle' && selectedId != null && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 border-b border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-900/50">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className={`w-5 h-5 shrink-0 ${accentIcon[accent]}`} />
                  <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">{tituloDetallePanel}</span>
                </div>
                {isAdmin() && detalle && (
                  <button
                    type="button"
                    onClick={anularDocumento}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border border-red-300 text-red-700 dark:text-red-400 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Anular todo
                  </button>
                )}
              </div>
              <div className="flex-1 overflow-auto p-4 md:p-5 min-h-[280px]">
                {loadingDetalle ? (
                  <div className="flex justify-center py-24">
                    <Loader2 className="w-10 h-10 animate-spin text-primary-600" />
                  </div>
                ) : detalle ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm border-b border-gray-100 dark:border-gray-700 pb-4">
                      <div>
                        <span className="text-gray-500 dark:text-gray-400 text-xs uppercase">Fecha</span>
                        <p className="font-medium text-gray-900 dark:text-white">{fmtFecha(detalle)}</p>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400 text-xs uppercase">Registro</span>
                        <p className="text-gray-700 dark:text-gray-300">
                          {detalle.created_at ? new Date(detalle.created_at).toLocaleString('es') : '—'}
                        </p>
                      </div>
                      {tipo === 'SALIDA' && detalle.lote_codigo && (
                        <div>
                          <span className="text-gray-500 dark:text-gray-400 text-xs uppercase">Lote</span>
                          <p className="font-medium text-amber-700 dark:text-amber-400">{detalle.lote_codigo}</p>
                        </div>
                      )}
                      {tipo === 'INGRESO' && (
                        <div>
                          <span className="text-gray-500 dark:text-gray-400 text-xs uppercase">Origen</span>
                          <p className="text-gray-900 dark:text-white">
                            {detalle.ingreso_origen === 'PROVEEDOR' ? 'Ingreso por proveedor' : 'Ingreso por producción'}
                          </p>
                        </div>
                      )}
                      {tipo === 'INGRESO' && detalle.ingreso_origen === 'PROVEEDOR' && (
                        <div>
                          <span className="text-gray-500 dark:text-gray-400 text-xs uppercase">Proveedor</span>
                          <p className="text-gray-900 dark:text-white">{detalle.proveedor_nombre || '—'}</p>
                        </div>
                      )}
                      <div className="sm:col-span-2">
                        <span className="text-gray-500 dark:text-gray-400 text-xs uppercase">Referencia</span>
                        <p className="text-gray-800 dark:text-gray-200">{detalle.referencia || '—'}</p>
                      </div>
                      <div className="sm:col-span-2">
                        <span className="text-gray-500 dark:text-gray-400 text-xs uppercase">Observaciones</span>
                        <p className="text-gray-600 dark:text-gray-400">{detalle.observaciones || '—'}</p>
                      </div>
                      <div className="sm:col-span-2 text-xs text-gray-500">Usuario: {detalle.usuario_nombre}</div>
                    </div>

                    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                      <table className="min-w-full text-sm">
                        <thead className="bg-gray-100 dark:bg-gray-900">
                          <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                            <th className="px-3 py-2">Descripción del insumo</th>
                            <th className="px-3 py-2 whitespace-nowrap">Und. medida</th>
                            <th className="px-3 py-2 text-right">Cantidad</th>
                            {isAdmin() && <th className="px-3 py-2 text-right w-24">Acciones</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {(detalle.lineas || []).map((m, i) => (
                            <tr
                              key={m.id}
                              className={`border-b border-gray-100 dark:border-gray-700/80 ${
                                i % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50/80 dark:bg-gray-800/50'
                              }`}
                            >
                              <td className="px-3 py-2 text-gray-900 dark:text-white">{fmtDescInsumoLinea(m)}</td>
                              <td className="px-3 py-2 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                                {m.insumo_unidad || '—'}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-gray-900 dark:text-white">
                                {fmtCantidad(m.cantidad)}
                              </td>
                              {isAdmin() && (
                                <td className="px-3 py-2 text-right whitespace-nowrap">
                                  <button
                                    type="button"
                                    title="Editar línea"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      abrirEditar(m)
                                    }}
                                    className="p-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded"
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </button>
                                  <button
                                    type="button"
                                    title="Anular línea"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      anularMovimiento(m)
                                    }}
                                    className="p-1.5 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded"
                                  >
                                    <Undo2 className="w-4 h-4" />
                                  </button>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {(!detalle.lineas || detalle.lineas.length === 0) && (
                      <p className="text-sm text-gray-500">Este documento no tiene líneas.</p>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-12 text-gray-500 dark:text-gray-400 space-y-3">
                    <p>No se pudo cargar el detalle.</p>
                    <button
                      type="button"
                      onClick={() => selectedId != null && loadDetalle(selectedId)}
                      className="text-sm text-primary-600 hover:underline"
                    >
                      Reintentar
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

          {modo === 'lista' && (
            <div className="flex flex-col items-center justify-center py-16 text-center text-gray-500 dark:text-gray-400">
              <p className="mb-4">Seleccione un documento a la izquierda o cree uno nuevo.</p>
              <button
                type="button"
                onClick={abrirNuevo}
                className={`px-4 py-2 rounded-lg text-white font-medium ${accentBtn[accent]}`}
              >
                Nuevo documento
              </button>
            </div>
          )}
        </section>
      </div>

      <Modal
        isOpen={editModalOpen}
        onClose={cerrarEditar}
        title={tipo === 'SALIDA' ? 'Editar línea de salida' : 'Editar línea de ingreso'}
        size="md"
      >
        {editLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
          </div>
        ) : (
          <form onSubmit={guardarEdicion} className="space-y-4">
            {tipo === 'SALIDA' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Lote de producción *
                </label>
                <select
                  value={editForm.lote_produccion_id}
                  onChange={(e) => setEditForm((f) => ({ ...f, lote_produccion_id: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg"
                  required
                >
                  <option value="">Seleccione lote...</option>
                  {lotes.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.codigo} · {l.estado || ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Insumo *</label>
                <select
                  value={editForm.insumo_id}
                  onChange={(e) => setEditForm((f) => ({ ...f, insumo_id: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg"
                  required
                >
                  <option value="">Seleccione...</option>
                  {insumosEdit.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.nombre} (stock {Number(i.stock_actual)} {i.unidad_medida})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cantidad *</label>
                <input
                  type="number"
                  min="0.001"
                  step="any"
                  value={editForm.cantidad}
                  onChange={(e) => setEditForm((f) => ({ ...f, cantidad: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Referencia</label>
              <input
                value={editForm.referencia}
                onChange={(e) => setEditForm((f) => ({ ...f, referencia: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Observaciones</label>
              <textarea
                value={editForm.observaciones}
                onChange={(e) => setEditForm((f) => ({ ...f, observaciones: e.target.value }))}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg"
              />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Al guardar se ajusta el stock según la diferencia con el registro anterior.
            </p>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={cerrarEditar}
                className="flex-1 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={editSaving}
                className={`flex-1 py-2 text-white rounded-lg font-medium disabled:opacity-50 flex items-center justify-center gap-2 ${accentBtn[accent]}`}
              >
                {editSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Guardar
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
