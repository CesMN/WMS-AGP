import axios from 'axios'

export const referenciasApi = {
  listar: (tipo) => axios.get('/api/referencias', { params: { tipo } }),
}
