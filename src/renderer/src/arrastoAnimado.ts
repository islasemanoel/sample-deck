import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Sample } from '@shared/tipos'
import { Arte } from './componentes/Arte'
import fonteUrl from '@fontsource/inter/files/inter-latin-600-normal.woff2?url'
import { picosDe, semExtensao } from './cartaoArrasto'

/** Inter 600 em base64: a janela externa não enxerga a fonte do app. */
let fonteBase64 = ''
void fetch(fonteUrl)
  .then((r) => r.arrayBuffer())
  .then((buf) => {
    let bin = ''
    const bytes = new Uint8Array(buf)
    for (let i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    }
    fonteBase64 = btoa(bin)
  })
  .catch(() => undefined)

/**
 * Arrasto animado dentro da janela: um cartão HTML segue o cursor com atraso, inclina conforme
 * a velocidade, brilha e tem a onda "dançando". Ao chegar na borda da janela entrega o arrasto
 * ao sistema (`entregarAoSistema`), que é o único jeito de soltar na DAW ou no Explorer.
 * Soltar sobre um pad dentro do app dispara um "drop" sintético nele.
 */

const BORDA = 3
/**
 * Área ocupada pelo cartão (com o brilho) em relação ao ponto que segue o cursor. Quando qualquer
 * parte dela encosta na borda da janela, o cartão externo assume para o interno não ser cortado.
 */
const AREA = { esquerda: 70 - 14, topo: 60 - 14, direita: 14 + 250 + 70, baixo: 14 + 50 + 60 }
const MAX_INCLINACAO = 14

let ativo = false

export function arrastoAnimadoAtivo(): boolean {
  return ativo
}

function criarCartao(sample: Sample): HTMLDivElement {
  const el = document.createElement('div')
  el.className = 'cartao-arrasto'
  // Mesma arte da coluna "Pasta" da lista (mesma semente), em SVG estático
  const capa = renderToStaticMarkup(createElement(Arte, { semente: sample.pastaRelativa || sample.pastaRaiz, tamanho: 34, raio: 3 }))
  const picos = picosDe(sample)
  const max = Math.max(0.0001, ...picos)
  // Fases presas ao relógio: o cartão externo calcula as mesmas e os pulsos coincidem na troca
  const agora = Date.now()
  const barras = picos
    .map((p, i) => {
      const h = Math.max(12, Math.round((p / max) * 100))
      return `<i style="height:${h}%;animation-delay:${-((i * 97 + agora) % 900)}ms"></i>`
    })
    .join('')
  el.innerHTML =
    `<div class="cartao-arrasto-brilho" style="animation-delay:${-(agora % 1600)}ms"></div>` +
    `<div class="cartao-arrasto-corpo">` +
    `<div class="cartao-arrasto-capa">${capa}</div>` +
    `<div class="cartao-arrasto-texto"><b></b><div class="cartao-arrasto-onda">${barras}</div></div>` +
    `</div>`
  el.querySelector('b')!.textContent = semExtensao(sample.nome)
  return el
}

/** Variáveis de cor usadas pelo cartão, com os valores do tema atual. */
const VARIAVEIS_CARTAO = ['--azul', '--superficie', '--borda-forte', '--texto']

function variaveisDoTema(): string {
  const estilo = getComputedStyle(document.documentElement)
  return VARIAVEIS_CARTAO.map((v) => `${v}:${estilo.getPropertyValue(v).trim()}`).join(';')
}

