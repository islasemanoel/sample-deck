/**
 * Ajustes do "projeto" (a música em que o usuário está trabalhando): tom e andamento.
 * A pré-escuta transpõe cada sample para o tom do projeto e estica/comprime loops
 * para o BPM do projeto. Lógica pura, testável em Node.
 */
import { consensoDosTons, type ResultadoNota, type ResultadoTom } from './analiseTom'
import { nomeDaClasse } from './nota'
import { LeitorComTom, normalizarTom } from './pitch'
import type { Sample } from './tipos'

const NOMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const CLASSE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

/** Tom musical: tônica (0 = C ... 11 = B) e modo (null quando o nome não diz). */
export interface Tonalidade {
  tonica: number
  menor: boolean | null
}

/** Limites do BPM do projeto e da razão de velocidade aplicada aos loops. */
export const BPM_PROJETO_MIN = 40
export const BPM_PROJETO_MAX = 300
export const VELOCIDADE_MIN = 0.5
export const VELOCIDADE_MAX = 2

/** Os 24 tons oferecidos na escolha do tom do projeto ("C maj", "C min", "C# maj"...). */
export const TONS_PROJETO: string[] = NOMES.flatMap((n) => [`${n} maj`, `${n} min`])

/**
 * Lê um tom no formato da biblioteca ("A min", "C# maj", "Bb", "F#", "Am", "Ebm").
 * @returns null se o texto não for um tom
 */
