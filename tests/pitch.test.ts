import { describe, it, expect } from 'vitest'
import { LeitorComTom, deslocarTom, formatarTom, normalizarTom, razaoDoTom } from '@shared/pitch'

const TAXA = 44100

function seno(freq: number, segundos: number): Float32Array {
  const n = Math.round(TAXA * segundos)
  const x = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    x[i] = 0.5 * Math.sin((2 * Math.PI * freq * i) / TAXA)
  }
  return x
}

/** Frequência dominante estimada por cruzamentos de zero no trecho central. */
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

function rms(x: Float32Array): number {
  let s = 0
  const ini = Math.floor(x.length * 0.25)
  const fim = Math.floor(x.length * 0.75)
  for (let i = ini; i < fim; i++) {
    s += x[i] * x[i]
  }
  return Math.sqrt(s / (fim - ini))
}

describe('pitch', () => {
  it('converte semitons em razão de frequência', () => {
    expect(razaoDoTom(12)).toBeCloseTo(2)
    expect(razaoDoTom(-12)).toBeCloseTo(0.5)
    expect(razaoDoTom(0)).toBe(1)
  })

  it('normaliza e formata o tom com precisão de cent', () => {
    expect(normalizarTom(3.14159)).toBe(3.14)
    expect(normalizarTom(40)).toBe(12)
    expect(normalizarTom(-40)).toBe(-12)
    expect(normalizarTom(-0.001)).toBe(0)
    expect(normalizarTom(NaN)).toBe(0)
    expect(formatarTom(0)).toBe('0')
    expect(formatarTom(3)).toBe('+3')
    expect(formatarTom(-1.5)).toBe('-1.50')
  })

  it.each([7, -5, 12, -12, 0.5])('muda %s semitons mantendo a duração', (st) => {
    const entrada = seno(440, 1)
    const saida = deslocarTom(entrada, st)
    expect(saida.length).toBe(entrada.length)
    const esperado = 440 * razaoDoTom(st)
    expect(frequencia(saida)).toBeGreaterThan(esperado * 0.995)
    expect(frequencia(saida)).toBeLessThan(esperado * 1.005)
    // Volume preservado.
    expect(rms(saida)).toBeGreaterThan(rms(entrada) * 0.85)
    expect(rms(saida)).toBeLessThan(rms(entrada) * 1.15)
  })

  it('tom zero devolve uma cópia idêntica', () => {
    const entrada = seno(220, 0.2)
    const saida = deslocarTom(entrada, 0)
    expect(saida).not.toBe(entrada)
    expect(Array.from(saida)).toEqual(Array.from(entrada))
  })

  it('aceita sinais menores que um quadro', () => {
    const saida = deslocarTom(seno(1000, 0.01), 3)
    expect(saida.length).toBe(441)
    expect(saida.every(Number.isFinite)).toBe(true)
  })

  it('muda o tom durante a leitura, sem reiniciar', () => {
    const entrada = seno(440, 2)
    const leitor = new LeitorComTom([entrada], 0, false, 0)
    const a = new Float32Array(TAXA)
    const b = new Float32Array(TAXA)
    expect(leitor.ler([a], a.length)).toBe(true)
    leitor.definirTom(7)
    leitor.ler([b], b.length)
    // Antes da mudança: cópia exata do original.
    expect(Array.from(a.subarray(0, 1000))).toEqual(Array.from(entrada.subarray(0, 1000)))
    expect(frequencia(b)).toBeGreaterThan(440 * razaoDoTom(7) * 0.995)
    expect(frequencia(b)).toBeLessThan(440 * razaoDoTom(7) * 1.005)
  })

  it('termina no fim do áudio e repete quando pedido', () => {
    const entrada = seno(440, 0.5)
    const saida = new Float32Array(TAXA)
    expect(new LeitorComTom([entrada], 0, false, 3).ler([saida], saida.length)).toBe(false)
    expect(rms(saida.subarray(entrada.length + 10))).toBe(0)
    const comRepeticao = new Float32Array(TAXA)
    expect(new LeitorComTom([entrada], 0, true, 3).ler([comRepeticao], comRepeticao.length)).toBe(true)
    expect(rms(comRepeticao.subarray(entrada.length))).toBeGreaterThan(0.2)
  })

  it('começa do ponto pedido', () => {
    const entrada = seno(440, 1)
    const saida = new Float32Array(100)
    new LeitorComTom([entrada], 5000, false, 0).ler([saida], 100)
    expect(Array.from(saida)).toEqual(Array.from(entrada.subarray(5000, 5100)))
  })
})
