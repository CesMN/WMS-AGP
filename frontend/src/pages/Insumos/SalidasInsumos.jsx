import { ArrowUpFromLine } from 'lucide-react'
import MovimientosInsumosPanel from './MovimientosInsumosPanel'

const SalidasInsumos = () => (
  <MovimientosInsumosPanel
    tipo="SALIDA"
    title="Salidas de insumos"
    subtitle="Consumo vinculado a un lote de producción (trazabilidad)."
    Icon={ArrowUpFromLine}
    accent="amber"
  />
)

export default SalidasInsumos
