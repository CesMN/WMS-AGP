import { useState, useEffect } from 'react'
import { Building2, Plus, Edit, Trash2, Loader2 } from 'lucide-react'
import Modal from '../../components/Modal'
import PaginationBar from '../../components/PaginationBar'
import ExportDropdown from '../../components/ExportDropdown'
import { clientesApi } from '../../api/clientes'
import { especiesApi } from '../../api/especies'
import { useConfig } from '../../contexts/ConfigContext'
import toast from 'react-hot-toast'

const Clientes = () => {
  const { registrosPorPagina } = useConfig()
  const [clientes, setClientes] = useState([])
  const [totalRegistros, setTotalRegistros] = useState(0)
  const [offset, setOffset] = useState(0)
  const [refreshKey, setRefreshKey] = useState(0)
  const [especies, setEspecies] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState(null)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({ nombre: '', descripcion: '', especie_ids: [] })
  const [errors, setErrors] = useState({})

  useEffect(() => {
    especiesApi.listar({ limit: 500 }).then((r) => setEspecies(r.data?.data ?? r.data ?? [])).catch(() => toast.error('Error al cargar especies'))
  }, [])

  useEffect(() => {
    let cancelled = false
    const limit = registrosPorPagina || 50
    setLoading(true)
    clientesApi
      .listar({ limit, offset: Number(offset) })
      .then(({ data }) => {
        if (cancelled) return
        setClientes(data?.data ?? data ?? [])
        setTotalRegistros(data?.total ?? (data?.data ?? data)?.length ?? 0)
      })
      .catch(() => {
        if (!cancelled) {
          toast.error('Error al cargar datos')
          setClientes([])
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
    setFormData({ nombre: '', descripcion: '', especie_ids: [] })
    setErrors({})
    setModalOpen(true)
  }

  const openEditar = async (c) => {
    setEditando(c)
    try {
      const { data } = await clientesApi.obtener(c.id)
      setFormData({
        nombre: data.nombre,
        descripcion: data.descripcion || '',
        especie_ids: data.especie_ids || [],
      })
    } catch (e) {
      toast.error('Error al cargar cliente')
      return
    }
    setErrors({})
    setModalOpen(true)
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }))
  }

  const toggleEspecie = (especieId) => {
    setFormData((prev) => {
      const ids = prev.especie_ids.includes(especieId)
        ? prev.especie_ids.filter((id) => id !== especieId)
        : [...prev.especie_ids, especieId]
      return { ...prev, especie_ids: ids }
    })
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
        await clientesApi.actualizar(editando.id, formData)
        toast.success('Cliente actualizado')
      } else {
        await clientesApi.crear(formData)
        toast.success('Cliente creado')
      }
      setModalOpen(false)
      refreshLista()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const handleEliminar = async (c) => {
    if (!window.confirm(`¿Eliminar cliente "${c.nombre}"?`)) return
    try {
      await clientesApi.eliminar(c.id)
      toast.success('Cliente eliminado')
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
          <Building2 className="w-8 h-8 text-[var(--color-primary,#2563eb)]" />
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Clientes</h1>
        </div>
        <div className="flex items-center gap-2">
          <ExportDropdown
            getExportConfig={() => ({
              title: 'Clientes',
              filtersSummary: 'Ninguno',
              columns: [{ key: 'nombre', label: 'Nombre' }, { key: 'descripcion', label: 'Descripción' }],
              fetchData: () => clientesApi.listar({ limit: 10000, offset: 0 }).then((r) => ({ data: r.data?.data ?? r.data ?? [] })),
            })}
          />
          <button
            onClick={openCrear}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium"
          >
            <Plus className="w-5 h-5" />
            Agregar cliente
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {clientes.map((c) => (
          <div
            key={c.id}
            className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col"
          >
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="flex items-center gap-2 min-w-0">
                <div className="p-2 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex-shrink-0">
                  <Building2 className="w-5 h-5 text-[var(--color-primary,#2563eb)]" />
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white truncate">{c.nombre}</h3>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => openEditar(c)} className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg" title="Editar">
                  <Edit className="w-4 h-4" />
                </button>
                <button onClick={() => handleEliminar(c)} className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg" title="Eliminar">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mb-2">{c.descripcion || 'Sin descripción'}</p>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-auto">
              {c.especies?.length ? (
                <span>Especies: {c.especies.map((e) => e.nombre).join(', ')}</span>
              ) : (
                <span>Sin especies asignadas</span>
              )}
            </div>
          </div>
        ))}
      </div>
      {!loading && clientes.length > 0 && (
        <div className="mt-4 px-4 py-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <PaginationBar total={totalRegistros} limit={registrosPorPagina || 50} offset={offset} onPageChange={setOffset} />
        </div>
      )}
      {clientes.length === 0 && !loading && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-12 text-center text-gray-500 dark:text-gray-400">
          No hay clientes registrados.
        </div>
      )}

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editando ? 'Editar cliente' : 'Agregar cliente'} size="md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre *</label>
            <input name="nombre" value={formData.nombre} onChange={handleChange} className={`w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white ${errors.nombre ? 'border-red-500' : 'border-gray-300'}`} />
            {errors.nombre && <p className="mt-1 text-sm text-red-600">{errors.nombre}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Descripción</label>
            <textarea name="descripcion" value={formData.descripcion} onChange={handleChange} rows={3} className="w-full px-3 py-2 border border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white rounded-lg" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Especies que almacenará el cliente</label>
            <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-3 max-h-40 overflow-y-auto space-y-2">
              {especies.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">No hay especies. Cree especies primero.</p>
              ) : (
                especies.map((esp) => (
                  <label key={esp.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.especie_ids.includes(esp.id)}
                      onChange={() => toggleEspecie(esp.id)}
                      className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-gray-700 dark:text-gray-300">{esp.nombre}</span>
                  </label>
                ))
              )}
            </div>
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

export default Clientes
