import { useState, useEffect, useMemo } from 'react'
import { Layers, Plus, Edit, Loader2, FileText, Trash2, XCircle } from 'lucide-react'
import Modal from '../../components/Modal'
import PaginationBar from '../../components/PaginationBar'
import { ingresosMpApi } from '../../api/ingresos-mp'
import { useConfig } from '../../contexts/ConfigContext'
import { useAuth } from '../../contexts/AuthContext'
import { traducirLoteAFecha } from '../../utils/traducirLoteAFecha'
import toast from 'react-hot-toast'

const ESTADOS = ['Registrado', 'Iniciado', 'En proceso', 'Terminado']

/** Agrupa líneas del parte (por código) bajo el nombre de producto de plantilla (ej. varias referencias → "FILETE FRESCO"). */
function agruparLineasProduccionPorProducto(lineas) {
  const map = new Map()
  for (const p of lineas || []) {
    const nombre = (p.producto || '').trim() || 'Sin categoría'
    if (!map.has(nombre)) map.set(nombre, { nombre, bultos: 0, kg: 0 })
    const g = map.get(nombre)
    g.bultos += Number(p.empaque_bultos) || 0
    g.kg += Number(p.empaque_kg) || 0
  }
  return Array.from(map.values()).sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'))
}

function labelFuenteOperativoResumen(fuente) {
  if (fuente === 'calculado_tm_mp') return 'Fórmula × TM materia prima'
  if (fuente === 'manual_resumen') return 'Resumen manual'
  if (fuente === 'salidas_documento') return 'Salidas con documento'
  return fuente || '—'
}

function badgeEstadoInsumos(estado) {
  if (estado === 'agregados') return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
  if (estado === 'completos') return 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200'
  return 'bg-gray-100 text-gray-700 dark:bg-gray-700/70 dark:text-gray-200'
}

function claseBadgeEstadoProceso(estado) {
  const e = String(estado || '')
  if (e === 'Finalizado' || e === 'Aplicado') {
    return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
  }
  if (e === 'En proceso') {
    return 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200'
  }
  if (e === 'No aplicado') {
    return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
  }
  return 'bg-gray-100 text-gray-700 dark:bg-gray-600 dark:text-gray-200'
}

