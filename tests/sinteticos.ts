/**
 * Geradores de áudio sintético para testes de detecção de BPM.
 */

/** Ruído determinístico em [-1, 1]. */
export function geradorRuido(semente = 1): () => number {
  let s = semente
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return (s / 0x7fffffff) * 2 - 1
  }
}

export interface OpcoesBatida {
  /** Compassos de 4 tempos. */
  compassos: number
  taxa?: number
  /** Silêncio antes da primeira batida (s): loop "mal cortado". */
  atrasoInicial?: number
  /** Cauda decaindo após o fim (s), como um reverb. */
  cauda?: number
  /** Hi-hat em colcheias (2), semicolcheias (4) ou nenhum (0). */
  hats?: 0 | 2 | 4
  /** Kick em todos os tempos (house) em vez de 1 e 3. */
  quatroNoChao?: boolean
}

/** Gera uma levada de bateria (kick, snare nos tempos 2 e 4, hats) no BPM pedido. */
export function batida(bpm: number, o: OpcoesBatida): { taxa: number; amostras: Float32Array } {
  const taxa = o.taxa ?? 22050
  const tempo = 60 / bpm
  const duracaoLoop = tempo * 4 * o.compassos
  const atraso = o.atrasoInicial ?? 0
  const total = Math.ceil((atraso + duracaoLoop + (o.cauda ?? 0)) * taxa)
  const x = new Float32Array(total)
  const rnd = geradorRuido(7)
  const somar = (inicio: number, dur: number, f: (t: number) => number): void => {
    const i0 = Math.round((atraso + inicio) * taxa)
    const n = Math.round(dur * taxa)
    for (let i = 0; i < n && i0 + i < total; i++) {
      x[i0 + i] += f(i / taxa)
    }
  }
  const batidas = 4 * o.compassos
  for (let b = 0; b < batidas; b++) {
    const t = b * tempo
    if (o.quatroNoChao || b % 2 === 0) {
      somar(t, 0.18, (s) => Math.sin(2 * Math.PI * (50 + 90 * Math.exp(-s * 35)) * s) * Math.exp(-s * 14) * 0.9)
    }
    if (b % 2 === 1) {
      somar(t, 0.14, (s) => (rnd() * 0.6 + Math.sin(2 * Math.PI * 190 * s) * 0.3) * Math.exp(-s * 22))
    }
    const hats = o.hats ?? 2
    for (let h = 0; h < hats; h++) {
      somar(t + (h * tempo) / hats, 0.04, (s) => rnd() * 0.18 * Math.exp(-s * 90))
    }
  }
  if (o.cauda) {
    somar(duracaoLoop, o.cauda, (s) => rnd() * 0.15 * Math.exp(-s * 6))
  }
  return { taxa, amostras: x }
}
