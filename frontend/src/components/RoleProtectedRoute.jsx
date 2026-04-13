import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import LoadingSpinner from './LoadingSpinner'

const RoleProtectedRoute = ({ children, allowedRoles = null, resource = null, action = 'view' }) => {
  const { user, loading, hasPermission } = useAuth()
  const rol = (user?.rol || '').trim()
  const permitidoPorRol =
    !Array.isArray(allowedRoles) || allowedRoles.length === 0
      ? true
      : allowedRoles.some((r) => String(r).toLowerCase() === rol.toLowerCase())
  const permitidoPorPermiso = resource ? hasPermission(resource, action) : true

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (!permitidoPorRol || !permitidoPorPermiso) {
    return <Navigate to="/dashboard" replace />
  }

  return children
}

export default RoleProtectedRoute
