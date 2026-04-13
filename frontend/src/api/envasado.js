import axios from 'axios'

export const envasadoApi = {
  lotesActivos: () => axios.get('/api/envasado/lotes-activos'),
  listar: () => axios.get('/api/envasado'),
  porLote: (loteId) => axios.get(`/api/envasado/por-lote/${loteId}`),
  obtener: (id) => axios.get(`/api/envasado/${id}`),
  iniciar: (loteId) => axios.post('/api/envasado', { lote_id: loteId }),
  actualizar: (id, data) => axios.put(`/api/envasado/${id}`, data),
  finalizar: (id) => axios.post(`/api/envasado/${id}/finalizar`),
  reabrir: (id) => axios.patch(`/api/envasado/${id}/reabrir`),
}
