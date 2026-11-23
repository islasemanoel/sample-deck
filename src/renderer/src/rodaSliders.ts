/**
 * Roda do mouse sobre qualquer `<input type="range">` aumenta/diminui o valor.
 *
 * Passo por giro: atributo `data-passo-roda` do input, ou 5% da faixa (nunca menor que o `step`).
 * Com Shift ou Ctrl o ajuste é fino: um `step` por giro.
 * O valor é aplicado pelo setter nativo + evento `input`, para o `onChange` do React disparar
 * normalmente em inputs controlados.
 */

const setterValor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set

function casasDecimais(n: number): number {
  const s = String(n)
  const i = s.indexOf('.')
  return i < 0 ? 0 : s.length - i - 1
}

function aoRolar(e: WheelEvent): void {
  const alvo = e.target instanceof Element ? e.target : null
  if (!alvo) {
    return
  }

  // Knobs customizados (role="slider") tratam a roda sozinhos; aqui só impedimos a rolagem da página.
  if (alvo.closest('[role="slider"]')) {
    e.preventDefault()
    return
  }

  const input = alvo.closest('input[type="range"]')
  if (!(input instanceof HTMLInputElement) || input.disabled || (e.deltaY === 0 && e.deltaX === 0)) {
    return
  }
  e.preventDefault()

  const min = input.min === '' ? 0 : Number(input.min)
  const max = input.max === '' ? 100 : Number(input.max)
  const step = input.step === '' || input.step === 'any' ? 0 : Number(input.step)
  const fino = e.shiftKey || e.ctrlKey
  const passoNormal = Number(input.dataset.passoRoda) || Math.max(step, (max - min) / 20)
  const passo = fino && step > 0 ? step : passoNormal
  const direcao = e.deltaY < 0 || (e.deltaY === 0 && e.deltaX > 0) ? 1 : -1

  const atual = Number(input.value)
  let novo = Math.min(max, Math.max(min, atual + direcao * passo))
  if (step > 0) {
    // Alinha ao step e remove ruído de ponto flutuante (0.1 + 0.2...)
    novo = min + Math.round((novo - min) / step) * step
    novo = Number(novo.toFixed(casasDecimais(step)))
    novo = Math.min(max, Math.max(min, novo))
  }
  if (novo === atual) {
    return
  }

  setterValor?.call(input, String(novo))
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

let instalado = false

export function instalarRodaSliders(): void {
  if (instalado) {
    return
  }
  instalado = true
  // passive: false para poder impedir a rolagem da página/painel enquanto ajusta o slider
  window.addEventListener('wheel', aoRolar, { passive: false })
}
