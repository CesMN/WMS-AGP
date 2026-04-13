import axios from 'axios'

export const clientesExportacionApi = {
  listar: (params = {}) => axios.get('/api/clientes-exportacion', { params }),
  obtener: (id) => axios.get(`/api/clientes-exportacion/${id}`),
  crear: (data) => axios.post('/api/clientes-exportacion', data),
  actualizar: (id, data) => axios.put(`/api/clientes-exportacion/${id}`, data),
  eliminar: (id) => axios.delete(`/api/clientes-exportacion/${id}`),
}
