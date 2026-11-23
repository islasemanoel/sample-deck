import { describe, it, expect } from 'vitest'
import { limitarLargura, montarColunas, normalizarLarguras } from '../src/renderer/src/colunas'

describe('montarColunas', () => {
  it('padrão: Arquivo preenche a sobra', () => {
    expect(montarColunas({})).toBe(
      '34px 46px 30px minmax(180px, 1fr) minmax(60px, 170px) minmax(48px, 60px) minmax(48px, 74px) minmax(44px, 56px) 76px'
    )
  })

  it('usa as larguras escolhidas; com Arquivo fixo, uma coluna vazia absorve a sobra', () => {
    expect(montarColunas({ kit: 250, bpm: 70 })).toBe(
      '34px 46px 30px minmax(180px, 1fr) minmax(60px, 250px) minmax(48px, 60px) minmax(48px, 74px) minmax(44px, 70px) 76px'
    )
    expect(montarColunas({ nome: 300 })).toBe(
      '34px 46px 30px minmax(120px, 300px) minmax(60px, 170px) minmax(48px, 60px) minmax(48px, 74px) minmax(44px, 56px) 76px minmax(0, 1fr)'
    )
  })
})

describe('limitarLargura e normalizarLarguras', () => {
  it('respeita mínimo e máximo', () => {
    expect(limitarLargura('kit', 10)).toBe(60)
    expect(limitarLargura('nome', 5000)).toBe(900)
    expect(limitarLargura('tom', 80.6)).toBe(81)
  })

  it('descarta valores inválidos ou colunas desconhecidas', () => {
    expect(normalizarLarguras({ kit: 200, tom: 'x', bpm: NaN, outra: 50, nome: 20 })).toEqual({ kit: 200, nome: 120 })
    expect(normalizarLarguras(null)).toEqual({})
  })
})
