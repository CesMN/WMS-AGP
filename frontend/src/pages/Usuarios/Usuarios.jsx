import { useState, useEffect } from 'react'
import { Users, Plus, Edit, Trash2, Loader2 } from 'lucide-react'
import Modal from '../../components/Modal'
import PaginationBar from '../../components/PaginationBar'
import ExportDropdown from '../../components/ExportDropdown'
import { usuariosApi } from '../../api/usuarios'
import { useConfig } from '../../contexts/ConfigContext'
import toast from 'react-hot-toast'

const ROLES = ['Admin', 'Usuario', 'Visitante']

const Usuarios = () => {
  const { registrosPorPagina } = useConfig()
  const [usuarios, setUsuarios] = useState([])
  const [totalRegistros, setTotalRegistros] = useState(0)
  const [offset, setOffset] = useState(0)
  const [refreshKey, setRefreshKey] = useState(0)
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState(null)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    nombre: '',
    email: '',
    password: '',
    rol: 'Usuario',
  })
  const [errors, setErrors] = useState({})

  useEffect(() => {
    let cancelled = false
    const limit = registrosPorPagina || 50
    setLoading(true)
    usuariosApi
      .listar({ limit, offset: Number(offset) })
      .then(({ data }) => {
        if (cancelled) return
        setUsuarios(data?.data ?? data ?? [])
        setTotalRegistros(data?.total ?? (data?.data ?? data)?.length ?? 0)
      })
      .catch(() => {
        if (!cancelled) {
          toast.error('Error al cargar usuarios')
          setUsuarios([])
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
    setFormData({ nombre: '', email: '', password: '', rol: 'Usuario' })
    setErrors({})
    setModalOpen(true)
  }

  const openEditar = (u) => {
    setEditando(u)
    setFormData({
      nombre: u.nombre,
      email: u.email,
      password: '',
      rol: u.rol,
    })
    setErrors({})
    setModalOpen(true)
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }))
  }

  const validate = () => {
    const newErrors = {}
    if (!formData.nombre.trim()) newErrors.nombre = 'El nombre es requerido'
    if (!formData.email.trim()) newErrors.email = 'El email es requerido'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) newErrors.email = 'Email inválido'
    if (!editando && !formData.password) newErrors.password = 'La contraseña es requerida'
    if (editando && formData.password && formData.password.length < 6) newErrors.password = 'Mínimo 6 caracteres'
    if (!editando && formData.password && formData.password.length < 6) newErrors.password = 'Mínimo 6 caracteres'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return
    try {
      setSaving(true)
      if (editando) {
        const payload = { nombre: formData.nombre, email: formData.email, rol: formData.rol }
        if (formData.password) payload.password = formData.password
        await usuariosApi.actualizar(editando.id, payload)
        toast.success('Usuario actualizado')
      } else {
        await usuariosApi.crear(formData)
        toast.success('Usuario creado')
      }
      setModalOpen(false)
      refreshLista()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const handleEliminar = async (u) => {
    if (!window.confirm(`¿Eliminar usuario "${u.nombre}"?`)) return
    try {
      await usuariosApi.eliminar(u.id)
      toast.success('Usuario eliminado')
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
          <Users className="w-8 h-8 text-primary-600" />
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Usuarios</h1>
        </div>
        <div className="flex items-center gap-2">
          <ExportDropdown
            getExportConfig={() => ({
              title: 'Usuarios',
              filtersSummary: 'Ninguno',
              columns: [{ key: 'nombre', label: 'Nombre' }, { key: 'email', label: 'Email' }, { key: 'rol', label: 'Rol' }],
              fetchData: () => usuariosApi.listar({ limit: 10000, offset: 0 }).then((r) => ({ data: r.data?.data ?? r.data ?? [] })),
            })}
          />
          <button
            onClick={openCrear}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium"
          >
            <Plus className="w-5 h-5" />
            Agregar usuario
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-900/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Nombre</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Email</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Rol</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {usuarios.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{u.nombre}</td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{u.email}</td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{u.rol}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2">
                      <button onClick={() => openEditar(u)} className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg" title="Editar">
                        <Edit className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleEliminar(u)} className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg" title="Eliminar">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && usuarios.length > 0 && (
          <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700">
            <PaginationBar total={totalRegistros} limit={registrosPorPagina || 50} offset={offset} onPageChange={setOffset} />
          </div>
        )}
        {usuarios.length === 0 && !loading && (
          <div className="p-12 text-center text-gray-500 dark:text-gray-400">No hay usuarios registrados.</div>
        )}
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editando ? 'Editar usuario' : 'Agregar usuario'} size="md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre *</label>
            <input name="nombre" value={formData.nombre} onChange={handleChange} className={`w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white ${errors.nombre ? 'border-red-500' : 'border-gray-300'}`} />
            {errors.nombre && <p className="mt-1 text-sm text-red-600">{errors.nombre}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email *</label>
            <input name="email" type="email" value={formData.email} onChange={handleChange} disabled={!!editando} className={`w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white ${errors.email ? 'border-red-500' : 'border-gray-300'} disabled:opacity-70`} />
            {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Contraseña {editando ? '(dejar en blanco para no cambiar)' : '*'}</label>
            <input name="password" type="password" value={formData.password} onChange={handleChange} placeholder={editando ? '••••••••' : ''} className={`w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white ${errors.password ? 'border-red-500' : 'border-gray-300'}`} />
            {errors.password && <p className="mt-1 text-sm text-red-600">{errors.password}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Rol *</label>
            <select name="rol" value={formData.rol} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white rounded-lg">
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
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

export default Usuarios
