import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Truck } from 'lucide-react'
import { despachosApi } from '../../api/despachos'

const BarraDespachos = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const [despachos, setDespachos] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    despachosApi.listar({ estado: 'Registrado', limit: 20 })
      .then(({ data }) => {
        if (!cancelled) setDespachos(data?.data ?? data ?? [])
      })
      .catch(() => { if (!cancelled) setDespachos([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [location.pathname, location.key])

  useEffect(() => {
    const handler = () => {
      setLoading(true)
      despachosApi.listar({ estado: 'Registrado', limit: 20 })
        .then(({ data }) => setDespachos(data?.data ?? data ?? []))
        .catch(() => setDespachos([]))
        .finally(() => setLoading(false))
    }
    window.addEventListener('despachos-actualizados', handler)
    return () => window.removeEventListener('despachos-actualizados', handler)
  }, [])

  const irADespacho = (id) => {
    if (location.pathname === '/despachos') {
      window.dispatchEvent(new CustomEvent('abrir-detalle-despacho', { detail: { id } }))
    } else {
      navigate('/despachos', { state: { openDespachoId: id } })
    }
  }

  if (despachos.length === 0 && !loading) return null

  return (
    <div className="bg-primary-50 dark:bg-primary-900/20 border-b border-primary-200 dark:border-primary-800 px-4 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-primary-800 dark:text-primary-200 flex items-center gap-1.5">
          <Truck className="w-4 h-4" />
          Despachos en curso:
        </span>
        {loading ? (
          <span className="text-sm text-primary-600 dark:text-primary-400">Cargando...</span>
        ) : (
          despachos.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => irADespacho(d.id)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium bg-white dark:bg-gray-800 border border-primary-200 dark:border-primary-700 text-primary-700 dark:text-primary-300 hover:bg-primary-100 dark:hover:bg-primary-800/50 transition-colors"
            >
              {d.tipo_salida} · {d.cliente_destino || 'Sin cliente'} ({d.total_bultos} bultos)
            </button>
          ))
        )}
      </div>
    </div>
  )
}

export default BarraDespachos
