import { describe, it, expect } from 'vitest'
import {
  alternarFavorito,
  definirFavoritos,
  criarColecao,
  renomearColecao,
  excluirColecao,
  adicionarAColecao,
  removerDaColecao,
  removerPasta,
  mesclarVarredura,
  aplicarLote,
  normalizarBiblioteca
} from '@shared/biblioteca'
import { bibliotecaVazia } from '@shared/tipos'
import { umSample } from './fabrica'

describe('favoritos', () => {
  it('alterna favorito sem alterar a biblioteca original', () => {
    const b = bibliotecaVazia()
    const b2 = alternarFavorito(b, 'x')
    expect(b2.favoritos).toEqual(['x'])
    expect(b.favoritos).toEqual([])
    expect(alternarFavorito(b2, 'x').favoritos).toEqual([])
  })

  it('define favorito de vários samples de uma vez, sem duplicar', () => {
    const b = { ...bibliotecaVazia(), favoritos: ['a'] }
    expect(definirFavoritos(b, ['a', 'b', 'b'], true).favoritos).toEqual(['a', 'b'])
    expect(definirFavoritos(b, ['a', 'c'], false).favoritos).toEqual([])
  })
})

describe('coleções', () => {
  it('cria coleção com nome aparado e rejeita nome vazio', () => {
    const b = criarColecao(bibliotecaVazia(), '  Graves  ', 'c1', 50)
    expect(b.colecoes).toEqual([
      { id: 'c1', nome: 'Graves', descricao: '', sampleIds: [], criadaEm: 50 }
    ])
    expect(() => criarColecao(b, '   ', 'c2', 60)).toThrow()
  })

  it('renomeia, altera descrição e exclui', () => {
    let b = criarColecao(bibliotecaVazia(), 'A', 'c1', 1)
    b = renomearColecao(b, 'c1', 'B', 'minha descrição')
    expect(b.colecoes[0].nome).toBe('B')
    expect(b.colecoes[0].descricao).toBe('minha descrição')
    expect(() => renomearColecao(b, 'c1', '', '')).toThrow()
    expect(excluirColecao(b, 'c1').colecoes).toEqual([])
  })

  it('adiciona sem duplicar e remove samples', () => {
    let b = criarColecao(bibliotecaVazia(), 'A', 'c1', 1)
    b = adicionarAColecao(b, 'c1', ['s1', 's2'])
    b = adicionarAColecao(b, 'c1', ['s2', 's3'])
    expect(b.colecoes[0].sampleIds).toEqual(['s1', 's2', 's3'])
    b = removerDaColecao(b, 'c1', ['s1', 's3'])
    expect(b.colecoes[0].sampleIds).toEqual(['s2'])
  })

  it('operar em coleção inexistente gera erro', () => {
    expect(() => adicionarAColecao(bibliotecaVazia(), 'nao', ['s1'])).toThrow()
  })
})

describe('pastas e varredura', () => {
  it('remover pasta tira samples dela e limpa favoritos e coleções', () => {
    const a = umSample({ id: 'a', pastaRaiz: 'C:/A' })
    const b = umSample({ id: 'b', pastaRaiz: 'C:/B' })
    let bib = { ...bibliotecaVazia(), pastas: ['C:/A', 'C:/B'], samples: [a, b], favoritos: ['a', 'b'] }
    bib = criarColecao(bib, 'X', 'c1', 1)
    bib = adicionarAColecao(bib, 'c1', ['a', 'b'])

    const r = removerPasta(bib, 'C:/A')
    expect(r.pastas).toEqual(['C:/B'])
    expect(r.samples.map((s) => s.id)).toEqual(['b'])
    expect(r.favoritos).toEqual(['b'])
    expect(r.colecoes[0].sampleIds).toEqual(['b'])
  })

  it('mesclar varredura substitui os samples da pasta e mantém os demais', () => {
    const antigo = umSample({ id: 'velho', pastaRaiz: 'C:/A' })
    const outro = umSample({ id: 'outro', pastaRaiz: 'C:/B' })
    const novo = umSample({ id: 'novo', pastaRaiz: 'C:/A' })
    const bib = {
      ...bibliotecaVazia(),
      pastas: ['C:/B'],
      samples: [antigo, outro],
      favoritos: ['velho', 'outro']
    }
    const r = mesclarVarredura(bib, 'C:/A', [novo])
    expect(r.pastas).toEqual(['C:/B', 'C:/A'])
    expect(r.samples.map((s) => s.id).sort()).toEqual(['novo', 'outro'])
    expect(r.favoritos).toEqual(['outro'])
  })

  it('normalizar preenche campos ausentes de um JSON antigo ou corrompido', () => {
    expect(normalizarBiblioteca(null)).toEqual(bibliotecaVazia())
    expect(normalizarBiblioteca({ pastas: ['C:/A'] })).toEqual({ ...bibliotecaVazia(), pastas: ['C:/A'] })
    expect(normalizarBiblioteca({ samples: 'lixo' }).samples).toEqual([])
  })
})

describe('aplicarLote (varredura em andamento)', () => {
  it('acrescenta samples novos, substitui os de mesmo id e registra a pasta', () => {
    const a = umSample({ id: 'a', pastaRaiz: 'P', nome: 'antigo' })
    const b = umSample({ id: 'b', pastaRaiz: 'P' })
    const base = { ...bibliotecaVazia(), samples: [a, b] }
    const a2 = { ...a, nome: 'novo' }
    const c = umSample({ id: 'c', pastaRaiz: 'P' })
    const r = aplicarLote(base, 'P', [a2, c, c])
    expect(r.samples.map((s) => s.id)).toEqual(['a', 'b', 'c'])
    expect(r.samples[0].nome).toBe('novo')
    expect(r.pastas).toEqual(['P'])
    expect(base.samples).toHaveLength(2) // não altera a original
  })

  it('não remove nada: o que a varredura ainda não revisitou continua', () => {
    const velho = umSample({ id: 'v', pastaRaiz: 'P' })
    const r = aplicarLote({ ...bibliotecaVazia(), pastas: ['P'], samples: [velho] }, 'P', [])
    expect(r.samples).toEqual([velho])
  })
})