/** Documento autônomo do cartão (CSS, fonte embutida e um script de inclinação) para a janela que segue o cursor fora do app. */
function htmlSeguidor(cartao: HTMLElement): string {
  const regras: string[] = []
  for (const folha of Array.from(document.styleSheets)) {
    try {
      for (const r of Array.from(folha.cssRules)) {
        if (r.cssText.includes('cartao-arrasto') && !r.cssText.startsWith('body')) {
          regras.push(r.cssText)
        }
      }
    } catch {
      // folha de outra origem: ignora
    }
  }
  const clone = cartao.cloneNode(true) as HTMLElement
  clone.removeAttribute('style')
  return (
    `<!doctype html><html><head><meta charset="utf-8">` +
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:; script-src 'unsafe-inline'">` +
    `<style>` +
    (fonteBase64 ? `@font-face{font-family:'Inter';font-weight:600;src:url(data:font/woff2;base64,${fonteBase64}) format('woff2')}` : '') +
    // A janela externa não herda as variáveis do app: leva as cores do tema atual
    `:root{${variaveisDoTema()}}` +
    `*{box-sizing:border-box}html,body{margin:0;background:transparent;overflow:hidden;font-family:'Inter','Segoe UI',system-ui,sans-serif;font-size:13px;-webkit-font-smoothing:antialiased}` +
    regras.join(' ') +
    // Começa invisível (a opacidade é trocada na borda) e sem a animação de entrada
    `body{opacity:0}.cartao-arrasto{position:absolute;left:70px;top:60px;transform:rotate(-5deg)}.cartao-arrasto-corpo{animation:none}` +
    `</style></head><body>${clone.outerHTML}` +
    `<script>const n=Date.now();` +
    `document.querySelector('.cartao-arrasto-brilho').style.animationDelay=-(n%1600)+'ms';` +
    `document.querySelectorAll('.cartao-arrasto-onda i').forEach((b,i)=>{b.style.animationDelay=-((i*97+n)%900)+'ms'});` +
    // Mesma inclinação por velocidade do cartão da interface, lida do deslocamento da própria janela
    `const c=document.querySelector('.cartao-arrasto');let lx=screenX,t=-5;` +
    `(function f(){const vx=screenX-lx;lx=screenX;` +
    `t+=((Math.max(-14,Math.min(14,vx*1.6))-5)-t)*0.2;` +
    `c.style.transform='rotate('+t+'deg)';requestAnimationFrame(f)})()</script></body></html>`
  )
}

function padSob(x: number, y: number): HTMLElement | null {
  const el = document.elementFromPoint(x, y)
  return el instanceof Element ? (el.closest('[data-pad]') as HTMLElement | null) : null
}

/** Depois da entrega ao sistema: avisa o processo principal quando o mouse volta sem botão (arrasto acabou). */
function vigiarFimDoArrastoNativo(): void {
  const fim = (e: Event): void => {
    if (e.type === 'mousemove' && (e as MouseEvent).buttons !== 0) {
      return
    }
    window.removeEventListener('mousemove', fim, true)
    window.removeEventListener('mouseup', fim, true)
    window.removeEventListener('dragend', fim, true)
    window.api.cancelarArrasto()
  }
  window.addEventListener('mousemove', fim, true)
  window.addEventListener('mouseup', fim, true)
  window.addEventListener('dragend', fim, true)
}

export function iniciarArrastoAnimado(sample: Sample, xInicial: number, yInicial: number, entregarAoSistema: () => void, aoTerminar: () => void): void {
  if (ativo) {
    return
  }
  ativo = true
  const cartao = criarCartao(sample)
  document.body.appendChild(cartao)
  document.body.classList.add('arrastando-sample')
  window.api.prepararArrasto(htmlSeguidor(cartao), xInicial, yInicial)

  let alvoX = xInicial
  let alvoY = yInicial
  let x = xInicial
  let y = yInicial
  let inclinacao = 0
  let quadro = 0
  let padAtual: HTMLElement | null = null
  let externoVisivel = false
  // O interno só some quando o externo confirma que já pintou: nunca ficam os dois ausentes
  const pararAviso = window.api.aoArrastoExternoVisivel(() => {
    if (externoVisivel) {
      cartao.style.opacity = '0'
    }
  })

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

  const encerrar = (entregue = false): void => {
    pararAviso()
    if (!entregue) {
      window.api.cancelarArrasto()
    }
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
      encerrar(true)
      entregarAoSistema()
      vigiarFimDoArrastoNativo()
      return
    }
    // Usa a maior entre a posição do cursor e a do cartão (que vem atrás com a mola)
    const naZona =
      Math.min(e.clientX, x) - AREA.esquerda <= 0 ||
      Math.min(e.clientY, y) - AREA.topo <= 0 ||
      Math.max(e.clientX, x) + AREA.direita >= window.innerWidth ||
      Math.max(e.clientY, y) + AREA.baixo >= window.innerHeight
    if (naZona && !externoVisivel) {
      externoVisivel = true
      window.api.mostrarArrasto()
    } else if (!naZona && externoVisivel) {
      externoVisivel = false
      cartao.style.opacity = ''
      window.api.esconderArrasto()
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
