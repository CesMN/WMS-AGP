import axios from 'axios'

export const empaqueApi = {
  lotesActivos: () => axios.get('/api/empaque/lotes-activos'),
  listar: () => axios.get('/api/empaque'),
  porLote: (loteId) => axios.get(`/api/empaque/por-lote/${loteId}`),
  obtener: (id) => axios.get(`/api/empaque/${id}`),
  iniciar: (loteId) => axios.post('/api/empaque', { lote_id: loteId }),
  actualizar: (id, data) => axios.put(`/api/empaque/${id}`, data),
  finalizar: (id) => axios.post(`/api/empaque/${id}/finalizar`),
  reabrir: (id) => axios.patch(`/api/empaque/${id}/reabrir`),
}
