import { useState, useEffect } from 'react'
import Sidebar from './Sidebar'
import BarraDespachos from './BarraDespachos'
import { useAuth } from '../../contexts/AuthContext'
import { useConfig } from '../../contexts/ConfigContext'
import { usePosicionEnTransito } from '../../contexts/PosicionEnTransitoContext'
import { Move, X } from 'lucide-react'
import toast from 'react-hot-toast'

const Layout = ({ children }) => {
  const { tema, setConfigValor, CLAVES } = useConfig()
  const { enTransito, clearTransito } = usePosicionEnTransito()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode')
    if (saved !== null) return JSON.parse(saved)
    return tema === 'oscuro'
  })

  useEffect(() => {
    if (tema === 'oscuro' || tema === 'claro') {
      setDarkMode(tema === 'oscuro')
    }
  }, [tema])

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
    localStorage.setItem('darkMode', JSON.stringify(darkMode))
  }, [darkMode])

  const handleToggleDarkMode = async () => {
    const next = !darkMode
    setDarkMode(next)
    try {
      await setConfigValor(CLAVES.TEMA, next ? 'oscuro' : 'claro')
    } catch (_) {
      toast.error('No se pudo guardar la preferencia de tema')
    }
  }

  const toggleSidebar = () => {
    setSidebarCollapsed(!sidebarCollapsed)
  }

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={toggleSidebar}
        darkMode={darkMode}
        onToggleDarkMode={handleToggleDarkMode}
      />
      <main
        className={`flex-1 flex flex-col overflow-auto transition-all duration-300 ${
          sidebarCollapsed ? 'ml-20' : 'ml-64'
        }`}
      >
        <BarraDespachos />
        <div className="flex-1 p-6 wms-app-content">{children}</div>

        {/* Barra flotante cuando hay una posición en tránsito (entre carriles/almacenes) */}
        {enTransito && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border border-primary-200 dark:border-primary-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white">
            <Move className="w-5 h-5 text-primary-600 dark:text-primary-400 flex-shrink-0" />
            <span className="text-sm font-medium">
              Posición {enTransito.numeroPosicion} en tránsito · {enTransito.almacenNombre} → {enTransito.carrilNombre}
            </span>
            <button
              type="button"
              onClick={clearTransito}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-500"
            >
              <X className="w-4 h-4" />
              Cancelar
            </button>
          </div>
        )}
      </main>
    </div>
  )
}

export default Layout
