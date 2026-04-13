import { useState, useEffect } from 'react'
import TopBar from './TopBar'
import BarraDespachos from './BarraDespachos'
import { useConfig } from '../../contexts/ConfigContext'
import { usePosicionEnTransito } from '../../contexts/PosicionEnTransitoContext'
import { Move, X } from 'lucide-react'
import toast from 'react-hot-toast'

const Layout = ({ children }) => {
  const { tema, setConfigValor, CLAVES } = useConfig()
  const { enTransito, clearTransito } = usePosicionEnTransito()
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

  return (
    <div className="flex flex-col h-screen bg-[#f8fafc] dark:bg-gray-900 w-full">
      <TopBar darkMode={darkMode} onToggleDarkMode={handleToggleDarkMode} />
      <div className="flex-1 flex flex-col overflow-hidden w-full min-w-0">
      <BarraDespachos />
      <main className="flex-1 overflow-auto overscroll-y-contain">
        <div className="wms-main-safe p-3 sm:p-5 md:p-6 wms-app-content w-full max-w-full min-w-0 mx-auto max-w-[1920px]">{children}</div>
      </main>

      {/* Barra flotante cuando hay una posición en tránsito (entre carriles/almacenes) */}
        {enTransito && (
          <div className="fixed z-40 bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 right-4 flex max-w-none flex-col gap-2 rounded-xl border border-primary-200 bg-white px-4 py-3 text-gray-900 shadow-lg dark:border-primary-800 dark:bg-gray-800 dark:text-white sm:bottom-6 sm:left-1/2 sm:right-auto sm:max-w-2xl sm:-translate-x-1/2 sm:flex-row sm:items-center sm:gap-3">
            <div className="flex items-start gap-2 sm:items-center">
              <Move className="mt-0.5 h-5 w-5 shrink-0 text-primary-600 dark:text-primary-400 sm:mt-0" />
              <span className="text-sm font-medium leading-snug break-words">
                Posición {enTransito.numeroPosicion} en tránsito · {enTransito.almacenNombre} → {enTransito.carrilNombre}
              </span>
            </div>
            <button
              type="button"
              onClick={clearTransito}
              className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-1.5 self-end rounded-lg bg-gray-200 px-4 text-sm font-medium text-gray-700 hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-200 dark:hover:bg-gray-500 sm:self-auto"
            >
              <X className="h-4 w-4" />
              Cancelar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default Layout
