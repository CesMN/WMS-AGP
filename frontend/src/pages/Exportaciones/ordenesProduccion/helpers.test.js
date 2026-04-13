import { describe, it, expect } from 'vitest'
import {
  esOrigenProduccion,
  filterProductosByQuery,
  contenedorRequisitoCoincideStockReal,
  puedeDesvincularAsignacionOp,
  getProductoLabel,
} from './helpers'

describe('ordenesProduccion/helpers', () => {
  it('esOrigenProduccion detecta variantes', () => {
    expect(esOrigenProduccion('produccion')).toBe(true)
    expect(esOrigenProduccion('PRODUCCIÓN')).toBe(true)
    expect(esOrigenProduccion('prod_x')).toBe(true)
    expect(esOrigenProduccion('stock')).toBe(false)
  })

  it('getProductoLabel concatena campos', () => {
    expect(getProductoLabel({ codigo: 'A1', descripcion: 'X', presentacion: '10kg' })).toBe('A1 – X – 10kg')
  })

  it('filterProductosByQuery filtra por texto', () => {
    const list = [
      { id: 1, codigo: 'P01', descripcion: 'Filete', producto: '', presentacion: '' },
      { id: 2, codigo: 'Z99', descripcion: 'Otro', producto: '', presentacion: '' },
    ]
    expect(filterProductosByQuery(list, 'file').length).toBe(1)
    expect(filterProductosByQuery(list, '').length).toBe(2)
  })

  it('contenedorRequisitoCoincideStockReal exige igualdad fila a fila', () => {
    const rows = { c1: [{ rowKey: 'r1', lineaId: 'L1' }] }
    const draft = { c1: { r1: '10' } }
    const stock = { c1: { r1: '10' } }
    expect(contenedorRequisitoCoincideStockReal('c1', rows, draft, stock)).toBe(true)
    expect(contenedorRequisitoCoincideStockReal('c1', rows, draft, { c1: { r1: '9' } })).toBe(false)
  })

  it('puedeDesvincularAsignacionOp respeta embarque y rol', () => {
    const ordenOk = { contenedores: [] }
    const ordenBloqueado = { contenedores: [{ despachado_at: '2024-01-01' }] }
    const isAdmin = () => true
    expect(puedeDesvincularAsignacionOp({ origen: 'almacen' }, isAdmin, ordenOk)).toBe(true)
    expect(puedeDesvincularAsignacionOp({ origen: 'almacen' }, isAdmin, ordenBloqueado)).toBe(false)
    expect(
      puedeDesvincularAsignacionOp(
        { origen: 'produccion', lote_produccion_id: 'x', lote_produccion_estado: 'Terminado' },
        isAdmin,
        ordenOk
      )
    ).toBe(false)
  })
})
