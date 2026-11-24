import { tagDaPalavra } from './analiseNome'
import type { Sample, TipoSample } from './tipos'

/** Critérios de filtragem da lista de samples. */
export interface Filtros {
  busca: string
  tags: string[]
  instrumento: string | null
  genero: string | null
  tom: string | null
  bpmMin: number | null
  bpmMax: number | null
  tipo: TipoSample | null
}

export type Ordenacao = 'recentes' | 'nome' | 'bpm' | 'duracao' | 'tom' | 'pasta' | 'kit'
export type Direcao = 'asc' | 'desc'

/** Filtros sem nenhum critério ativo. */
export function filtrosVazios(): Filtros {
  return { busca: '', tags: [], instrumento: null, genero: null, tom: null, bpmMin: null, bpmMax: null, tipo: null }
}

/** Remove acentos e passa para minúsculas, para comparação de texto. */
export function normalizarTexto(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** Quantidade de critérios ativos (cada tag conta um; a busca não conta). */
export function contarFiltrosAtivos(f: Filtros): number {
  let n = f.tags.length
  for (const v of [f.instrumento, f.genero, f.tom, f.tipo]) {
    if (v !== null) {
      n++
    }
  }
  if (f.bpmMin !== null || f.bpmMax !== null) {
    n++
  }
  return n
}

/**
 * Uma palavra da busca: casa por trecho do texto, pela tag que ela gera no dicionário
 * ("snares", "snr" → tag "snare") ou, no plural simples, pelo singular ("loops" → "loop").
 */
interface PalavraBusca {
  texto: string
  tag: string | null
  singular: string | null
}

function prepararPalavra(p: string): PalavraBusca {
  const singular = p.length > 3 && /[sz]$/.test(p) ? p.slice(0, -1) : null
  return { texto: p, tag: tagDaPalavra(p) ?? (singular ? tagDaPalavra(singular) : null), singular }
}

/** Aplica todos os critérios; a ordem original é preservada. */
export function filtrarSamples(samples: Sample[], f: Filtros): Sample[] {
  const palavras = normalizarTexto(f.busca)
    .split(/\s+/)
    .filter((p) => p.length > 0)
    .map(prepararPalavra)
  const usaBpm = f.bpmMin !== null || f.bpmMax !== null
  return samples.filter((s) => {
    if (palavras.length > 0) {
      const alvo = normalizarTexto(`${s.nome} ${s.tags.join(' ')} ${s.kit ?? ''}`)
      const casa = (p: PalavraBusca): boolean =>
        alvo.includes(p.texto) || (p.tag !== null && s.tags.includes(p.tag)) || (p.singular !== null && alvo.includes(p.singular))
      if (!palavras.every(casa)) {
        return false
      }
    }
    if (f.tags.length > 0 && !f.tags.every((t) => s.tags.includes(t))) {
      return false
    }
    if (f.instrumento !== null && s.categoria !== f.instrumento) {
      return false
    }
    if (f.genero !== null && !s.tags.includes(f.genero)) {
      return false
    }
    if (f.tom !== null && s.tom !== f.tom) {
      return false
    }
    if (f.tipo !== null && s.tipo !== f.tipo) {
      return false
    }
    if (usaBpm) {
      if (s.bpm === null) {
        return false
      }
      if (f.bpmMin !== null && s.bpm < f.bpmMin) {
        return false
      }
      if (f.bpmMax !== null && s.bpm > f.bpmMax) {
        return false
      }
    }
    return true
  })
}

const NOTAS = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B']

/** Posição musical de um tom (C maj < C min < C# maj ...); desconhecidos no fim. */
function posicaoDoTom(tom: string): number {
  const [nota, modo] = tom.split(' ')
  const i = NOTAS.indexOf(nota)
  const base = i < 0 ? 1000 : i * 3
  return base + (modo === 'maj' ? 0 : modo === 'min' ? 1 : 2)
}

/**
 * Ordena uma cópia da lista; valores ausentes ficam sempre no fim.
 * Por pasta: a direção vale para as pastas e, dentro de cada uma, os nomes ficam em ordem crescente.
 */
export function ordenarSamples(samples: Sample[], ordem: Ordenacao, direcao: Direcao): Sample[] {
  const sinal = direcao === 'asc' ? 1 : -1
  if (ordem === 'pasta') {
    const chavePasta = new Map(samples.map((s) => [s, normalizarTexto(`${s.pastaRaiz}/${s.pastaRelativa}`)]))
    return [...samples].sort(
      (a, b) =>
        sinal * (chavePasta.get(a) as string).localeCompare(chavePasta.get(b) as string) ||
        normalizarTexto(a.nome).localeCompare(normalizarTexto(b.nome))
    )
  }
  const chave = (s: Sample): number | string | null => {
    switch (ordem) {
      case 'recentes':
        return s.modificadoEm
      case 'nome':
        return normalizarTexto(s.nome)
      case 'bpm':
        return s.bpm
      case 'duracao':
        return s.duracao
      case 'tom':
        return s.tom === null ? null : posicaoDoTom(s.tom)
      case 'kit':
        return s.kit ? normalizarTexto(s.kit) : null
    }
  }
  return [...samples].sort((a, b) => {
    const ka = chave(a)
    const kb = chave(b)
    if (ka === null && kb === null) {
      return 0
    }
    if (ka === null) {
      return 1
    }
    if (kb === null) {
      return -1
    }
    const cmp = typeof ka === 'string' ? ka.localeCompare(kb as string) : ka - (kb as number)
    // Dentro do mesmo kit, nomes em ordem crescente
    if (cmp === 0 && ordem === 'kit') {
      return normalizarTexto(a.nome).localeCompare(normalizarTexto(b.nome))
    }
    return cmp * sinal
  })
}

/** Embaralha uma cópia (Fisher–Yates) usando o gerador informado. */
export function embaralhar<T>(itens: T[], aleatorio: () => number = Math.random): T[] {
  const r = [...itens]
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(aleatorio() * (i + 1))
    ;[r[i], r[j]] = [r[j], r[i]]
  }
  return r
}

/** Tags mais frequentes, por quantidade decrescente e depois em ordem alfabética. */
export function tagsMaisFrequentes(samples: Sample[], limite: number): { tag: string; quantidade: number }[] {
  const contagem = new Map<string, number>()
  for (const s of samples) {
    for (const t of s.tags) {
      contagem.set(t, (contagem.get(t) ?? 0) + 1)
    }
  }
  return [...contagem.entries()]
    .map(([tag, quantidade]) => ({ tag, quantidade }))
    .sort((a, b) => b.quantidade - a.quantidade || a.tag.localeCompare(b.tag))
    .slice(0, limite)
}

/** Tons presentes na lista, únicos e em ordem musical. */
export function tonsDisponiveis(samples: Sample[]): string[] {
  const unicos = new Set<string>()
  for (const s of samples) {
    if (s.tom !== null) {
      unicos.add(s.tom)
    }
  }
  return [...unicos].sort((a, b) => posicaoDoTom(a) - posicaoDoTom(b))
}
