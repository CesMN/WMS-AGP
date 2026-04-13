import { useState, useEffect } from 'react'
import { PackagePlus, Plus, Edit, Trash2, Loader2 } from 'lucide-react'
import Modal from '../../components/Modal'
import PaginationBar from '../../components/PaginationBar'
import { recepcionApi } from '../../api/recepcion'
import { useConfig } from '../../contexts/ConfigContext'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'

const Recepcion = () => {
  const { registrosPorPagina } = useConfig()
  const { isAdmin } = useAuth()
  const [list, setList] = useState([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [refreshKey, setRefreshKey] = useState(0)
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState(null)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({ proveedor: '', fecha: '', guia_remision: '', estado: 'Pendiente' })
  const [errors, setErrors] = useState({})

  useEffect(() => {
    let cancelled = false
    const limit = registrosPorPagina || 50
    setLoading(true)
    recepcionApi
      .listar({ limit, offset: Number(offset) })
      .then(({ data }) => {
        if (cancelled) return
        setList(data?.data ?? data ?? [])
        setTotal(data?.total ?? 0)
      })
      .catch(() => {
        if (!cancelled) {
          toast.error('Error al cargar recepciones')
          setList([])
          setTotal(0)
        }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [offset, registrosPorPagina, refreshKey])

  const refreshLista = () => setRefreshKey((k) => k + 1)

  const openCrear = () => {
    setEditando(null)
    setFormData({
      proveedor: '',
      fecha: new Date().toISOString().slice(0, 10),
      guia_remision: '',
      estado: 'Pendiente',
    })
    setErrors({})
    setModalOpen(true)
  }

  const openEditar = (item) => {
    setEditando(item)
    setFormData({
      proveedor: item.proveedor || '',
      fecha: item.fecha?.slice?.(0, 10) || '',
      guia_remision: item.guia_remision || '',
      estado: item.estado || 'Pendiente',
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
    if (!formData.proveedor?.trim()) newErrors.proveedor = 'El proveedor es requerido'
    if (!formData.fecha) newErrors.fecha = 'La fecha es requerida'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return
    try {
      setSaving(true)
      if (editando) {
        await recepcionApi.actualizar(editando.id, formData)
        toast.success('Recepción actualizada')
      } else {
        await recepcionApi.crear(formData)
        toast.success('Recepción creada')
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
    if (!window.confirm(`¿Eliminar recepción del proveedor "${item.proveedor}"?`)) return
    try {
      await recepcionApi.eliminar(item.id)
      toast.success('Recepción eliminada')
      refreshLista()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al eliminar')
    }
  }

  const reabrirRecepcion = async (item) => {
    if (!window.confirm('¿Reabrir esta recepción? Volverá a estado Pendiente. Solo un administrador puede hacer esto.')) return
    try {
      await recepcionApi.actualizar(item.id, {
        proveedor: item.proveedor,
        fecha: item.fecha?.slice?.(0, 10) || item.fecha,
        guia_remision: item.guia_remision || '',
        estado: 'Pendiente',
      })
      toast.success('Recepción reabierta')
      refreshLista()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al reabrir')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-10 h-10 animate-spin text-primary-600" />
      </div>
    )
  }

  return (
    <div className="min-w-0 max-w-full">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-5 sm:mb-6">
        <div className="flex items-start gap-3 min-w-0">
          <div className="p-2 rounded-lg bg-primary-100 dark:bg-primary-900/40 shrink-0">
            <PackagePlus className="w-6 h-6 text-primary-600 dark:text-primary-400" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white leading-tight">Recepción</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Registro de ingresos por proveedor y guía de remisión.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={openCrear}
          className="inline-flex items-center justify-center gap-2 w-full sm:w-auto min-h-[44px] px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium shrink-0"
        >
          <Plus className="w-5 h-5 shrink-0" />
          Nueva recepción
        </button>
      </div>

      {list.length === 0 && !loading ? (
        <div className="text-sm text-gray-500 dark:text-gray-400 py-10 px-4 text-center border border-dashed border-gray-300 dark:border-gray-600 rounded-xl bg-white/50 dark:bg-gray-800/30">
          No hay recepciones registradas.
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
          <div className="wms-table-scroll">
            <table className="min-w-[44rem] w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Proveedor</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Fecha</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Guía remisión</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Estado</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {list.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{item.proveedor}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{item.fecha}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{item.guia_remision || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-xs rounded-full ${item.estado === 'Recibido' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : item.estado === 'Anulado' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'}`}>
                        {item.estado}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button type="button" onClick={() => openEditar(item)} className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg align-middle" title="Editar">
                        <Edit className="w-4 h-4" />
                      </button>
                      {item.estado === 'Recibido' && isAdmin() && (
                        <button type="button" onClick={() => reabrirRecepcion(item)} className="min-h-[36px] inline-flex items-center px-2.5 py-1.5 text-xs bg-amber-600 text-white rounded-lg hover:bg-amber-700 align-middle ml-0.5" title="Reabrir (solo Admin)">Reabrir</button>
                      )}
                      <button type="button" onClick={() => handleEliminar(item)} className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg align-middle" title="Eliminar">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {list.length > 0 && (
        <div className="mt-4">
          <PaginationBar total={total} limit={registrosPorPagina || 50} offset={offset} onPageChange={setOffset} />
        </div>
      )}

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editando ? 'Editar recepción' : 'Nueva recepción'} size="md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Proveedor *</label>
            <input name="proveedor" value={formData.proveedor} onChange={handleChange} autoComplete="organization" className={`w-full min-h-[44px] px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white ${errors.proveedor ? 'border-red-500' : 'border-gray-300'}`} />
            {errors.proveedor && <p className="mt-1 text-sm text-red-600">{errors.proveedor}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fecha *</label>
            <input type="date" name="fecha" value={formData.fecha} onChange={handleChange} className={`w-full min-h-[44px] px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white ${errors.fecha ? 'border-red-500' : 'border-gray-300'}`} />
            {errors.fecha && <p className="mt-1 text-sm text-red-600">{errors.fecha}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Guía de remisión</label>
            <input name="guia_remision" value={formData.guia_remision} onChange={handleChange} className="w-full min-h-[44px] px-3 py-2 border border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white rounded-lg" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Estado</label>
            <select name="estado" value={formData.estado} onChange={handleChange} className="w-full min-h-[44px] px-3 py-2 border border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white rounded-lg">
              <option value="Pendiente">Pendiente</option>
              <option value="Recibido">Recibido</option>
              <option value="Parcial">Parcial</option>
              <option value="Anulado">Anulado</option>
            </select>
          </div>
          <div className="flex flex-col-reverse sm:flex-row gap-3 pt-4">
            <button type="button" onClick={() => setModalOpen(false)} className="flex-1 min-h-[44px] px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">Cancelar</button>
            <button type="submit" disabled={saving} className="flex-1 min-h-[44px] px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium inline-flex items-center justify-center gap-2 disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : null}
              {editando ? 'Guardar' : 'Crear'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

export default Recepcion
