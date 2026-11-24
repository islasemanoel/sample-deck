import { LeitorComTom, normalizarTom } from './pitch'

export type ModoPad = 'oneshot' | 'gate' | 'loop'

export const MODOS_PAD: { modo: ModoPad; rotulo: string; dica: string }[] = [
  { modo: 'oneshot', rotulo: 'One-shot', dica: 'Toca o trecho inteiro a cada toque' },
  { modo: 'gate', rotulo: 'Gate', dica: 'Toca só enquanto a tecla está pressionada' },
  { modo: 'loop', rotulo: 'Loop', dica: 'Liga/desliga em loop a cada toque' }
]

/** Ajustes de um pad (pertencem ao pad, não ao sample). */
export interface ConfigPad {
  modo: ModoPad
  /** 0 a 1. */
  volume: number
  /** -1 (esquerda) a 1 (direita). */
  pan: number
  /** Semitons (-12 a 12); muda só o tom, sem alterar a duração. */
  tom: number
  /** Início do trecho tocado, em segundos do arquivo. */
  inicio: number
  /** Fim do trecho tocado, em segundos do arquivo; null = até o fim do arquivo. */
  fim: number | null
  /**
   * Grupo de corte (1 a GRUPOS_CORTE); null = sem grupo. Tocar um pad silencia os
   * outros pads do mesmo grupo, como o hi-hat aberto/fechado numa MPC.
   */
  grupo: number | null
  /** Toca o trecho de trás para frente. */
  reverso: boolean
}

/** Quantidade de grupos de corte disponíveis. */
export const GRUPOS_CORTE = 4

/** Letra do grupo de corte (1 → "A"). */
export function letraDoGrupo(grupo: number): string {
  return String.fromCharCode(64 + grupo)
}

/** Índices dos outros pads do mesmo grupo de corte do pad `indice` (que devem parar quando ele toca). */
export function padsACortar(configs: ConfigPad[], indice: number): number[] {
  const g = configs[indice]?.grupo ?? null
  if (g === null) {
    return []
  }
  return configs.flatMap((c, i) => (i !== indice && c.grupo === g ? [i] : []))
}

export const CONFIG_PADRAO: ConfigPad = { modo: 'oneshot', volume: 1, pan: 0, tom: 0, inicio: 0, fim: null, grupo: null, reverso: false }

/** Limite de sanidade para posições salvas (24 h). */
const MAX_SEGUNDOS = 24 * 3600

const limitar = (v: number, min: number, max: number, padrao: number): number =>
  Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : padrao

/** Valida uma configuração vinda do armazenamento (ou de um slider). */
export function normalizarConfigPad(c: Partial<ConfigPad> | null | undefined): ConfigPad {
  const modo: ModoPad = c?.modo === 'gate' || c?.modo === 'loop' ? c.modo : 'oneshot'
  const inicio = limitar(typeof c?.inicio === 'number' ? c.inicio : 0, 0, MAX_SEGUNDOS, 0)
  const fimBruto = c?.fim
  const fim = typeof fimBruto === 'number' && Number.isFinite(fimBruto) && fimBruto > inicio ? Math.min(fimBruto, MAX_SEGUNDOS) : null
  const g = c?.grupo
  const grupo = typeof g === 'number' && Number.isInteger(g) && g >= 1 && g <= GRUPOS_CORTE ? g : null
  return {
    modo,
    volume: limitar(c?.volume ?? 1, 0, 1, 1),
    pan: limitar(c?.pan ?? 0, -1, 1, 0),
    tom: Math.round(limitar(c?.tom ?? 0, -12, 12, 0) * 100) / 100 + 0,
    inicio,
    fim,
    grupo,
    reverso: c?.reverso === true
  }
}

/** Verdadeiro se o pad toca só parte do arquivo. */
export function temCorte(c: ConfigPad): boolean {
  return c.inicio > 0 || c.fim !== null
}

/**
 * Trecho no áudio invertido no tempo: o que vai de `inicio` a `fim` no arquivo fica em
 * [duracao - fim, duracao - inicio] na cópia invertida.
 */
export function trechoInvertido(t: { inicio: number; fim: number }, duracao: number): { inicio: number; fim: number } {
  return { inicio: Math.max(0, duracao - t.fim), fim: Math.min(duracao, duracao - t.inicio) }
}

/**
 * Trecho efetivamente tocado, ajustado à duração real do áudio: sempre com
 * pelo menos uma amostra e dentro do arquivo.
 */
export function trechoDoPad(c: Pick<ConfigPad, 'inicio' | 'fim'>, duracao: number, taxa: number): { inicio: number; fim: number } {
  const umaAmostra = 1 / taxa
  const inicio = Math.max(0, Math.min(c.inicio, duracao - umaAmostra))
  let fim = c.fim === null ? duracao : Math.min(c.fim, duracao)
  if (fim <= inicio) {
    fim = Math.min(duracao, inicio + umaAmostra)
  }
  return { inicio, fim }
}

/**
 * Tempo legível com a precisão pedida: "0.250", "12.5", "1:05.300".
 * `casas` é o número de casas decimais dos segundos.
 */
