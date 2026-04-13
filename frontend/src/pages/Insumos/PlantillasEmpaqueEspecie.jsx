import { useEffect, useState } from 'react'
import { Boxes, Loader2, Save, Plus, Trash2, Copy, ClipboardPaste } from 'lucide-react'
import toast from 'react-hot-toast'
import { empaqueEspecificacionesApi } from '../../api/empaque-especificaciones'
import { insumosApi } from '../../api/insumos'

const PlantillasEmpaqueEspecie = () => {
  const [plantillas, setPlantillas] = useState([])
  const [insumos, setInsumos] = useState([])
  const [loading, setLoading] = useState(true)
  const [plantillaId, setPlantillaId] = useState('')
  const [detalle, setDetalle] = useState(null)
  const [saving, setSaving] = useState(false)
  /** Insumos copiados desde el primer producto (primario/secundario/otros) */
  const [portapapelesInsumos, setPortapapelesInsumos] = useState(null)
  const [filasPegadoSeleccionadas, setFilasPegadoSeleccionadas] = useState(() => new Set())

  const loadMeta = async () => {
    setLoading(true)
    try {
      const [pr, ir] = await Promise.all([
        empaqueEspecificacionesApi.procesoPlantillasListar(),
        insumosApi.listar({ limit: 800, incluir_inactivos: 'true' }),
      ])
      setPlantillas(pr.data?.data ?? [])
      setInsumos(ir.data?.data ?? [])
    } catch {
      toast.error('No se pudo cargar plantillas/insumos')
    } finally {
      setLoading(false)
    }
  }

  const loadDetalle = async (id) => {
    if (!id) {
      setDetalle(null)
      return
    }
    setLoading(true)
    try {
      const { data } = await empaqueEspecificacionesApi.procesoPlantillaDetalle(id)
      setDetalle(data)
    } catch (err) {
      toast.error(err.response?.data?.message || 'No se pudo cargar detalle')
      setDetalle(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadMeta()
  }, [])

  useEffect(() => {
    if (plantillaId) loadDetalle(plantillaId)
    else setDetalle(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plantillaId])

  useEffect(() => {
    setPortapapelesInsumos(null)
    setFilasPegadoSeleccionadas(new Set())
  }, [plantillaId, detalle?.id])

  const clonarLineasInsumo = (list) =>
    (list || []).map((r) => ({
      insumo_id: r.insumo_id ?? '',
      cantidad_por_unidad: r.cantidad_por_unidad ?? '',
      unidad_base: r.unidad_base || 'BULTO',
    }))

  const copiarInsumosDelPrimerProducto = () => {
    const first = detalle?.productos?.[0]
    if (!first) {
      toast.error('No hay productos en la plantilla')
      return
    }
    setPortapapelesInsumos({
      primario: clonarLineasInsumo(first.primario),
      secundario: clonarLineasInsumo(first.secundario),
      otros: clonarLineasInsumo(first.otros),
    })
    toast.success('Insumos del primer producto copiados. Marca filas y pega.')
  }

  const toggleFilaPegado = (productoId) => {
    setFilasPegadoSeleccionadas((prev) => {
      const next = new Set(prev)
      if (next.has(productoId)) next.delete(productoId)
      else next.add(productoId)
      return next
    })
  }

  const seleccionarTodasFilasPegado = (productoIds) => {
    setFilasPegadoSeleccionadas(new Set(productoIds))
  }

  const pegarInsumosEnSeleccionados = () => {
    if (!portapapelesInsumos) {
      toast.error('Primero copia los insumos del primer producto')
      return
    }
    if (filasPegadoSeleccionadas.size === 0) {
      toast.error('Marca al menos una fila destino (checkbox)')
      return
    }
    setDetalle((prev) => {
      if (!prev?.productos) return prev
      return {
        ...prev,
        productos: prev.productos.map((p) => {
          if (!filasPegadoSeleccionadas.has(p.id)) return p
          return {
            ...p,
            primario: clonarLineasInsumo(portapapelesInsumos.primario),
            secundario: clonarLineasInsumo(portapapelesInsumos.secundario),
            otros: clonarLineasInsumo(portapapelesInsumos.otros),
          }
        }),
      }
    })
    toast.success(`Insumos pegados en ${filasPegadoSeleccionadas.size} producto(s)`)
  }

  const setProductoCategoria = (productoId, categoria, updater) => {
    setDetalle((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        productos: prev.productos.map((p) => {
          if (p.id !== productoId) return p
          const key = categoria.toLowerCase()
          return { ...p, [key]: updater(p[key] || []) }
        }),
      }
    })
  }

  const addLine = (productoId, categoria) => {
    setProductoCategoria(productoId, categoria, (arr) => [...arr, { insumo_id: '', cantidad_por_unidad: '', unidad_base: 'BULTO' }])
  }

  const updateLine = (productoId, categoria, idx, patch) => {
    setProductoCategoria(productoId, categoria, (arr) => arr.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }

  const removeLine = (productoId, categoria, idx) => {
    setProductoCategoria(productoId, categoria, (arr) => arr.filter((_, i) => i !== idx))
  }

  const saveAll = async () => {
    if (!detalle?.id) return
    const items = []
    for (const p of detalle.productos || []) {
      const pushCat = (cat, list) => {
        for (const r of list || []) {
          const c = Number(r.cantidad_por_unidad)
          if (!r.insumo_id || Number.isNaN(c) || c < 0) continue
          items.push({
            producto_id: p.id,
            categoria: cat,
            insumo_id: r.insumo_id,
            cantidad_por_unidad: c,
            unidad_base: (r.unidad_base || 'BULTO').toUpperCase() === 'CAJA' ? 'CAJA' : 'BULTO',
          })
        }
      }
      pushCat('PRIMARIO', p.primario)
      pushCat('SECUNDARIO', p.secundario)
      pushCat('OTROS', p.otros)
    }
    setSaving(true)
    try {
      await empaqueEspecificacionesApi.procesoPlantillaGuardarDetalle(detalle.id, { items })
      toast.success('Plantilla de empaque guardada')
      await loadDetalle(detalle.id)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const renderCategoria = (productoId, categoria, rows) => (
    <div className="space-y-1.5">
      {(rows || []).map((r, idx) => (
        <div key={`${productoId}-${categoria}-${idx}`} className="grid grid-cols-12 gap-1">
          <select
            value={r.insumo_id || ''}
            onChange={(e) => updateLine(productoId, categoria, idx, { insumo_id: e.target.value })}
            className="col-span-7 px-2 py-1.5 text-xs border rounded-lg bg-white text-gray-900 border-gray-300 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600 dark:[color-scheme:dark]"
          >
            <option value="">Insumo...</option>
            {insumos.map((i) => (
              <option key={i.id} value={i.id}>{i.nombre} ({i.unidad_medida})</option>
            ))}
          </select>
          <input
            type="number"
            min="0"
            step="any"
            value={r.cantidad_por_unidad}
            onChange={(e) => updateLine(productoId, categoria, idx, { cantidad_por_unidad: e.target.value })}
            placeholder="Cantidad"
            className="col-span-3 px-2 py-1.5 text-xs border rounded-lg bg-white text-gray-900 placeholder:text-gray-400 border-gray-300 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500 dark:border-gray-600 dark:[color-scheme:dark]"
          />
          <button
            type="button"
            onClick={() => removeLine(productoId, categoria, idx)}
            className="col-span-2 px-2 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
            title="Eliminar línea"
          >
            <Trash2 className="w-3.5 h-3.5 mx-auto" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => addLine(productoId, categoria)}
        className="inline-flex items-center gap-1 text-xs text-primary-600 dark:text-primary-400 hover:underline"
      >
        <Plus className="w-3.5 h-3.5" /> Añadir
      </button>
    </div>
  )

  return (
    <div className="min-w-0 max-w-full">
      <div className="flex items-start gap-3 mb-5 sm:mb-6">
        <div className="p-2 rounded-lg bg-primary-100 dark:bg-primary-900/40 shrink-0">
          <Boxes className="w-6 h-6 text-primary-600 dark:text-primary-400" />
        </div>
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white leading-tight">Plantilla de empaque (práctica)</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">Plantilla de proceso: insumos por producto (primario, secundario y otros).</p>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-4 shadow-sm">
        <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">Plantilla de proceso</label>
        <select
          value={plantillaId}
          onChange={(e) => setPlantillaId(e.target.value)}
          className="w-full max-w-2xl min-h-[44px] px-3 py-2 border rounded-lg bg-white text-gray-900 border-gray-300 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600 dark:[color-scheme:dark]"
        >
          <option value="">Seleccione...</option>
          {plantillas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.cliente_nombre} · {p.especie_nombre} · {p.titulo}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-10 h-10 animate-spin text-primary-600" /></div>
      ) : detalle ? (
        <div className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={copiarInsumosDelPrimerProducto}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-800 dark:text-gray-100 bg-gray-50 dark:bg-gray-900/40 hover:bg-gray-100 dark:hover:bg-gray-700/50"
              >
                <Copy className="w-4 h-4 shrink-0" />
                Copiar insumos del 1.º producto
              </button>
              <button
                type="button"
                onClick={pegarInsumosEnSeleccionados}
                disabled={!portapapelesInsumos || filasPegadoSeleccionadas.size === 0}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-primary-500/50 rounded-lg text-primary-700 dark:text-primary-300 bg-primary-50 dark:bg-primary-950/40 hover:bg-primary-100 dark:hover:bg-primary-900/30 disabled:opacity-40 disabled:pointer-events-none"
              >
                <ClipboardPaste className="w-4 h-4 shrink-0" />
                Pegar en filas marcadas
                {filasPegadoSeleccionadas.size > 0 ? ` (${filasPegadoSeleccionadas.size})` : ''}
              </button>
              {portapapelesInsumos ? (
                <span className="text-xs text-gray-600 dark:text-gray-400">Hay copia en memoria</span>
              ) : null}
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={saveAll}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg disabled:opacity-50"
            >
              <Save className="w-4 h-4" /> {saving ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              Marca con el checkbox las filas donde quieras repetir los mismos insumos que el primer producto, luego «Pegar en filas marcadas».
            </span>
            {(detalle.productos || []).length > 1 ? (
              <>
                <button
                  type="button"
                  onClick={() =>
                    seleccionarTodasFilasPegado((detalle.productos || []).slice(1).map((x) => x.id))
                  }
                  className="text-primary-600 dark:text-primary-400 underline hover:no-underline"
                >
                  Marcar todas
                </button>
                <button
                  type="button"
                  onClick={() => setFilasPegadoSeleccionadas(new Set())}
                  className="text-gray-600 dark:text-gray-300 underline hover:no-underline"
                >
                  Desmarcar
                </button>
              </>
            ) : null}
          </p>
          <div className="wms-table-scroll bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
            <table className="min-w-[48rem] w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/50">
                <tr>
                  <th className="px-2 py-2 w-10 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase" title="Destino para pegar">
                    <span className="sr-only">Pegar</span>
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Producto</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Empaque primario</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Empaque secundario</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Otros insumos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {(detalle.productos || []).map((p, rowIdx) => (
                  <tr key={p.id} className="align-top">
                    <td className="px-2 py-2 text-center">
                      {rowIdx === 0 ? (
                        <span className="text-[10px] text-gray-400 dark:text-gray-500" title="Origen de la copia">
                          —
                        </span>
                      ) : (
                        <input
                          type="checkbox"
                          checked={filasPegadoSeleccionadas.has(p.id)}
                          onChange={() => toggleFilaPegado(p.id)}
                          className="rounded border-gray-400 text-primary-600 focus:ring-primary-500 dark:border-gray-500 dark:bg-gray-800"
                          aria-label={`Seleccionar ${p.codigo} para pegar insumos`}
                        />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <p className="font-medium text-gray-900 dark:text-white">
                        {p.codigo} — {(p.descripcion || '').trim() || p.producto}
                      </p>
                      {p.presentacion ? (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{p.presentacion}</p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">{renderCategoria(p.id, 'PRIMARIO', p.primario)}</td>
                    <td className="px-3 py-2">{renderCategoria(p.id, 'SECUNDARIO', p.secundario)}</td>
                    <td className="px-3 py-2">{renderCategoria(p.id, 'OTROS', p.otros)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-500 dark:text-gray-400">Selecciona una plantilla de proceso para empezar.</p>
      )}
    </div>
  )
}

export default PlantillasEmpaqueEspecie

