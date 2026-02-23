import axios from 'axios'

export const clientesApi = {
  listar: (params = {}) => axios.get('/api/clientes', { params }),
  obtener: (id) => axios.get(`/api/clientes/${id}`),
  crear: (data) => axios.post('/api/clientes', data),
  actualizar: (id, data) => axios.put(`/api/clientes/${id}`, data),
  eliminar: (id) => axios.delete(`/api/clientes/${id}`),
}
