/**
 * Preparação de áudio para a estimativa de BPM: leitura de WAV em mono e conversão
 * de taxa de amostragem. A estimativa em si fica em src/main/detectorBpm.ts (Essentia).
 */

/** Áudio mono para análise. */
export interface AudioMono {
  taxa: number
  amostras: Float32Array
}

/**
 * Decodifica um WAV (PCM 8/16/24/32 bits, float 32/64, inclusive WAVE_FORMAT_EXTENSIBLE)
 * misturando os canais em mono e lendo no máximo `maxSegundos`.
 * Retorna null se não for WAV ou se o formato não for suportado.
 */
export function decodificarWavMono(dados: Uint8Array, maxSegundos: number): AudioMono | null {
  if (dados.length < 12) {
    return null
  }
  const v = new DataView(dados.buffer, dados.byteOffset, dados.byteLength)
  const txt = (p: number): string => String.fromCharCode(dados[p], dados[p + 1], dados[p + 2], dados[p + 3])
  if (txt(0) !== 'RIFF' || txt(8) !== 'WAVE') {
    return null
  }
  let formato = 0
  let canais = 0
  let taxa = 0
  let bits = 0
  let inicioDados = -1
  let tamanhoDados = 0
  let p = 12
  while (p + 8 <= dados.length) {
    const id = txt(p)
    const tam = v.getUint32(p + 4, true)
    const corpo = p + 8
    if (id === 'fmt ' && corpo + 16 <= dados.length) {
      formato = v.getUint16(corpo, true)
      canais = v.getUint16(corpo + 2, true)
      taxa = v.getUint32(corpo + 4, true)
      bits = v.getUint16(corpo + 14, true)
      if (formato === 0xfffe && tam >= 26 && corpo + 26 <= dados.length) {
        formato = v.getUint16(corpo + 24, true)
      }
    } else if (id === 'data') {
      inicioDados = corpo
      tamanhoDados = Math.min(tam, dados.length - corpo)
      break
    }
    p = corpo + tam + (tam % 2)
  }
  const bytes = bits / 8
  const suportado =
    (formato === 1 && [8, 16, 24, 32].includes(bits)) || (formato === 3 && (bits === 32 || bits === 64))
  if (inicioDados < 0 || !suportado || canais < 1 || taxa < 1000) {
    return null
  }
  const bloco = bytes * canais
  const quadros = Math.min(Math.floor(tamanhoDados / bloco), Math.floor(maxSegundos * taxa))
  const ler = (pos: number): number => {
    if (formato === 3) {
      return bits === 32 ? v.getFloat32(pos, true) : v.getFloat64(pos, true)
    }
    switch (bits) {
      case 8:
        return (dados[pos] - 128) / 128
      case 16:
        return v.getInt16(pos, true) / 32768
      case 24: {
        const x = dados[pos] | (dados[pos + 1] << 8) | (dados[pos + 2] << 16)
        return ((x << 8) >> 8) / 8388608
      }
      default:
        return v.getInt32(pos, true) / 2147483648
    }
  }
  const amostras = new Float32Array(quadros)
  for (let q = 0; q < quadros; q++) {
    let soma = 0
    const base = inicioDados + q * bloco
    for (let c = 0; c < canais; c++) {
      soma += ler(base + c * bytes)
    }
    amostras[q] = soma / canais
  }
  return { taxa, amostras }
}

/**
 * Converte a taxa de amostragem por interpolação linear (suficiente para análise de ritmo).
 * Retorna o próprio sinal se a taxa já for a pedida.
 */
export function reamostrar(x: Float32Array, de: number, para: number): Float32Array {
  if (de === para) {
    return x
  }
  const n = Math.round((x.length * para) / de)
  const saida = new Float32Array(n)
  const passo = de / para
  for (let i = 0; i < n; i++) {
    const pos = i * passo
    const j = Math.floor(pos)
    const f = pos - j
    const a = j < x.length ? x[j] : 0
    const b = j + 1 < x.length ? x[j + 1] : 0
    saida[i] = a + (b - a) * f
  }
  return saida
}

/**
 * Contraste dos ataques: energia do percentil 90 dividida pela mediana, em quadros de ~10 ms.
 * Som contínuo ou ruído fica perto de 1; uma levada passa facilmente de 3.
 * Usado para descartar sinais sem pulsação antes da estimativa (o Essentia "acha" BPM em ruído).
 * @returns 0 para silêncio, Infinity quando a mediana é silêncio e há ataques
 */
export function contrasteDeEnergia(x: Float32Array, taxa: number): number {
  const tamanho = Math.max(1, Math.round(taxa / 100))
  const n = Math.floor(x.length / tamanho)
  if (n === 0) {
    return 0
  }
  const energias = new Float32Array(n)
  for (let f = 0; f < n; f++) {
    let e = 0
    for (let i = f * tamanho; i < (f + 1) * tamanho; i++) {
      e += x[i] * x[i]
    }
    energias[f] = e
  }
  energias.sort()
  const mediana = energias[Math.floor(n * 0.5)]
  const p90 = energias[Math.floor(n * 0.9)]
  if (p90 <= 1e-10) {
    return 0
  }
  return mediana <= 1e-12 ? Infinity : p90 / mediana
}
