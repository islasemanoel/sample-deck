import { describe, it, expect } from 'vitest'
import { LeitorComTom } from '@shared/pitch'
import {
  TONS_PROJETO,
  alteraAudioAjustes,
  lerTonalidade,
  normalizarBpmProjeto,
  renderizarComAjustes,
  ehPercussaoSemTom,
  precisaDetectarTom,
  situacaoBpm,
  sufixoAjustes,
  tomDaNota,
  tomDoResultado,
  transposicaoParaProjeto,
  velocidadeParaProjeto
} from '@shared/projeto'

const TAXA = 44100

function seno(freq: number, segundos: number): Float32Array {
  const n = Math.round(TAXA * segundos)
  const x = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    x[i] = 0.5 * Math.sin((2 * Math.PI * freq * i) / TAXA)
  }
  return x
}

/** Frequência dominante por cruzamentos de zero no trecho central. */
function frequencia(x: Float32Array): number {
  const ini = Math.floor(x.length * 0.25)
  const fim = Math.floor(x.length * 0.75)
  let primeiro = -1
  let ultimo = -1
  let cruzamentos = 0
  for (let i = ini + 1; i < fim; i++) {
    if (x[i - 1] < 0 && x[i] >= 0) {
      const t = i - 1 + -x[i - 1] / (x[i] - x[i - 1])
      if (primeiro < 0) {
        primeiro = t
      } else {
        cruzamentos++
      }
      ultimo = t
    }
  }
  return (cruzamentos * TAXA) / (ultimo - primeiro)
}

describe('lerTonalidade', () => {
  it('lê os formatos da biblioteca', () => {
    expect(lerTonalidade('A min')).toEqual({ tonica: 9, menor: true })
    expect(lerTonalidade('C# maj')).toEqual({ tonica: 1, menor: false })
    expect(lerTonalidade('Bb')).toEqual({ tonica: 10, menor: null })
    expect(lerTonalidade('Ebm')).toEqual({ tonica: 3, menor: true })
    expect(lerTonalidade('Cb')).toEqual({ tonica: 11, menor: null })
  })
  it('rejeita o que não é tom', () => {
    expect(lerTonalidade(null)).toBeNull()
    expect(lerTonalidade('')).toBeNull()
    expect(lerTonalidade('H min')).toBeNull()
    expect(lerTonalidade('kick')).toBeNull()
  })
  it('oferece os 24 tons', () => {
    expect(TONS_PROJETO).toHaveLength(24)
    expect(TONS_PROJETO.every((t) => lerTonalidade(t)?.menor !== null)).toBe(true)
  })
})

describe('transposicaoParaProjeto', () => {
  it('leva pelo menor caminho, entre -6 e +5', () => {
    expect(transposicaoParaProjeto('C maj', 'D maj')).toBe(2)
    expect(transposicaoParaProjeto('C maj', 'A maj')).toBe(-3)
    expect(transposicaoParaProjeto('A min', 'C min')).toBe(3)
    expect(transposicaoParaProjeto('C maj', 'F# maj')).toBe(-6)
    expect(transposicaoParaProjeto('F# maj', 'C maj')).toBe(-6)
    expect(transposicaoParaProjeto('G min', 'G min')).toBe(0)
  })
  it('tons relativos não mudam', () => {
    expect(transposicaoParaProjeto('A min', 'C maj')).toBe(0)
    expect(transposicaoParaProjeto('C maj', 'A min')).toBe(0)
    // E menor (relativo de G maior) para C maior: G → C = +5
    expect(transposicaoParaProjeto('E min', 'C maj')).toBe(5)
  })
  it('sem modo, compara as tônicas', () => {
    expect(transposicaoParaProjeto('F#', 'A min')).toBe(3)
  })
  it('null com tom desconhecido', () => {
    expect(transposicaoParaProjeto(null, 'C maj')).toBeNull()
    expect(transposicaoParaProjeto('C maj', null)).toBeNull()
  })
})

describe('velocidadeParaProjeto', () => {
  it('razão entre os andamentos', () => {
    expect(velocidadeParaProjeto(120, 140)).toBeCloseTo(140 / 120)
    expect(velocidadeParaProjeto(90, 85)).toBeCloseTo(85 / 90)
  })
  it('usa meio tempo e tempo dobrado', () => {
    expect(velocidadeParaProjeto(70, 140)).toBe(1)
    expect(velocidadeParaProjeto(170, 85)).toBe(1)
    expect(velocidadeParaProjeto(160, 90)).toBeCloseTo(90 / 80)
  })
  it('limita e trata desconhecidos', () => {
    expect(velocidadeParaProjeto(null, 120)).toBeNull()
    expect(velocidadeParaProjeto(120, null)).toBeNull()
    expect(velocidadeParaProjeto(300, 40)).toBeGreaterThanOrEqual(0.5)
  })
})

