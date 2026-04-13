import { createContext, useContext, useState, useEffect } from 'react'
import axios from 'axios'
import toast from 'react-hot-toast'

const AuthContext = createContext()

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth debe usarse dentro de AuthProvider')
  }
  return context
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  /** Alineado con RBAC backend: rol efectivo «Administrador» (o legacy «admin»). */
  const isAdmin = () => {
    const role = String(user?.rol || '').toLowerCase()
    return role === 'administrador' || role === 'admin'
  }

  const hasPermission = (resource, action = 'view') => {
    const role = String(user?.rol || '').toLowerCase()
    if (role === 'administrador' || role === 'admin') return true
    const perms = user?.permissions || {}
    const row = perms?.[resource] || { view: false, operate: false }
    return action === 'operate' ? !!row.operate : !!row.view
  }
  const canView = (resource) => hasPermission(resource, 'view')
  const canOperate = (resource) => hasPermission(resource, 'operate')

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (token) {
      verifyToken(token)
    } else {
      setLoading(false)
    }
  }, [])

  const verifyToken = async (token) => {
    try {
      const response = await axios.get('/api/auth/verify', {
        headers: { Authorization: `Bearer ${token}` }
      })
      setUser(response.data.user)
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
    } catch (error) {
      localStorage.removeItem('token')
      setUser(null)
      const is401 = error.response?.status === 401
      if (is401) toast.error('Sesión expirada. Inicia sesión de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  const login = async (email, password) => {
    try {
      const response = await axios.post('/api/auth/login', { email, password })
      const { token, user } = response.data
      localStorage.setItem('token', token)
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
      setUser(user)
      return { success: true }
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || 'Error al iniciar sesión'
      }
    }
  }

  const logout = () => {
    localStorage.removeItem('token')
    delete axios.defaults.headers.common['Authorization']
    setUser(null)
  }

  const value = {
    user,
    login,
    logout,
    loading,
    isAuthenticated: !!user,
    isAdmin,
    hasPermission,
    canView,
    canOperate,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
