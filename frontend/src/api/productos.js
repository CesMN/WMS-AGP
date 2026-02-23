import axios from 'axios'

export const productosApi = {
  listar: (params) => axios.get('/api/productos', { params }),
  buscar: (query) => axios.get('/api/productos/buscar', { params: { q: query } }),
  obtener: (id) => axios.get(`/api/productos/${id}`),
  crear: (data) => axios.post('/api/productos', data),
  actualizar: (id, data) => axios.put(`/api/productos/${id}`, data),
  eliminar: (id) => axios.delete(`/api/productos/${id}`),
  importarValidar: (file) => {
    const form = new FormData()
    form.append('archivo', file)
    return axios.post('/api/productos/import', form, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
  importarConfirmar: (rows) => axios.post('/api/productos/import/confirm', { rows }),
}
