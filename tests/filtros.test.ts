import { describe, it, expect } from 'vitest'
import {
  filtrarSamples,
  ordenarSamples,
  embaralhar,
  tagsMaisFrequentes,
  tonsDisponiveis,
  filtrosVazios,
  contarFiltrosAtivos
} from '@shared/filtros'
import { umSample } from './fabrica'

const kick = umSample({ nome: 'Kick_Punchy', tags: ['kick', 'trap'], categoria: 'drums' })
const baixo = umSample({
  nome: 'Bass_Loop_Ação',
  tags: ['bass', 'house'],
  categoria: 'bass',
  bpm: 124,
  tom: 'A min',
  tipo: 'loop',
  duracao: 8,
  modificadoEm: 3000
})
const vocal = umSample({
  nome: 'Vox_Hook',
  tags: ['vocals', 'trap'],
  categoria: 'vocals',
  bpm: 140,
  tom: 'C maj',
  tipo: 'loop',
  duracao: 4,
  modificadoEm: 2000
})
const todos = [kick, baixo, vocal]

describe('filtrarSamples', () => {
  it('sem filtros retorna todos', () => {
    expect(filtrarSamples(todos, filtrosVazios())).toEqual(todos)
  })

  it('busca exige todas as palavras em nome ou tags, ignorando acentos e caixa', () => {
    expect(filtrarSamples(todos, { ...filtrosVazios(), busca: 'acao' })).toEqual([baixo])
    expect(filtrarSamples(todos, { ...filtrosVazios(), busca: 'TRAP vox' })).toEqual([vocal])
    expect(filtrarSamples(todos, { ...filtrosVazios(), busca: 'trap house' })).toEqual([])
  })

  it('tags selecionadas precisam estar todas presentes', () => {
    expect(filtrarSamples(todos, { ...filtrosVazios(), tags: ['trap'] })).toEqual([kick, vocal])
    expect(filtrarSamples(todos, { ...filtrosVazios(), tags: ['trap', 'kick'] })).toEqual([kick])
  })

  it('filtra por instrumento (categoria), gênero, tom e tipo', () => {
    expect(filtrarSamples(todos, { ...filtrosVazios(), instrumento: 'bass' })).toEqual([baixo])
    expect(filtrarSamples(todos, { ...filtrosVazios(), genero: 'trap' })).toEqual([kick, vocal])
    expect(filtrarSamples(todos, { ...filtrosVazios(), tom: 'C maj' })).toEqual([vocal])
    expect(filtrarSamples(todos, { ...filtrosVazios(), tipo: 'one-shot' })).toEqual([kick])
  })

  it('faixa de bpm é inclusiva e exclui samples sem bpm', () => {
    expect(filtrarSamples(todos, { ...filtrosVazios(), bpmMin: 124, bpmMax: 140 })).toEqual([
      baixo,
      vocal
    ])
    expect(filtrarSamples(todos, { ...filtrosVazios(), bpmMin: 130 })).toEqual([vocal])
    expect(filtrarSamples(todos, { ...filtrosVazios(), bpmMax: 100 })).toEqual([])
  })
})

describe('contarFiltrosAtivos', () => {
  it('conta cada critério ativo, sem contar a busca', () => {
    expect(contarFiltrosAtivos(filtrosVazios())).toBe(0)
    expect(
      contarFiltrosAtivos({ ...filtrosVazios(), busca: 'x', tags: ['a', 'b'], bpmMin: 90, tipo: 'loop' })
    ).toBe(4)
  })
})

describe('ordenarSamples', () => {
  it('ordena por recentes (mais novo primeiro) sem alterar a lista original', () => {
    const copia = [...todos]
    expect(ordenarSamples(todos, 'recentes', 'desc').map((s) => s.id)).toEqual([
      baixo.id,
      vocal.id,
      kick.id
    ])
    expect(todos).toEqual(copia)
  })

  it('ordena por nome e inverte com direção', () => {
    expect(ordenarSamples(todos, 'nome', 'asc').map((s) => s.nome)).toEqual([
      'Bass_Loop_Ação',
      'Kick_Punchy',
      'Vox_Hook'
    ])
    expect(ordenarSamples(todos, 'nome', 'desc')[0].nome).toBe('Vox_Hook')
  })

  it('valores ausentes (bpm, tom) ficam sempre no fim', () => {
    expect(ordenarSamples(todos, 'bpm', 'asc').map((s) => s.bpm)).toEqual([124, 140, null])
    expect(ordenarSamples(todos, 'bpm', 'desc').map((s) => s.bpm)).toEqual([140, 124, null])
    expect(ordenarSamples(todos, 'tom', 'asc').map((s) => s.tom)).toEqual(['C maj', 'A min', null])
  })

  it('ordena por pasta (raiz + subpastas, sem diferenciar acentos/caixa) e, dentro dela, por nome', () => {
    const lista = [
      umSample({ id: 'p1', pastaRaiz: 'E:/Kits', pastaRelativa: 'Snares', nome: 'b' }),
      umSample({ id: 'p2', pastaRaiz: 'E:/Kits', pastaRelativa: 'Kicks', nome: 'z' }),
      umSample({ id: 'p3', pastaRaiz: 'E:/Kits', pastaRelativa: 'Snares', nome: 'a' }),
      umSample({ id: 'p4', pastaRaiz: 'E:/Kits', pastaRelativa: 'Áudio', nome: 'x' }),
      umSample({ id: 'p5', pastaRaiz: 'D:/Outros', pastaRelativa: '', nome: 'y' })
    ]
    expect(ordenarSamples(lista, 'pasta', 'asc').map((s) => s.id)).toEqual(['p5', 'p4', 'p2', 'p3', 'p1'])
    // decrescente inverte as pastas, mas mantém os nomes em ordem dentro de cada uma
    expect(ordenarSamples(lista, 'pasta', 'desc').map((s) => s.id)).toEqual(['p3', 'p1', 'p2', 'p4', 'p5'])
  })

  it('ordena por duração', () => {
    expect(ordenarSamples(todos, 'duracao', 'asc').map((s) => s.duracao)).toEqual([2, 4, 8])
  })
})

describe('embaralhar', () => {
  it('mantém os mesmos itens e é determinístico com o mesmo gerador', () => {
    const gerador = () => {
      let x = 0.3
      return () => (x = (x * 9301 + 49297) % 233280 / 233280)
    }
    const a = embaralhar(todos, gerador())
    const b = embaralhar(todos, gerador())
    expect(a).toEqual(b)
    expect([...a].sort((x, y) => x.id.localeCompare(y.id))).toEqual(
      [...todos].sort((x, y) => x.id.localeCompare(y.id))
    )
  })
})

describe('tagsMaisFrequentes', () => {
  it('conta e ordena por frequência, depois alfabética, respeitando o limite', () => {
    expect(tagsMaisFrequentes(todos, 3)).toEqual([
      { tag: 'trap', quantidade: 2 },
      { tag: 'bass', quantidade: 1 },
      { tag: 'house', quantidade: 1 }
    ])
  })
})

describe('tonsDisponiveis', () => {
  it('lista tons únicos em ordem musical (C, C#, D...), maior antes de menor', () => {
    const lista = [
      umSample({ tom: 'A min' }),
      umSample({ tom: 'C maj' }),
      umSample({ tom: 'C# min' }),
      umSample({ tom: 'C min' }),
      umSample({ tom: 'A min' }),
      umSample({ tom: null }),
      umSample({ tom: 'Bb' })
    ]
    expect(tonsDisponiveis(lista)).toEqual(['C maj', 'C min', 'C# min', 'A min', 'Bb'])
  })
})
