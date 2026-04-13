import { ArrowDownToLine } from 'lucide-react'
import MovimientosInsumosPanel from './MovimientosInsumosPanel'

const IngresosInsumos = () => (
  <MovimientosInsumosPanel
    tipo="INGRESO"
    title="Ingreso de insumos"
    subtitle="Aumenta el stock del almacén de insumos."
    Icon={ArrowDownToLine}
    accent="emerald"
  />
)

export default IngresosInsumos
