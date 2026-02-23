import axios from 'axios'

export const movimientosApi = {
  listar: (params = {}) => {
    const searchParams = new URLSearchParams()
    if (params.tipo_movimiento) searchParams.set('tipo_movimiento', params.tipo_movimiento)
    if (params.fecha_desde) searchParams.set('fecha_desde', params.fecha_desde)
    if (params.fecha_hasta) searchParams.set('fecha_hasta', params.fecha_hasta)
    if (params.usuario_id) searchParams.set('usuario_id', params.usuario_id)
    if (params.limit != null) searchParams.set('limit', params.limit)
    if (params.offset != null) searchParams.set('offset', params.offset)
    const query = searchParams.toString()
    return axios.get(`/api/movimientos${query ? `?${query}` : ''}`)
  },
  obtener: (id) => axios.get(`/api/movimientos/${id}`),
  actualizarGuiaGrupo: (data) =>
    axios.patch('/api/movimientos/actualizar-guia-grupo', data),
  ingresosAgrupados: (params = {}) => {
    const searchParams = new URLSearchParams()
    if (params.limit != null) searchParams.set('limit', params.limit)
    if (params.offset != null) searchParams.set('offset', params.offset)
    if (params.numero_guia != null && String(params.numero_guia).trim() !== '') searchParams.set('numero_guia', params.numero_guia.trim())
    if (params.fecha_desde) searchParams.set('fecha_desde', params.fecha_desde)
    if (params.fecha_hasta) searchParams.set('fecha_hasta', params.fecha_hasta)
    if (params.cliente_id) searchParams.set('cliente_id', params.cliente_id)
    if (params.especie_id) searchParams.set('especie_id', params.especie_id)
    const query = searchParams.toString()
    return axios.get(`/api/movimientos/ingresos-agrupados${query ? `?${query}` : ''}`)
  },
  salidasAgrupadas: (params = {}) => {
    const searchParams = new URLSearchParams()
    if (params.limit != null) searchParams.set('limit', params.limit)
    if (params.offset != null) searchParams.set('offset', params.offset)
    if (params.numero_guia != null && String(params.numero_guia).trim() !== '') searchParams.set('numero_guia', params.numero_guia.trim())
    if (params.fecha_desde) searchParams.set('fecha_desde', params.fecha_desde)
    if (params.fecha_hasta) searchParams.set('fecha_hasta', params.fecha_hasta)
    if (params.cliente_id) searchParams.set('cliente_id', params.cliente_id)
    if (params.especie_id) searchParams.set('especie_id', params.especie_id)
    const query = searchParams.toString()
    return axios.get(`/api/movimientos/salidas-agrupadas${query ? `?${query}` : ''}`)
  },
}
