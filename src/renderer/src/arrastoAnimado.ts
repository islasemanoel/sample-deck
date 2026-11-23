import { CATEGORIAS } from '@shared/analiseNome'
import type { Sample } from '@shared/tipos'
import { picosDe, semExtensao } from './cartaoArrasto'

/**
 * Arrasto animado dentro da janela: um cartão HTML segue o cursor com atraso, inclina conforme
 * a velocidade, brilha e tem a onda "dançando". Ao chegar na borda da janela entrega o arrasto
 * ao sistema (`entregarAoSistema`), que é o único jeito de soltar na DAW ou no Explorer.
 * Soltar sobre um pad dentro do app dispara um "drop" sintético nele.
 */

const BORDA = 3
const MAX_INCLINACAO = 14

let ativo = false

export function arrastoAnimadoAtivo(): boolean {
  return ativo
}

function criarCartao(sample: Sample): HTMLDivElement {
  const el = document.createElement('div')
  el.className = 'cartao-arrasto'
  const cor = CATEGORIAS[sample.categoria]?.cor ?? '#a855f7'
  const picos = picosDe(sample)
  const max = Math.max(0.0001, ...picos)
  const barras = picos
    .map((p, i) => {
      const h = Math.max(12, Math.round((p / max) * 100))
      return `<i style="height:${h}%;animation-delay:${-((i * 97) % 900)}ms"></i>`
    })
    .join('')
  el.innerHTML =
    `<div class="cartao-arrasto-brilho"></div>` +
    `<div class="cartao-arrasto-corpo">` +
    `<div class="cartao-arrasto-capa" style="background:linear-gradient(135deg, ${cor}, #1b1c22)"></div>` +
    `<div class="cartao-arrasto-texto"><b></b><div class="cartao-arrasto-onda">${barras}</div></div>` +
    `</div>`
  el.querySelector('b')!.textContent = semExtensao(sample.nome)
  return el
}

function padSob(x: number, y: number): HTMLElement | null {
  const el = document.elementFromPoint(x, y)
  return el instanceof Element ? (el.closest('[data-pad]') as HTMLElement | null) : null
}

export function iniciarArrastoAnimado(sample: Sample, xInicial: number, yInicial: number, entregarAoSistema: () => void, aoTerminar: () => void): void {
  if (ativo) {
    return
  }
  ativo = true
  const cartao = criarCartao(sample)
  document.body.appendChild(cartao)
  document.body.classList.add('arrastando-sample')

  let alvoX = xInicial
  let alvoY = yInicial
  let x = xInicial
  let y = yInicial
  let inclinacao = 0
  let quadro = 0
  let padAtual: HTMLElement | null = null

  const marcarPad = (pad: HTMLElement | null): void => {
    if (pad === padAtual) {
      return
    }
    padAtual?.classList.remove('alvo-soltar')
    pad?.classList.add('alvo-soltar')
    padAtual = pad
  }

  const animar = (): void => {
    const nx = x + (alvoX - x) * 0.28
    const ny = y + (alvoY - y) * 0.28
    const vx = nx - x
    inclinacao += ((Math.max(-MAX_INCLINACAO, Math.min(MAX_INCLINACAO, vx * 1.6)) - 5) - inclinacao) * 0.2
    x = nx
    y = ny
    cartao.style.transform = `translate(${x + 14}px, ${y + 14}px) rotate(${inclinacao}deg)`
    quadro = requestAnimationFrame(animar)
  }
  cartao.style.transform = `translate(${x + 14}px, ${y + 14}px) rotate(-5deg)`
  quadro = requestAnimationFrame(animar)

  const encerrar = (): void => {
    cancelAnimationFrame(quadro)
    marcarPad(null)
    cartao.remove()
    document.body.classList.remove('arrastando-sample')
    window.removeEventListener('mousemove', aoMover, true)
    window.removeEventListener('mouseup', aoSoltar, true)
    window.removeEventListener('keydown', aoTecla, true)
    window.removeEventListener('blur', aoPerderFoco)
    ativo = false
  }

  const aoMover = (e: MouseEvent): void => {
    if (e.buttons === 0) {
      encerrar()
      aoTerminar()
      return
    }
    alvoX = e.clientX
    alvoY = e.clientY
    if (e.clientX <= BORDA || e.clientY <= BORDA || e.clientX >= window.innerWidth - BORDA || e.clientY >= window.innerHeight - BORDA) {
      encerrar()
      entregarAoSistema()
      return
    }
    marcarPad(padSob(e.clientX, e.clientY))
  }

  const aoSoltar = (e: MouseEvent): void => {
    const pad = padSob(e.clientX, e.clientY)
    encerrar()
    // O mouseup viraria um "click" no item de origem (tocar/selecionar): engole esse click.
    const engolir = (ev: Event): void => ev.stopPropagation()
    window.addEventListener('click', engolir, { capture: true, once: true })
    setTimeout(() => window.removeEventListener('click', engolir, true), 0)
    if (pad) {
      pad.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true }))
    }
    aoTerminar()
  }

  const aoTecla = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      encerrar()
      aoTerminar()
    }
  }

  const aoPerderFoco = (): void => {
    encerrar()
    aoTerminar()
  }

  window.addEventListener('mousemove', aoMover, true)
  window.addEventListener('mouseup', aoSoltar, true)
  window.addEventListener('keydown', aoTecla, true)
  window.addEventListener('blur', aoPerderFoco)
}
