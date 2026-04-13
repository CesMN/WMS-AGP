import axios from 'axios'

export const stockApi = {
  resumen: () => axios.get('/api/stock/resumen'),
  resumenPorCliente: () => axios.get('/api/stock/resumen-por-cliente'),
  loteRepublicanoLetrasAnos: () => axios.get('/api/stock/lote-republicano-letras-anos'),
  listar: (params = {}) => {
    const searchParams = new URLSearchParams()
    if (params.almacen_id) searchParams.set('almacen_id', params.almacen_id)
    if (params.carril_id) searchParams.set('carril_id', params.carril_id)
    if (params.nivel_id) searchParams.set('nivel_id', params.nivel_id)
    if (params.posicion_id) searchParams.set('posicion_id', params.posicion_id)
    if (params.especie_id) searchParams.set('especie_id', params.especie_id)
    if (params.cliente_id) searchParams.set('cliente_id', params.cliente_id)
    if (params.q) searchParams.set('q', params.q)
    if (params.limit != null) searchParams.set('limit', params.limit)
    if (params.offset != null) searchParams.set('offset', params.offset)
    const query = searchParams.toString()
    return axios.get(`/api/stock${query ? `?${query}` : ''}`)
  },
  lineas: (params = {}) => {
    const searchParams = new URLSearchParams()
    if (params.cliente_id) searchParams.set('cliente_id', params.cliente_id)
    if (params.especie_id) searchParams.set('especie_id', params.especie_id)
    if (params.lote) searchParams.set('lote', params.lote)
    if (params.q) searchParams.set('q', params.q)
    if (params.almacen_id) searchParams.set('almacen_id', params.almacen_id)
    if (params.carril_id) searchParams.set('carril_id', params.carril_id)
    if (params.nivel_id) searchParams.set('nivel_id', params.nivel_id)
    if (params.posicion_id) searchParams.set('posicion_id', params.posicion_id)
    const query = searchParams.toString()
    return axios.get(`/api/stock/lineas${query ? `?${query}` : ''}`)
  },
  matrizLoteProduccion: () => axios.get('/api/stock/matriz-lote-produccion'),
}