export function formatarTempo(segundos: number, casas = 3): string {
  const s = Math.max(0, segundos)
  if (Number(s.toFixed(casas)) < 60) {
    return s.toFixed(casas)
  }
  const min = Math.floor(s / 60)
  const resto = s - min * 60
  const txt = resto.toFixed(casas)
  // "5.000" vira "05.000"; trata o arredondamento que chega a 60
  if (Number(txt) >= 60) {
    return formatarTempo((min + 1) * 60, casas)
  }
  const [inteiro, frac] = txt.split('.')
  return `${min}:${inteiro.padStart(2, '0')}${frac !== undefined ? `.${frac}` : ''}`
}

/** Duração curta com unidade adequada: "0.42 ms", "125.0 ms", "2.350 s", "1:12.000". */
export function formatarDuracao(segundos: number): string {
  if (segundos < 0.01) {
    return `${(segundos * 1000).toFixed(2)} ms`
  }
  if (segundos < 1) {
    return `${(segundos * 1000).toFixed(1)} ms`
  }
  return segundos < 60 ? `${segundos.toFixed(3)} s` : formatarTempo(segundos)
}

/**
 * Lê um tempo digitado: "1.25", "1,25", "1.25s", "250ms", "1:05.3".
 * Retorna segundos, ou null se o texto não for um tempo válido.
 */
export function lerTempo(texto: string): number | null {
  const t = texto.trim().toLowerCase().replace(/,/g, '.').replace(/\s+/g, '')
  let m = /^(\d+(?:\.\d*)?|\.\d+)ms$/.exec(t)
  if (m) {
    return Number(m[1]) / 1000
  }
  m = /^(\d+):(\d+(?:\.\d*)?)s?$/.exec(t)
  if (m) {
    return Number(m[1]) * 60 + Number(m[2])
  }
  m = /^(\d+(?:\.\d*)?|\.\d+)s?$/.exec(t)
  return m ? Number(m[1]) : null
}

/** Verdadeiro se o pad toca o arquivo de um jeito diferente do original (trecho, volume, pan, tom ou reverso). */
export function alteraAudio(c: ConfigPad): boolean {
  return temCorte(c) || c.volume !== 1 || c.pan !== 0 || c.tom !== 0 || c.reverso
}

/**
 * Gera o áudio exatamente como o pad o toca: só o trecho (de trás para frente, se reverso), com o tom (sem mudar a
 * duração, como no disparo), o volume e o pan (mesma lei de pan do StereoPannerNode).
 * Áudio mono sem pan continua mono; com pan vira estéreo.
 * @param canais um Float32Array por canal (mesmo tamanho)
 */
export function renderizarPad(canais: Float32Array[], taxa: number, c: ConfigPad): Float32Array[] {
  const duracao = canais[0].length / taxa
  const { inicio, fim } = trechoDoPad(c, duracao, taxa)
  const a = Math.round(inicio * taxa)
  const b = Math.max(a + 1, Math.min(canais[0].length, Math.round(fim * taxa)))
  const n = b - a

  // Trecho (invertido, no reverso) com o tom (mesmo processador do disparo) e o volume aplicado
  const trechos = canais.map(() => new Float32Array(n))
  new LeitorComTom(
    canais.map((canal) => (c.reverso ? canal.slice(a, b).reverse() : canal.subarray(a, b))),
    0,
    false,
    normalizarTom(c.tom)
  ).ler(trechos, n)
  if (c.volume !== 1) {
    for (const t of trechos) {
      for (let i = 0; i < n; i++) {
        t[i] *= c.volume
      }
    }
  }

  if (c.pan === 0) {
    return trechos
  }
  if (trechos.length === 1) {
    const x = (c.pan + 1) / 2
    const gE = Math.cos((x * Math.PI) / 2)
    const gD = Math.sin((x * Math.PI) / 2)
    return [trechos[0].map((v) => v * gE), trechos[0].map((v) => v * gD)]
  }
  const [e, d] = trechos
  const esq = new Float32Array(n)
  const dir = new Float32Array(n)
  if (c.pan < 0) {
    const x = c.pan + 1
    const gC = Math.cos((x * Math.PI) / 2)
    const gS = Math.sin((x * Math.PI) / 2)
    for (let i = 0; i < n; i++) {
      esq[i] = e[i] + d[i] * gC
      dir[i] = d[i] * gS
    }
  } else {
    const x = c.pan
    const gC = Math.cos((x * Math.PI) / 2)
    const gS = Math.sin((x * Math.PI) / 2)
    for (let i = 0; i < n; i++) {
      esq[i] = e[i] * gC
      dir[i] = d[i] + e[i] * gS
    }
  }
  return [esq, dir]
}

/** Nome de arquivo válido no Windows/macOS a partir de um texto qualquer (sem pastas nem caracteres proibidos). */
export function nomeArquivoSeguro(nome: string): string {
  const base = nome.split(/[\\/]/).pop() ?? ''
  const limpo = Array.from(base, (ch) => (ch.charCodeAt(0) < 32 || '<>:"|?*'.includes(ch) ? '_' : ch))
    .join('')
    .trim()
    .replace(/[. ]+$/, '')
    .slice(0, 120)
  return limpo || 'pad'
}
