import axios from 'axios'

export const produccionApi = {
  listar: (params = {}) => axios.get('/api/produccion', { params }),
  obtener: (id) => axios.get(`/api/produccion/${id}`),
  crear: (data) => axios.post('/api/produccion', data),
  actualizar: (id, data) => axios.put(`/api/produccion/${id}`, data),
  eliminar: (id) => axios.delete(`/api/produccion/${id}`),
  entradasPendientesListar: (params = {}) => axios.get('/api/produccion/entradas-pendientes/list', { params }),
  entradaPendienteMarcarConvertido: (id, data) => axios.put(`/api/produccion/entradas-pendientes/${id}/convertido`, data),
}
