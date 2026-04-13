import { useState, useEffect } from 'react'
import { Boxes, Plus, Edit, Trash2, Loader2, Search } from 'lucide-react'
import Modal from '../../components/Modal'
import PaginationBar from '../../components/PaginationBar'
import { insumosApi } from '../../api/insumos'
import { useConfig } from '../../contexts/ConfigContext'
import toast from 'react-hot-toast'

const CatalogoInsumos = () => {
  const { registrosPorPagina } = useConfig()
  const [list, setList] = useState([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [refreshKey, setRefreshKey] = useState(0)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [incluirInactivos, setIncluirInactivos] = useState(false)
  const [proveedores, setProveedores] = useState([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState(null)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    nombre: '',
    codigo: '',
    stock_minimo: 0,
    stock_actual: 0,
    unidad_medida: 'KG',
    proveedor_id: '',
    activo: true,
  })
  const [errors, setErrors] = useState({})

  useEffect(() => {
    insumosApi.proveedoresListar({ limit: 300 }).then(({ data }) => setProveedores(data?.data ?? [])).catch(() => setProveedores([]))
  }, [])

  useEffect(() => {
    setOffset(0)
  }, [q, incluirInactivos])

  useEffect(() => {
    let cancelled = false
    const limit = registrosPorPagina || 50
    setLoading(true)
    const params = { limit, offset: Number(offset) }
    if (q.trim()) params.q = q.trim()
    if (incluirInactivos) params.incluir_inactivos = 'true'
    insumosApi
      .listar(params)
      .then(({ data }) => {
        if (cancelled) return
        setList(data?.data ?? [])
        setTotal(data?.total ?? 0)
      })
      .catch(() => {
        if (!cancelled) {
          toast.error('Error al cargar insumos')
          setList([])
          setTotal(0)
        }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [offset, registrosPorPagina, refreshKey, q, incluirInactivos])

  const refreshLista = () => setRefreshKey((k) => k + 1)

  const openCrear = () => {
    setEditando(null)
    setFormData({ nombre: '', codigo: '', stock_minimo: 0, stock_actual: 0, unidad_medida: 'KG', proveedor_id: '', activo: true })
    setErrors({})
    setModalOpen(true)
  }

  const openEditar = (item) => {
    setEditando(item)
    setFormData({
      nombre: item.nombre || '',
      codigo: item.codigo || '',
      stock_minimo: item.stock_minimo ?? 0,
      stock_actual: item.stock_actual ?? 0,
      unidad_medida: item.unidad_medida || 'KG',
      proveedor_id: item.proveedor_id || '',
      activo: item.activo !== false,
    })
    setErrors({})
    setModalOpen(true)
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    const num = ['stock_minimo', 'stock_actual'].includes(name) ? (value === '' ? 0 : Number(value)) : value
    setFormData((prev) => ({ ...prev, [name]: num }))
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }))
  }

  const validate = () => {
    const newErrors = {}
    if (!formData.nombre?.trim()) newErrors.nombre = 'El nombre es requerido'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return
    try {
      setSaving(true)
      const payload = {
        ...formData,
        proveedor_id: formData.proveedor_id || null,
        codigo: formData.codigo?.trim() || null,
      }
      if (!editando) {
        delete payload.activo
      }
      if (editando) {
        await insumosApi.actualizar(editando.id, payload)
        toast.success('Insumo actualizado')
      } else {
        await insumosApi.crear(payload)
        toast.success('Insumo creado')
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
    if (!window.confirm(`¿Eliminar o desactivar insumo "${item.nombre}"?`)) return
    try {
      await insumosApi.eliminar(item.id)
      toast.success('Operación realizada')
      refreshLista()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al eliminar')
    }
  }

  return (
    <div className="min-w-0 max-w-full">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-5 sm:mb-6">
        <div className="flex items-start gap-3 min-w-0">
          <div className="p-2 rounded-lg bg-primary-100 dark:bg-primary-900/40 shrink-0">
            <Boxes className="w-6 h-6 text-primary-600 dark:text-primary-400" />
          </div>
          <div className="min-w-0">
            <p className="text-sm text-gray-500 dark:text-gray-400">Insumos</p>
            <h1 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white leading-tight">Catálogo de insumos</h1>
          </div>
        </div>
        <button type="button" onClick={openCrear} className="inline-flex items-center justify-center gap-2 w-full sm:w-auto min-h-[44px] px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium shrink-0">
          <Plus className="w-5 h-5 shrink-0" />
          Nuevo insumo
        </button>
      </div>

      <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-3 max-w-2xl">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre o código..."
            className="w-full min-h-[44px] pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 cursor-pointer select-none whitespace-nowrap">
          <input
            type="checkbox"
            checked={incluirInactivos}
            onChange={(e) => setIncluirInactivos(e.target.checked)}
            className="rounded border-gray-300 dark:border-gray-600"
          />
          Incluir inactivos
        </label>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-10 h-10 animate-spin text-primary-600" />
          </div>
        ) : (
          <div className="wms-table-scroll">
            <table className="min-w-[52rem] w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Nombre / estado</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Código</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Proveedor</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Stock</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Mín.</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Und.</th>
                  <th className="px-4 py-3 text-right w-28">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {list.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-900 dark:text-white">{item.nombre}</span>
                      {item.activo === false && (
                        <span className="ml-2 text-xs font-medium text-amber-600 dark:text-amber-400">Inactivo</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{item.codigo || '—'}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{item.proveedor_nombre || '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{Number(item.stock_actual)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{Number(item.stock_minimo)}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{item.unidad_medida}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button type="button" onClick={() => openEditar(item)} className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg align-middle" title="Editar">
                        <Edit className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => handleEliminar(item)} className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg align-middle" title="Eliminar">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {list.length > 0 && (
          <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700">
            <PaginationBar total={total} limit={registrosPorPagina || 50} offset={offset} onPageChange={setOffset} />
          </div>
        )}
        {!loading && list.length === 0 && (
          <p className="p-8 text-center text-gray-500 dark:text-gray-400">No hay insumos registrados.</p>
        )}
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editando ? 'Editar insumo' : 'Nuevo insumo'} size="md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre *</label>
            <input name="nombre" value={formData.nombre} onChange={handleChange} className={`w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white ${errors.nombre ? 'border-red-500' : 'border-gray-300'}`} />
            {errors.nombre && <p className="mt-1 text-sm text-red-600">{errors.nombre}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Código interno</label>
            <input name="codigo" value={formData.codigo} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Proveedor</label>
            <select name="proveedor_id" value={formData.proveedor_id} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg">
              <option value="">— Sin proveedor —</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>{p.razon_social}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Stock mínimo</label>
              <input type="number" min={0} step="any" name="stock_minimo" value={formData.stock_minimo} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Stock actual</label>
              <input type="number" min={0} step="any" name="stock_actual" value={formData.stock_actual} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Unidad de medida</label>
            <select name="unidad_medida" value={formData.unidad_medida} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg">
              <option value="UN">UN</option>
              <option value="KG">KG</option>
              <option value="L">L</option>
              <option value="LB">LB</option>
            </select>
          </div>
          {editando && (
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.activo}
                onChange={(e) => setFormData((prev) => ({ ...prev, activo: e.target.checked }))}
                className="rounded border-gray-300 dark:border-gray-600"
              />
              Insumo activo (visible en listas y stock)
            </label>
          )}
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

export default CatalogoInsumos
