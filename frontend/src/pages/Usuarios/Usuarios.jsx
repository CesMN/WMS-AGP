import { useState, useEffect } from 'react'
import { Users, Plus, Edit, Trash2, Loader2 } from 'lucide-react'
import Modal from '../../components/Modal'
import PaginationBar from '../../components/PaginationBar'
import ExportDropdown from '../../components/ExportDropdown'
import { usuariosApi } from '../../api/usuarios'
import { useConfig } from '../../contexts/ConfigContext'
import toast from 'react-hot-toast'

const ROLES = [
  'Administrador',
  'Jefe Planta',
  'Gerencia',
  'Area Contable',
  'Almacen',
  'Produccion',
  'Supervisor de Envasado',
  'Supervisor de Congelado',
  'Supervisor de Empaque',
  'Camaras de Almacenamiento',
  'Recepcion',
  'Garita',
  'Supervisor de Proceso',
  'Supervisor de Calidad',
  'Exportaciones',
]

/** Alinea valores legacy de BD con el selector (Admin → Administrador, etc.) */
const mapRolForForm = (rol) => {
  const r = String(rol || '').trim()
  const legacy = { Admin: 'Administrador', Usuario: 'Recepcion', Visitante: 'Recepcion' }
  if (legacy[r]) return legacy[r]
  if (ROLES.includes(r)) return r
  return 'Recepcion'
}

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
    rol: 'Recepcion',
  })
  const [errors, setErrors] = useState({})
  const [catalog, setCatalog] = useState([])
  const [basePerms, setBasePerms] = useState({})
  const [effectivePerms, setEffectivePerms] = useState({})
  const [loadingPerms, setLoadingPerms] = useState(false)

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
    setFormData({ nombre: '', email: '', password: '', rol: 'Recepcion' })
    setErrors({})
    setModalOpen(true)
    loadRolePermissions('Recepcion')
  }

  const openEditar = (u) => {
    setEditando(u)
    setFormData({
      nombre: u.nombre,
      email: u.email,
      password: '',
      rol: mapRolForForm(u.rol),
    })
    setErrors({})
    setModalOpen(true)
    loadUserPermissions(u.id)
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }))
    if (name === 'rol') loadRolePermissions(value)
  }

  const mapRowsToState = (rows, source = 'role') => {
    const base = {}
    const effective = {}
    rows.forEach((r) => {
      const codigo = r.codigo
      base[codigo] = {
        view: !!(r.base_ver ?? r.puede_ver),
        operate: !!(r.base_operar ?? r.puede_operar),
      }
      effective[codigo] = {
        view: !!(source === 'user' ? r.effective_ver : (r.puede_ver ?? r.base_ver)),
        operate: !!(source === 'user' ? r.effective_operar : (r.puede_operar ?? r.base_operar)),
      }
    })
    setBasePerms(base)
    setEffectivePerms(effective)
  }

  const loadCatalog = async () => {
    try {
      const { data } = await usuariosApi.obtenerCatalogoPermisos()
      setCatalog(data?.resources || [])
    } catch (_) {
      setCatalog([])
    }
  }

  const loadRolePermissions = async (rol) => {
    try {
      setLoadingPerms(true)
      const { data } = await usuariosApi.obtenerPermisosRol(rol)
      mapRowsToState(data?.resources || [], 'role')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error cargando permisos del rol')
      setBasePerms({})
      setEffectivePerms({})
    } finally {
      setLoadingPerms(false)
    }
  }

  const loadUserPermissions = async (userId) => {
    try {
      setLoadingPerms(true)
      const { data } = await usuariosApi.obtenerPermisosUsuario(userId)
      mapRowsToState(data?.resources || [], 'user')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error cargando permisos del usuario')
      setBasePerms({})
      setEffectivePerms({})
    } finally {
      setLoadingPerms(false)
    }
  }

  useEffect(() => {
    loadCatalog()
  }, [])

  const setPerm = (codigo, key, value) => {
    setEffectivePerms((prev) => {
      const curr = prev[codigo] || { view: false, operate: false }
      const next = { ...curr, [key]: value }
      if (key === 'view' && !value) next.operate = false
      if (key === 'operate' && value) next.view = true
      return { ...prev, [codigo]: next }
    })
  }

  const buildOverridesPayload = () => {
    return Object.keys(effectivePerms).reduce((acc, codigo) => {
      const base = basePerms[codigo] || { view: false, operate: false }
      const eff = effectivePerms[codigo] || { view: false, operate: false }
      const row = { codigo }
      let changed = false
      if (eff.view !== base.view) {
        row.override_ver = eff.view
        changed = true
      }
      if (eff.operate !== base.operate) {
        row.override_operar = eff.operate
        changed = true
      }
      if (changed) acc.push(row)
      return acc
    }, [])
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
        const updated = await usuariosApi.actualizar(editando.id, payload)
        await usuariosApi.guardarOverridesUsuario(updated.data.id, { resources: buildOverridesPayload() })
        toast.success('Usuario actualizado')
      } else {
        const created = await usuariosApi.crear(formData)
        await usuariosApi.guardarOverridesUsuario(created.data.id, { resources: buildOverridesPayload() })
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

  const groupedResources = catalog.reduce((acc, r) => {
    const key = r.seccion || 'General'
    if (!acc[key]) acc[key] = []
    acc[key].push(r)
    return acc
  }, {})

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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div className="flex items-center gap-3 min-w-0">
          <Users className="w-7 h-7 sm:w-8 sm:h-8 shrink-0 text-primary-600" />
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white truncate">Usuarios</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editando ? 'Editar usuario' : 'Agregar usuario'} size="2xl">
        <form onSubmit={handleSubmit} className="space-y-4 max-h-[80vh] overflow-y-auto pr-1">
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
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Accesos por vista (Ver / Operar)</h3>
              {loadingPerms && <Loader2 className="w-4 h-4 animate-spin text-gray-500" />}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Puedes habilitar solo visualización o también operaciones para cada vista.
            </p>
            <div className="space-y-3">
              {Object.entries(groupedResources).map(([seccion, rows]) => (
                <div key={seccion} className="rounded-md border border-gray-100 dark:border-gray-700">
                  <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800/60 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-300">
                    {seccion}
                  </div>
                  <div className="divide-y divide-gray-100 dark:divide-gray-700">
                    {rows.map((r) => {
                      const codigo = r.codigo
                      const eff = effectivePerms[codigo] || { view: false, operate: false }
                      return (
                        <div key={codigo} className="px-3 py-2 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm text-gray-900 dark:text-white">{r.nombre}</p>
                            <p className="text-[11px] text-gray-500 dark:text-gray-400">{codigo}</p>
                          </div>
                          <div className="flex items-center gap-4">
                            <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
                              <input
                                type="checkbox"
                                checked={eff.view}
                                onChange={(e) => setPerm(codigo, 'view', e.target.checked)}
                              />
                              Ver
                            </label>
                            <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
                              <input
                                type="checkbox"
                                checked={eff.operate}
                                onChange={(e) => setPerm(codigo, 'operate', e.target.checked)}
                              />
                              Operar
                            </label>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
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

export default Usuarios
