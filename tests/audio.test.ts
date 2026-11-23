import { describe, it, expect } from 'vitest'
import { codificarWav, calcularPicos, inicioDasRepeticoes } from '@shared/audio'

function lerTexto(b: Uint8Array, ini: number, n: number): string {
  return String.fromCharCode(...b.slice(ini, ini + n))
}

describe('codificarWav', () => {
  it('gera cabeçalho RIFF/WAVE PCM 16 bits correto para estéreo', () => {
    const esq = new Float32Array([0, 0.5, -0.5])
    const dir = new Float32Array([1, -1, 0])
    const wav = codificarWav([esq, dir], 44100)
    const v = new DataView(wav.buffer)

    expect(wav.length).toBe(44 + 3 * 2 * 2)
    expect(lerTexto(wav, 0, 4)).toBe('RIFF')
    expect(v.getUint32(4, true)).toBe(wav.length - 8)
    expect(lerTexto(wav, 8, 4)).toBe('WAVE')
    expect(lerTexto(wav, 12, 4)).toBe('fmt ')
    expect(v.getUint16(20, true)).toBe(1) // PCM
    expect(v.getUint16(22, true)).toBe(2) // canais
    expect(v.getUint32(24, true)).toBe(44100)
    expect(v.getUint32(28, true)).toBe(44100 * 4) // byte rate
    expect(v.getUint16(32, true)).toBe(4) // block align
    expect(v.getUint16(34, true)).toBe(16)
    expect(lerTexto(wav, 36, 4)).toBe('data')
    expect(v.getUint32(40, true)).toBe(12)
  })

  it('intercala canais e converte amostras para inteiros', () => {
    const wav = codificarWav([new Float32Array([0.5, -1]), new Float32Array([1, 0])], 8000)
    const v = new DataView(wav.buffer)
    expect(v.getInt16(44, true)).toBe(16384) // esq[0]
    expect(v.getInt16(46, true)).toBe(32767) // dir[0]
    expect(v.getInt16(48, true)).toBe(-32768) // esq[1]
    expect(v.getInt16(50, true)).toBe(0) // dir[1]
  })

  it('limita valores fora de [-1, 1]', () => {
    const wav = codificarWav([new Float32Array([2, -3])], 8000)
    const v = new DataView(wav.buffer)
    expect(v.getInt16(44, true)).toBe(32767)
    expect(v.getInt16(46, true)).toBe(-32768)
  })

  it('rejeita lista de canais vazia ou de tamanhos diferentes', () => {
    expect(() => codificarWav([], 8000)).toThrow()
    expect(() => codificarWav([new Float32Array(2), new Float32Array(3)], 8000)).toThrow()
  })
})

describe('calcularPicos', () => {
  it('retorna o pico absoluto de cada bloco', () => {
    const dados = new Float32Array([0.1, -0.8, 0.2, 0.3, -0.1, 0.05])
    expect(calcularPicos(dados, 3).map((x) => Number(x.toFixed(2)))).toEqual([0.8, 0.3, 0.1])
  })

  it('com mais barras que amostras, cada barra usa ao menos uma amostra', () => {
    const picos = calcularPicos(new Float32Array([0.5, -1]), 4)
    expect(picos).toHaveLength(4)
    expect(Math.max(...picos)).toBe(1)
  })

  it('áudio vazio gera barras zeradas', () => {
    expect(calcularPicos(new Float32Array(0), 3)).toEqual([0, 0, 0])
  })
})

describe('inicioDasRepeticoes', () => {
  it('repete o loop até cobrir a duração total', () => {
    expect(inicioDasRepeticoes(2, 7)).toEqual([0, 2, 4, 6])
    expect(inicioDasRepeticoes(4, 8)).toEqual([0, 4])
  })

  it('camada mais longa que o total toca uma única vez', () => {
    expect(inicioDasRepeticoes(10, 4)).toEqual([0])
  })

  it('duração inválida não gera repetições infinitas', () => {
    expect(inicioDasRepeticoes(0, 4)).toEqual([0])
  })
})
