import axios from 'axios'

export const usuariosApi = {
  listar: (params = {}) => axios.get('/api/usuarios', { params }),
  obtener: (id) => axios.get(`/api/usuarios/${id}`),
  crear: (data) => axios.post('/api/usuarios', data),
  actualizar: (id, data) => axios.put(`/api/usuarios/${id}`, data),
  eliminar: (id) => axios.delete(`/api/usuarios/${id}`),
  obtenerCatalogoPermisos: () => axios.get('/api/usuarios/permisos/catalogo'),
  obtenerPermisosRol: (rol) => axios.get(`/api/usuarios/permisos/roles/${encodeURIComponent(rol)}`),
  guardarPermisosRol: (rol, data) => axios.put(`/api/usuarios/permisos/roles/${encodeURIComponent(rol)}`, data),
  obtenerPermisosUsuario: (id) => axios.get(`/api/usuarios/${id}/permisos`),
  guardarOverridesUsuario: (id, data) => axios.put(`/api/usuarios/${id}/permisos-overrides`, data),
}
