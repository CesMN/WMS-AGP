import { lazy, Suspense } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './contexts/AuthContext'
import { ConfigProvider } from './contexts/ConfigContext'
import { PosicionEnTransitoProvider } from './contexts/PosicionEnTransitoContext'
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
const Usuarios = lazy(() => import('./pages/Usuarios/Usuarios'))
const Especies = lazy(() => import('./pages/Especies/Especies'))
const Clientes = lazy(() => import('./pages/Clientes/Clientes'))
const Productos = lazy(() => import('./pages/Productos/Productos'))
const Stock = lazy(() => import('./pages/Stock/Stock'))
const Movimientos = lazy(() => import('./pages/Movimientos/Movimientos'))
const MovimientosIngresos = lazy(() => import('./pages/Movimientos/Ingresos'))
const MovimientosSalidas = lazy(() => import('./pages/Movimientos/Salidas'))
const Despachos = lazy(() => import('./pages/Despachos/Despachos'))
const Configuracion = lazy(() => import('./pages/Configuracion/Configuracion'))

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
                  <Layout>
                    <ErrorBoundary>
                      <Suspense fallback={<LoadingSpinner size="lg" />}>
                        <Routes>
                          <Route path="/" element={<Dashboard />} />
                          <Route path="/dashboard" element={<Dashboard />} />
                          <Route path="/almacenes" element={<Almacenes />} />
                          <Route path="/almacenes/:almacenId/carriles" element={<Carriles />} />
                          <Route path="/almacenes/:almacenId/carriles/:carrilId/niveles" element={<NivelPosicion />} />
                          <Route path="/almacenes/:almacenId/carriles/:carrilId/posicion/:posicionId" element={<Posicion />} />
                          <Route path="/usuarios" element={<RoleProtectedRoute allowedRoles={['Admin']}><Usuarios /></RoleProtectedRoute>} />
                          <Route path="/especies" element={<Especies />} />
                          <Route path="/clientes" element={<Clientes />} />
                          <Route path="/productos" element={<Productos />} />
                          <Route path="/stock" element={<Stock />} />
                          <Route path="/movimientos" element={<RoleProtectedRoute allowedRoles={['Admin']}><Movimientos /></RoleProtectedRoute>} />
                          <Route path="/movimientos/ingresos" element={<MovimientosIngresos />} />
                          <Route path="/movimientos/salidas" element={<MovimientosSalidas />} />
                          <Route path="/despachos" element={<Despachos />} />
                          <Route path="/configuracion" element={<Configuracion />} />
                        </Routes>
                      </Suspense>
                    </ErrorBoundary>
                  </Layout>
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
