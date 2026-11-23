import { describe, it, expect } from 'vitest'
import { estimarNotaOneShot } from '../src/main/detectorNota'
import { geradorRuido } from './sinteticos'

const TAXA = 44100

/** One-shot sintético: ataque com ruído/clique e corpo com a frequência pedida, decaindo. */
function oneShot(
  hz: (t: number) => number,
  o: { duracao?: number; harmonicos?: number; taxa?: number; ataque?: boolean } = {}
): { amostras: Float32Array; taxa: number } {
  const taxa = o.taxa ?? TAXA
  const n = Math.round((o.duracao ?? 1.5) * taxa)
  const x = new Float32Array(n)
  const rnd = geradorRuido(11)
  let fase = 0
  for (let i = 0; i < n; i++) {
    const t = i / taxa
    fase += (2 * Math.PI * hz(t)) / taxa
    let v = 0
    for (let k = 1; k <= (o.harmonicos ?? 1); k++) {
      v += Math.sin(k * fase) / k
    }
    v *= Math.exp(-t * 2)
    if (o.ataque !== false && t < 0.012) {
      v += rnd() * (1 - t / 0.012) // clique de ataque sem altura definida
    }
    x[i] = v * 0.7
  }
  return { amostras: x, taxa }
}

describe('estimarNotaOneShot', () => {
  it('808 grave: Lá (55 Hz) com ataque que começa mais agudo', async () => {
    // o 808 típico cai de altura nos primeiros milissegundos
    const s = oneShot((t) => 55 * (1 + 1.5 * Math.exp(-t * 60)))
    expect(await estimarNotaOneShot(s.amostras, s.taxa)).toBe('A')
  })

  it('baixo rico em harmônicos: Ré (73,4 Hz)', async () => {
    const s = oneShot(() => 73.42, { harmonicos: 8 })
    expect(await estimarNotaOneShot(s.amostras, s.taxa)).toBe('D')
  })

  it('synth médio: Dó (261,6 Hz) e Fá# (185 Hz)', async () => {
    const c = oneShot(() => 261.63, { harmonicos: 5 })
    expect(await estimarNotaOneShot(c.amostras, c.taxa)).toBe('C')
    const fs = oneShot(() => 185, { harmonicos: 3 })
    expect(await estimarNotaOneShot(fs.amostras, fs.taxa)).toBe('F#')
  })

  it('funciona em qualquer taxa de amostragem', async () => {
    for (const taxa of [22050, 48000, 96000]) {
      const s = oneShot(() => 98, { harmonicos: 4, taxa }) // Sol
      expect(await estimarNotaOneShot(s.amostras, s.taxa)).toBe('G')
    }
  })

  it('nota que desliza (glide de Lá a Ré) fica sem nota, por falta de consenso', async () => {
    const s = oneShot((t) => 110 * Math.pow(2, (5 * Math.min(t, 1.2)) / 12 / 1.2) ** 1, { duracao: 1.5 })
    expect(await estimarNotaOneShot(s.amostras, s.taxa)).toBeNull()
  })

  it('ruído, silêncio e som curto demais ficam sem nota', async () => {
    const rnd = geradorRuido(4)
    expect(await estimarNotaOneShot(new Float32Array(TAXA).map(() => rnd() * 0.5), TAXA)).toBeNull()
    expect(await estimarNotaOneShot(new Float32Array(TAXA), TAXA)).toBeNull()
    const curto = oneShot(() => 110, { duracao: 0.06 })
    expect(await estimarNotaOneShot(curto.amostras, curto.taxa)).toBeNull()
  })
})
