import { describe, it, expect } from 'vitest'
import { classeDeFrequencia, nomeDaClasse, regiaoDoCorpo, votarNota, extrairNotaDoNome } from '@shared/nota'

describe('extrairNotaDoNome (one-shots)', () => {
  it('lê a nota no fim do nome, com acidente, oitava ou modo', () => {
    expect(extrairNotaDoNome('TN_808_one_shot_long_C')).toBe('C')
    expect(extrairNotaDoNome('Bass F#1')).toBe('F#')
    expect(extrairNotaDoNome('Sub (G)')).toBe('G')
    expect(extrairNotaDoNome('Keys_Stab_Bb')).toBe('A#')
    expect(extrairNotaDoNome('808 Glide - D#m')).toBe('D#')
    expect(extrairNotaDoNome('Pluck_Eflat_2')).toBe('D#')
  })

  it('não confunde palavras ou letras no meio do nome com nota', () => {
    expect(extrairNotaDoNome('A Kick Punchy')).toBeNull()
    expect(extrairNotaDoNome('Bass Deep')).toBeNull()
    expect(extrairNotaDoNome('Snare_01')).toBeNull()
    expect(extrairNotaDoNome('808 - Cool')).toBeNull()
  })
})

describe('conversões de nota', () => {
  it('converte frequência para classe de nota (sem oitava)', () => {
    expect(classeDeFrequencia(440)).toBe(9) // A4
    expect(classeDeFrequencia(55)).toBe(9) // A1
    expect(classeDeFrequencia(261.63)).toBe(0) // C4
    expect(classeDeFrequencia(46.25)).toBe(6) // F#1
    expect(classeDeFrequencia(452)).toBe(9) // 47 cents acima de A ainda é A
  })

  it('nomeia classes com sustenido', () => {
    expect(nomeDaClasse(0)).toBe('C')
    expect(nomeDaClasse(1)).toBe('C#')
    expect(nomeDaClasse(10)).toBe('A#')
  })
})

describe('regiaoDoCorpo', () => {
  const taxa = 1000

  it('começa 20 ms depois do pico e termina quando o som cai 30 dB', () => {
    const x = new Float32Array(1000)
    x[100] = 1
    for (let i = 101; i < 600; i++) {
      x[i] = 0.5
    }
    x.fill(0.01, 600, 800) // -40 dB: já é silêncio
    expect(regiaoDoCorpo(x, taxa)).toEqual({ inicio: 120, fim: 599 })
  })

  it('silêncio não tem corpo', () => {
    expect(regiaoDoCorpo(new Float32Array(500), taxa)).toBeNull()
  })
})

describe('votarNota', () => {
  it('escolhe a nota mais votada e informa o consenso', () => {
    const r = votarNota([110, 110.5, 109.8, 220, 164.8]) // A A A A(oitava) E
    expect(r).toEqual({ classe: 9, consenso: 0.8, total: 5 })
  })

  it('ignora alturas inválidas e exige ao menos 3 votos', () => {
    expect(votarNota([0, -1, NaN, 110, 110])).toBeNull()
    expect(votarNota([])).toBeNull()
  })

  it('consenso baixo quando a nota desliza (glide)', () => {
    const glide = [110, 116.5, 123.5, 130.8, 138.6, 146.8] // A → D subindo
    const r = votarNota(glide)
    expect(r?.consenso).toBeLessThan(0.5)
  })
})
