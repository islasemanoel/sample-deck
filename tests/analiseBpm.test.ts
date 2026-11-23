import { describe, it, expect } from 'vitest'
import { alternativaBpm, candidatosBpm, encaixeNaDuracao, formatarBpm, refinarBpmPelaDuracao } from '../src/shared/analiseBpm'
import { analisarBpm } from '../src/main/detectorBpm'

describe('candidatosBpm', () => {
  it('metade, original e dobro dentro de 40–300', () => {
    expect(candidatosBpm(140)).toEqual([
      { fator: 0.5, bpm: 70 },
      { fator: 1, bpm: 140 },
      { fator: 2, bpm: 280 }
    ])
    expect(candidatosBpm(170).map((c) => c.bpm)).toEqual([85, 170])
  })
})

describe('encaixeNaDuracao', () => {
  it('loop de 8 s em 120 BPM fecha 4 compassos', () => {
    expect(encaixeNaDuracao(120, 8)).toEqual({ compassos: 4, bpmExato: 120, encaixa: true })
  })
  it('121 BPM num loop de 8 s não fecha; o BPM exato seria 120', () => {
    const r = encaixeNaDuracao(121, 8)!
    expect(r.encaixa).toBe(false)
    expect(r.bpmExato).toBe(120)
  })
  it('a metade também fecha (2 compassos)', () => {
    expect(encaixeNaDuracao(60, 8)).toMatchObject({ compassos: 2, encaixa: true })
  })
  it('sem duração ou curto demais', () => {
    expect(encaixeNaDuracao(120, 0)).toBeNull()
    expect(encaixeNaDuracao(120, 0.5)).toBeNull()
  })
})

it('formatarBpm', () => {
  expect(formatarBpm(92.02)).toBe('92')
  expect(formatarBpm(91.4)).toBe('91.4')
})

/** Levada sintética: bumbo nos tempos e chimbal nos contratempos. */
function levada(bpm: number, segundos: number, taxa = 44100): Float32Array {
  const x = new Float32Array(Math.round(segundos * taxa))
  const batida = (60 / bpm) * taxa
  for (let b = 0; b * batida < x.length; b++) {
    const golpes: Array<[number, number, number]> = [
      [Math.round(b * batida), 60, 0.9],
      [Math.round((b + 0.5) * batida), 4000, 0.3]
    ]
    for (const [inicio, f, amp] of golpes) {
      for (let i = 0; i < 0.12 * taxa && inicio + i < x.length; i++) {
        x[inicio + i] += Math.sin((2 * Math.PI * f * i) / taxa) * amp * Math.exp(-i / (0.03 * taxa))
      }
    }
  }
  return x
}

describe('analisarBpm', () => {
  it('estima o BPM de uma levada (ou a metade/dobro) e informa a confiança', async () => {
    const r = await analisarBpm(levada(100, 9.6), 44100)
    expect(r.motivo).toBeNull()
    expect([50, 100, 200].some((b) => Math.abs(r.bpm! - b) < 1.5)).toBe(true)
    expect(r.confianca).toBeGreaterThan(0)
  })
  it('som curto ou sem ataques não tem BPM', async () => {
    expect((await analisarBpm(new Float32Array(44100), 44100)).motivo).toMatch(/Curto/)
    const tom = Float32Array.from({ length: 44100 * 4 }, (_, i) => Math.sin(i / 10) * 0.5)
    expect((await analisarBpm(tom, 44100)).motivo).toMatch(/pulsação/)
  })
})

describe('refinarBpmPelaDuracao', () => {
  it('acerta o ".5" que o Essentia arredonda', () => {
    // 71 compassos a 81.5 BPM = 209,08 s
    expect(refinarBpmPelaDuracao(81, 209.08)).toEqual({ bpm: 81.5, compassos: 71 })
    expect(refinarBpmPelaDuracao(82, 209.08)).toEqual({ bpm: 81.5, compassos: 71 })
  })
  it('mantém a estimativa que já fecha em compassos', () => {
    expect(refinarBpmPelaDuracao(120, 8)).toEqual({ bpm: 120, compassos: 4 })
  })
  it('não inventa BPM quebrado por causa de cauda no fim do arquivo', () => {
    // 4 compassos a 120 com 40 ms de cauda: 119.4 não é "redondo"
    expect(refinarBpmPelaDuracao(120, 8.04).bpm).toBe(120)
    expect(refinarBpmPelaDuracao(120, null).bpm).toBe(120)
  })
})

describe('alternativaBpm', () => {
  it('sugere o valor do outro método na mesma oitava, arredondado a inteiro ou .5', () => {
    expect(alternativaBpm(81, { bpm: 81.92, confianca: 3.4 })).toBe(82)
    expect(alternativaBpm(81, { bpm: 162.94, confianca: 1.6 })).toBe(81.5)
  })
  it('nada a sugerir quando discorda, concorda demais ou tem pouca confiança', () => {
    expect(alternativaBpm(93, { bpm: 69.3, confianca: 2.4 })).toBeNull()
    expect(alternativaBpm(75, { bpm: 74.96, confianca: 4.3 })).toBeNull()
    expect(alternativaBpm(77, { bpm: 77.4, confianca: 0.8 })).toBeNull()
    expect(alternativaBpm(80, null)).toBeNull()
  })
})
