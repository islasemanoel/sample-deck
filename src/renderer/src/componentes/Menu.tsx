import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** Item de menu suspenso. */
export interface ItemMenu {
  rotulo: string
  icone?: ReactNode
  ativo?: boolean
  desabilitado?: boolean
  perigo?: boolean
  separadorAntes?: boolean
  acao?: () => void
  /** Submenu aberto ao passar o mouse. */
  filhos?: ItemMenu[]
}

interface Props {
  /** Retângulo do elemento que abriu o menu (âncora). */
  ancora: DOMRect
  itens: ItemMenu[]
  aoFechar: () => void
  alinhar?: 'esquerda' | 'direita'
  larguraMin?: number
}

/**
 * Menu flutuante posicionado junto a uma âncora, fechado ao clicar fora ou com Esc.
 * Ajusta a posição para não sair da janela.
 */
export function Menu({ ancora, itens, aoFechar, alinhar = 'esquerda', larguraMin = 180 }: Props): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: -9999, y: -9999 })
  const [sub, setSub] = useState<{ indice: number; rect: DOMRect } | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) {
      return
    }
    const w = el.offsetWidth
    const h = el.offsetHeight
    let x = alinhar === 'direita' ? ancora.right - w : ancora.left
    let y = ancora.bottom + 4
    if (x + w > window.innerWidth - 8) {
      x = window.innerWidth - w - 8
    }
    if (y + h > window.innerHeight - 8) {
      y = Math.max(8, ancora.top - h - 4)
    }
    setPos({ x: Math.max(8, x), y })
  }, [ancora, alinhar])

  useEffect(() => {
    const fora = (e: MouseEvent): void => {
      const alvo = e.target as HTMLElement
      if (!alvo.closest('.menu')) {
        aoFechar()
      }
    }
    const tecla = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        aoFechar()
      }
    }
    window.addEventListener('mousedown', fora)
    window.addEventListener('keydown', tecla)
    return () => {
      window.removeEventListener('mousedown', fora)
      window.removeEventListener('keydown', tecla)
    }
  }, [aoFechar])

  return createPortal(
    <>
      <div ref={ref} className="menu" style={{ left: pos.x, top: pos.y, minWidth: larguraMin }}>
        {itens.map((it, i) => (
          <div key={i}>
            {it.separadorAntes && <div className="menu-separador" />}
            <button
              className={`menu-item${it.ativo ? ' ativo' : ''}${it.perigo ? ' perigo' : ''}`}
              disabled={it.desabilitado}
              onMouseEnter={(e) => {
                setSub(it.filhos ? { indice: i, rect: e.currentTarget.getBoundingClientRect() } : null)
              }}
              onClick={() => {
                if (it.filhos) {
                  return
                }
                it.acao?.()
                aoFechar()
              }}
            >
              {it.icone && <span className="menu-icone">{it.icone}</span>}
              <span className="menu-rotulo">{it.rotulo}</span>
              {it.filhos && <span className="menu-seta">›</span>}
            </button>
          </div>
        ))}
      </div>
      {sub && itens[sub.indice].filhos && (
        <Menu
          ancora={new DOMRect(sub.rect.right - 4, sub.rect.top - 6, 0, 0)}
          itens={itens[sub.indice].filhos as ItemMenu[]}
          aoFechar={aoFechar}
        />
      )}
    </>,
    document.body
  )
}
