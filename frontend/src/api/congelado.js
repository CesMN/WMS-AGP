import axios from 'axios'

export const congeladoApi = {
  lotesActivos: () => axios.get('/api/congelado/lotes-activos'),
  listar: () => axios.get('/api/congelado'),
  porLote: (loteId) => axios.get(`/api/congelado/por-lote/${loteId}`),
  obtener: (id) => axios.get(`/api/congelado/${id}`),
  iniciar: (loteId) => axios.post('/api/congelado', { lote_id: loteId }),
  actualizar: (id, data) => axios.put(`/api/congelado/${id}`, data),
  finalizar: (id) => axios.post(`/api/congelado/${id}/finalizar`),
  reabrir: (id) => axios.patch(`/api/congelado/${id}/reabrir`),
}
