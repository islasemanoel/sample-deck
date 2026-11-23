import { embaralhar, ordenarSamples } from '@shared/filtros'
import { VERSAO_ANALISE, type Biblioteca, type Sample } from '@shared/tipos'

/** Qual lista está aberta na área central. */
export type Visao =
  | { tipo: 'explorar' }
  | { tipo: 'todos' }
  | { tipo: 'todasPastas' }
  | { tipo: 'recentes' }
  | { tipo: 'favoritos' }
  | { tipo: 'colecoes' }
  | { tipo: 'colecao'; id: string }
  | { tipo: 'pasta'; caminho: string }

/** Gerador pseudoaleatório reproduzível (mulberry32) a partir de uma semente. */
export function geradorComSemente(semente: number): () => number {
  let s = semente >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Samples de uma visão, na ordem "padrão" dela (antes de filtros e ordenação escolhida).
 * @param semente usada para embaralhar a visão "Explorar"
 * @param limiteRecentes quantos itens a visão "Recentes" mostra
 */
export function samplesDaVisao(b: Biblioteca, v: Visao, semente: number, limiteRecentes = 200): Sample[] {
  const porId = new Map(b.samples.map((s) => [s.id, s]))
  const porIds = (ids: string[]): Sample[] => ids.map((id) => porId.get(id)).filter((s): s is Sample => !!s)
  switch (v.tipo) {
    case 'explorar':
      return embaralhar(b.samples, geradorComSemente(semente))
    case 'todos':
      return ordenarSamples(b.samples, 'recentes', 'desc')
    case 'todasPastas':
      return ordenarSamples(b.samples, 'pasta', 'asc')
    case 'recentes':
      return ordenarSamples(b.samples, 'recentes', 'desc').slice(0, limiteRecentes)
    case 'favoritos':
      return porIds([...b.favoritos].reverse())
    case 'colecao':
      return porIds(b.colecoes.find((c) => c.id === v.id)?.sampleIds ?? [])
    case 'pasta':
      return b.samples.filter((s) => s.pastaRaiz === v.caminho)
    case 'colecoes':
      return []
  }
}

/**
 * Rótulo do escopo da busca numa visão que mostra só parte da biblioteca ("Nesta pasta"...),
 * ou null quando a visão já abrange tudo e não faz sentido alternar para "todas as pastas".
 */
export function rotuloEscopoLocal(v: Visao): string | null {
  switch (v.tipo) {
    case 'pasta':
      return 'Nesta pasta'
    case 'colecao':
      return 'Nesta coleção'
    case 'favoritos':
      return 'Em Curtidos'
    case 'recentes':
      return 'Em Recentes'
    default:
      return null
  }
}

/** Compara duas visões (para destacar o item ativo na barra lateral). */
export function mesmaVisao(a: Visao, b: Visao): boolean {
  if (a.tipo !== b.tipo) {
    return false
  }
  if (a.tipo === 'colecao' && b.tipo === 'colecao') {
    return a.id === b.id
  }
  if (a.tipo === 'pasta' && b.tipo === 'pasta') {
    return a.caminho === b.caminho
  }
  return true
}

/** Nome curto de uma pasta a partir do caminho completo. */
export function nomeDaPasta(caminho: string): string {
  const partes = caminho.split(/[\\/]/).filter((p) => p.length > 0)
  return partes[partes.length - 1] ?? caminho
}

/** Ordem das pastas na barra lateral: como foram adicionadas ou pelo nome. */
export type OrdemPastas = 'inclusao' | 'alfabetica'

/** Pastas na ordem escolhida (alfabética pelo nome exibido, ignorando maiúsculas/acentos e com números em ordem natural). */
export function ordenarPastas(pastas: string[], ordem: OrdemPastas): string[] {
  if (ordem === 'inclusao') {
    return pastas
  }
  const comparar = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true }).compare
  return [...pastas].sort((a, b) => comparar(nomeDaPasta(a), nomeDaPasta(b)) || comparar(a, b))
}

/** BPM para exibição: "~92" quando estimado pelo áudio, "--" quando desconhecido. */
export function formatarBpm(s: Sample): string {
  if (s.bpm === null) {
    return '--'
  }
  return s.bpmEstimado ? `~${s.bpm}` : String(s.bpm)
}

/** Quantos samples foram indexados por uma versão anterior da análise (precisam reescanear). */
export function samplesDesatualizados(b: Biblioteca): number {
  return b.samples.reduce((n, s) => n + (s.versaoAnalise === VERSAO_ANALISE ? 0 : 1), 0)
}

/** Formata segundos como m:ss. */
export function formatarDuracao(s: number | null): string {
  if (s === null) {
    return '--'
  }
  const total = Math.round(s)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}
