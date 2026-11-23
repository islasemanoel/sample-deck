import { describe, expect, it } from 'vitest'
import { alteraAudio, CONFIG_PADRAO, nomeArquivoSeguro, renderizarPad, formatarDuracao, formatarTempo, lerTempo, letraDoGrupo, normalizarConfigPad, padsACortar, temCorte, trechoDoPad } from '../src/shared/pads'

describe('normalizarConfigPad', () => {
  it('usa o padrão para entradas vazias ou inválidas', () => {
    expect(normalizarConfigPad(undefined)).toEqual(CONFIG_PADRAO)
    expect(normalizarConfigPad({ modo: 'x' as never, volume: NaN, pan: NaN, tom: NaN })).toEqual(CONFIG_PADRAO)
  })

  it('limita volume, pan e tom', () => {
    expect(normalizarConfigPad({ volume: 3, pan: -5, tom: 40 })).toMatchObject({ volume: 1, pan: -1, tom: 12 })
    expect(normalizarConfigPad({ volume: -1, tom: -40 })).toMatchObject({ volume: 0, tom: -12 })
  })

  it('mantém modos válidos', () => {
    expect(normalizarConfigPad({ modo: 'gate' }).modo).toBe('gate')
    expect(normalizarConfigPad({ modo: 'loop' }).modo).toBe('loop')
  })
})

describe('trecho do pad', () => {
  it('valida início e fim salvos', () => {
    expect(normalizarConfigPad({ inicio: 1.5, fim: 3 })).toMatchObject({ inicio: 1.5, fim: 3 })
    expect(normalizarConfigPad({ inicio: -2, fim: NaN })).toMatchObject({ inicio: 0, fim: null })
    // fim antes do início é descartado
    expect(normalizarConfigPad({ inicio: 2, fim: 1 })).toMatchObject({ inicio: 2, fim: null })
    expect(temCorte(CONFIG_PADRAO)).toBe(false)
    expect(temCorte({ ...CONFIG_PADRAO, fim: 0.5 })).toBe(true)
  })

  it('ajusta o trecho à duração real', () => {
    expect(trechoDoPad({ inicio: 0, fim: null }, 2, 48000)).toEqual({ inicio: 0, fim: 2 })
    expect(trechoDoPad({ inicio: 0.5, fim: 10 }, 2, 48000)).toEqual({ inicio: 0.5, fim: 2 })
    const t = trechoDoPad({ inicio: 5, fim: null }, 2, 48000)
    expect(t.fim).toBe(2)
    expect(t.inicio).toBeLessThan(2)
    expect(t.fim - t.inicio).toBeCloseTo(1 / 48000, 9)
  })

  it('formata e lê tempos', () => {
    expect(formatarTempo(1.2345)).toBe('1.234')
    expect(formatarTempo(65.3, 1)).toBe('1:05.3')
    expect(formatarTempo(59.9999, 2)).toBe('1:00.00')
    expect(formatarDuracao(0.00042)).toBe('0.42 ms')
    expect(formatarDuracao(0.125)).toBe('125.0 ms')
    expect(formatarDuracao(2.35)).toBe('2.350 s')
    expect(lerTempo('1,25')).toBe(1.25)
    expect(lerTempo('250ms')).toBe(0.25)
    expect(lerTempo('1:05.3')).toBeCloseTo(65.3)
    expect(lerTempo('2s')).toBe(2)
    expect(lerTempo('abc')).toBeNull()
  })
})

