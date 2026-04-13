import axios from 'axios'

export const ingresosMpApi = {
  // Lotes de producción
  lotesListar: (params = {}) => axios.get('/api/ingresos-mp/lotes/list', { params }),
  loteObtener: (id) => axios.get(`/api/ingresos-mp/lotes/${id}`),
  loteResumen: (id) => axios.get(`/api/ingresos-mp/lotes/${id}/resumen`),
  loteCrear: (data) => axios.post('/api/ingresos-mp/lotes', data),
  loteActualizar: (id, data) => axios.put(`/api/ingresos-mp/lotes/${id}`, data),
  loteEliminar: (id) => axios.delete(`/api/ingresos-mp/lotes/${id}`),
  loteCancelarProcesos: (id) => axios.post(`/api/ingresos-mp/lotes/${id}/cancelar-procesos`),
  /** Galones de bunker (insumo operativo); vacío o null borra el valor. */
  loteOperativosBunkerGalones: (id, body) =>
    axios.patch(`/api/ingresos-mp/lotes/${id}/operativos-bunker-galones`, body),

  // Proveedores MP
  proveedoresListar: (params = {}) => axios.get('/api/ingresos-mp/proveedores/list', { params }),
  proveedorObtener: (id) => axios.get(`/api/ingresos-mp/proveedores/${id}`),
  proveedorCrear: (data) => axios.post('/api/ingresos-mp/proveedores', data),
  proveedorActualizar: (id, data) => axios.put(`/api/ingresos-mp/proveedores/${id}`, data),

  // Vehículos por lote
  vehiculosListar: (params = {}) => axios.get('/api/ingresos-mp/vehiculos/list', { params }),
  vehiculoObtener: (id) => axios.get(`/api/ingresos-mp/vehiculos/${id}`),
  vehiculoCrear: (data) => axios.post('/api/ingresos-mp/vehiculos', data),
  vehiculoActualizar: (id, data) => axios.put(`/api/ingresos-mp/vehiculos/${id}`, data),
  vehiculoEliminar: (id) => axios.delete(`/api/ingresos-mp/vehiculos/${id}`),

  // Descargas
  descargasListar: (params = {}) => axios.get('/api/ingresos-mp/descargas/list', { params }),
  descargaObtener: (id) => axios.get(`/api/ingresos-mp/descargas/${id}`),
  descargaCrear: (data) => axios.post('/api/ingresos-mp/descargas', data),
  descargaActualizar: (id, data) => axios.put(`/api/ingresos-mp/descargas/${id}`, data),
  descargaEliminar: (id) => axios.delete(`/api/ingresos-mp/descargas/${id}`),
  winchaCrear: (descargaId, data) => axios.post(`/api/ingresos-mp/descargas/${descargaId}/winchas`, data),
  winchaActualizar: (winchaId, data) => axios.put(`/api/ingresos-mp/winchas/${winchaId}`, data),
  winchaEliminar: (winchaId) => axios.delete(`/api/ingresos-mp/winchas/${winchaId}`),

  // Embarcaciones (por matrícula)
  embarcacionesListar: (params = {}) => axios.get('/api/ingresos-mp/embarcaciones/list', { params }),
  embarcacionPorMatricula: (matricula) => axios.get(`/api/ingresos-mp/embarcaciones/por-matricula/${encodeURIComponent(matricula)}`),
  embarcacionRegistrar: (data) => axios.post('/api/ingresos-mp/embarcaciones', data),

  // Validación de descargas
  validacionDescargasListar: (params = {}) => axios.get('/api/ingresos-mp/validacion/descargas', { params }),
  documentosValidacionListar: (descargaId) => axios.get(`/api/ingresos-mp/descargas/${descargaId}/documentos-validacion`),
  documentoValidacionObtener: (docId) => axios.get(`/api/ingresos-mp/documentos-validacion/${docId}`),
  documentoValidacionSubir: (descargaId, data) => axios.post(`/api/ingresos-mp/descargas/${descargaId}/documentos-validacion`, data),
  documentoValidacionEliminar: (docId) => axios.delete(`/api/ingresos-mp/documentos-validacion/${docId}`),
  descargaValidar: (descargaId) => axios.post(`/api/ingresos-mp/descargas/${descargaId}/validar`),
  descargaReabrirValidacion: (descargaId) => axios.patch(`/api/ingresos-mp/descargas/${descargaId}/reabrir-validacion`),
}
