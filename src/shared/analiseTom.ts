/**
 * Análise de tom/nota sob demanda (menu "Detectar tom"). Só exibe o resultado: nada é gravado
 * na biblioteca. Aqui ficam as regras e os cálculos puros; a medição está em src/main/detectorTom.ts.
 */
import { nomeDaClasse } from './nota'
import type { Sample } from './tipos'

/** Aba aberta primeiro: nota (one-shots curtos, 808, kick, snare) ou tom (o resto). */
export type ModoAnalise = 'nota' | 'tom'

/** Tags que sempre abrem a análise de nota. */
const TAGS_DE_NOTA = ['808', 'kick', 'snare']

/** One-shots abaixo desta duração (s) abrem a análise de nota. */
export const DURACAO_MAX_NOTA = 2

/** Escolhe a aba inicial da janela de análise. */
export function modoDeAnalise(s: Pick<Sample, 'tipo' | 'duracao' | 'tags'>): ModoAnalise {
  if (s.tags.some((t) => TAGS_DE_NOTA.includes(t))) {
    return 'nota'
  }
  if (s.tipo === 'one-shot' && s.duracao !== null && s.duracao < DURACAO_MAX_NOTA) {
    return 'nota'
  }
  return 'tom'
}

/** Como medir a nota: kick pula a queda de altura do ataque; snare é só aproximada. */
export type PecaNota = 'kick' | 'snare' | 'normal'

export function pecaDoSample(s: Pick<Sample, 'tags'>): PecaNota {
  if (s.tags.includes('kick')) {
    return 'kick'
  }
  if (s.tags.includes('snare')) {
    return 'snare'
  }
  return 'normal'
}

/** Métodos de detecção de tom exibidos, na ordem da avaliação (melhor primeiro). */
export const METODOS_TOM = [
  { id: 'bgate', nome: 'Essentia · bgate', mirex: 53, exato: 39 },
  { id: 'braw', nome: 'Essentia · braw', mirex: 53, exato: 39 },
  { id: 'edma', nome: 'Essentia · edma', mirex: 51, exato: 37 },
  { id: 'keyfinder', nome: 'libKeyFinder (Mixxx)', mirex: 45, exato: 32 }
] as const

export type IdMetodoTom = (typeof METODOS_TOM)[number]['id']

/** Tom estimado por um método (null se não respondeu). */
export interface TomEstimado {
  metodo: IdMetodoTom
  /** Classe da tônica (0 = C ... 11 = B). */
  tonica: number
  menor: boolean
  /** Força informada pelo método (0–1), quando houver. */
  forca: number | null
}

/** Resultado da análise de tom de um sample. */
export interface ResultadoTom {
  estimativas: Array<TomEstimado | { metodo: IdMetodoTom; erro: string }>
  /** Segundos de áudio analisados. */
  segundos: number
}

/** Resultado da análise de nota (PitchYin, quadro a quadro, com votação). */
export interface ResultadoNota {
  /** Classe vencedora; null se não houve alturas suficientes. */
  classe: number | null
  /** Fração dos quadros que votaram na classe vencedora (0–1). */
  consenso: number
  /** Quadros com altura confiável. */
  quadros: number
  /** Mediana (Hz) das alturas da classe vencedora; dá a oitava e o desvio em cents. */
  hz: number | null
  /** Passou nos critérios calibrados (consenso ≥ 0,7). */
  confiavel: boolean
  peca: PecaNota
}

/** "A menor", "C# maior". */
export function nomeDoTom(tonica: number, menor: boolean): string {
  return `${nomeDaClasse(tonica)} ${menor ? 'menor' : 'maior'}`
}

const CLASSES: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6,
  G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11
}

/**
 * Lê a resposta textual de um detector: "A Minor", "Db Major" (libKeyFinder) ou tônica + "minor"
 * (Essentia). @returns null para "Silence" ou textos desconhecidos
 */
export function lerTom(tonica: string, escala: string): { tonica: number; menor: boolean } | null {
  const c = CLASSES[tonica.trim()]
  const e = escala.trim().toLowerCase()
  if (c === undefined || (e !== 'major' && e !== 'minor')) {
    return null
  }
  return { tonica: c, menor: e === 'minor' }
}

/**
 * Agrupa as estimativas iguais e devolve o tom mais votado.
 * @returns tom, votos e total de métodos que responderam; null se nenhum respondeu
 */
export function consensoDosTons(
  estimativas: ResultadoTom['estimativas']
): { tonica: number; menor: boolean; votos: number; total: number } | null {
  const validas = estimativas.filter((e): e is TomEstimado => 'tonica' in e)
  let melhor: { tonica: number; menor: boolean; votos: number } | null = null
  for (const e of validas) {
    const votos = validas.filter((o) => o.tonica === e.tonica && o.menor === e.menor).length
    if (!melhor || votos > melhor.votos) {
      melhor = { tonica: e.tonica, menor: e.menor, votos }
    }
  }
  return melhor && { ...melhor, total: validas.length }
}

/** Frequência (Hz) de uma nota MIDI. */
export function frequenciaMidi(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

/** Nota mais próxima de uma frequência: nome com oitava ("F#1") e desvio em cents (−50 a +50). */
export function notaDaFrequencia(hz: number): { nome: string; midi: number; cents: number } {
  const exato = 69 + 12 * Math.log2(hz / 440)
  const midi = Math.round(exato)
  const cents = Math.round((exato - midi) * 100)
  return { nome: `${nomeDaClasse(midi)}${Math.floor(midi / 12) - 1}`, midi, cents }
}

/**
 * Frequências da referência de um tom: tríade da tônica (maior ou menor) na região média,
 * com a tônica uma oitava abaixo para firmar o centro.
 */
export function acordeDeReferencia(tonica: number, menor: boolean): number[] {
  const raiz = 48 + tonica // C3...B3
  return [raiz - 12, raiz, raiz + (menor ? 3 : 4), raiz + 7].map(frequenciaMidi)
}
