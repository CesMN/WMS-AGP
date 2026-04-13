import { Plus, Trash2, Loader2 } from 'lucide-react'
import Modal from '../../../../components/Modal'
import { ESTADOS } from '../constants'
import { filterProductosByQuery, getProductoLabel } from '../helpers'

export default function OrdenFormModal({
  isOpen,
  onClose,
  editando,
  formData,
  errors,
  handleChange,
  handleSubmit,
  saving,
  clientesExportacion,
  clientesProduccion,
  especies,
  addLinea,
  removeLinea,
  updateLinea,
  productosCliente,
  stockPorProducto,
  openProductoLine,
  setOpenProductoLine,
  productSearchText,
  setProductSearchText,
}) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editando ? 'Editar orden' : 'Nueva orden de producción'} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">N° OP *</label>
            <input
              name="numero_op"
              value={formData.numero_op}
              onChange={handleChange}
              className={`w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white ${errors.numero_op ? 'border-red-500' : 'border-gray-300'}`}
              placeholder="Ej. OP-2026-001"
            />
            {errors.numero_op && <p className="mt-1 text-sm text-red-600">{errors.numero_op}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fecha envío OP *</label>
            <input
              type="date"
              name="fecha_envio_op"
              value={formData.fecha_envio_op}
              onChange={handleChange}
              className={`w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white ${errors.fecha_envio_op ? 'border-red-500' : 'border-gray-300'}`}
            />
            {errors.fecha_envio_op && <p className="mt-1 text-sm text-red-600">{errors.fecha_envio_op}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Prioridad</label>
            <input
              type="number"
              name="prioridad"
              min="1"
              step="1"
              value={formData.prioridad}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white rounded-lg"
              placeholder="1"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Desde 1. Mayor número = mayor prioridad (1-3 baja, 4-7 media, 8+ alta).
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cliente de exportación</label>
            <select
              name="cliente_exportacion_id"
              value={formData.cliente_exportacion_id}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white rounded-lg"
            >
              <option value="">Seleccione cliente exportación</option>
              {clientesExportacion.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cliente de producción</label>
            <select
              name="cliente_id"
              value={formData.cliente_id}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white rounded-lg"
            >
              <option value="">Seleccione cliente producción</option>
              {clientesProduccion.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Especie</label>
            <select
              name="especie_id"
              value={formData.especie_id}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white rounded-lg"
            >
              <option value="">Seleccione especie</option>
              {especies.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Destino</label>
            <input
              name="destino"
              value={formData.destino}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white rounded-lg"
              placeholder="Puerto / país"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cantidad de contenedores</label>
            <input
              type="number"
              name="cantidad_contenedores"
              min="1"
              max="702"
              step="1"
              value={formData.cantidad_contenedores}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white rounded-lg"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Físico de empaque: la solicitud en bultos puede repartirse en estos contenedores (A, B, C…).
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Estado</label>
            <select
              name="estado"
              value={formData.estado}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white rounded-lg"
            >
              {ESTADOS.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Productos a cargar</label>
            <button type="button" onClick={addLinea} className="text-sm text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1">
              <Plus className="w-4 h-4" /> Agregar línea
            </button>
          </div>
          {errors.lineas && <p className="text-sm text-red-600 mb-2">{errors.lineas}</p>}
          <div className="border border-gray-200 dark:border-gray-600 rounded-lg wms-table-scroll">
            <table className="min-w-[42rem] w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-500 dark:text-gray-300">Producto</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-500 dark:text-gray-300">Solicitado (bultos)</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-500 dark:text-gray-300">Stock disp. (kg)</th>
                  <th className="px-3 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {formData.lineas.map((lin, idx) => {
                  const selectedProduct = productosCliente.find((x) => String(x.id) === String(lin.producto_id))
                  const displayValue = openProductoLine === idx ? productSearchText : selectedProduct ? getProductoLabel(selectedProduct) : ''
                  return (
                    <tr key={idx}>
                      <td className="px-3 py-2 min-w-0 sm:min-w-[280px]">
                        <div className="relative w-full max-w-full sm:max-w-[420px]">
                          <input
                            type="text"
                            value={displayValue}
                            title={displayValue || 'Escriba para buscar por código, descripción o presentación'}
                            onChange={(e) => {
                              setProductSearchText(e.target.value)
                              setOpenProductoLine(idx)
                            }}
                            onFocus={() => {
                              setOpenProductoLine(idx)
                              setProductSearchText(selectedProduct ? getProductoLabel(selectedProduct) : '')
                            }}
                            onBlur={() => setTimeout(() => setOpenProductoLine(null), 200)}
                            placeholder="Escriba para buscar..."
                            className="w-full min-w-0 px-2 py-2 sm:py-1.5 border border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white rounded text-sm min-h-[44px] sm:min-h-0"
                          />
                          {openProductoLine === idx && (
                            <ul className="absolute z-10 bottom-full left-0 right-0 mb-0.5 w-full max-h-48 overflow-y-auto bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg py-1">
                              {filterProductosByQuery(productosCliente, productSearchText).length === 0 ? (
                                <li className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">Sin resultados</li>
                              ) : (
                                filterProductosByQuery(productosCliente, productSearchText).map((p) => (
                                  <li
                                    key={p.id}
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => {
                                      updateLinea(idx, 'producto_id', p.id)
                                      updateLinea(idx, 'producto_codigo', p.codigo)
                                      updateLinea(idx, 'producto_nombre', p.producto)
                                      setOpenProductoLine(null)
                                      setProductSearchText('')
                                    }}
                                    className="px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-900 dark:text-white"
                                  >
                                    {getProductoLabel(p)}
                                  </li>
                                ))
                              )}
                            </ul>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={lin.cantidad_solicitada ?? ''}
                          onChange={(e) => updateLinea(idx, 'cantidad_solicitada', e.target.value)}
                          className="w-20 px-2 py-1.5 border border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white rounded text-sm text-right"
                        />
                      </td>
                      <td className="px-3 py-2 text-right text-gray-500 dark:text-gray-400">
                        {lin.producto_id && stockPorProducto[lin.producto_id]
                          ? `${Number(stockPorProducto[lin.producto_id].kg || 0).toFixed(2)} kg`
                          : '—'}
                      </td>
                      <td className="px-3 py-2">
                        <button type="button" onClick={() => removeLinea(idx)} className="p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {formData.lineas.length === 0 && (
              <p className="px-3 py-4 text-sm text-gray-500 dark:text-gray-400 text-center">Seleccione un cliente y agregue líneas de producto.</p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3 pt-4 sm:flex-row">
          <button type="button" onClick={onClose} className="w-full sm:flex-1 min-h-[44px] px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
            Cancelar
          </button>
          <button type="submit" disabled={saving} className="w-full sm:flex-1 min-h-[44px] px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium flex items-center justify-center gap-2 disabled:opacity-50">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {editando ? 'Guardar' : 'Crear'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
