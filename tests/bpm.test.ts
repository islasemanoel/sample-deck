import { describe, it, expect } from 'vitest'
import { contrasteDeEnergia, decodificarWavMono, reamostrar } from '@shared/bpm'
import { batida, geradorRuido } from './sinteticos'
import { codificarWav } from '@shared/audio'

/** Monta um WAV à mão (cabeçalho + dados brutos), para formatos que o codificador não gera. */
function wavBruto(opcoes: { formato: number; canais: number; taxa: number; bits: number; dados: Uint8Array; extensivel?: boolean; tamanhoDataFalso?: number }): Uint8Array {
  const tamFmt = opcoes.extensivel ? 40 : 16
  const buf = new Uint8Array(12 + 8 + tamFmt + 8 + opcoes.dados.length)
  const v = new DataView(buf.buffer)
  const txt = (p: number, t: string): void => [...t].forEach((c, i) => (buf[p + i] = c.charCodeAt(0)))
  txt(0, 'RIFF')
  v.setUint32(4, buf.length - 8, true)
  txt(8, 'WAVE')
  txt(12, 'fmt ')
  v.setUint32(16, tamFmt, true)
  v.setUint16(20, opcoes.extensivel ? 0xfffe : opcoes.formato, true)
  v.setUint16(22, opcoes.canais, true)
  v.setUint32(24, opcoes.taxa, true)
  const bloco = (opcoes.canais * opcoes.bits) / 8
  v.setUint32(28, opcoes.taxa * bloco, true)
  v.setUint16(32, bloco, true)
  v.setUint16(34, opcoes.bits, true)
  if (opcoes.extensivel) {
    v.setUint16(36, 22, true)
    v.setUint16(44, opcoes.formato, true) // subformato (2 primeiros bytes do GUID)
  }
  const pData = 20 + tamFmt
  txt(pData, 'data')
  v.setUint32(pData + 4, opcoes.tamanhoDataFalso ?? opcoes.dados.length, true)
  buf.set(opcoes.dados, pData + 8)
  return buf
}

describe('decodificarWavMono', () => {
  it('lê PCM 16 bits estéreo misturando os canais', () => {
    const wav = codificarWav([new Float32Array([0.5, -0.5]), new Float32Array([0.5, 0.5])], 8000)
    const r = decodificarWavMono(wav, 60)
    expect(r?.taxa).toBe(8000)
    expect([...(r?.amostras ?? [])].map((x) => Number(x.toFixed(3)))).toEqual([0.5, 0])
  })

  it('lê PCM 24 bits (inclusive no formato extensível)', () => {
    // 0x400000 = +0.5 ; 0xC00000 = -0.5
    const dados = new Uint8Array([0x00, 0x00, 0x40, 0x00, 0x00, 0xc0])
    for (const extensivel of [false, true]) {
      const r = decodificarWavMono(wavBruto({ formato: 1, canais: 1, taxa: 44100, bits: 24, dados, extensivel }), 60)
      expect([...(r?.amostras ?? [])]).toEqual([0.5, -0.5])
    }
  })

  it('lê ponto flutuante 32 bits', () => {
    const f = new Float32Array([0.25, -0.75])
    const r = decodificarWavMono(wavBruto({ formato: 3, canais: 1, taxa: 48000, bits: 32, dados: new Uint8Array(f.buffer) }), 60)
    expect([...(r?.amostras ?? [])]).toEqual([0.25, -0.75])
  })

  it('tolera bloco "data" com tamanho maior que o arquivo (gravação interrompida)', () => {
    const dados = new Uint8Array(new Int16Array([16384, -16384]).buffer)
    const r = decodificarWavMono(wavBruto({ formato: 1, canais: 1, taxa: 8000, bits: 16, dados, tamanhoDataFalso: 0xffffffff }), 60)
    expect([...(r?.amostras ?? [])]).toEqual([0.5, -0.5])
  })

  it('limita a quantidade de segundos lidos', () => {
    const r = decodificarWavMono(codificarWav([new Float32Array(8000 * 5)], 8000), 2)
    expect(r?.amostras.length).toBe(16000)
  })

  it('rejeita o que não é WAV ou formato não suportado', () => {
    expect(decodificarWavMono(new Uint8Array([1, 2, 3, 4]), 60)).toBeNull()
    expect(decodificarWavMono(new TextEncoder().encode('RIFF....WAVEjunk'), 60)).toBeNull()
    const adpcm = wavBruto({ formato: 2, canais: 1, taxa: 8000, bits: 4, dados: new Uint8Array(10) })
    expect(decodificarWavMono(adpcm, 60)).toBeNull()
  })
})

describe('contrasteDeEnergia', () => {
  const taxa = 22050

  it('levada de bateria tem contraste alto', () => {
    expect(contrasteDeEnergia(batida(92, { compassos: 2 }).amostras, taxa)).toBeGreaterThan(3)
  })

  it('tom contínuo e ruído branco ficam perto de 1', () => {
    const tom = new Float32Array(taxa * 2).map((_, i) => Math.sin((2 * Math.PI * 220 * i) / taxa))
    const rnd = geradorRuido(5)
    const ruido = new Float32Array(taxa * 2).map(() => rnd())
    expect(contrasteDeEnergia(tom, taxa)).toBeLessThan(1.3)
    expect(contrasteDeEnergia(ruido, taxa)).toBeLessThan(1.6)
  })

  it('silêncio tem contraste zero e um único ataque isolado tem contraste infinito', () => {
    expect(contrasteDeEnergia(new Float32Array(taxa), taxa)).toBe(0)
    const x = new Float32Array(taxa)
    x.fill(0.8, 0, 2000)
    expect(contrasteDeEnergia(x, taxa)).toBe(Infinity)
  })
})

describe('reamostrar', () => {
  it('mantém o sinal quando a taxa já é a pedida', () => {
    const x = new Float32Array([0.1, 0.2, 0.3])
    expect(reamostrar(x, 44100, 44100)).toBe(x)
  })

  it('dobra a quantidade de amostras de 22050 para 44100, interpolando', () => {
    const r = reamostrar(new Float32Array([0, 1, 0]), 22050, 44100)
    expect(r.length).toBe(6)
    expect([...r].map((v) => Number(v.toFixed(2)))).toEqual([0, 0.5, 1, 0.5, 0, 0])
  })

  it('reduz 48000 para 44100 preservando a duração e a frequência de um tom', () => {
    const x = new Float32Array(48000).map((_, i) => Math.sin((2 * Math.PI * 100 * i) / 48000))
    const r = reamostrar(x, 48000, 44100)
    expect(r.length).toBe(44100)
    // um quarto de período de 100 Hz depois: pico do seno
    expect(r[Math.round(44100 / 400)]).toBeCloseTo(1, 2)
  })
})
