import { useEffect, useRef } from 'react'
import { motor } from '../motorAudio'

/** O que os atalhos de teclado acionam; atualizado a cada render sem reinstalar os ouvintes. */
export interface AcoesAtalhos {
  /** Há modal ou menu aberto: só vale Ctrl+K/F e Esc nos campos. */
  bloqueado: boolean
  dispararPad: (indice: number) => void
  soltarPad: (indice: number) => void
  voltar: () => void
  avancar: () => void
  tocarDoInicio: () => void
  tocarParar: () => void
  moverCursor: (passo: number) => void
  curtirEmFoco: () => void
  adicionarSelecionadoAosPads: () => void
  limparSelecao: () => void
}

/** Atalhos globais do teclado. Os ouvintes são instalados uma única vez. */
export function useAtalhos(acoes: AcoesAtalhos): void {
  const ref = useRef(acoes)
  ref.current = acoes

  useEffect(() => {
    const tecla = (e: KeyboardEvent): void => {
      const a = ref.current
      const alvo = e.target as HTMLElement
      // Sliders e caixas de seleção não recebem texto: não devem bloquear os atalhos
      const tipoCampo = alvo.tagName === 'INPUT' ? (alvo as HTMLInputElement).type : ''
      const digitando = (alvo.tagName === 'INPUT' && tipoCampo !== 'range' && tipoCampo !== 'checkbox') || alvo.tagName === 'TEXTAREA'
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'f')) {
        e.preventDefault()
        const campo = document.getElementById('campo-busca') as HTMLInputElement | null
        campo?.focus()
        campo?.select()
        return
      }
      if (e.code === 'Numpad0' && !digitando && !a.bloqueado) {
        e.preventDefault()
        motor.pararPads()
        return
      }
      const m = /^Numpad([1-9])$/.exec(e.code)
      if (m && !digitando && !a.bloqueado) {
        e.preventDefault()
        if (!e.repeat) {
          a.dispararPad(Number(m[1]) - 1)
        }
        return
      }
      if (digitando || a.bloqueado) {
        if (e.key === 'Escape' && digitando) {
          alvo.blur()
        }
        return
      }
      if (e.altKey && e.key === 'ArrowLeft') {
        a.voltar()
      } else if (e.altKey && e.key === 'ArrowRight') {
        a.avancar()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        a.tocarDoInicio()
      } else if (e.key === ' ') {
        e.preventDefault()
        a.tocarParar()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        a.moverCursor(1)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        a.moverCursor(-1)
      } else if (e.key.toLowerCase() === 'l') {
        a.curtirEmFoco()
      } else if (e.key === 'Enter' && !alvo.closest('button, a')) {
        e.preventDefault()
        a.adicionarSelecionadoAosPads()
      } else if (e.key === 'Escape') {
        a.limparSelecao()
      }
    }
    const soltar = (e: KeyboardEvent): void => {
      const m = /^Numpad([1-9])$/.exec(e.code)
      if (m) {
        ref.current.soltarPad(Number(m[1]) - 1)
      }
    }
    window.addEventListener('keydown', tecla)
    window.addEventListener('keyup', soltar)
    return () => {
      window.removeEventListener('keydown', tecla)
      window.removeEventListener('keyup', soltar)
    }
  }, [])
}
