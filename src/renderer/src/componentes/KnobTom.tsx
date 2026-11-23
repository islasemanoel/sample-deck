import { useRef, useState } from 'react'
import { ClipboardPaste, Copy, RotateCcw } from 'lucide-react'
import { TOM_MAX, TOM_MIN, formatarTom, normalizarTom } from '@shared/pitch'
import { Menu, type ItemMenu } from './Menu'

/** Ângulo máximo do ponteiro, para cada lado, em graus (0 = meio-dia). */
const GIRO = 135
/** Semitons por pixel arrastado (modo normal, com encaixe em semitons inteiros). */
const SENSIBILIDADE = 0.1
/** Semitons por pixel no modo fino (Shift/Ctrl): 1 cent por pixel. */
const SENSIBILIDADE_FINA = 0.01

/** Valor copiado do knob (vale para toda a sessão, mesmo se o knob for recriado). */
let tomCopiado: number | null = null

interface Props {
  /** Tom em semitons (−12 a +12, precisão de cent). */
  valor: number
  aoMudar: (semitons: number) => void
}

function ponto(angulo: number, raio: number): string {
  const rad = ((angulo - 90) * Math.PI) / 180
  return `${16 + raio * Math.cos(rad)} ${16 + raio * Math.sin(rad)}`
}

function arco(de: number, ate: number, raio: number): string {
  const [a, b] = de <= ate ? [de, ate] : [ate, de]
  const grande = b - a > 180 ? 1 : 0
  return `M ${ponto(a, raio)} A ${raio} ${raio} 0 ${grande} 1 ${ponto(b, raio)}`
}

/**
 * Knob bipolar de tom (estilo FL Studio): arrastar para a direita/cima sobe o tom,
 * para a esquerda/baixo desce. Encaixa em semitons; com Shift ou Ctrl ajusta em cents.
 * Roda do mouse: ±1 semitom (±1 cent com Shift/Ctrl). Duplo clique volta a 0.
 * Botão direito: restaurar para 0, copiar e colar o valor (também Ctrl+C / Ctrl+V com foco).
 */
export function KnobTom({ valor, aoMudar }: Props): JSX.Element {
  const arrasto = useRef<{ bruto: number } | null>(null)
  const [menu, setMenu] = useState<DOMRect | null>(null)
  const [copiado, setCopiado] = useState(tomCopiado)
  // Último valor emitido: várias teclas/giros da roda seguidos antes de redesenhar não se perdem.
  const atual = useRef(valor)
  atual.current = valor

  const emitir = (v: number): void => {
    const n = normalizarTom(v)
    if (n !== atual.current) {
      atual.current = n
      aoMudar(n)
    }
  }

  const copiar = (): void => {
    tomCopiado = atual.current
    setCopiado(tomCopiado)
    void navigator.clipboard?.writeText(formatarTom(tomCopiado)).catch(() => undefined)
  }

  const colar = (): void => {
    if (tomCopiado !== null) {
      emitir(tomCopiado)
    }
  }

  const itensMenu = (): ItemMenu[] => [
    { rotulo: 'Restaurar para 0', icone: <RotateCcw size={14} />, desabilitado: valor === 0, acao: () => emitir(0) },
    { rotulo: `Copiar valor (${formatarTom(valor)})`, icone: <Copy size={14} />, separadorAntes: true, acao: copiar },
    {
      rotulo: copiado === null ? 'Colar valor' : `Colar valor (${formatarTom(copiado)})`,
      icone: <ClipboardPaste size={14} />,
      desabilitado: copiado === null,
      acao: colar
    }
  ]

  const aoPressionar = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) {
      return
    }
    e.preventDefault()
    e.currentTarget.focus()
    e.currentTarget.setPointerCapture(e.pointerId)
    arrasto.current = { bruto: valor }
  }

  const aoMover = (e: React.PointerEvent<HTMLDivElement>): void => {
    const a = arrasto.current
    if (!a) {
      return
    }
    const fino = e.shiftKey || e.ctrlKey
    const delta = e.movementX - e.movementY
    a.bruto = Math.max(TOM_MIN, Math.min(TOM_MAX, a.bruto + delta * (fino ? SENSIBILIDADE_FINA : SENSIBILIDADE)))
    emitir(fino ? a.bruto : Math.round(a.bruto))
  }

  const aoSoltar = (e: React.PointerEvent<HTMLDivElement>): void => {
    arrasto.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  const passo = (e: { shiftKey: boolean; ctrlKey: boolean }): number => (e.shiftKey || e.ctrlKey ? 0.01 : 1)

  const aoRolar = (e: React.WheelEvent<HTMLDivElement>): void => {
    const direcao = e.deltaY < 0 || e.deltaX > 0 ? 1 : -1
    emitir(atual.current + direcao * passo(e))
  }

  const aoTeclar = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
      e.preventDefault()
      e.stopPropagation()
      copiar()
      return
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) {
      e.preventDefault()
      e.stopPropagation()
      colar()
      return
    }
    const mapa: Record<string, number> = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }
    if (e.key in mapa) {
      e.preventDefault()
      e.stopPropagation() // não mover a seleção da lista
      emitir(atual.current + mapa[e.key] * passo(e))
    } else if (e.key === 'Delete' || e.key === 'Backspace' || e.key === '0') {
      e.preventDefault()
      e.stopPropagation()
      emitir(0)
    }
  }

  const angulo = (valor / TOM_MAX) * GIRO
  const ativo = valor !== 0
  const texto = formatarTom(valor)

  return (
    <div className="knob-tom">
      <div
        className={`knob${ativo ? ' ativo' : ''}`}
        role="slider"
        tabIndex={0}
        aria-label="Tom"
        aria-valuemin={TOM_MIN}
        aria-valuemax={TOM_MAX}
        aria-valuenow={valor}
        aria-valuetext={`${texto} semitons`}
        title={'Tom: ' + texto + ' st\nArraste ←/→ (ou ↑/↓) para mudar • Shift/Ctrl: ajuste fino em cents\nRoda do mouse: ±1 semitom • Duplo clique: voltar a 0\nBotão direito: restaurar, copiar e colar'}
        onPointerDown={aoPressionar}
        onPointerMove={aoMover}
        onPointerUp={aoSoltar}
        onPointerCancel={aoSoltar}
        onDoubleClick={() => emitir(0)}
        onContextMenu={(e) => {
          e.preventDefault()
          setCopiado(tomCopiado)
          setMenu(new DOMRect(e.clientX, e.clientY, 0, 0))
        }}
        onWheel={aoRolar}
        onKeyDown={aoTeclar}
      >
        <svg viewBox="0 0 32 32" width={30} height={30}>
          <path className="knob-trilha" d={arco(-GIRO, GIRO, 13)} />
          {ativo && <path className="knob-valor" d={arco(0, angulo, 13)} />}
          <circle className="knob-corpo" cx={16} cy={16} r={9.5} />
          <line className="knob-ponteiro" x1={16} y1={16} x2={16} y2={8.5} transform={`rotate(${angulo} 16 16)`} />
          <circle className="knob-centro" cx={16} cy={3} r={0.9} />
        </svg>
      </div>
      <div className="knob-rotulo">
        <span>PITCH</span>
        <b className={ativo ? 'ativo' : ''}>{texto}</b>
      </div>
      {menu && <Menu ancora={menu} itens={itensMenu()} aoFechar={() => setMenu(null)} larguraMin={170} />}
    </div>
  )
}
