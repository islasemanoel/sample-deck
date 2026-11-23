import { describe, it, expect } from 'vitest'
import {
  samplesDaVisao,
  mesmaVisao,
  nomeDaPasta,
  ordenarPastas,
  formatarDuracao,
  formatarBpm,
  samplesDesatualizados,
  rotuloEscopoLocal
} from '../src/renderer/src/visao'
import { bibliotecaVazia, VERSAO_ANALISE, type Biblioteca } from '@shared/tipos'
import { umSample } from './fabrica'

const a = umSample({ id: 'a', pastaRaiz: 'C:/A', modificadoEm: 10 })
const b = umSample({ id: 'b', pastaRaiz: 'C:/B', modificadoEm: 30 })
const c = umSample({ id: 'c', pastaRaiz: 'C:/A', modificadoEm: 20 })
const bib: Biblioteca = {
  ...bibliotecaVazia(),
  pastas: ['C:/A', 'C:/B'],
  samples: [a, b, c],
  favoritos: ['c', 'a', 'sumiu'],
  colecoes: [{ id: 'col', nome: 'X', descricao: '', sampleIds: ['b', 'sumiu', 'a'], criadaEm: 1 }]
}
const ids = (l: { id: string }[]): string[] => l.map((s) => s.id)

describe('samplesDaVisao', () => {
  it('"Sons" lista do mais recente para o mais antigo', () => {
    expect(ids(samplesDaVisao(bib, { tipo: 'todos' }, 1))).toEqual(['b', 'c', 'a'])
  })

  it('"Recentes" respeita o limite informado', () => {
    expect(ids(samplesDaVisao(bib, { tipo: 'recentes' }, 1, 2))).toEqual(['b', 'c'])
  })

  it('curtidos aparecem do último curtido para o primeiro, ignorando ids inexistentes', () => {
    expect(ids(samplesDaVisao(bib, { tipo: 'favoritos' }, 1))).toEqual(['a', 'c'])
  })

  it('coleção mantém a ordem em que os samples foram adicionados', () => {
    expect(ids(samplesDaVisao(bib, { tipo: 'colecao', id: 'col' }, 1))).toEqual(['b', 'a'])
    expect(samplesDaVisao(bib, { tipo: 'colecao', id: 'nao-existe' }, 1)).toEqual([])
  })

  it('pasta lista só os samples daquela raiz', () => {
    expect(ids(samplesDaVisao(bib, { tipo: 'pasta', caminho: 'C:/A' }, 1)).sort()).toEqual(['a', 'c'])
  })

  it('"Todas as pastas" lista a biblioteca inteira agrupada por pasta', () => {
    const x = samplesDaVisao(bib, { tipo: 'todasPastas' }, 1)
    expect(x).toHaveLength(bib.samples.length)
    expect(x.map((s) => s.pastaRaiz)).toEqual([...x.map((s) => s.pastaRaiz)].sort())
  })

  it('"Explorar" embaralha de forma reproduzível pela semente', () => {
    const x = ids(samplesDaVisao(bib, { tipo: 'explorar' }, 42))
    expect(x).toEqual(ids(samplesDaVisao(bib, { tipo: 'explorar' }, 42)))
    expect([...x].sort()).toEqual(['a', 'b', 'c'])
  })

  it('a grade de coleções não lista samples', () => {
    expect(samplesDaVisao(bib, { tipo: 'colecoes' }, 1)).toEqual([])
  })
})

describe('auxiliares de visão', () => {
  it('compara visões pelo tipo e identificador', () => {
    expect(mesmaVisao({ tipo: 'colecao', id: 'x' }, { tipo: 'colecao', id: 'x' })).toBe(true)
    expect(mesmaVisao({ tipo: 'colecao', id: 'x' }, { tipo: 'colecao', id: 'y' })).toBe(false)
    expect(mesmaVisao({ tipo: 'todos' }, { tipo: 'recentes' })).toBe(false)
  })

  it('extrai o nome da pasta com barras de qualquer tipo', () => {
    expect(nomeDaPasta('D:\\Samples\\Drums\\')).toBe('Drums')
    expect(nomeDaPasta('/home/x/Loops')).toBe('Loops')
  })

  it('ordena pastas por inclusão ou alfabeticamente pelo nome', () => {
    const pastas = ['D:/Kits/drums 10', 'C:/zeta', 'E:/Ábaco', 'C:/x/Drums 2', 'D:/beta']
    expect(ordenarPastas(pastas, 'inclusao')).toEqual(pastas)
    expect(ordenarPastas(pastas, 'alfabetica')).toEqual([
      'E:/Ábaco',
      'D:/beta',
      'C:/x/Drums 2',
      'D:/Kits/drums 10',
      'C:/zeta'
    ])
    expect(pastas[0]).toBe('D:/Kits/drums 10')
  })

  it('mostra BPM estimado com "~" e ausente como "--"', () => {
    expect(formatarBpm(umSample({ bpm: 92 }))).toBe('92')
    expect(formatarBpm(umSample({ bpm: 92, bpmEstimado: true }))).toBe('~92')
    expect(formatarBpm(umSample({ bpm: null }))).toBe('--')
  })

  it('conta samples de pastas indexados por uma versão anterior da análise', () => {
    const atual = umSample({ versaoAnalise: VERSAO_ANALISE })
    const antigo = umSample({ versaoAnalise: VERSAO_ANALISE - 1 })
    const semVersao = { ...umSample(), versaoAnalise: undefined } as unknown as typeof atual
    expect(samplesDesatualizados({ ...bib, samples: [atual] })).toBe(0)
    expect(samplesDesatualizados({ ...bib, samples: [atual, antigo, semVersao] })).toBe(2)
  })

  it('formata duração em m:ss', () => {
    expect(formatarDuracao(0.4)).toBe('0:00')
    expect(formatarDuracao(65.6)).toBe('1:06')
    expect(formatarDuracao(null)).toBe('--')
  })
})

describe('rotuloEscopoLocal', () => {
  it('oferece escopo restrito só em visões que mostram parte da biblioteca', () => {
    expect(rotuloEscopoLocal({ tipo: 'pasta', caminho: 'C:/Samples' })).toBe('Nesta pasta')
    expect(rotuloEscopoLocal({ tipo: 'colecao', id: 'x' })).toBe('Nesta coleção')
    expect(rotuloEscopoLocal({ tipo: 'favoritos' })).toBe('Em Curtidos')
    expect(rotuloEscopoLocal({ tipo: 'recentes' })).toBe('Em Recentes')
    expect(rotuloEscopoLocal({ tipo: 'todos' })).toBeNull()
    expect(rotuloEscopoLocal({ tipo: 'explorar' })).toBeNull()
  })
})
