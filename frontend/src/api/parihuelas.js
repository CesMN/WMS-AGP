import axios from 'axios'

export const parihuelasApi = {
  listar: (params = {}) => axios.get('/api/parihuelas', { params }),
  lotes: () => axios.get('/api/parihuelas/lotes'),
  obtener: (id) => axios.get(`/api/parihuelas/${id}`),
  incompletas: (productoId, almacenId) =>
    axios.get('/api/parihuelas/incompletas', { params: { producto_id: productoId, almacen_id: almacenId || undefined } }),
  crear: (data) => axios.post('/api/parihuelas', data),
  actualizar: (id, data) => axios.patch(`/api/parihuelas/${id}`, data),
  eliminar: (id) => axios.delete(`/api/parihuelas/${id}`),
  recepcionar: (id, data) => axios.patch(`/api/parihuelas/${id}/recepcionar`, data),
  reabrir: (id) => axios.patch(`/api/parihuelas/${id}/reabrir`),
}