describe('grupo de corte', () => {
  it('valida o grupo salvo', () => {
    expect(normalizarConfigPad({ grupo: 2 }).grupo).toBe(2)
    expect(normalizarConfigPad({ grupo: 0 }).grupo).toBeNull()
    expect(normalizarConfigPad({ grupo: 9 }).grupo).toBeNull()
    expect(normalizarConfigPad({ grupo: 1.5 }).grupo).toBeNull()
    expect(normalizarConfigPad(undefined).grupo).toBeNull()
  })

  it('corta só os outros pads do mesmo grupo', () => {
    const c = (grupo: number | null) => ({ ...CONFIG_PADRAO, grupo })
    const configs = [c(1), c(1), c(2), c(null), c(1)]
    expect(padsACortar(configs, 0)).toEqual([1, 4])
    expect(padsACortar(configs, 2)).toEqual([])
    expect(padsACortar(configs, 3)).toEqual([])
    expect(letraDoGrupo(1)).toBe('A')
  })
})

describe('renderizarPad', () => {
  const rampa = (n: number): Float32Array => Float32Array.from({ length: n }, (_, i) => i / n)

  it('sem ajustes devolve o arquivo inteiro igual', () => {
    const c = rampa(100)
    const [s] = renderizarPad([c], 100, CONFIG_PADRAO)
    expect(Array.from(s)).toEqual(Array.from(c))
    expect(alteraAudio(CONFIG_PADRAO)).toBe(false)
  })

  it('corta o trecho e aplica o volume', () => {
    const c = rampa(100)
    const cfg = { ...CONFIG_PADRAO, inicio: 0.2, fim: 0.5, volume: 0.5 }
    const [s] = renderizarPad([c], 100, cfg)
    expect(s.length).toBe(30)
    expect(s[0]).toBeCloseTo(0.2 * 0.5)
    expect(s[29]).toBeCloseTo(0.49 * 0.5)
    expect(alteraAudio(cfg)).toBe(true)
  })

  it('o tom não muda a duração, como no disparo', () => {
    const c = rampa(1000)
    expect(renderizarPad([c], 1000, { ...CONFIG_PADRAO, tom: 12 })[0].length).toBe(1000)
    expect(renderizarPad([c], 1000, { ...CONFIG_PADRAO, tom: -12 })[0].length).toBe(1000)
  })

  it('o tom muda a frequência mantendo o tamanho do trecho', () => {
    const taxa = 44100
    const seno = new Float32Array(taxa).map((_, i) => Math.sin((2 * Math.PI * 440 * i) / taxa))
    const [s] = renderizarPad([seno], taxa, { ...CONFIG_PADRAO, tom: 12, inicio: 0.25, fim: 0.75 })
    expect(s.length).toBe(taxa / 2)
    // Conta cruzamentos por zero no miolo (longe das bordas): ~880 Hz
    let cruzamentos = 0
    const meio = s.subarray(4096, s.length - 4096)
    for (let i = 1; i < meio.length; i++) {
      if (meio[i - 1] < 0 !== meio[i] < 0) cruzamentos++
    }
    const freq = cruzamentos / 2 / (meio.length / taxa)
    expect(freq).toBeGreaterThan(870)
    expect(freq).toBeLessThan(890)
  })

  it('pan transforma mono em estéreo com a lei do StereoPanner', () => {
    const c = new Float32Array(10).fill(1)
    const esquerda = renderizarPad([c], 10, { ...CONFIG_PADRAO, pan: -1 })
    expect(esquerda).toHaveLength(2)
    expect(esquerda[0][0]).toBeCloseTo(1)
    expect(esquerda[1][0]).toBeCloseTo(0)
    const [e, d] = renderizarPad([c, new Float32Array(10)], 10, { ...CONFIG_PADRAO, pan: 1 })
    expect(e[0]).toBeCloseTo(0)
    expect(d[0]).toBeCloseTo(1)
  })
})

describe('nomeArquivoSeguro', () => {
  it('remove pastas e caracteres proibidos', () => {
    expect(nomeArquivoSeguro('..\\..\\x/kick: 1?.wav')).toBe('kick_ 1_.wav')
    expect(nomeArquivoSeguro('a\u0001b')).toBe('a_b')
    expect(nomeArquivoSeguro('  ')).toBe('pad')
  })
})
