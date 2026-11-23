import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { BPM_PROJETO_MAX, BPM_PROJETO_MIN, TONS_PROJETO, normalizarBpmProjeto } from '@shared/projeto'

/** Tom e BPM do projeto, cada um com sua chave liga/desliga (o valor fica guardado desligado). */
export interface AjustesProjeto {
  tom: string | null
  bpm: number | null
  tomLigado: boolean
  bpmLigado: boolean
}

/** Tom e BPM que valem de fato: null quando sem valor ou desligado. */
export function projetoEfetivo(a: AjustesProjeto): { tom: string | null; bpm: number | null } {
  return { tom: a.tomLigado ? a.tom : null, bpm: a.bpmLigado ? a.bpm : null }
}

interface Props {
  /** Retângulo do botão que abriu o painel (o painel abre acima dele). */
  ancora: DOMRect
  projeto: AjustesProjeto
  arrastarComAjustes: boolean
  aoMudar: (a: AjustesProjeto) => void
  aoArrastarComAjustes: (v: boolean) => void
  aoFechar: () => void
}

/** "A min" → "A menor", "C# maj" → "C# maior". */
function nomeDoTom(tom: string): string {
  return tom.replace(/ maj$/, ' maior').replace(/ min$/, ' menor')
}

/**
 * Painel suspenso com o tom e o BPM do projeto (a pré-escuta transpõe cada sample para o
 * tom e estica os loops para o BPM) e a opção de arrastar para a DAW com os ajustes.
 */
export function PainelProjeto(p: Props): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: -9999, y: -9999 })
  const [textoBpm, setTextoBpm] = useState(p.projeto.bpm !== null ? String(p.projeto.bpm) : '')

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) {
      return
    }
    const x = Math.min(window.innerWidth - el.offsetWidth - 8, Math.max(8, p.ancora.right - el.offsetWidth))
    setPos({ x, y: Math.max(8, p.ancora.top - el.offsetHeight - 6) })
  }, [p.ancora])

  useEffect(() => {
    const fora = (e: MouseEvent): void => {
      const alvo = e.target as HTMLElement
      if (!alvo.closest('.painel-projeto') && !alvo.closest('.botao-projeto')) {
        p.aoFechar()
      }
    }
    const tecla = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        p.aoFechar()
      }
    }
    window.addEventListener('mousedown', fora, true)
    window.addEventListener('keydown', tecla, true)
    return () => {
      window.removeEventListener('mousedown', fora, true)
      window.removeEventListener('keydown', tecla, true)
    }
  }, [p.aoFechar])

  const pr = p.projeto
  const mudar = (alteracao: Partial<AjustesProjeto>): void => p.aoMudar({ ...pr, ...alteracao })
  const bpmInvalido = textoBpm.trim() !== '' && normalizarBpmProjeto(textoBpm) === null

  return createPortal(
    <div
      ref={ref}
      className="menu painel-projeto"
      style={{ left: pos.x, top: pos.y }}
      // As teclas digitadas aqui não devem acionar os atalhos da lista (espaço, setas, 1–9...)
      onKeyDown={(e) => e.stopPropagation()}
    >
      <h4>Projeto</h4>
      <div className={`painel-projeto-campo${pr.tomLigado ? '' : ' desligado'}`}>
        <label className="painel-projeto-chave" title="Ligar ou desligar o tom do projeto">
          <input type="checkbox" checked={pr.tomLigado} onChange={(e) => mudar({ tomLigado: e.target.checked })} />
          <span>Tom</span>
        </label>
        <select
          value={pr.tom ?? ''}
          disabled={!pr.tomLigado}
          onChange={(e) => mudar({ tom: e.target.value || null })}
        >
          <option value="">Nenhum</option>
          {TONS_PROJETO.map((t) => (
            <option key={t} value={t}>
              {nomeDoTom(t)}
            </option>
          ))}
        </select>
      </div>
      <div className={`painel-projeto-campo${pr.bpmLigado ? '' : ' desligado'}`}>
        <label className="painel-projeto-chave" title="Ligar ou desligar o BPM do projeto">
          <input type="checkbox" checked={pr.bpmLigado} onChange={(e) => mudar({ bpmLigado: e.target.checked })} />
          <span>BPM</span>
        </label>
        <input
          type="number"
          min={BPM_PROJETO_MIN}
          max={BPM_PROJETO_MAX}
          step="any"
          placeholder="Nenhum"
          disabled={!pr.bpmLigado}
          className={bpmInvalido ? 'invalido' : ''}
          value={textoBpm}
          onChange={(e) => {
            setTextoBpm(e.target.value)
            const bpm = normalizarBpmProjeto(e.target.value)
            if (bpm !== null || e.target.value.trim() === '') {
              mudar({ bpm })
            }
          }}
        />
      </div>
      <p className="painel-projeto-ajuda">
        Com tom, o knob se ajusta sozinho em cada sample para levá-lo ao tom do projeto (tons relativos, como A menor e C
        maior, não mudam). Usa o tom do nome do arquivo; sem ele, detecta pelo áudio ao tocar. Bateria e percussão sem
        tom no nome não são transpostas. Com BPM, os loops tocam nesse andamento sem mudar o tom. Desmarque a caixa para desligar cada um sem perder o valor.
      </p>
      <label className="config-opcao">
        <input type="checkbox" checked={p.arrastarComAjustes} onChange={(e) => p.aoArrastarComAjustes(e.target.checked)} />
        <span>
          <strong>Arrastar para a DAW com os ajustes</strong>
          <small>Leva um WAV já com o tom, o BPM e o reverso da pré-escuta, em vez do arquivo original.</small>
        </span>
      </label>
    </div>,
    document.body
  )
}
