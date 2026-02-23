import axios from 'axios'

export const especiesApi = {
  listar: (params = {}) => axios.get('/api/especies', { params }),
  obtener: (id) => axios.get(`/api/especies/${id}`),
  crear: (data) => axios.post('/api/especies', data),
  actualizar: (id, data) => axios.put(`/api/especies/${id}`, data),
  eliminar: (id) => axios.delete(`/api/especies/${id}`),
}