describe('normalizarBpmProjeto', () => {
  it('aceita números e textos válidos', () => {
    expect(normalizarBpmProjeto(140)).toBe(140)
    expect(normalizarBpmProjeto('92,55')).toBe(92.6)
    expect(normalizarBpmProjeto('10')).toBeNull()
    expect(normalizarBpmProjeto('abc')).toBeNull()
    expect(normalizarBpmProjeto(undefined)).toBeNull()
  })
})

describe('LeitorComTom com velocidade', () => {
  it('muda a duração sem mudar o tom', () => {
    const x = seno(440, 1)
    const n = Math.round(x.length / 1.5)
    const saida = new Float32Array(n)
    const ativo = new LeitorComTom([x], 0, false, 0, 1.5).ler([saida], n)
    expect(ativo).toBe(true)
    expect(frequencia(saida)).toBeCloseTo(440, -1)
    // Depois do fim da origem, termina
    expect(new LeitorComTom([x], 0, false, 0, 1.5).ler([new Float32Array(x.length)], x.length)).toBe(false)
  })
  it('combina tom e velocidade', () => {
    const x = seno(440, 1)
    const n = Math.round(x.length / 0.8)
    const saida = new Float32Array(n)
    new LeitorComTom([x], 0, false, 12, 0.8).ler([saida], n)
    expect(frequencia(saida)).toBeCloseTo(880, -1)
  })
})

describe('renderizarComAjustes', () => {
  it('inverte no tempo', () => {
    const x = new Float32Array([1, 2, 3, 4])
    expect(Array.from(renderizarComAjustes([x], { semitons: 0, velocidade: 1, reverso: true })[0])).toEqual([4, 3, 2, 1])
    expect(Array.from(x)).toEqual([1, 2, 3, 4])
  })
  it('estica pelo andamento', () => {
    const x = seno(440, 1)
    const [y] = renderizarComAjustes([x], { semitons: 0, velocidade: 2, reverso: false })
    expect(y.length).toBe(Math.round(x.length / 2))
    expect(frequencia(y)).toBeCloseTo(440, -1)
  })
  it('sem ajustes devolve o original', () => {
    const x = seno(440, 0.1)
    expect(renderizarComAjustes([x], { semitons: 0, velocidade: 1, reverso: false })[0]).toBe(x)
    expect(alteraAudioAjustes({ semitons: 0, velocidade: 1, reverso: false })).toBe(false)
    expect(alteraAudioAjustes({ semitons: 0, velocidade: 1, reverso: true })).toBe(true)
  })
  it('nomeia o arquivo com os ajustes', () => {
    expect(sufixoAjustes({ semitons: 3, velocidade: 140 / 120, reverso: true }, 140)).toBe(' (+3 st, 140 BPM, reverso)')
    expect(sufixoAjustes({ semitons: 0, velocidade: 1, reverso: false }, null)).toBe('')
  })
})

describe('samples sem tom ou BPM', () => {
  it('percussão sem tom no nome fica sem ajuste e não é analisada', () => {
    expect(ehPercussaoSemTom({ tom: null, categoria: 'drums' })).toBe(true)
    expect(ehPercussaoSemTom({ tom: null, categoria: 'percussion' })).toBe(true)
    expect(ehPercussaoSemTom({ tom: 'F', categoria: 'drums' })).toBe(false)
    expect(precisaDetectarTom({ tom: null, categoria: 'drums' })).toBe(false)
    expect(precisaDetectarTom({ tom: null, categoria: 'keys' })).toBe(true)
    expect(precisaDetectarTom({ tom: 'A min', categoria: 'keys' })).toBe(false)
  })
  it('situação do BPM', () => {
    expect(situacaoBpm({ tipo: 'loop', bpm: 120 }, null)).toEqual({ tipo: 'desligado' })
    expect(situacaoBpm({ tipo: 'one-shot', bpm: null }, 140)).toEqual({ tipo: 'one-shot' })
    expect(situacaoBpm({ tipo: 'loop', bpm: null }, 140)).toEqual({ tipo: 'desconhecido' })
    expect(situacaoBpm({ tipo: 'loop', bpm: 140 }, 140)).toEqual({ tipo: 'aplicado', velocidade: 1 })
  })
  it('aceita o tom detectado só com consenso', () => {
    const e = (tonica: number, menor: boolean) => ({ metodo: 'bgate' as const, tonica, menor, forca: null })
    expect(tomDoResultado({ estimativas: [e(9, true), e(9, true), e(0, false), e(4, true)], segundos: 8 })).toBe('A min')
    expect(tomDoResultado({ estimativas: [e(9, true), e(2, true), e(0, false), e(4, true)], segundos: 8 })).toBeNull()
    expect(tomDoResultado({ estimativas: [e(9, true), { metodo: 'braw', erro: 'x' }], segundos: 8 })).toBeNull()
  })
  it('aceita a nota de one-shot só se confiável', () => {
    const n = { classe: 6, consenso: 0.9, quadros: 20, hz: 92.5, confiavel: true, peca: 'normal' as const }
    expect(tomDaNota(n)).toBe('F#')
    expect(tomDaNota({ ...n, confiavel: false })).toBeNull()
  })
})
