import { Loader2 } from 'lucide-react'

export default function LoadingSpinner({ size = 'md', className = '' }) {
  const sizeClass = size === 'sm' ? 'w-6 h-6' : size === 'lg' ? 'w-12 h-12' : 'w-10 h-10'
  return (
    <div className={`flex items-center justify-center py-12 ${className}`} role="status" aria-label="Cargando">
      <Loader2 className={`${sizeClass} text-primary-600 animate-spin`} />
    </div>
  )
}
