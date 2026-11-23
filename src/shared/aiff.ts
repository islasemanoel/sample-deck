/**
 * Decodificador de AIFF / AIFF-C em TypeScript puro.
 *
 * O Chromium (e portanto o Electron) não decodifica AIFF em `decodeAudioData`,
 * então a leitura é feita aqui e o resultado vira um AudioBuffer no renderer.
 */

export interface AudioDecodificado {
  /** Um Float32Array por canal, valores entre -1 e 1. */
  canais: Float32Array[]
  /** Taxa de amostragem em Hz. */
  taxa: number
}

function texto(v: DataView, pos: number): string {
  return String.fromCharCode(v.getUint8(pos), v.getUint8(pos + 1), v.getUint8(pos + 2), v.getUint8(pos + 3))
}

/** Indica se os bytes começam com o cabeçalho de um arquivo AIFF ou AIFF-C. */
export function ehAiff(dados: ArrayBuffer): boolean {
  if (dados.byteLength < 12) {
    return false
  }
  const v = new DataView(dados)
  const forma = texto(v, 8)
  return texto(v, 0) === 'FORM' && (forma === 'AIFF' || forma === 'AIFC')
}

/** Lê um número de ponto flutuante estendido de 80 bits (IEEE 754, big-endian). */
function lerEstendido(v: DataView, pos: number): number {
  const expoente = v.getUint16(pos) & 0x7fff
  const sinal = v.getUint16(pos) & 0x8000 ? -1 : 1
  const alto = v.getUint32(pos + 2)
  const baixo = v.getUint32(pos + 6)
  if (expoente === 0 && alto === 0 && baixo === 0) {
    return 0
  }
  const mantissa = alto * 2 ** 32 + baixo
  return sinal * mantissa * 2 ** (expoente - 16383 - 63)
}

type Formato = 'int-be' | 'int-le' | 'uint8' | 'float32' | 'float64' | 'ulaw' | 'alaw'

function formatoDaCompressao(tipo: string): Formato {
  switch (tipo) {
    case 'NONE':
    case 'twos':
      return 'int-be'
    case 'sowt':
      return 'int-le'
    case 'raw ':
      return 'uint8'
    case 'fl32':
    case 'FL32':
      return 'float32'
    case 'fl64':
    case 'FL64':
      return 'float64'
    case 'ulaw':
    case 'ULAW':
      return 'ulaw'
    case 'alaw':
    case 'ALAW':
      return 'alaw'
    default:
      throw new Error(`Compressão AIFF-C não suportada: "${tipo.trim()}"`)
  }
}

function ulaw(b: number): number {
  const u = ~b & 0xff
  const t = (((u & 0x0f) << 3) + 0x84) << ((u & 0x70) >> 4)
  return (u & 0x80 ? 0x84 - t : t - 0x84) / 32768
}

function alaw(b: number): number {
  const a = b ^ 0x55
  const seg = (a & 0x70) >> 4
  let t = (a & 0x0f) << 4
  t = seg === 0 ? t + 8 : ((t + 0x108) << (seg - 1))
  return (a & 0x80 ? t : -t) / 32768
}

/** Decodifica um arquivo AIFF / AIFF-C completo. Lança erro se o formato não for suportado. */
export function decodificarAiff(dados: ArrayBuffer): AudioDecodificado {
  if (!ehAiff(dados)) {
    throw new Error('Não é um arquivo AIFF')
  }
  const v = new DataView(dados)
  const aifc = texto(v, 8) === 'AIFC'
  let nCanais = 0
  let quadros = 0
  let bits = 0
  let taxa = 0
  let formato: Formato = 'int-be'
  let inicioDados = -1
  let fimDados = -1

  let pos = 12
  const fim = Math.min(dados.byteLength, 8 + v.getUint32(4))
  while (pos + 8 <= fim) {
    const id = texto(v, pos)
    const tamanho = v.getUint32(pos + 4)
    const corpo = pos + 8
    if (id === 'COMM') {
      nCanais = v.getUint16(corpo)
      quadros = v.getUint32(corpo + 2)
      bits = v.getUint16(corpo + 6)
      taxa = lerEstendido(v, corpo + 8)
      if (aifc && tamanho >= 22) {
        formato = formatoDaCompressao(texto(v, corpo + 18))
      }
    } else if (id === 'SSND') {
      const deslocamento = v.getUint32(corpo)
      inicioDados = corpo + 8 + deslocamento
      fimDados = Math.min(corpo + tamanho, dados.byteLength)
    }
    pos = corpo + tamanho + (tamanho % 2) // blocos têm tamanho par
  }

  if (nCanais === 0 || taxa <= 0) {
    throw new Error('Arquivo AIFF sem bloco COMM válido')
  }
  if (inicioDados < 0) {
    throw new Error('Arquivo AIFF sem dados de áudio (SSND)')
  }

  let bytesAmostra: number
  if (formato === 'float32') {
    bytesAmostra = 4
  } else if (formato === 'float64') {
    bytesAmostra = 8
  } else if (formato === 'ulaw' || formato === 'alaw' || formato === 'uint8') {
    bytesAmostra = 1
  } else {
    bytesAmostra = Math.ceil(bits / 8)
    if (bytesAmostra < 1 || bytesAmostra > 4) {
      throw new Error(`Resolução AIFF não suportada: ${bits} bits`)
    }
  }

  const bytesQuadro = bytesAmostra * nCanais
  quadros = Math.min(quadros, Math.floor(Math.max(0, fimDados - inicioDados) / bytesQuadro))
  const canais = Array.from({ length: nCanais }, () => new Float32Array(quadros))
  const escala = 2 ** (bytesAmostra * 8 - 1)

  const ler = (p: number): number => {
    switch (formato) {
      case 'float32':
        return v.getFloat32(p)
      case 'float64':
        return v.getFloat64(p)
      case 'ulaw':
        return ulaw(v.getUint8(p))
      case 'alaw':
        return alaw(v.getUint8(p))
      case 'uint8':
        return (v.getUint8(p) - 128) / 128
      default: {
        const le = formato === 'int-le'
        let x = 0
        for (let i = 0; i < bytesAmostra; i++) {
          x = x * 256 + v.getUint8(p + (le ? bytesAmostra - 1 - i : i))
        }
        if (x >= escala) {
          x -= escala * 2
        }
        return x / escala
      }
    }
  }

  let p = inicioDados
  for (let q = 0; q < quadros; q++) {
    for (let c = 0; c < nCanais; c++) {
      canais[c][q] = ler(p)
      p += bytesAmostra
    }
  }
  return { canais, taxa: Math.round(taxa) }
}
