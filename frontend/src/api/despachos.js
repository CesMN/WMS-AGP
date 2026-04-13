import axios from 'axios'

export const despachosApi = {
  listar: (params = {}) => {
    const searchParams = new URLSearchParams()
    if (params.estado) searchParams.set('estado', params.estado)
    if (params.fecha_desde) searchParams.set('fecha_desde', params.fecha_desde)
    if (params.fecha_hasta) searchParams.set('fecha_hasta', params.fecha_hasta)
    if (params.cliente_destino) searchParams.set('cliente_destino', params.cliente_destino)
    if (params.especie_id) searchParams.set('especie_id', params.especie_id)
    if (params.producto_id) searchParams.set('producto_id', params.producto_id)
    if (params.limit != null) searchParams.set('limit', params.limit)
    if (params.offset != null) searchParams.set('offset', params.offset)
    const query = searchParams.toString()
    return axios.get(`/api/despachos${query ? `?${query}` : ''}`)
  },
  obtener: (id) => axios.get(`/api/despachos/${id}`),
  obtenerProductosRequeridos: (id) => axios.get(`/api/despachos/${id}/productos-requeridos`),
  crear: (data) => axios.post('/api/despachos', data),
  actualizar: (id, data) => axios.put(`/api/despachos/${id}`, data),
  eliminar: (id) => axios.delete(`/api/despachos/${id}`),
  cambiarEstado: (id, estado, extra = {}) => axios.patch(`/api/despachos/${id}/estado`, { estado, ...extra }),
  reabrir: (id) => axios.patch(`/api/despachos/${id}/reabrir`),
  agregarLineas: (id, lineas) => axios.post(`/api/despachos/${id}/lineas`, { lineas }),
  agregarPosicion: (id, posicion_id) => axios.post(`/api/despachos/${id}/agregar-posicion`, { posicion_id }),
  sincronizarFechaPorReferencia: (payload) => axios.patch('/api/despachos/sincronizar-fecha-referencia', payload),
  actualizarLinea: (id, lineaId, data) => axios.patch(`/api/despachos/${id}/lineas/${lineaId}`, data),
  actualizarLineas: (id, lineas) => axios.put(`/api/despachos/${id}/lineas`, { lineas }),
  quitarLinea: (id, lineaId) => axios.delete(`/api/despachos/${id}/lineas/${lineaId}`),
}
