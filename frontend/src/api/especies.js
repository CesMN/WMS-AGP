import axios from 'axios'

export const especiesApi = {
  listar: (params = {}) => axios.get('/api/especies', { params }),
  obtener: (id) => axios.get(`/api/especies/${id}`),
  crear: (data) => axios.post('/api/especies', data),
  actualizar: (id, data) => axios.put(`/api/especies/${id}`, data),
  eliminar: (id) => axios.delete(`/api/especies/${id}`),
  clasificacionesListar: (especieId) => axios.get(`/api/especies/${especieId}/clasificaciones`),
  clasificacionCrear: (especieId, data) => axios.post(`/api/especies/${especieId}/clasificaciones`, data),
  clasificacionActualizar: (id, data) => axios.put(`/api/especies/clasificaciones/${id}`, data),
  clasificacionEliminar: (id) => axios.delete(`/api/especies/clasificaciones/${id}`),
}
