import { describe, expect, it } from 'vitest'
import { decodificarAiff, ehAiff } from '@shared/aiff'

/** Codifica uma taxa como float estendido de 80 bits. */
function estendido(taxa: number): number[] {
  const e = Math.floor(Math.log2(taxa))
  const mantissa = taxa * 2 ** (63 - e)
  const alto = Math.floor(mantissa / 2 ** 32)
  const baixo = mantissa - alto * 2 ** 32
  const exp = e + 16383
  return [exp >> 8, exp & 0xff, alto >>> 24, (alto >> 16) & 0xff, (alto >> 8) & 0xff, alto & 0xff,
    baixo >>> 24, (baixo >> 16) & 0xff, (baixo >> 8) & 0xff, baixo & 0xff]
}

function montar(opts: { canais: number; bits: number; taxa: number; amostras: number[]; compressao?: string; le?: boolean }): ArrayBuffer {
  const bytes = Math.ceil(opts.bits / 8)
  const quadros = opts.amostras.length / opts.canais
  const dados: number[] = []
  for (const s of opts.amostras) {
    let x = Math.round(s * 2 ** (bytes * 8 - 1))
    if (x < 0) x += 2 ** (bytes * 8)
    const be: number[] = []
    for (let i = bytes - 1; i >= 0; i--) be.push(Math.floor(x / 2 ** (i * 8)) & 0xff)
    dados.push(...(opts.le ? be.reverse() : be))
  }
  const u32 = (n: number): number[] => [n >>> 24, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
  const txt = (t: string): number[] => [...t].map((c) => c.charCodeAt(0))
  const comm = [opts.canais >> 8, opts.canais & 0xff]
  comm.push(...u32(quadros), opts.bits >> 8, opts.bits & 0xff, ...estendido(opts.taxa))
  if (opts.compressao) comm.push(...txt(opts.compressao), 0, 0)
  const ssnd = [...u32(0), ...u32(0), ...dados]
  const corpo = [
    ...txt(opts.compressao ? 'AIFC' : 'AIFF'),
    ...txt('COMM'), ...u32(comm.length), ...comm,
    ...txt('SSND'), ...u32(ssnd.length), ...ssnd
  ]
  return new Uint8Array([...txt('FORM'), ...u32(corpo.length), ...corpo]).buffer
}

describe('decodificarAiff', () => {
  it('reconhece o cabeçalho', () => {
    expect(ehAiff(montar({ canais: 1, bits: 16, taxa: 44100, amostras: [0] }))).toBe(true)
    expect(ehAiff(new Uint8Array(20).buffer)).toBe(false)
  })

  it('lê AIFF 16 bits estéreo', () => {
    const a = decodificarAiff(montar({ canais: 2, bits: 16, taxa: 44100, amostras: [0.5, -0.5, 0.25, -1] }))
    expect(a.taxa).toBe(44100)
    expect(a.canais).toHaveLength(2)
    expect([...a.canais[0]]).toEqual([0.5, 0.25])
    expect([...a.canais[1]]).toEqual([-0.5, -1])
  })

  it('lê AIFF 24 bits a 48 kHz', () => {
    const a = decodificarAiff(montar({ canais: 1, bits: 24, taxa: 48000, amostras: [0.125, -0.75] }))
    expect(a.taxa).toBe(48000)
    expect([...a.canais[0]]).toEqual([0.125, -0.75])
  })

  it('lê AIFF-C sowt (little-endian)', () => {
    const a = decodificarAiff(montar({ canais: 1, bits: 16, taxa: 22050, amostras: [0.5, -0.25], compressao: 'sowt', le: true }))
    expect(a.taxa).toBe(22050)
    expect([...a.canais[0]]).toEqual([0.5, -0.25])
  })

  it('recusa compressão desconhecida', () => {
    expect(() => decodificarAiff(montar({ canais: 1, bits: 16, taxa: 44100, amostras: [0], compressao: 'ima4' }))).toThrow(/ima4/)
  })
})