export function lerTonalidade(tom: string | null | undefined): Tonalidade | null {
  if (!tom) {
    return null
  }
  const m = /^\s*([A-Ga-g])(#|b|♯|♭)?\s*(maj(?:or)?|min(?:or)?|m)?\s*$/i.exec(tom)
  if (!m) {
    return null
  }
  const acidente = m[2] === '#' || m[2] === '♯' ? 1 : m[2] ? -1 : 0
  const modo = (m[3] ?? '').toLowerCase()
  return {
    tonica: (CLASSE[m[1].toUpperCase()] + acidente + 12) % 12,
    menor: modo ? !modo.startsWith('maj') : null
  }
}

/** Nome curto de um tom: "A min" → "Am", "C# maj" → "C#". */
export function formatarTonalidade(t: Tonalidade): string {
  return `${NOMES[t.tonica]}${t.menor ? 'm' : ''}`
}

/**
 * Semitons para levar um sample do seu tom ao tom do projeto, pelo menor caminho
 * (de −6 a +5, preferindo descer, que soa mais natural). Tons relativos
 * (A menor e C maior) usam as mesmas notas, então não precisam de transposição.
 * @returns null se o tom do sample ou do projeto for desconhecido
 */
export function transposicaoParaProjeto(tomSample: string | null, tomProjeto: string | null): number | null {
  const s = lerTonalidade(tomSample)
  const p = lerTonalidade(tomProjeto)
  if (!s || !p) {
    return null
  }
  // Com os dois modos conhecidos e diferentes, compara pelas tônicas maiores relativas
  const relativa = (t: Tonalidade): number => (t.menor ? t.tonica + 3 : t.tonica)
  const comparaRelativas = s.menor !== null && p.menor !== null && s.menor !== p.menor
  const origem = comparaRelativas ? relativa(s) : s.tonica
  const alvo = comparaRelativas ? relativa(p) : p.tonica
  let d = (((alvo - origem) % 12) + 12) % 12
  if (d >= 6) {
    d -= 12
  }
  return d
}

/**
 * Razão de velocidade para tocar um loop de `bpmSample` no andamento `bpmProjeto`
 * (2 = duas vezes mais rápido). Considera meio tempo e tempo dobrado (um loop de 70 BPM
 * num projeto de 140 toca na velocidade original) e limita entre 0,5 e 2.
 * @returns null se algum BPM for desconhecido
 */
export function velocidadeParaProjeto(bpmSample: number | null, bpmProjeto: number | null): number | null {
  if (!bpmSample || !bpmProjeto || !(bpmSample > 0) || !(bpmProjeto > 0)) {
    return null
  }
  let melhor = bpmProjeto / bpmSample
  for (const fator of [0.5, 2]) {
    const r = bpmProjeto / (bpmSample * fator)
    if (Math.abs(Math.log(r)) < Math.abs(Math.log(melhor)) - 1e-9) {
      melhor = r
    }
  }
  return Math.min(VELOCIDADE_MAX, Math.max(VELOCIDADE_MIN, melhor))
}

/** Categorias sem altura definida: sem tom no nome, não são transpostas nem analisadas. */
const CATEGORIAS_SEM_TOM = new Set(['drums', 'percussion'])

/** Bateria/percussão sem tom no nome (um "Kick_F" com tom no nome é transposto normalmente). */
export function ehPercussaoSemTom(s: Pick<Sample, 'tom' | 'categoria'>): boolean {
  return !s.tom && CATEGORIAS_SEM_TOM.has(s.categoria)
}

/** O tom do sample precisa ser detectado pelo áudio para ajustá-lo ao projeto. */
export function precisaDetectarTom(s: Pick<Sample, 'tom' | 'categoria'>): boolean {
  return !s.tom && !ehPercussaoSemTom(s)
}

/** Mínimo de métodos concordando (entre os que responderam) para aceitar um tom detectado. */
const VOTOS_MIN_TOM = 2

/**
 * Tom aceito de uma análise de tom ("A min"), quando ao menos 2 métodos e metade dos que
 * responderam concordam; senão null (desconhecido).
 */
export function tomDoResultado(r: ResultadoTom): string | null {
  const c = consensoDosTons(r.estimativas)
  if (!c || c.votos < VOTOS_MIN_TOM || c.votos * 2 < c.total) {
    return null
  }
  return `${nomeDaClasse(c.tonica)} ${c.menor ? 'min' : 'maj'}`
}

/** Nota aceita de uma análise de nota de one-shot ("F#", sem modo), ou null se não for confiável. */
export function tomDaNota(r: ResultadoNota): string | null {
  return r.confiavel && r.classe !== null ? nomeDaClasse(r.classe) : null
}

/** Situação de um sample diante do projeto, para o aviso no player. */
export type SituacaoTom =
  | { tipo: 'desligado' }
  | { tipo: 'conhecido'; tom: string; detectado: boolean }
  | { tipo: 'percussao' }
  | { tipo: 'detectando' }
  /** Ainda não analisado (é detectado quando tocar). */
  | { tipo: 'pendente' }
  | { tipo: 'desconhecido' }

export type SituacaoBpm = { tipo: 'desligado' } | { tipo: 'aplicado'; velocidade: number } | { tipo: 'one-shot' } | { tipo: 'desconhecido' }

/** Situação do andamento de um sample no BPM do projeto. */
export function situacaoBpm(s: Pick<Sample, 'tipo' | 'bpm'>, bpmProjeto: number | null): SituacaoBpm {
  if (!bpmProjeto) {
    return { tipo: 'desligado' }
  }
  if (s.tipo !== 'loop') {
    return { tipo: 'one-shot' }
  }
  const v = velocidadeParaProjeto(s.bpm, bpmProjeto)
  return v === null ? { tipo: 'desconhecido' } : { tipo: 'aplicado', velocidade: v }
}

/** BPM do projeto válido (arredondado a 0,1) ou null. */
export function normalizarBpmProjeto(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : v
  if (typeof n !== 'number' || !Number.isFinite(n) || n < BPM_PROJETO_MIN || n > BPM_PROJETO_MAX) {
    return null
  }
  return Math.round(n * 10) / 10
}

/** Ajustes aplicados ao áudio de um sample na pré-escuta (e ao arrastá-lo, se a opção estiver ligada). */
export interface AjustesAudio {
  /** Semitons (−12 a +12). */
  semitons: number
  /** Razão de velocidade (1 = original), sem mudar o tom. */
  velocidade: number
  /** Tocar de trás para frente. */
  reverso: boolean
}

/** Verdadeiro se os ajustes mudam o áudio. */
export function alteraAudioAjustes(a: AjustesAudio): boolean {
  return normalizarTom(a.semitons) !== 0 || Math.abs(a.velocidade - 1) > 1e-6 || a.reverso
}

/** Cópias invertidas no tempo dos canais. */
export function inverterCanais(canais: Float32Array[]): Float32Array[] {
  return canais.map((c) => c.slice().reverse())
}

/**
 * Gera o áudio como a pré-escuta o toca: invertido (se for o caso), com o tom e a
 * velocidade aplicados pelo mesmo processador do worklet.
 */
export function renderizarComAjustes(canais: Float32Array[], a: AjustesAudio): Float32Array[] {
  const origem = a.reverso ? inverterCanais(canais) : canais
  if (normalizarTom(a.semitons) === 0 && Math.abs(a.velocidade - 1) <= 1e-6) {
    return origem
  }
  const tamanho = Math.max(1, Math.round((origem[0]?.length ?? 0) / a.velocidade))
  const saida = origem.map(() => new Float32Array(tamanho))
  new LeitorComTom(origem, 0, false, a.semitons, a.velocidade).ler(saida, tamanho)
  return saida
}

/** Sufixo do nome do arquivo gerado com os ajustes: " (+3 st, 140 BPM, reverso)". */
export function sufixoAjustes(a: AjustesAudio, bpmFinal: number | null): string {
  const partes: string[] = []
  const st = normalizarTom(a.semitons)
  if (st !== 0) {
    partes.push(`${st > 0 ? '+' : ''}${st} st`)
  }
  if (Math.abs(a.velocidade - 1) > 1e-6) {
    partes.push(bpmFinal ? `${Math.round(bpmFinal * 10) / 10} BPM` : `x${a.velocidade.toFixed(2)}`)
  }
  if (a.reverso) {
    partes.push('reverso')
  }
  return partes.length > 0 ? ` (${partes.join(', ')})` : ''
}
