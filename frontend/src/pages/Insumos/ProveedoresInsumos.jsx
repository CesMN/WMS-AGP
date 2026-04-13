import { useState, useEffect } from 'react'
import { Store, Plus, Edit, Loader2, Trash2 } from 'lucide-react'
import Modal from '../../components/Modal'
import { insumosApi } from '../../api/insumos'
import toast from 'react-hot-toast'

const ProveedoresInsumos = () => {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [incluirInactivos, setIncluirInactivos] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ razon_social: '', ruc: '', contacto: '', direccion: '', activo: true })

  const load = () => {
    setLoading(true)
    insumosApi
      .proveedoresListar({ limit: 500, incluir_inactivos: incluirInactivos ? 'true' : undefined })
      .then(({ data }) => setList(data?.data ?? []))
      .catch(() => {
        toast.error('Error al cargar proveedores')
        setList([])
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [incluirInactivos])

  const openNuevo = () => {
    setEditando(null)
    setForm({ razon_social: '', ruc: '', contacto: '', direccion: '', activo: true })
    setModalOpen(true)
  }

  const openEditar = async (p) => {
    setEditando(p)
    setModalOpen(true)
    setForm({
      razon_social: p.razon_social || '',
      ruc: p.ruc || '',
      contacto: p.contacto || '',
      direccion: p.direccion || '',
      activo: p.activo !== false,
    })
    try {
      const { data } = await insumosApi.proveedorObtener(p.id)
      if (data?.id) {
        setForm({
          razon_social: data.razon_social || '',
          ruc: data.ruc || '',
          contacto: data.contacto || '',
          direccion: data.direccion || '',
          activo: data.activo !== false,
        })
      }
    } catch {
      /* ya tenemos datos de la fila */
    }
  }

  const eliminarProveedor = async (p) => {
    if (!window.confirm(`¿Eliminar o desactivar a "${p.razon_social}"?`)) return
    try {
      const { data } = await insumosApi.proveedorEliminar(p.id)
      toast.success(data?.message || 'Operación realizada')
      load()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al eliminar')
    }
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!form.razon_social?.trim()) {
      toast.error('Razón social es requerida')
      return
    }
    setSaving(true)
    try {
      if (editando) {
        await insumosApi.proveedorActualizar(editando.id, {
          razon_social: form.razon_social,
          ruc: form.ruc,
          contacto: form.contacto,
          direccion: form.direccion,
          activo: form.activo,
        })
        toast.success('Proveedor actualizado')
      } else {
        await insumosApi.proveedorCrear({
          razon_social: form.razon_social,
          ruc: form.ruc,
          contacto: form.contacto,
          direccion: form.direccion,
        })
        toast.success('Proveedor creado')
      }
      setModalOpen(false)
      load()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-w-0 max-w-full">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-5 sm:mb-6">
        <div className="flex items-start gap-3 min-w-0">
          <div className="p-2 rounded-lg bg-primary-100 dark:bg-primary-900/40 shrink-0">
            <Store className="w-6 h-6 text-primary-600 dark:text-primary-400" />
          </div>
          <div className="min-w-0">
            <p className="text-sm text-gray-500 dark:text-gray-400">Insumos</p>
            <h1 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white leading-tight">Proveedores de insumos</h1>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3 shrink-0">
          <label className="flex items-center gap-2 min-h-[44px] sm:min-h-0 text-sm text-gray-600 dark:text-gray-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={incluirInactivos}
              onChange={(e) => setIncluirInactivos(e.target.checked)}
              className="rounded border-gray-300 dark:border-gray-600"
            />
            Incluir inactivos
          </label>
          <button type="button" onClick={openNuevo} className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium">
            <Plus className="w-5 h-5 shrink-0" />
            Nuevo proveedor
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-10 h-10 animate-spin text-primary-600" />
          </div>
        ) : (
          <div className="wms-table-scroll">
            <table className="min-w-[40rem] w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Razón social</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">RUC</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Contacto</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase w-24">Estado</th>
                  <th className="px-4 py-3 text-right w-28">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {list.map((p) => (
                  <tr
                    key={p.id}
                    className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 ${p.activo === false ? 'opacity-60' : ''}`}
                  >
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{p.razon_social}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{p.ruc || '—'}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{p.contacto || '—'}</td>
                    <td className="px-4 py-3 text-center">
                      {p.activo === false ? (
                        <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Inactivo</span>
                      ) : (
                        <span className="text-xs text-emerald-600 dark:text-emerald-400">Activo</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button type="button" onClick={() => openEditar(p)} className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg align-middle" title="Editar">
                        <Edit className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => eliminarProveedor(p)} className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg align-middle" title="Eliminar o desactivar">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && list.length === 0 && (
          <p className="p-8 text-center text-gray-500 dark:text-gray-400">No hay proveedores registrados.</p>
        )}
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editando ? 'Editar proveedor' : 'Nuevo proveedor'}>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Razón social *</label>
            <input value={form.razon_social} onChange={(e) => setForm((f) => ({ ...f, razon_social: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">RUC</label>
              <input value={form.ruc} onChange={(e) => setForm((f) => ({ ...f, ruc: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Contacto</label>
              <input value={form.contacto} onChange={(e) => setForm((f) => ({ ...f, contacto: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Dirección</label>
            <textarea value={form.direccion} onChange={(e) => setForm((f) => ({ ...f, direccion: e.target.value }))} rows={2} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg" />
          </div>
          {editando && (
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={form.activo}
                onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked }))}
                className="rounded border-gray-300 dark:border-gray-600"
              />
              Proveedor activo
            </label>
          )}
          <div className="flex flex-col-reverse sm:flex-row gap-2 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="flex-1 min-h-[44px] py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300">Cancelar</button>
            <button type="submit" disabled={saving} className="flex-1 min-h-[44px] py-2.5 bg-primary-600 text-white rounded-lg font-medium disabled:opacity-50 inline-flex items-center justify-center">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Guardar'}</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

export default ProveedoresInsumos
