/**
 * Utilitários de áudio puros (sem Web Audio), testáveis em Node.
 */

/**
 * Codifica canais em ponto flutuante como WAV PCM 16 bits intercalado.
 * @param canais um Float32Array por canal, todos do mesmo tamanho
 * @param taxa taxa de amostragem em Hz
 */
export function codificarWav(canais: Float32Array[], taxa: number): Uint8Array {
  if (canais.length === 0) {
    throw new Error('É preciso ao menos um canal')
  }
  const quadros = canais[0].length
  if (canais.some((c) => c.length !== quadros)) {
    throw new Error('Canais com tamanhos diferentes')
  }
  const nCanais = canais.length
  const bytesDados = quadros * nCanais * 2
  const saida = new Uint8Array(44 + bytesDados)
  const v = new DataView(saida.buffer)
  const escreverTexto = (pos: number, t: string): void => {
    for (let i = 0; i < t.length; i++) {
      saida[pos + i] = t.charCodeAt(i)
    }
  }
  escreverTexto(0, 'RIFF')
  v.setUint32(4, 36 + bytesDados, true)
  escreverTexto(8, 'WAVE')
  escreverTexto(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, nCanais, true)
  v.setUint32(24, taxa, true)
  v.setUint32(28, taxa * nCanais * 2, true)
  v.setUint16(32, nCanais * 2, true)
  v.setUint16(34, 16, true)
  escreverTexto(36, 'data')
  v.setUint32(40, bytesDados, true)
  let pos = 44
  for (let q = 0; q < quadros; q++) {
    for (let c = 0; c < nCanais; c++) {
      const x = Math.max(-1, Math.min(1, canais[c][q]))
      v.setInt16(pos, x < 0 ? Math.round(x * 32768) : Math.round(x * 32767), true)
      pos += 2
    }
  }
  return saida
}

/** Pico absoluto de cada um dos `barras` blocos do sinal (para desenhar a forma de onda). */
export function calcularPicos(dados: Float32Array, barras: number): number[] {
  const picos = new Array<number>(barras).fill(0)
  if (dados.length === 0) {
    return picos
  }
  for (let b = 0; b < barras; b++) {
    const ini = Math.floor((b * dados.length) / barras)
    const fim = Math.max(ini + 1, Math.floor(((b + 1) * dados.length) / barras))
    let pico = 0
    for (let i = ini; i < fim && i < dados.length; i++) {
      const a = Math.abs(dados[i])
      if (a > pico) {
        pico = a
      }
    }
    picos[b] = pico
  }
  return picos
}

/** Instantes (s) em que um loop deve recomeçar para preencher a duração total. */
export function inicioDasRepeticoes(duracaoLoop: number, duracaoTotal: number): number[] {
  if (!(duracaoLoop > 0)) {
    return [0]
  }
  const inicios: number[] = []
  for (let t = 0; t < duracaoTotal - 1e-9; t += duracaoLoop) {
    inicios.push(Number(t.toFixed(6)))
  }
  return inicios.length > 0 ? inicios : [0]
}
