import { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import Modal from '../../components/Modal'
import { almacenesApi } from '../../api/almacenes'
import toast from 'react-hot-toast'

const ModalMoverProducto = ({ isOpen, onClose, almacenId, carrilId, posicionId, stockId, stockItem, onSuccess }) => {
  const [loading, setLoading] = useState(false)
  const [loadingDatos, setLoadingDatos] = useState(false)
  const [almacenes, setAlmacenes] = useState([])
  const [carriles, setCarriles] = useState([])
  const [niveles, setNiveles] = useState([])
  const [posiciones, setPosiciones] = useState([])

  const [seleccion, setSeleccion] = useState({
    almacen_id: '',
    carril_id: '',
    nivel_id: '',
    posicion_id: '',
  })

  const maxBultos = stockItem ? Number(stockItem.cantidad_bultos) || 1 : 1
  const formato = stockItem ? Number(stockItem.formato) || 0 : 0
  const unidadMedida = stockItem?.unidad_medida || 'KG'

  const [cantidadBultos, setCantidadBultos] = useState(maxBultos)
  const [pesoAdicional, setPesoAdicional] = useState(0)
  const [motivo, setMotivo] = useState('')

  useEffect(() => {
    if (isOpen) {
      cargaAlmacenes()
      const bultos = stockItem ? Number(stockItem.cantidad_bultos) || 1 : 1
      setCantidadBultos(bultos)
      setPesoAdicional(0)
      resetForm()
    }
  }, [isOpen, stockItem])

  const totalKgMover = () => {
    if (!formato || !cantidadBultos) return 0
    const adicional = Number(pesoAdicional) || 0
    if (unidadMedida === 'KG') {
      return cantidadBultos * formato + adicional
    }
    return (cantidadBultos * formato) / 2.2046 + adicional
  }

  const cargaAlmacenes = async () => {
    try {
      setLoadingDatos(true)
      const { data } = await almacenesApi.listar()
      setAlmacenes(data)
    } catch (e) {
      toast.error('Error al cargar almacenes')
    } finally {
      setLoadingDatos(false)
    }
  }

  const cargaCarriles = async (almacenId) => {
    try {
      setLoadingDatos(true)
      const { data } = await almacenesApi.carriles(almacenId)
      setCarriles(data)
      setNiveles([])
      setPosiciones([])
      setSeleccion((prev) => ({ ...prev, carril_id: '', nivel_id: '', posicion_id: '' }))
    } catch (e) {
      toast.error('Error al cargar carriles')
    } finally {
      setLoadingDatos(false)
    }
  }

  const cargaNivelesPosiciones = async (almacenId, carrilId) => {
    try {
      setLoadingDatos(true)
      const { data } = await almacenesApi.nivelesPosiciones(almacenId, carrilId)
      const nivelesUnicos = []
      const nivelesMap = new Map()

      data.matriz.forEach((fila) => {
        if (!nivelesMap.has(fila.nivel_id)) {
          nivelesMap.set(fila.nivel_id, {
            id: fila.nivel_id,
            numero_nivel: fila.numero_nivel,
            posiciones: fila.posiciones,
          })
          nivelesUnicos.push({
            id: fila.nivel_id,
            numero_nivel: fila.numero_nivel,
            posiciones: fila.posiciones,
          })
        }
      })

      setNiveles(nivelesUnicos)
      setPosiciones([])
      setSeleccion((prev) => ({ ...prev, nivel_id: '', posicion_id: '' }))
    } catch (e) {
      toast.error('Error al cargar niveles y posiciones')
    } finally {
      setLoadingDatos(false)
    }
  }

  const handleAlmacenChange = (e) => {
    const almacenId = e.target.value
    setSeleccion({ almacen_id: almacenId, carril_id: '', nivel_id: '', posicion_id: '' })
    setCarriles([])
    setNiveles([])
    setPosiciones([])
    if (almacenId) {
      cargaCarriles(almacenId)
    }
  }

  const handleCarrilChange = (e) => {
    const carrilId = e.target.value
    setSeleccion((prev) => ({ ...prev, carril_id: carrilId, nivel_id: '', posicion_id: '' }))
    setNiveles([])
    setPosiciones([])
    if (carrilId && seleccion.almacen_id) {
      cargaNivelesPosiciones(seleccion.almacen_id, carrilId)
    }
  }

  const handleNivelChange = (e) => {
    const nivelId = e.target.value
    const nivel = niveles.find((n) => n.id === nivelId)
    setSeleccion((prev) => ({ ...prev, nivel_id: nivelId, posicion_id: '' }))
    if (nivel) {
      setPosiciones(nivel.posiciones || [])
    } else {
      setPosiciones([])
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!seleccion.almacen_id || !seleccion.carril_id || !seleccion.nivel_id || !seleccion.posicion_id) {
      toast.error('Debe seleccionar todos los niveles de la jerarquía')
      return
    }

    if (seleccion.posicion_id === posicionId) {
      toast.error('Debe seleccionar una posición diferente a la actual')
      return
    }

    if (cantidadBultos < 1 || cantidadBultos > maxBultos) {
      toast.error(`La cantidad de bultos debe estar entre 1 y ${maxBultos}`)
      return
    }

    try {
      setLoading(true)
      await almacenesApi.moverStock(almacenId, carrilId, posicionId, stockId, {
        nuevo_almacen_id: seleccion.almacen_id,
        nuevo_carril_id: seleccion.carril_id,
        nuevo_nivel_id: seleccion.nivel_id,
        nuevo_posicion_id: seleccion.posicion_id,
        motivo: motivo || 'Movimiento de producto entre posiciones',
        cantidad_bultos: cantidadBultos,
        peso_adicional: Number(pesoAdicional) || 0,
      })
      toast.success('Producto movido correctamente')
      handleClose()
      if (onSuccess) {
        onSuccess()
      }
    } catch (error) {
      const message = error.response?.data?.message || 'Error al mover el producto'
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setSeleccion({
      almacen_id: '',
      carril_id: '',
      nivel_id: '',
      posicion_id: '',
    })
    setMotivo('')
    const bultos = stockItem ? Number(stockItem.cantidad_bultos) || 1 : 1
    setCantidadBultos(bultos)
    setPesoAdicional(0)
    setCarriles([])
    setNiveles([])
    setPosiciones([])
  }

  const handleClose = () => {
    if (!loading) {
      resetForm()
      onClose()
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Mover Producto" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {stockItem && (
          <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600 mb-4">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Stock actual</div>
            <div className="text-sm font-medium text-gray-900 dark:text-white">
              {stockItem.producto_codigo} – {stockItem.producto_nombre}
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              {maxBultos} bultos · {Number(stockItem.total_kg).toFixed(2)} KG · Formato: {formato} {unidadMedida}
            </div>
          </div>
        )}

        {/* Cantidad a mover */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Cantidad de bultos a mover <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            min={1}
            max={maxBultos}
            value={cantidadBultos}
            onChange={(e) => setCantidadBultos(Math.min(maxBultos, Math.max(1, parseInt(e.target.value, 10) || 1)))}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-white"
            disabled={loading || loadingDatos}
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Máximo: {maxBultos} bultos</p>
        </div>

        {/* Peso adicional */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Peso adicional (kg) para lo que se mueve
          </label>
          <input
            type="number"
            step="0.01"
            min={0}
            value={pesoAdicional}
            onChange={(e) => setPesoAdicional(parseFloat(e.target.value) || 0)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-white"
            disabled={loading || loadingDatos}
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Total a mover: <strong>{totalKgMover().toFixed(2)} KG</strong>
          </p>
        </div>

        <p className="text-sm text-gray-600 dark:text-gray-400">
          Seleccione la nueva ubicación:
        </p>

        {/* Almacén */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Almacén <span className="text-red-500">*</span>
          </label>
          <select
            value={seleccion.almacen_id}
            onChange={handleAlmacenChange}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-white"
            disabled={loading || loadingDatos}
            required
          >
            <option value="">Seleccione un almacén</option>
            {almacenes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre}
              </option>
            ))}
          </select>
        </div>

        {/* Carril */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Carril <span className="text-red-500">*</span>
          </label>
          <select
            value={seleccion.carril_id}
            onChange={handleCarrilChange}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-white"
            disabled={loading || loadingDatos || !seleccion.almacen_id}
            required
          >
            <option value="">Seleccione un carril</option>
            {carriles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </div>

        {/* Nivel */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Nivel <span className="text-red-500">*</span>
          </label>
          <select
            value={seleccion.nivel_id}
            onChange={handleNivelChange}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-white"
            disabled={loading || loadingDatos || !seleccion.carril_id}
            required
          >
            <option value="">Seleccione un nivel</option>
            {niveles.map((n) => (
              <option key={n.id} value={n.id}>
                Nivel {n.numero_nivel}
              </option>
            ))}
          </select>
        </div>

        {/* Posición */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Posición <span className="text-red-500">*</span>
          </label>
          <select
            value={seleccion.posicion_id}
            onChange={(e) =>
              setSeleccion((prev) => ({ ...prev, posicion_id: e.target.value }))
            }
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-white"
            disabled={loading || loadingDatos || !seleccion.nivel_id}
            required
          >
            <option value="">Seleccione una posición</option>
            {posiciones.map((p) => (
              <option key={p.id} value={p.id} disabled={p.bloqueada}>
                {p.nombre} ({p.bloqueada ? 'Bloqueado' : p.estado})
              </option>
            ))}
          </select>
        </div>

        {/* Motivo */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Motivo del Movimiento
          </label>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-white"
            rows="3"
            placeholder="Opcional: describa el motivo del movimiento"
            disabled={loading}
          />
        </div>

        {/* Botones */}
        <div className="flex gap-3 pt-4">
          <button
            type="button"
            onClick={handleClose}
            disabled={loading}
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={loading || loadingDatos}
            className="flex-1 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Moviendo...
              </>
            ) : (
              'Mover Producto'
            )}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default ModalMoverProducto
