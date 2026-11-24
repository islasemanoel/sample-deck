import { calcularPicos } from '@shared/audio'
import { CATEGORIAS } from '@shared/analiseNome'
import type { Sample } from '@shared/tipos'
import { motor } from './motorAudio'

/** Imagem que acompanha o cursor durante o arrasto nativo: cartão reto com sombra roxa. */

/** Tira só extensões de áudio conhecidas ("16. PYREX" não tem extensão). */
export function semExtensao(nome: string): string {
  return nome.replace(/\.(wav|mp3|flac|aif|aiff|ogg|m4a|aac|wma|opus)$/i, '')
}

const ESCALA = 1
const MARGEM = 18 // espaço para a sombra roxa não ser cortada
const CARTAO_L = 250
const CARTAO_A = 58
const LARGURA = CARTAO_L + MARGEM * 2
const ALTURA = CARTAO_A + MARGEM * 2
const BARRAS = 36
const ROXO = '168, 85, 247'

export function picosDe(sample: Sample): number[] {
  const buffer = motor.bufferPronto(sample)
  if (buffer) {
    return calcularPicos(buffer.getChannelData(0), BARRAS)
  }
  // Áudio ainda não carregado: forma de onda estável derivada do nome
  let h = 2166136261
  for (const c of sample.nome) {
    h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  }
  return Array.from({ length: BARRAS }, (_, i) => {
    h = Math.imul(h ^ i, 16777619) >>> 0
    return 0.25 + (h % 1000) / 1000 * 0.75
  })
}

function retanguloArredondado(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath()
  c.moveTo(x + r, y)
  c.arcTo(x + w, y, x + w, y + h, r)
  c.arcTo(x + w, y + h, x, y + h, r)
  c.arcTo(x, y + h, x, y, r)
  c.arcTo(x, y, x + w, y, r)
  c.closePath()
}

function cortarTexto(c: CanvasRenderingContext2D, texto: string, largura: number): string {
  if (c.measureText(texto).width <= largura) {
    return texto
  }
  let t = texto
  while (t.length > 1 && c.measureText(`${t}…`).width > largura) {
    t = t.slice(0, -1)
  }
  return `${t}…`
}

/** Gera o PNG (base64, sem prefixo) do cartão de arrasto, ou null se o canvas não estiver disponível. */
export function gerarCartaoArrasto(sample: Sample): string | null {
  const cv = document.createElement('canvas')
  cv.width = LARGURA * ESCALA
  cv.height = ALTURA * ESCALA
  const c = cv.getContext('2d')
  if (!c) {
    return null
  }
  c.scale(ESCALA, ESCALA)
  c.translate(LARGURA / 2, ALTURA / 2)

  // Cartão reto (o arrasto do sistema é uma imagem fixa)
  const x = -CARTAO_L / 2
  const y = -CARTAO_A / 2
  c.save()
  c.shadowColor = `rgba(${ROXO}, 0.65)`
  c.shadowBlur = 14
  c.shadowOffsetY = 3
  retanguloArredondado(c, x, y, CARTAO_L, CARTAO_A, 12)
  c.fillStyle = '#23242b'
  c.fill()
  c.restore()
  retanguloArredondado(c, x + 0.5, y + 0.5, CARTAO_L - 1, CARTAO_A - 1, 12)
  c.strokeStyle = 'rgba(255, 255, 255, 0.12)'
  c.lineWidth = 1
  c.stroke()

  // Miniatura com a cor da categoria
  const cor = CATEGORIAS[sample.categoria]?.cor ?? '#a855f7'
  const lado = CARTAO_A - 14
  const grad = c.createLinearGradient(x + 7, y + 7, x + 7 + lado, y + 7 + lado)
  grad.addColorStop(0, cor)
  grad.addColorStop(1, '#1b1c22')
  retanguloArredondado(c, x + 7, y + 7, lado, lado, 8)
  c.fillStyle = grad
  c.fill()

  // Nome
  const tx = x + lado + 17
  const tl = CARTAO_L - lado - 17 - 12
  c.font = '600 13px "Segoe UI", system-ui, sans-serif'
  c.fillStyle = '#f2f2f5'
  c.textBaseline = 'alphabetic'
  c.fillText(cortarTexto(c, semExtensao(sample.nome), tl), tx, y + 24)

  // Forma de onda
  const picos = picosDe(sample)
  const max = Math.max(0.0001, ...picos)
  const passo = tl / picos.length
  const meio = y + 42
  c.fillStyle = `rgb(${ROXO})`
  picos.forEach((p, i) => {
    const h = Math.max(2, (p / max) * 18)
    c.fillRect(tx + i * passo, meio - h / 2, Math.max(1.5, passo - 1.5), h)
  })

  return cv.toDataURL('image/png').replace(/^data:image\/png;base64,/, '')
}
