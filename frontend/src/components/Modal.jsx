import { useEffect } from 'react'
import { X } from 'lucide-react'

const Modal = ({ isOpen, onClose, title, children, size = 'md', zIndexClass = 'z-50' }) => {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      const handleEscape = (e) => {
        if (e.key === 'Escape') onClose()
      }
      document.addEventListener('keydown', handleEscape)
      return () => {
        document.removeEventListener('keydown', handleEscape)
        document.body.style.overflow = 'unset'
      }
    } else {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    '2xl': 'max-w-6xl',
  }

  return (
    <div
      className={`fixed inset-0 ${zIndexClass} flex items-end justify-center sm:items-center p-0 sm:p-4 bg-black/50 dark:bg-black/65 backdrop-blur-[1px] wms-modal-backdrop`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div
        className={`wms-modal bg-white dark:bg-gray-800 shadow-xl w-full max-h-[min(92dvh,100vh)] sm:max-h-[90vh] overflow-hidden flex flex-col rounded-t-2xl border border-gray-100 dark:border-gray-700 sm:border-0 sm:rounded-xl ${sizeClasses[size]}`}
        style={{ paddingBottom: 'max(0px, env(safe-area-inset-bottom))' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 py-4 sm:p-6 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <h2 id="modal-title" className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white pr-2 leading-tight">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] shrink-0 inline-flex items-center justify-center rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:p-6 text-gray-900 dark:text-white">{children}</div>
      </div>
    </div>
  )
}

export default Modal
