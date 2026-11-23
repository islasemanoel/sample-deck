import { useState, type CSSProperties } from 'react'
import { ClipboardPaste, Copy, RotateCcw } from 'lucide-react'
import { Menu, type ItemMenu } from './Menu'

/** Valores copiados, por tipo de controle (volume só cola em volume, tom só em tom...). Vale para a sessão. */
const copiados = new Map<string, number>()

interface Props {
  /** Tipo do controle: separa a "área de cópia" (ex.: 'volume', 'pan', 'tom'). */
  tipo: string
  valor: number
  min: number
  max: number
  step: number
  /** Valor restaurado pelo menu e pelo duplo clique. */
  padrao: number
  aoMudar: (v: number) => void
  /** Formata o valor para o menu (ex.: "80%"). */
  formatar: (v: number) => string
  className?: string
  style?: CSSProperties
  title?: string
  /** Passo da roda do mouse (ver rodaSliders.ts). */
  passoRoda?: number
}

/**
 * Slider (`input type="range"`) com menu no botão direito: restaurar o valor padrão,
 * copiar e colar o valor. Duplo clique também restaura o padrão.
 */
export function SliderAjuste(p: Props): JSX.Element {
  const [menu, setMenu] = useState<DOMRect | null>(null)

  const limitar = (v: number): number => Math.min(p.max, Math.max(p.min, v))

  const itens = (): ItemMenu[] => {
    const copiado = copiados.get(p.tipo)
    return [
      {
        rotulo: `Restaurar padrão (${p.formatar(p.padrao)})`,
        icone: <RotateCcw size={14} />,
        desabilitado: p.valor === p.padrao,
        acao: () => p.aoMudar(p.padrao)
      },
      {
        rotulo: `Copiar valor (${p.formatar(p.valor)})`,
        icone: <Copy size={14} />,
        separadorAntes: true,
        acao: () => {
          copiados.set(p.tipo, p.valor)
          void navigator.clipboard?.writeText(p.formatar(p.valor)).catch(() => undefined)
        }
      },
      {
        rotulo: copiado === undefined ? 'Colar valor' : `Colar valor (${p.formatar(copiado)})`,
        icone: <ClipboardPaste size={14} />,
        desabilitado: copiado === undefined,
        acao: () => {
          if (copiado !== undefined) {
            p.aoMudar(limitar(copiado))
          }
        }
      }
    ]
  }

  return (
    <>
      <input
        type="range"
        className={p.className}
        style={p.style}
        title={p.title}
        min={p.min}
        max={p.max}
        step={p.step}
        value={p.valor}
        data-passo-roda={p.passoRoda}
        onChange={(e) => p.aoMudar(Number(e.target.value))}
        onDoubleClick={() => p.aoMudar(p.padrao)}
        onContextMenu={(e) => {
          e.preventDefault()
          setMenu(new DOMRect(e.clientX, e.clientY, 0, 0))
        }}
      />
      {menu && <Menu ancora={menu} itens={itens()} aoFechar={() => setMenu(null)} larguraMin={170} />}
    </>
  )
}
