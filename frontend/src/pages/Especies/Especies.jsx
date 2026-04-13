import { useState, useEffect } from 'react'
import { Fish, Plus, Edit, Trash2, Loader2, Layers } from 'lucide-react'
import Modal from '../../components/Modal'
import PaginationBar from '../../components/PaginationBar'
import ExportDropdown from '../../components/ExportDropdown'
import { especiesApi } from '../../api/especies'
import { useConfig } from '../../contexts/ConfigContext'
import toast from 'react-hot-toast'

const TIPO_DESCARGA_OPTIONS = [
  { value: 'normal', label: 'Descarga normal' },
  { value: 'clasificacion', label: 'Descarga por clasificación' },
]

const Especies = () => {
  const { registrosPorPagina } = useConfig()
  const [especies, setEspecies] = useState([])
  const [totalRegistros, setTotalRegistros] = useState(0)
  const [offset, setOffset] = useState(0)
  const [refreshKey, setRefreshKey] = useState(0)
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState(null)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({ nombre: '', observaciones: '', tipo_descarga: 'normal' })
  const [errors, setErrors] = useState({})
  const [clasificaciones, setClasificaciones] = useState([])
  const [loadingClasif, setLoadingClasif] = useState(false)
  const [clasifForm, setClasifForm] = useState({ codigo: '', nombre: '', orden: 0 })
  const [editandoClasif, setEditandoClasif] = useState(null)

  useEffect(() => {
    let cancelled = false
    const limit = registrosPorPagina || 50
    setLoading(true)
    especiesApi
      .listar({ limit, offset: Number(offset) })
      .then(({ data }) => {
        if (cancelled) return
        setEspecies(data?.data ?? data ?? [])
        setTotalRegistros(data?.total ?? (data?.data ?? data)?.length ?? 0)
      })
      .catch(() => {
        if (!cancelled) {
          toast.error('Error al cargar especies')
          setEspecies([])
          setTotalRegistros(0)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [offset, registrosPorPagina, refreshKey])

  const refreshLista = () => setRefreshKey((k) => k + 1)

  const openCrear = () => {
    setEditando(null)
    setFormData({ nombre: '', observaciones: '', tipo_descarga: 'normal' })
    setClasificaciones([])
    setClasifForm({ codigo: '', nombre: '', orden: 0 })
    setEditandoClasif(null)
    setErrors({})
    setModalOpen(true)
  }

  const openEditar = (e) => {
    setEditando(e)
    setFormData({
      nombre: e.nombre,
      observaciones: e.observaciones || '',
      tipo_descarga: e.tipo_descarga === 'clasificacion' ? 'clasificacion' : 'normal',
    })
    setEditandoClasif(null)
    setClasifForm({ codigo: '', nombre: '', orden: 0 })
    setErrors({})
    setModalOpen(true)
    if (e.id && e.tipo_descarga === 'clasificacion') {
      setLoadingClasif(true)
      especiesApi
        .clasificacionesListar(e.id)
        .then(({ data }) => setClasificaciones(Array.isArray(data) ? data : []))
        .catch(() => setClasificaciones([]))
        .finally(() => setLoadingClasif(false))
    } else {
      setClasificaciones([])
    }
  }

  const agregarClasificacion = async () => {
    if (!editando?.id || !clasifForm.codigo?.trim()) return
    try {
      const { data } = await especiesApi.clasificacionCrear(editando.id, clasifForm)
      setClasificaciones((prev) => [...prev, data].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)))
      setClasifForm({ codigo: '', nombre: '', orden: clasificaciones.length })
      toast.success('Clasificación agregada')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al agregar')
    }
  }

  const actualizarClasificacion = async () => {
    if (!editandoClasif?.id) return
    try {
      const { data } = await especiesApi.clasificacionActualizar(editandoClasif.id, clasifForm)
      setClasificaciones((prev) => prev.map((c) => (c.id === data.id ? data : c)))
      setEditandoClasif(null)
      setClasifForm({ codigo: '', nombre: '', orden: 0 })
      toast.success('Clasificación actualizada')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al actualizar')
    }
  }

  const eliminarClasificacion = async (c) => {
    if (!window.confirm(`¿Eliminar clasificación "${c.codigo}"?`)) return
    try {
      await especiesApi.clasificacionEliminar(c.id)
      setClasificaciones((prev) => prev.filter((x) => x.id !== c.id))
      toast.success('Clasificación eliminada')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al eliminar')
    }
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }))
  }

  const validate = () => {
    const newErrors = {}
    if (!formData.nombre.trim()) newErrors.nombre = 'El nombre es requerido'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return
    try {
      setSaving(true)
      if (editando) {
        await especiesApi.actualizar(editando.id, formData)
        toast.success('Especie actualizada')
      } else {
        await especiesApi.crear(formData)
        toast.success('Especie creada')
      }
      setModalOpen(false)
      refreshLista()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const handleEliminar = async (item) => {
    if (!window.confirm(`¿Eliminar especie "${item.nombre}"?`)) return
    try {
      await especiesApi.eliminar(item.id)
      toast.success('Especie eliminada')
      refreshLista()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al eliminar')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary-600 border-t-transparent" />
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Fish className="w-8 h-8 text-[var(--color-primary,#2563eb)]" />
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Especies</h1>
        </div>
        <div className="flex items-center gap-2">
          <ExportDropdown
            getExportConfig={() => ({
              title: 'Especies',
              filtersSummary: 'Ninguno',
              columns: [{ key: 'nombre', label: 'Nombre' }, { key: 'observaciones', label: 'Observaciones' }],
              fetchData: () => especiesApi.listar({ limit: 10000, offset: 0 }).then((r) => ({ data: r.data?.data ?? r.data ?? [] })),
            })}
          />
          <button
            onClick={openCrear}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium"
          >
            <Plus className="w-5 h-5" />
            Agregar especie
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {especies.map((item) => (
          <div
            key={item.id}
            className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col"
          >
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="flex items-center gap-2 min-w-0">
                <div className="p-2 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex-shrink-0">
                  <Fish className="w-5 h-5 text-[var(--color-primary,#2563eb)]" />
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white truncate">{item.nombre}</h3>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => openEditar(item)} className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg" title="Editar">
                  <Edit className="w-4 h-4" />
                </button>
                <button onClick={() => handleEliminar(item)} className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg" title="Eliminar">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-3 flex-1">{item.observaciones || 'Sin observaciones'}</p>
            <div className="mt-2">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${item.tipo_descarga === 'clasificacion' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'}`}>
                <Layers className="w-3 h-3" />
                {item.tipo_descarga === 'clasificacion' ? 'Por clasificación' : 'Normal'}
              </span>
            </div>
          </div>
        ))}
      </div>
      {!loading && especies.length > 0 && (
        <div className="mt-4 px-4 py-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <PaginationBar total={totalRegistros} limit={registrosPorPagina || 50} offset={offset} onPageChange={setOffset} />
        </div>
      )}
      {especies.length === 0 && !loading && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-12 text-center text-gray-500 dark:text-gray-400">
          No hay especies registradas.
        </div>
      )}

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editando ? 'Editar especie' : 'Agregar especie'} size="md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre *</label>
            <input name="nombre" value={formData.nombre} onChange={handleChange} className={`w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white ${errors.nombre ? 'border-red-500' : 'border-gray-300'}`} />
            {errors.nombre && <p className="mt-1 text-sm text-red-600">{errors.nombre}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Tipo de descarga</label>
            <div className="flex flex-wrap gap-4">
              {TIPO_DESCARGA_OPTIONS.map((opt) => (
                <label key={opt.value} className="inline-flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="tipo_descarga" value={opt.value} checked={formData.tipo_descarga === opt.value} onChange={handleChange} className="rounded border-gray-300 text-primary-600" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">{opt.label}</span>
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Normal: modelo estándar. Por clasificación: se registran pesos por código (ej. 2-4 kg, 4-10 kg).</p>
          </div>
          {formData.tipo_descarga === 'clasificacion' && (
            <div className="rounded-lg border border-gray-200 dark:border-gray-600 p-3 bg-gray-50 dark:bg-gray-800/50">
              <h4 className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-2">Códigos de clasificación</h4>
              {!editando ? (
                <p className="text-xs text-gray-500 dark:text-gray-400">Guarde la especie primero para agregar códigos de clasificación (ej. 2-4 kg, 4-10 kg).</p>
              ) : (
                <>
                  {loadingClasif ? (
                    <div className="flex items-center justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-primary-600" /></div>
                  ) : (
                    <>
                      <ul className="space-y-2 mb-3 max-h-40 overflow-y-auto">
                        {clasificaciones.map((c) => (
                          <li key={c.id} className="flex items-center justify-between gap-2 py-1.5 px-2 rounded bg-white dark:bg-gray-700 text-sm">
                            <span className="text-gray-800 dark:text-gray-200">{c.codigo}{c.nombre ? ` — ${c.nombre}` : ''}</span>
                            <span className="inline-flex gap-1">
                              <button type="button" onClick={() => { setEditandoClasif(c); setClasifForm({ codigo: c.codigo, nombre: c.nombre || '', orden: c.orden ?? 0 }) }} className="p-1 text-gray-500 hover:text-primary-600 rounded" title="Editar"> <Edit className="w-3.5 h-3.5" /> </button>
                              <button type="button" onClick={() => eliminarClasificacion(c)} className="p-1 text-gray-500 hover:text-red-600 rounded" title="Eliminar"> <Trash2 className="w-3.5 h-3.5" /> </button>
                            </span>
                          </li>
                        ))}
                      </ul>
                      <div className="flex flex-wrap gap-2 items-end">
                        <input placeholder="Código (ej. 2-4 kg)" value={clasifForm.codigo} onChange={(e) => setClasifForm((p) => ({ ...p, codigo: e.target.value }))} className="flex-1 min-w-[100px] px-2 py-1.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded text-sm" />
                        <input placeholder="Nombre (opcional)" value={clasifForm.nombre} onChange={(e) => setClasifForm((p) => ({ ...p, nombre: e.target.value }))} className="flex-1 min-w-[100px] px-2 py-1.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded text-sm" />
                        <input type="number" placeholder="Orden" value={clasifForm.orden} onChange={(e) => setClasifForm((p) => ({ ...p, orden: parseInt(e.target.value, 10) || 0 }))} className="w-16 px-2 py-1.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded text-sm" />
                        {editandoClasif ? (
                          <><button type="button" onClick={actualizarClasificacion} className="px-3 py-1.5 bg-primary-600 text-white rounded text-sm">Guardar</button><button type="button" onClick={() => { setEditandoClasif(null); setClasifForm({ codigo: '', nombre: '', orden: 0 }) }} className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm">Cancelar</button></>
                        ) : (
                          <button type="button" onClick={agregarClasificacion} className="px-3 py-1.5 bg-primary-600 text-white rounded text-sm">Agregar</button>
                        )}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Observaciones</label>
            <textarea name="observaciones" value={formData.observaciones} onChange={handleChange} rows={3} className="w-full px-3 py-2 border border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white rounded-lg" />
          </div>
          <div className="flex gap-3 pt-4">
            <button type="button" onClick={() => setModalOpen(false)} className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium flex items-center justify-center gap-2 disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {editando ? 'Guardar' : 'Crear'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

export default Especies
