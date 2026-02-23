import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import LoadingSpinner from './LoadingSpinner'

/**
 * Protege rutas por rol. Si el usuario no tiene uno de los roles permitidos, redirige al dashboard.
 * @param {React.ReactNode} children
 * @param {string[]} allowedRoles - Ej: ['Admin']. Si el usuario tiene rol 'Usuario', no puede acceder.
 */
const RoleProtectedRoute = ({ children, allowedRoles = ['Admin'] }) => {
  const { user, loading } = useAuth()
  const rol = (user?.rol || '').trim()
  const permitido = Array.isArray(allowedRoles) && allowedRoles.some((r) => String(r).toLowerCase() === rol.toLowerCase())

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (!permitido) {
    return <Navigate to="/dashboard" replace />
  }

  return children
}

export default RoleProtectedRoute
