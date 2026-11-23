import type { Tema } from '@shared/api'
import { gravarAjuste, lerAjuste } from './preferencias'

/** Tema salvo nas preferências (claro, se nunca foi escolhido). */
export function lerTema(): Tema {
  return lerAjuste('tema') === 'escuro' ? 'escuro' : 'claro'
}

/** Aplica o tema às variáveis CSS (data-tema no <html>) e às cores nativas da janela. */
export function aplicarTema(tema: Tema): void {
  document.documentElement.dataset.tema = tema
  window.api?.definirTema(tema)
}

/** Aplica e grava o tema escolhido. */
export function escolherTema(tema: Tema): void {
  aplicarTema(tema)
  gravarAjuste('tema', tema)
}
