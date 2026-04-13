import { lazy, Suspense } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './contexts/AuthContext'
import { ConfigProvider } from './contexts/ConfigContext'
import { PosicionEnTransitoProvider } from './contexts/PosicionEnTransitoContext'
import { NotificationsProvider } from './contexts/NotificationsContext'
import Layout from './components/Layout/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import RoleProtectedRoute from './components/RoleProtectedRoute'
import ErrorBoundary from './components/ErrorBoundary'
import LoadingSpinner from './components/LoadingSpinner'

import Login from './pages/Login'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Almacenes = lazy(() => import('./pages/Almacenes/Almacenes'))
const Carriles = lazy(() => import('./pages/Almacenes/Carriles'))
const NivelPosicion = lazy(() => import('./pages/Almacenes/NivelPosicion'))
const Posicion = lazy(() => import('./pages/Almacenes/Posicion'))
const RecepcionParihuelas = lazy(() => import('./pages/Almacenes/RecepcionParihuelas'))
const HistorialParihuelas = lazy(() => import('./pages/Almacenes/HistorialParihuelas'))
const Usuarios = lazy(() => import('./pages/Usuarios/Usuarios'))
const Especies = lazy(() => import('./pages/Especies/Especies'))
const Clientes = lazy(() => import('./pages/Clientes/Clientes'))
const Productos = lazy(() => import('./pages/Productos/Productos'))
const Stock = lazy(() => import('./pages/Stock/Stock'))
const RegistroActividad = lazy(() => import('./pages/Admin/RegistroActividad'))
const MovimientosIngresos = lazy(() => import('./pages/Movimientos/Ingresos'))
const MovimientosSalidas = lazy(() => import('./pages/Movimientos/Salidas'))
const Despachos = lazy(() => import('./pages/Despachos/Despachos'))
const Configuracion = lazy(() => import('./pages/Configuracion/Configuracion'))
const Recepcion = lazy(() => import('./pages/Recepcion/Recepcion'))
const CatalogoInsumos = lazy(() => import('./pages/Insumos/CatalogoInsumos'))
const ProveedoresInsumos = lazy(() => import('./pages/Insumos/ProveedoresInsumos'))
const IngresosInsumos = lazy(() => import('./pages/Insumos/IngresosInsumos'))
const SalidasInsumos = lazy(() => import('./pages/Insumos/SalidasInsumos'))
const StockInsumos = lazy(() => import('./pages/Insumos/StockInsumos'))
const PlantillasEmpaqueEspecie = lazy(() => import('./pages/Insumos/PlantillasEmpaqueEspecie'))
const ConciliacionEmpaque = lazy(() => import('./pages/Insumos/ConciliacionEmpaque'))
const LotesProduccion = lazy(() => import('./pages/IngresosMp/LotesProduccion'))
const VehiculosLote = lazy(() => import('./pages/IngresosMp/VehiculosLote'))
const DescargaMateriaPrima = lazy(() => import('./pages/IngresosMp/DescargaMateriaPrima'))
const ProveedoresMp = lazy(() => import('./pages/IngresosMp/ProveedoresMp'))
const ValidacionDescargas = lazy(() => import('./pages/IngresosMp/ValidacionDescargas'))
const PlantillasProceso = lazy(() => import('./pages/Produccion/PlantillasProceso'))
const PlantillasSnapshotHistorial = lazy(() => import('./pages/Produccion/PlantillasSnapshotHistorial'))
const Envasado = lazy(() => import('./pages/Produccion/Envasado'))
const Congelado = lazy(() => import('./pages/Produccion/Congelado'))
const Empaque = lazy(() => import('./pages/Produccion/Empaque'))
const ControlProduccion = lazy(() => import('./pages/Produccion/ControlProduccion'))
const StockPptt = lazy(() => import('./pages/Produccion/StockPptt'))
const ReporteProduccion = lazy(() => import('./pages/Produccion/ReporteProduccion'))
const ProduccionSubmodulo = lazy(() => import('./pages/Produccion/ProduccionSubmodulo'))
const Salidas = lazy(() => import('./pages/Salidas/Salidas'))
const OrdenesProduccionExportacion = lazy(() => import('./pages/Exportaciones/OrdenesProduccion'))
const ClientesExportacion = lazy(() => import('./pages/Exportaciones/ClientesExportacion'))
const PedidosListos = lazy(() => import('./pages/Exportaciones/PedidosListos'))

