import { resolve } from 'path'
import { describe, it, expect } from 'vitest'
import {
  acordeDeReferencia,
  consensoDosTons,
  lerTom,
  modoDeAnalise,
  nomeDoTom,
  notaDaFrequencia,
  pecaDoSample
} from '../src/shared/analiseTom'
import { analisarNota, analisarTom } from '../src/main/detectorTom'

const KEYFINDER = resolve(__dirname, '../resources/keyfinder/keyFinderProgressiveWorker.js')
const TAXA = 44100

describe('modoDeAnalise', () => {
  const base = { tipo: 'loop' as const, duracao: 8, tags: [] as string[] }
  it('loops abrem a análise de tom', () => {
    expect(modoDeAnalise(base)).toBe('tom')
  })
  it('one-shots com menos de 2 s abrem a nota', () => {
    expect(modoDeAnalise({ ...base, tipo: 'one-shot', duracao: 1.2 })).toBe('nota')
  })
  it('one-shots longos (pads, acordes) abrem o tom', () => {
    expect(modoDeAnalise({ ...base, tipo: 'one-shot', duracao: 3.5 })).toBe('tom')
    expect(modoDeAnalise({ ...base, tipo: 'one-shot', duracao: null })).toBe('tom')
  })
  it('808, kick e snare sempre abrem a nota, mesmo longos', () => {
    expect(modoDeAnalise({ ...base, tipo: 'one-shot', duracao: 4, tags: ['808'] })).toBe('nota')
    expect(modoDeAnalise({ ...base, tags: ['kick'] })).toBe('nota')
    expect(modoDeAnalise({ ...base, tags: ['snare'] })).toBe('nota')
  })
  it('peça usada na medição', () => {
    expect(pecaDoSample({ tags: ['808', 'kick'] })).toBe('kick')
    expect(pecaDoSample({ tags: ['snare'] })).toBe('snare')
    expect(pecaDoSample({ tags: ['808'] })).toBe('normal')
  })
})

describe('textos e frequências', () => {
  it('lê os formatos do Essentia e do libKeyFinder', () => {
    expect(lerTom('A', 'minor')).toEqual({ tonica: 9, menor: true })
    expect(lerTom('Db', 'Major')).toEqual({ tonica: 1, menor: false })
    expect(lerTom('Silence', '')).toBeNull()
  })
  it('nome do tom', () => {
    expect(nomeDoTom(9, true)).toBe('A menor')
    expect(nomeDoTom(1, false)).toBe('C# maior')
  })
  it('nota da frequência com oitava e cents', () => {
    expect(notaDaFrequencia(55)).toEqual({ nome: 'A1', midi: 33, cents: 0 })
    expect(notaDaFrequencia(440 * Math.pow(2, 0.2 / 12)).cents).toBe(20)
  })
  it('acorde de referência: tônica grave + tríade', () => {
    const [grave, raiz, terca] = acordeDeReferencia(9, true)
    expect(grave).toBeCloseTo(110, 3)
    expect(raiz).toBeCloseTo(220, 3)
    expect(terca).toBeCloseTo(261.63, 1) // C4, terça menor de A
  })
  it('consenso conta métodos iguais', () => {
    const c = consensoDosTons([
      { metodo: 'bgate', tonica: 9, menor: true, forca: 0.7 },
      { metodo: 'braw', tonica: 9, menor: true, forca: 0.6 },
      { metodo: 'edma', tonica: 0, menor: false, forca: 0.5 },
      { metodo: 'keyfinder', erro: 'x' }
    ])
    expect(c).toEqual({ tonica: 9, menor: true, votos: 2, total: 3 })
  })
})

/** Progressão em Lá menor (Am – Dm – E – Am), 2 s por acorde, com harmônicos. */
function progressaoLaMenor(): Float32Array {
  const acordes = [
    [57, 60, 64],
    [62, 65, 69],
    [64, 68, 71],
    [57, 60, 64]
  ]
  const n = acordes.length * 2 * TAXA
  const x = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const t = i / TAXA
    const acorde = acordes[Math.floor(t / 2)]
    let v = Math.sin(2 * Math.PI * 55 * t) * 0.3 // pedal em A grave
    for (const m of acorde) {
      const f = 440 * Math.pow(2, (m - 69) / 12)
      for (let k = 1; k <= 3; k++) {
        v += Math.sin(2 * Math.PI * f * k * t) / (k * 2)
      }
    }
    x[i] = v * 0.15
  }
  return x
}

describe('analisarTom', () => {
  it('os quatro métodos respondem e a maioria acha Lá menor', async () => {
    const r = await analisarTom(progressaoLaMenor(), TAXA, KEYFINDER)
    expect(r.estimativas.map((e) => e.metodo)).toEqual(['bgate', 'braw', 'edma', 'keyfinder'])
    expect(r.estimativas.every((e) => 'tonica' in e)).toBe(true)
    const c = consensoDosTons(r.estimativas)
    expect(c && nomeDoTom(c.tonica, c.menor)).toBe('A menor')
    expect(c!.votos).toBeGreaterThanOrEqual(3)
    expect(r.segundos).toBeCloseTo(8, 1)
  }, 30000)
})

describe('analisarNota', () => {
  /** Kick sintético: altura cai de ~200 Hz para 49 Hz (G1) nos primeiros ~50 ms. */
  function kick(): Float32Array {
    const n = Math.round(0.8 * TAXA)
    const x = new Float32Array(n)
    let fase = 0
    for (let i = 0; i < n; i++) {
      const t = i / TAXA
      fase += (2 * Math.PI * 49 * (1 + 3 * Math.exp(-t * 60))) / TAXA
      x[i] = Math.sin(fase) * Math.exp(-t * 4) * 0.8
    }
    return x
  }

  it('kick: mede a cauda depois da queda de altura', async () => {
    const r = await analisarNota(kick(), TAXA, 'kick')
    expect(r.classe).toBe(7) // G
    expect(notaDaFrequencia(r.hz!).nome).toBe('G1')
    expect(r.confiavel).toBe(true)
  })

  it('snare nunca é marcada como confiável', async () => {
    const r = await analisarNota(kick(), TAXA, 'snare')
    expect(r.confiavel).toBe(false)
  })

  it('silêncio não tem nota', async () => {
    const r = await analisarNota(new Float32Array(TAXA), TAXA, 'normal')
    expect(r.classe).toBeNull()
  })
})
