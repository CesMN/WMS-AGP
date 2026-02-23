import axios from 'axios'

export const configuracionApi = {
  listar: () => axios.get('/api/configuracion'),
  actualizar: (id, data) => axios.put(`/api/configuracion/${id}`, data),
}