function App() {
  return (
    <AuthProvider>
      <Router>
        <Toaster position="top-right" />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <ConfigProvider>
                  <PosicionEnTransitoProvider>
                    <NotificationsProvider>
                      <Layout>
                        <ErrorBoundary>
                          <Suspense fallback={<LoadingSpinner size="lg" />}>
                            <Routes>
                          <Route path="/" element={<RoleProtectedRoute resource="dashboard"><Dashboard /></RoleProtectedRoute>} />
                          <Route path="/dashboard" element={<RoleProtectedRoute resource="dashboard"><Dashboard /></RoleProtectedRoute>} />
                          <Route path="/almacenes" element={<RoleProtectedRoute resource="almacenamiento.almacenes"><Almacenes /></RoleProtectedRoute>} />
                          <Route path="/almacenes/:almacenId/carriles" element={<Carriles />} />
                          <Route path="/almacenes/:almacenId/carriles/:carrilId/niveles" element={<NivelPosicion />} />
                          <Route path="/almacenes/:almacenId/carriles/:carrilId/posicion/:posicionId" element={<Posicion />} />
                          <Route path="/almacenes/recepcion-parihuelas" element={<RoleProtectedRoute resource="almacenamiento.recepcion_parihuelas"><RecepcionParihuelas /></RoleProtectedRoute>} />
                          <Route path="/almacenes/historial-parihuelas" element={<RoleProtectedRoute resource="almacenamiento.historial_parihuelas"><HistorialParihuelas /></RoleProtectedRoute>} />
                          <Route path="/usuarios" element={<RoleProtectedRoute resource="admin.usuarios"><Usuarios /></RoleProtectedRoute>} />
                          <Route path="/especies" element={<RoleProtectedRoute resource="admin.especies"><Especies /></RoleProtectedRoute>} />
                          <Route path="/clientes" element={<RoleProtectedRoute resource="admin.clientes"><Clientes /></RoleProtectedRoute>} />
                          <Route path="/productos" element={<RoleProtectedRoute resource="admin.productos"><Productos /></RoleProtectedRoute>} />
                          <Route path="/stock" element={<RoleProtectedRoute resource="almacenamiento.stock_fisico"><Stock /></RoleProtectedRoute>} />
                          <Route path="/admin/registro-actividad" element={<RoleProtectedRoute resource="admin.registro_actividad"><RegistroActividad /></RoleProtectedRoute>} />
                          <Route path="/movimientos" element={<Navigate to="/admin/registro-actividad" replace />} />
                          <Route path="/movimientos/ingresos" element={<RoleProtectedRoute resource="almacenamiento.mov_ingresos"><MovimientosIngresos /></RoleProtectedRoute>} />
                          <Route path="/movimientos/salidas" element={<RoleProtectedRoute resource="almacenamiento.mov_salidas"><MovimientosSalidas /></RoleProtectedRoute>} />
                          <Route path="/despachos" element={<RoleProtectedRoute resource="exportaciones.despachos"><Despachos /></RoleProtectedRoute>} />
                          <Route path="/recepcion" element={<RoleProtectedRoute resource="recepcion.general"><Recepcion /></RoleProtectedRoute>} />
                          <Route path="/insumos/proveedores" element={<RoleProtectedRoute resource="insumos.proveedores"><ProveedoresInsumos /></RoleProtectedRoute>} />
                          <Route path="/insumos/catalogo" element={<RoleProtectedRoute resource="insumos.catalogo"><CatalogoInsumos /></RoleProtectedRoute>} />
                          <Route path="/insumos/ingresos" element={<RoleProtectedRoute resource="insumos.ingresos"><IngresosInsumos /></RoleProtectedRoute>} />
                          <Route path="/insumos/salidas" element={<RoleProtectedRoute resource="insumos.salidas"><SalidasInsumos /></RoleProtectedRoute>} />
                          <Route path="/insumos/stock" element={<RoleProtectedRoute resource="insumos.stock"><StockInsumos /></RoleProtectedRoute>} />
                          <Route path="/insumos/plantillas-empaque" element={<RoleProtectedRoute resource="insumos.plantillas_empaque"><PlantillasEmpaqueEspecie /></RoleProtectedRoute>} />
                          <Route path="/insumos/conciliacion-empaque" element={<RoleProtectedRoute resource="insumos.conciliacion"><ConciliacionEmpaque /></RoleProtectedRoute>} />
                          <Route path="/insumos" element={<Navigate to="/insumos/catalogo" replace />} />
                          <Route path="/ingresos-mp/lotes" element={<RoleProtectedRoute resource="ingresos_mp.lotes"><LotesProduccion /></RoleProtectedRoute>} />
                          <Route path="/ingresos-mp/vehiculos" element={<RoleProtectedRoute resource="ingresos_mp.vehiculos"><VehiculosLote /></RoleProtectedRoute>} />
                          <Route path="/ingresos-mp/descargas" element={<RoleProtectedRoute resource="ingresos_mp.descargas"><DescargaMateriaPrima /></RoleProtectedRoute>} />
                          <Route path="/ingresos-mp/proveedores" element={<RoleProtectedRoute resource="ingresos_mp.proveedores"><ProveedoresMp /></RoleProtectedRoute>} />
                          <Route path="/ingresos-mp/validacion-descargas" element={<RoleProtectedRoute resource="ingresos_mp.validacion_descargas"><ValidacionDescargas /></RoleProtectedRoute>} />
                          <Route path="/produccion" element={<Navigate to="/exportaciones/ordenes-produccion" replace />} />
                          <Route path="/produccion/ordenes-exportacion" element={<Navigate to="/exportaciones/ordenes-produccion" replace />} />
                          <Route path="/produccion/plantillas-proceso" element={<RoleProtectedRoute resource="produccion.plantillas_proceso"><PlantillasProceso /></RoleProtectedRoute>} />
                          <Route
                            path="/produccion/plantillas-snapshots"
                            element={
                              <RoleProtectedRoute resource="produccion.plantillas_snapshots">
                                <PlantillasSnapshotHistorial />
                              </RoleProtectedRoute>
                            }
                          />
                          <Route path="/produccion/envasado" element={<RoleProtectedRoute resource="produccion.envasado"><Envasado /></RoleProtectedRoute>} />
                          <Route path="/produccion/congelado" element={<RoleProtectedRoute resource="produccion.congelado"><Congelado /></RoleProtectedRoute>} />
                          <Route path="/produccion/empaque" element={<RoleProtectedRoute resource="produccion.empaque"><Empaque /></RoleProtectedRoute>} />
                          <Route path="/produccion/control-produccion" element={<RoleProtectedRoute resource="produccion.control"><ControlProduccion /></RoleProtectedRoute>} />
                          <Route path="/produccion/stock-pptt" element={<RoleProtectedRoute resource="produccion.stock_pptt"><StockPptt /></RoleProtectedRoute>} />
                          <Route path="/produccion/reporte-produccion" element={<RoleProtectedRoute resource="produccion.reporte"><ReporteProduccion /></RoleProtectedRoute>} />
                          <Route path="/produccion/:submodulo" element={<ProduccionSubmodulo />} />
                          <Route path="/exportaciones/clientes" element={<RoleProtectedRoute resource="exportaciones.clientes"><ClientesExportacion /></RoleProtectedRoute>} />
                          <Route path="/exportaciones/ordenes-produccion" element={<RoleProtectedRoute resource="exportaciones.ordenes"><OrdenesProduccionExportacion /></RoleProtectedRoute>} />
                          <Route path="/exportaciones/listos" element={<RoleProtectedRoute resource="exportaciones.listos"><PedidosListos /></RoleProtectedRoute>} />
                          <Route path="/salidas" element={<RoleProtectedRoute resource="insumos.salidas"><Salidas /></RoleProtectedRoute>} />
                          <Route path="/configuracion" element={<RoleProtectedRoute resource="configuracion"><Configuracion /></RoleProtectedRoute>} />
                            </Routes>
                          </Suspense>
                        </ErrorBoundary>
                      </Layout>
                    </NotificationsProvider>
                  </PosicionEnTransitoProvider>
                </ConfigProvider>
              </ProtectedRoute>
            }
          />
        </Routes>
      </Router>
    </AuthProvider>
  )
}

export default App
