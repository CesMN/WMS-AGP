import axios from 'axios'

export const recepcionApi = {
  listar: (params = {}) => axios.get('/api/recepcion', { params }),
  obtener: (id) => axios.get(`/api/recepcion/${id}`),
  crear: (data) => axios.post('/api/recepcion', data),
  actualizar: (id, data) => axios.put(`/api/recepcion/${id}`, data),
  eliminar: (id) => axios.delete(`/api/recepcion/${id}`),
  lotesListar: (params = {}) => axios.get('/api/recepcion/lotes/list', { params }),
  loteCrear: (data) => axios.post('/api/recepcion/lotes', data),
  loteActualizar: (id, data) => axios.put(`/api/recepcion/lotes/${id}`, data),
}
