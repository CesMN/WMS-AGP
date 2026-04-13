import axios from 'axios'

export const salidasApi = {
  listar: (params = {}) => axios.get('/api/salidas', { params }),
  obtener: (id) => axios.get(`/api/salidas/${id}`),
  crear: (data) => axios.post('/api/salidas', data),
  actualizar: (id, data) => axios.put(`/api/salidas/${id}`, data),
  eliminar: (id) => axios.delete(`/api/salidas/${id}`),
}
