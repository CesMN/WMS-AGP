import axios from 'axios'

export const reportesProduccionApi = {
  lotes: (params = {}) => axios.get('/api/reportes-produccion/lotes', { params }),
  reporteLote: (loteId) => axios.get('/api/reportes-produccion/reporte-lote', { params: { lote_id: loteId } }),
}