const LotesProduccion = () => {
  const { registrosPorPagina, lotRepublicanoAnos } = useConfig()
  const { isAdmin } = useAuth()
  const [list, setList] = useState([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [refreshKey, setRefreshKey] = useState(0)
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState(null)
  const [saving, setSaving] = useState(false)
  const [filtroEstado, setFiltroEstado] = useState('')
  const [formData, setFormData] = useState({
    codigo: '',
    estado: 'Registrado',
    fecha_creacion: new Date().toISOString().slice(0, 10),
    fecha_inicio: '',
    fecha_terminado: '',
    observaciones: '',
  })
  const [errors, setErrors] = useState({})
  const [modalResumenOpen, setModalResumenOpen] = useState(false)
  const [resumenData, setResumenData] = useState(null)
  const [loadingResumen, setLoadingResumen] = useState(false)
  const [deletingLoteId, setDeletingLoteId] = useState(null)
  const [cancelandoProcesosId, setCancelandoProcesosId] = useState(null)

  useEffect(() => {
    let cancelled = false
    const limit = registrosPorPagina || 50
    setLoading(true)
    const params = { limit, offset: Number(offset) }
    if (filtroEstado) params.estado = filtroEstado
    ingresosMpApi
      .lotesListar(params)
      .then(({ data }) => {
        if (cancelled) return
        setList(data?.data ?? data ?? [])
        setTotal(data?.total ?? 0)
      })
      .catch(() => {
        if (!cancelled) {
          toast.error('Error al cargar lotes')
          setList([])
          setTotal(0)
        }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [offset, registrosPorPagina, refreshKey, filtroEstado])

  const refreshLista = () => setRefreshKey((k) => k + 1)

  const gruposProduccionResumen = useMemo(
    () => agruparLineasProduccionPorProducto(resumenData?.produccion_resumen?.lineas),
    [resumenData?.produccion_resumen?.lineas]
  )

  const totalesEmpaqueYrendimiento = useMemo(() => {
    const pr = resumenData?.produccion_resumen
    if (!pr) return null
    const bultos = Number(pr.total_bultos_empaque) || 0
    const kgEmpaque = Number(pr.total_kg_empaque) || 0
    const kgMp = Number(resumenData?.recepcion_mp?.resumen?.total_kg) || 0
    const rendimientoPct =
      kgMp > 0 ? Number(((kgEmpaque / kgMp) * 100).toFixed(2)) : null
    return { bultos, kgEmpaque, kgMp, rendimientoPct }
  }, [resumenData?.produccion_resumen, resumenData?.recepcion_mp?.resumen?.total_kg])

  const fechaProduccionLote = useMemo(
    () => traducirLoteAFecha(resumenData?.lote?.codigo, lotRepublicanoAnos),
    [resumenData?.lote?.codigo, lotRepublicanoAnos]
  )

  const desgloseDespachosEstado = useMemo(() => {
    const base = { total: 0, finalizado: 0, despachado: 0, otros: 0 }
    const rows = Array.isArray(resumenData?.despachos) ? resumenData.despachos : []
    base.total = rows.length
    for (const d of rows) {
      const estado = String(d?.estado || '').trim().toLowerCase()
      if (estado === 'finalizado') base.finalizado += 1
      else if (estado === 'despachado') base.despachado += 1
      else base.otros += 1
    }
    return base
  }, [resumenData?.despachos])

  const openCrear = () => {
    setEditando(null)
    setFormData({
      codigo: '',
      estado: 'Registrado',
      fecha_creacion: new Date().toISOString().slice(0, 10),
      fecha_inicio: '',
      fecha_terminado: '',
      observaciones: '',
    })
    setErrors({})
    setModalOpen(true)
  }

  const openEditar = (item) => {
    setEditando(item)
    const toDatetimeLocal = (v) => {
      if (!v) return ''
      const d = new Date(v)
      if (Number.isNaN(d.getTime())) return ''
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      const h = String(d.getHours()).padStart(2, '0')
      const min = String(d.getMinutes()).padStart(2, '0')
      return `${y}-${m}-${day}T${h}:${min}`
    }
    setFormData({
      codigo: item.codigo || '',
      estado: item.estado || 'Registrado',
      fecha_creacion: item.fecha_creacion?.slice?.(0, 10) || new Date().toISOString().slice(0, 10),
      fecha_inicio: toDatetimeLocal(item.fecha_inicio),
      fecha_terminado: toDatetimeLocal(item.fecha_terminado),
      observaciones: item.observaciones || '',
    })
    setErrors({})
    setModalOpen(true)
  }

  const openResumen = (item) => {
    setResumenData(null)
    setModalResumenOpen(true)
    setLoadingResumen(true)
    ingresosMpApi
      .loteResumen(item.id)
      .then(({ data }) => setResumenData(data))
      .catch(() => toast.error('Error al cargar resumen'))
      .finally(() => setLoadingResumen(false))
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }))
  }

  const validate = () => {
    const newErrors = {}
    if (!formData.codigo?.trim()) newErrors.codigo = 'El código es requerido'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return
    try {
      setSaving(true)
      const payload = {
        codigo: formData.codigo,
        estado: formData.estado,
        observaciones: formData.observaciones || null,
      }
      if (editando) {
        if (formData.fecha_inicio) payload.fecha_inicio = formData.fecha_inicio.slice(0, 16).replace('T', ' ')
        if (formData.fecha_terminado) payload.fecha_terminado = formData.fecha_terminado.slice(0, 16).replace('T', ' ')
        await ingresosMpApi.loteActualizar(editando.id, payload)
        toast.success('Lote actualizado')
      } else {
        await ingresosMpApi.loteCrear({
          ...formData,
          fecha_creacion: formData.fecha_creacion,
          observaciones: formData.observaciones || null,
        })
        toast.success('Lote creado')
      }
      setModalOpen(false)
      refreshLista()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const cambiarEstado = async (lote, nuevoEstado) => {
    try {
      await ingresosMpApi.loteActualizar(lote.id, { estado: nuevoEstado })
      toast.success(`Estado actualizado a ${nuevoEstado}`)
      refreshLista()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al cambiar estado')
    }
  }

  const reabrirLote = async (lote) => {
    if (!window.confirm('¿Reabrir este lote? Volverá a estado En proceso y podrá editarlo. Solo un administrador puede hacer esto.')) return
    try {
      await ingresosMpApi.loteActualizar(lote.id, { estado: 'En proceso' })
      toast.success('Lote reabierto')
      refreshLista()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al reabrir')
    }
  }

  const handleEliminarLote = (item) => {
    if (!window.confirm(`¿Eliminar el lote "${item.codigo}"? Solo es posible si no tiene vehículos, descargas, envasado, congelado, empaque ni parihuelas.`)) return
    setDeletingLoteId(item.id)
    ingresosMpApi
      .loteEliminar(item.id)
      .then(() => {
        toast.success('Lote eliminado correctamente')
        refreshLista()
      })
      .catch((err) => {
        const msg = err.response?.data?.message || 'Error al eliminar lote'
        toast.error(msg)
      })
      .finally(() => setDeletingLoteId(null))
  }

  const handleCancelarProcesos = (item) => {
    if (!window.confirm(`¿Cancelar procesos de producción (envasado, congelado, empaque) del lote "${item.codigo}"? Se eliminarán esos registros para que pueda eliminar el lote después. Solo Admin.`)) return
    setCancelandoProcesosId(item.id)
    ingresosMpApi
      .loteCancelarProcesos(item.id)
      .then(({ data }) => {
        toast.success(data?.message || 'Procesos cancelados')
        refreshLista()
      })
      .catch((err) => {
        toast.error(err.response?.data?.message || 'Error al cancelar procesos')
      })
      .finally(() => setCancelandoProcesosId(null))
  }

  const formatDateTime = (v) => (v ? new Date(v).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' }) : '—')

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-10 h-10 animate-spin text-primary-600" />
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Layers className="w-8 h-8 text-[var(--color-primary,#2563eb)]" />
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Lote de Producción</h1>
        </div>
        <button
          onClick={openCrear}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium"
        >
          <Plus className="w-5 h-5" />
          Nuevo lote
        </button>
      </div>

      <div className="mb-4 flex gap-2 items-center">
        <label className="text-sm text-gray-600 dark:text-gray-400">Estado:</label>
        <select
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value)}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg"
        >
          <option value="">Todos</option>
          {ESTADOS.map((e) => (
            <option key={e} value={e}>{e}</option>
          ))}
        </select>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Código</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Estado</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Fecha creación</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Inicio</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Fin</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Observaciones</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {list.map((item) => (
              <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{item.codigo}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    item.estado === 'Terminado' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                    item.estado === 'En proceso' || item.estado === 'Iniciado' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' :
                    'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                  }`}>
                    {item.estado}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{item.fecha_creacion}</td>
                <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{formatDateTime(item.fecha_inicio)}</td>
                <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{formatDateTime(item.fecha_terminado)}</td>
                <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 max-w-xs truncate">{item.observaciones || '—'}</td>
                <td className="px-4 py-3 text-right flex flex-wrap justify-end gap-1">
                  <button onClick={() => openResumen(item)} className="p-2 text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg" title="Ver resumen de producción">
                    <FileText className="w-4 h-4" />
                  </button>
                  <button onClick={() => openEditar(item)} className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg" title="Editar">
                    <Edit className="w-4 h-4" />
                  </button>
                  {item.estado === 'Registrado' && (
                    <button onClick={() => cambiarEstado(item, 'Iniciado')} className="px-2 py-1 text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/50">Iniciar</button>
                  )}
                  {item.estado === 'Iniciado' && (
                    <button onClick={() => cambiarEstado(item, 'En proceso')} className="px-2 py-1 text-xs bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 rounded-lg">En proceso</button>
                  )}
                  {(item.estado === 'Iniciado' || item.estado === 'En proceso') && (
                    <button onClick={() => cambiarEstado(item, 'Terminado')} className="px-2 py-1 text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 rounded-lg">Terminar</button>
                  )}
                  {item.estado === 'Terminado' && isAdmin() && (
                    <button onClick={() => reabrirLote(item)} className="px-2 py-1 text-xs bg-amber-600 text-white rounded-lg hover:bg-amber-700" title="Reabrir lote (solo Admin)">Reabrir</button>
                  )}
                  {isAdmin() && (
                    <button
                      onClick={() => handleCancelarProcesos(item)}
                      disabled={cancelandoProcesosId === item.id}
                      className="p-2 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg disabled:opacity-50"
                      title="Cancelar procesos (envasado, congelado, empaque) para poder eliminar el lote"
                    >
                      {cancelandoProcesosId === item.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                    </button>
                  )}
                  {isAdmin() && (
                    <button
                      onClick={() => handleEliminarLote(item)}
                      disabled={deletingLoteId === item.id}
                      className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg disabled:opacity-50"
                      title="Eliminar lote (solo Admin, si no tiene datos en la secuencia)"
                    >
                      {deletingLoteId === item.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {list.length > 0 && (
        <div className="mt-4 px-4 py-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <PaginationBar total={total} limit={registrosPorPagina || 50} offset={offset} onPageChange={setOffset} />
        </div>
      )}
      {list.length === 0 && !loading && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-12 text-center text-gray-500 dark:text-gray-400">
          No hay lotes de producción. Cree uno para iniciar la lógica del sistema.
        </div>
      )}

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editando ? 'Editar lote' : 'Nuevo lote'} size="md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Código *</label>
            <input name="codigo" value={formData.codigo} onChange={handleChange} className={`w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white ${errors.codigo ? 'border-red-500' : 'border-gray-300'}`} placeholder="Ej: LOTE-2025-001" />
            {errors.codigo && <p className="mt-1 text-sm text-red-600">{errors.codigo}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Estado</label>
            <select name="estado" value={formData.estado} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white rounded-lg">
              {ESTADOS.map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
          </div>
          {!editando && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fecha creación</label>
              <input type="date" name="fecha_creacion" value={formData.fecha_creacion} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white rounded-lg" />
            </div>
          )}
          {editando && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fecha y hora de inicio</label>
                <input type="datetime-local" name="fecha_inicio" value={formData.fecha_inicio} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white rounded-lg" step="60" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fecha y hora de fin</label>
                <input type="datetime-local" name="fecha_terminado" value={formData.fecha_terminado} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white rounded-lg" step="60" />
              </div>
            </>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Observaciones</label>
            <textarea name="observaciones" value={formData.observaciones} onChange={handleChange} rows={2} className="w-full px-3 py-2 border border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white rounded-lg" />
          </div>
          <div className="flex gap-3 pt-4">
            <button type="button" onClick={() => setModalOpen(false)} className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">Cancelar</button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium flex items-center justify-center gap-2 disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {editando ? 'Guardar' : 'Crear'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={modalResumenOpen} onClose={() => { setModalResumenOpen(false); setResumenData(null) }} title="Resumen de producción" size="lg">
        {loadingResumen ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-10 h-10 animate-spin text-primary-600" />
          </div>
        ) : resumenData ? (
          <div className="space-y-6 text-sm">
            <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
              <div><span className="text-gray-500 dark:text-gray-400">Código:</span> {resumenData.lote?.codigo}</div>
              <div><span className="text-gray-500 dark:text-gray-400">Estado:</span> {resumenData.lote?.estado}</div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">Fecha producción (desde lote):</span>{' '}
                {fechaProduccionLote || '—'}
              </div>
              <div><span className="text-gray-500 dark:text-gray-400">Fecha creación:</span> {resumenData.lote?.fecha_creacion}</div>
              <div><span className="text-gray-500 dark:text-gray-400">Inicio:</span> {resumenData.lote?.fecha_inicio ? formatDateTime(resumenData.lote.fecha_inicio) : '—'}</div>
              <div><span className="text-gray-500 dark:text-gray-400">Fin:</span> {resumenData.lote?.fecha_terminado ? formatDateTime(resumenData.lote.fecha_terminado) : '—'}</div>
            </div>

            <section>
              <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">Recepción de materia prima</h3>
              <div className="mb-2 text-gray-600 dark:text-gray-400">
                {resumenData.recepcion_mp?.resumen?.total_vehiculos ?? 0} vehículo(s), {resumenData.recepcion_mp?.resumen?.total_descargas ?? 0} descarga(s), {resumenData.recepcion_mp?.resumen?.total_kg ?? 0} kg (winchas), {resumenData.recepcion_mp?.resumen?.total_cajas ?? 0} cajas.
              </div>
              {resumenData.recepcion_mp?.vehiculos?.length > 0 && (
                <div className="mb-3">
                  <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">Vehículos</h4>
                  <ul className="space-y-1 max-h-32 overflow-y-auto rounded border border-gray-200 dark:border-gray-600 p-2">
                    {resumenData.recepcion_mp.vehiculos.map((v) => (
                      <li key={v.id} className="flex flex-wrap gap-x-2 text-gray-700 dark:text-gray-300">
                        Orden {v.numero_orden} · {v.placas} · {v.proveedor_nombre || '—'} · {v.especie_nombre || '—'} · {v.cantidad_aproximada != null ? `${v.cantidad_aproximada} kg` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {resumenData.recepcion_mp?.descargas?.length > 0 && (
                <div className="mb-3">
                  <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">Descargas</h4>
                  <ul className="space-y-1 max-h-32 overflow-y-auto rounded border border-gray-200 dark:border-gray-600 p-2">
                    {resumenData.recepcion_mp.descargas.map((d) => (
                      <li key={d.id} className="flex flex-wrap gap-x-2 text-gray-700 dark:text-gray-300">
                        Guía {d.numero_guia_interna || '—'} · {d.fecha_descarga} · {d.placas_vehiculo} · {d.estado} · {d.total_kg != null ? `${Number(d.total_kg).toFixed(2)} kg` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {resumenData.recepcion_mp?.winchas?.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">Winchas</h4>
                  <ul className="space-y-1 max-h-40 overflow-y-auto rounded border border-gray-200 dark:border-gray-600 p-2">
                    {resumenData.recepcion_mp.winchas.map((w) => (
                      <li key={w.id} className="text-gray-700 dark:text-gray-300">
                        Wincha {w.numero_wincha || '—'} · {w.nombre_embarcacion || w.matricula_embarcacion || '—'} · Guía remitente: {w.numero_guia_remitente || '—'} · {w.peso_kg != null ? `${w.peso_kg} kg` : ''} · {w.cajas != null ? `${w.cajas} cajas` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            <section>
              <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-2">Resumen de producción</h3>
              {Array.isArray(resumenData.procesos_lote) && resumenData.procesos_lote.length > 0 ? (
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
                  {resumenData.procesos_lote.map((row) => (
                    <li
                      key={row.proceso}
                      className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 dark:border-gray-600 px-3 py-2 bg-white dark:bg-gray-800/50"
                    >
                      <span className="font-medium text-gray-800 dark:text-gray-100">{row.proceso}</span>
                      <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${claseBadgeEstadoProceso(row.estado)}`}>
                        {row.estado}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {resumenData.produccion_resumen?.lineas?.length > 0 ? (
                <div className="space-y-2">
                  <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-600">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-100 dark:bg-gray-700/80">
                        <tr>
                          <th className="px-3 py-2 text-left text-gray-700 dark:text-gray-100 font-medium">Producto</th>
                          <th className="px-3 py-2 text-right text-gray-700 dark:text-gray-100 font-medium w-28">Bultos</th>
                          <th className="px-3 py-2 text-right text-gray-700 dark:text-gray-100 font-medium w-28">Kg</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                        {gruposProduccionResumen.map((g) => (
                          <tr key={g.nombre} className="text-gray-800 dark:text-gray-200">
                            <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100">
                              {g.nombre}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">{Number(g.bultos) || 0}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{Number(g.kg) || 0}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {totalesEmpaqueYrendimiento ? (
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      Total empaque:{' '}
                      <span className="font-medium text-gray-900 dark:text-white">
                        {totalesEmpaqueYrendimiento.bultos} bultos
                      </span>
                      {' · '}
                      <span className="font-medium text-gray-900 dark:text-white">
                        {totalesEmpaqueYrendimiento.kgEmpaque} kg
                      </span>
                      {' · '}
                      <span className="text-gray-500 dark:text-gray-400">Rendimiento:</span>{' '}
                      <span className="font-medium text-gray-900 dark:text-white">
                        {totalesEmpaqueYrendimiento.rendimientoPct != null
                          ? `${totalesEmpaqueYrendimiento.rendimientoPct}%`
                          : '—'}
                      </span>
                      {totalesEmpaqueYrendimiento.rendimientoPct == null && (
                        <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">
                          (sin kg de MP en recepción)
                        </span>
                      )}
                    </p>
                  ) : null}
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Agrupado por tipo de producto de la plantilla (varias referencias en un solo renglón). El detalle por código está en Parte de producción.
                  </p>
                </div>
              ) : (
                <p className="text-gray-600 dark:text-gray-300">
                  Sin datos de plantilla o sin movimientos registrados en empaque, envasado o congelado para este lote.
                  {resumenData.produccion?.length ? ` (${resumenData.produccion.length} orden(es) en otro módulo.)` : ''}
                </p>
              )}
            </section>

            <section>
              <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">Insumos operativos (planta)</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                Agua, hielo (plantilla × TM de materia prima) y bunker (galones en conciliación). Al usar &quot;Agregar a producción&quot; en conciliación empaque, estos totales se guardan junto al empaque del lote.
              </p>
              {Array.isArray(resumenData.insumos_operativos) && resumenData.insumos_operativos.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50/30 dark:bg-indigo-950/20">
                  <table className="min-w-full text-sm">
                    <thead className="bg-indigo-100/60 dark:bg-indigo-950/50">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-gray-800 dark:text-gray-100">Concepto</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-800 dark:text-gray-100">Origen</th>
                        <th className="px-3 py-2 text-right font-medium text-gray-800 dark:text-gray-100">Cantidad</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-800 dark:text-gray-100">Unid.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-indigo-100 dark:divide-indigo-900/50 text-gray-800 dark:text-gray-200">
                      {resumenData.insumos_operativos.map((r, idx) => (
                        <tr key={`op-${idx}-${r.tipo || idx}`}>
                          <td className="px-3 py-2">
                            {r.descripcion || '—'}
                            {r.codigo ? <span className="text-gray-500 text-xs"> ({r.codigo})</span> : null}
                          </td>
                          <td className="px-3 py-2 text-xs">{labelFuenteOperativoResumen(r.fuente)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{r.cantidad ?? '—'}</td>
                          <td className="px-3 py-2">{r.unidad_medida || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-gray-500 dark:text-gray-400">
                  Sin filas: sin plantilla de empaque en el lote, sin TM de materia prima, sin bunker registrado, o aún no se ha sincronizado desde conciliación.
                </p>
              )}
            </section>

            <section>
              <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">Insumos</h3>
              <div className="mb-2 flex items-center gap-2">
                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${badgeEstadoInsumos(resumenData.insumos_resumen?.estado)}`}>
                  {resumenData.insumos_resumen?.estado === 'agregados'
                    ? 'Agregados a producción'
                    : resumenData.insumos_resumen?.estado === 'completos'
                      ? 'Completos (calculados)'
                      : 'Sin datos'}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {resumenData.insumos_resumen?.leyenda || 'No hay datos de insumos de empaque para este lote.'}
                </span>
              </div>
              <p className="text-gray-500 dark:text-gray-400">
                {resumenData.insumos?.length ? `${resumenData.insumos.length} registro(s).` : 'No hay insumos de empaque calculados para este lote.'}
              </p>
            </section>

            <section>
              <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">Despachos</h3>
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="inline-flex items-center rounded-full px-2.5 py-1 bg-gray-100 text-gray-700 dark:bg-gray-700/70 dark:text-gray-200">
                  Total: {desgloseDespachosEstado.total}
                </span>
                <span className="inline-flex items-center rounded-full px-2.5 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200">
                  Finalizado: {desgloseDespachosEstado.finalizado}
                </span>
                <span className="inline-flex items-center rounded-full px-2.5 py-1 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                  Despachado: {desgloseDespachosEstado.despachado}
                </span>
                {desgloseDespachosEstado.otros > 0 && (
                  <span className="inline-flex items-center rounded-full px-2.5 py-1 bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                    Otros: {desgloseDespachosEstado.otros}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3">
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2">
                  <p className="text-xs text-gray-500 dark:text-gray-400">1) Kg PT ingresado</p>
                  <p className="text-lg font-semibold text-gray-900 dark:text-white">
                    {Number(resumenData.despachos_resumen?.total_kg_ingresado_producto_terminado || 0).toFixed(2)}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2">
                  <p className="text-xs text-gray-500 dark:text-gray-400">2) Kg PT despachado/exportado</p>
                  <p className="text-lg font-semibold text-gray-900 dark:text-white">
                    {Number(resumenData.despachos_resumen?.total_kg_despachado_exportado || 0).toFixed(2)}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2">
                  <p className="text-xs text-gray-500 dark:text-gray-400">3) Kg PT restante</p>
                  <p className="text-lg font-semibold text-gray-900 dark:text-white">
                    {Number(resumenData.despachos_resumen?.total_kg_restante_producto_terminado || 0).toFixed(2)}
                  </p>
                </div>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                {resumenData.despachos_resumen?.leyenda || 'Sin resumen de despachos.'}
              </p>
              {resumenData.despachos?.length ? (
                <p className="text-gray-500 dark:text-gray-400">{resumenData.despachos.length} despacho(s) finalizado(s)/despachado(s) vinculados al lote.</p>
              ) : (
                <p className="text-gray-500 dark:text-gray-400">No hay despachos finalizados/despachados vinculados a este lote en el sistema.</p>
              )}
            </section>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}

export default LotesProduccion
