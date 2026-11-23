import { describe, it, expect } from 'vitest'
import { estimarBpmLoop } from '../src/main/detectorBpm'
import { batida, geradorRuido } from './sinteticos'

/** Diferença tolerada em BPM. */
const TOLERANCIA = 1

describe('estimarBpmLoop (Essentia LoopBpmEstimator)', () => {
  const limpos: [string, number, Parameters<typeof batida>[1]][] = [
    ['boom bap 92, 4 compassos', 92, { compassos: 4 }],
    ['house 128, 4 no chão', 128, { compassos: 4, quatroNoChao: true }],
    ['110 sem hi-hat', 110, { compassos: 4, hats: 0 }]
  ]

  // Dobro/metade é ambíguo por natureza (um trap de 140 é a mesma levada que um de 70 em
  // "half-time"); no benchmark com 397 loops reais foram 12% dos casos. Aqui o aceitável
  // é acertar a pulsação em uma das oitavas, nunca um valor sem relação.
  it('trap 140 com semicolcheias: aceita 140 ou a oitava (70)', async () => {
    const { taxa, amostras } = batida(140, { compassos: 4, hats: 4 })
    const r = await estimarBpmLoop(amostras, taxa)
    expect([70, 140, 280].some((v) => Math.abs((r ?? 0) - v) <= TOLERANCIA)).toBe(true)
  })

  for (const [descricao, bpm, opcoes] of limpos) {
    it(`acerta loop bem cortado: ${descricao}`, async () => {
      const { taxa, amostras } = batida(bpm, opcoes)
      const r = await estimarBpmLoop(amostras, taxa)
      expect(r).not.toBeNull()
      expect(Math.abs((r ?? 0) - bpm)).toBeLessThanOrEqual(TOLERANCIA)
    })
  }

  it('aceita qualquer taxa de amostragem (converte para 44,1 kHz)', async () => {
    for (const taxa of [22050, 44100, 48000]) {
      const { amostras } = batida(120, { compassos: 2, taxa })
      const r = await estimarBpmLoop(amostras, taxa)
      expect(Math.abs((r ?? 0) - 120)).toBeLessThanOrEqual(TOLERANCIA)
    }
  })

  it('em loop mal cortado pode recusar, mas nunca devolve um BPM errado', async () => {
    const casos: [number, Parameters<typeof batida>[1]][] = [
      [100, { compassos: 4, cauda: 0.6 }],
      [96, { compassos: 4, atrasoInicial: 0.137 }]
    ]
    for (const [bpm, o] of casos) {
      const { taxa, amostras } = batida(bpm, o)
      const r = await estimarBpmLoop(amostras, taxa)
      if (r !== null) {
        expect(Math.abs(r - bpm)).toBeLessThanOrEqual(TOLERANCIA)
      }
    }
  })

  it('silêncio, som contínuo e ruído não têm BPM', async () => {
    const taxa = 44100
    expect(await estimarBpmLoop(new Float32Array(taxa * 4), taxa)).toBeNull()
    const tom = new Float32Array(taxa * 4).map((_, i) => Math.sin((2 * Math.PI * 220 * i) / taxa) * 0.5)
    expect(await estimarBpmLoop(tom, taxa)).toBeNull()
    const rnd = geradorRuido(3)
    expect(await estimarBpmLoop(new Float32Array(taxa * 4).map(() => rnd() * 0.5), taxa)).toBeNull()
    // depois de uma exceção interna do WASM, continua funcionando
    const { amostras } = batida(92, { compassos: 4, taxa })
    expect(await estimarBpmLoop(amostras, taxa)).toBe(92)
  })

  it('trecho curto demais não é analisado', async () => {
    const { taxa, amostras } = batida(120, { compassos: 1 })
    expect(await estimarBpmLoop(amostras.slice(0, Math.floor(taxa * 0.8)), taxa)).toBeNull()
  })

  it('analisa muitos arquivos seguidos sem esgotar a memória do WASM', async () => {
    const { taxa, amostras } = batida(92, { compassos: 4 })
    for (let i = 0; i < 60; i++) {
      await estimarBpmLoop(amostras, taxa)
    }
    expect(await estimarBpmLoop(amostras, taxa)).toBe(92)
  })
})
