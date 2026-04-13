import { useParams } from 'react-router-dom'

const TITLES = {
  envasado: 'Envasado',
  congelamiento: 'Congelamiento',
  empaque: 'Empaque',
}

const ProduccionSubmodulo = () => {
  const { submodulo } = useParams()
  const titulo = TITLES[submodulo] || submodulo || 'Producción'

  return (
    <div className="p-4 md:p-6">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">{titulo}</h1>
      <p className="text-gray-600 dark:text-gray-400">
        Módulo en desarrollo. Debe existir un lote creado e iniciado para enlazar con la producción.
      </p>
    </div>
  )
}

export default ProduccionSubmodulo
