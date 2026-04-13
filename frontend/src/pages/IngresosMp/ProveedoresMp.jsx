import { useState, useEffect } from 'react'
import { Store, Plus, Edit, Loader2, History } from 'lucide-react'
import Modal from '../../components/Modal'
import PaginationBar from '../../components/PaginationBar'
import { ingresosMpApi } from '../../api/ingresos-mp'
import { useConfig } from '../../contexts/ConfigContext'
import toast from 'react-hot-toast'

const ProveedoresMp = () => {
  const { registrosPorPagina } = useConfig()
  const [list, setList] = useState([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [refreshKey, setRefreshKey] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [modalHistorialOpen, setModalHistorialOpen] = useState(false)
  const [proveedorDetalle, setProveedorDetalle] = useState(null)
  const [editando, setEditando] = useState(null)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    razon_social: '',
    ruc: '',
    contacto: '',
    direccion: '',
  })
  const [errors, setErrors] = useState({})

  useEffect(() => {
    let cancelled = false
    const limit = registrosPorPagina || 50
    setLoading(true)
    const params = { limit, offset: Number(offset) }
    if (busqueda.trim()) params.q = busqueda.trim()
    ingresosMpApi
      .proveedoresListar(params)
      .then(({ data }) => {
        if (cancelled) return
        setList(data?.data ?? data ?? [])
        setTotal(data?.total ?? 0)
      })
      .catch(() => {
        if (!cancelled) {
          toast.error('Error al cargar proveedores')
          setList([])
          setTotal(0)
        }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [offset, registrosPorPagina, refreshKey, busqueda])

  const refreshLista = () => setRefreshKey((k) => k + 1)

  const openCrear = () => {
    setEditando(null)
    setFormData({
      razon_social: '',
      ruc: '',
      contacto: '',
      direccion: '',
    })
    setErrors({})
    setModalOpen(true)
  }

  const openEditar = (item) => {
    setEditando(item)
    setFormData({
      razon_social: item.razon_social || '',
      ruc: item.ruc || '',
      contacto: item.contacto || '',
      direccion: item.direccion || '',
    })
    setErrors({})
    setModalOpen(true)
  }

  const openHistorial = async (item) => {
    try {
      const { data } = await ingresosMpApi.proveedorObtener(item.id)
      setProveedorDetalle(data)
      setModalHistorialOpen(true)
    } catch (err) {
      toast.error('Error al cargar historial')
    }
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }))
  }

  const validate = () => {
    const newErrors = {}
    if (!formData.razon_social?.trim()) newErrors.razon_social = 'La razón social es requerida'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return
    try {
      setSaving(true)
      if (editando) {
        await ingresosMpApi.proveedorActualizar(editando.id, formData)
        toast.success('Proveedor actualizado')
      } else {
        await ingresosMpApi.proveedorCrear(formData)
        toast.success('Proveedor creado')
      }
      setModalOpen(false)
      refreshLista()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al guardar')
    } finally {
      setSaving(false)
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
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Store className="w-8 h-8 text-[var(--color-primary,#2563eb)]" />
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Proveedores de materia prima</h1>
        </div>
        <button
          onClick={openCrear}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium"
        >
          <Plus className="w-5 h-5" />
          Nuevo proveedor
        </button>
      </div>

      <div className="mb-4 flex gap-2 items-center">
        <input
          type="text"
          placeholder="Buscar por razón social o RUC..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg w-64"
        />
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Razón social</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">RUC</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Contacto</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {list.map((item) => (
              <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{item.razon_social}</td>
                <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{item.ruc || '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 max-w-[200px] truncate">{item.contacto || '—'}</td>
                <td className="px-4 py-3 text-right flex flex-wrap justify-end gap-1">
                  <button onClick={() => openHistorial(item)} className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg" title="Ver historial de descargas">
                    <History className="w-4 h-4" />
                  </button>
                  <button onClick={() => openEditar(item)} className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg" title="Editar">
                    <Edit className="w-4 h-4" />
                  </button>
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
          No hay proveedores. Agregue uno para llevar el historial de descargas.
        </div>
      )}

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editando ? 'Editar proveedor' : 'Nuevo proveedor'} size="md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Razón social *</label>
            <input name="razon_social" value={formData.razon_social} onChange={handleChange} className={`w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white ${errors.razon_social ? 'border-red-500' : 'border-gray-300'}`} />
            {errors.razon_social && <p className="mt-1 text-sm text-red-600">{errors.razon_social}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">RUC</label>
            <input name="ruc" value={formData.ruc} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white rounded-lg" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Contacto</label>
            <input name="contacto" value={formData.contacto} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white rounded-lg" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Dirección</label>
            <textarea name="direccion" value={formData.direccion} onChange={handleChange} rows={2} className="w-full px-3 py-2 border border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white rounded-lg" />
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

      <Modal isOpen={modalHistorialOpen} onClose={() => { setModalHistorialOpen(false); setProveedorDetalle(null) }} title={proveedorDetalle ? `Historial de descargas – ${proveedorDetalle.razon_social}` : 'Historial'} size="lg">
        {proveedorDetalle && (
          <div>
            <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <p className="text-sm text-gray-600 dark:text-gray-400"><strong>RUC:</strong> {proveedorDetalle.ruc || '—'}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400"><strong>Contacto:</strong> {proveedorDetalle.contacto || '—'}</p>
            </div>
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Fecha</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Guía interna</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Placas</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">N° orden</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Lote</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {(proveedorDetalle.historial_descargas || []).map((d) => (
                    <tr key={d.id}>
                      <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{d.fecha_descarga}</td>
                      <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{d.numero_guia_interna || '—'}</td>
                      <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{d.placas_vehiculo || '—'}</td>
                      <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{d.numero_orden || '—'}</td>
                      <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{d.lote_codigo || '—'}</td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 text-xs rounded-full ${d.estado === 'Completado' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'}`}>
                          {d.estado}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {(!proveedorDetalle.historial_descargas || proveedorDetalle.historial_descargas.length === 0) && (
              <p className="text-center text-gray-500 dark:text-gray-400 py-6">Sin descargas registradas.</p>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}

export default ProveedoresMp
