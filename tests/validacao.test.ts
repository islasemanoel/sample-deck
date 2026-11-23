import { describe, it, expect } from 'vitest'
import * as v from '../src/main/validacao'

describe('validação dos argumentos do IPC', () => {
  it('texto exige string não vazia', () => {
    expect(v.texto('C:/a', 'pasta')).toBe('C:/a')
    for (const ruim of ['', 1, null, undefined, {}, ['a']]) {
      expect(() => v.texto(ruim, 'pasta')).toThrow('Argumento inválido: pasta')
    }
  })

  it('texto opcional aceita ausente e rejeita tipo errado', () => {
    expect(v.textoOpcional(undefined, 't')).toBe('')
    expect(v.textoOpcional('x', 't')).toBe('x')
    expect(() => v.textoOpcional(5, 't')).toThrow()
  })

  it('texto livre aceita vazio mas não outros tipos', () => {
    expect(v.textoLivre('', 'd')).toBe('')
    expect(() => v.textoLivre(null, 'd')).toThrow()
  })

  it('lista de textos rejeita itens que não são texto', () => {
    expect(v.listaTextos(['a', 'b'], 'ids')).toEqual(['a', 'b'])
    expect(v.listaTextos([], 'ids')).toEqual([])
    expect(() => v.listaTextos('a', 'ids')).toThrow()
    expect(() => v.listaTextos(['a', 1], 'ids')).toThrow()
    expect(() => v.listaTextos([''], 'ids')).toThrow()
  })

  it('booleano é estrito', () => {
    expect(v.booleano(false, 'b')).toBe(false)
    expect(() => v.booleano(0, 'b')).toThrow()
  })

  it('bytes exige Uint8Array do tamanho mínimo', () => {
    expect(v.bytes(new Uint8Array(50), 'dados', 44).byteLength).toBe(50)
    expect(() => v.bytes(new Uint8Array(10), 'dados', 44)).toThrow()
    expect(() => v.bytes([1, 2, 3], 'dados')).toThrow()
  })

  it('amostras exige Float32Array não vazio e a taxa, um valor plausível', () => {
    expect(v.amostras(new Float32Array(10)).length).toBe(10)
    expect(() => v.amostras(new Float32Array(0))).toThrow()
    expect(() => v.amostras([0, 1])).toThrow()
    expect(v.taxa(44100)).toBe(44100)
    for (const ruim of [0, NaN, Infinity, '44100', 10]) {
      expect(() => v.taxa(ruim)).toThrow()
    }
  })
})
