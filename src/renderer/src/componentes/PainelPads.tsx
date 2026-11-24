import { RotateCcw, Square, Scissors, Trash2, X } from 'lucide-react'
import { useState, type KeyboardEvent, type PointerEvent } from 'react'
import { CATEGORIAS } from '@shared/analiseNome'
import { CONFIG_PADRAO, GRUPOS_CORTE, letraDoGrupo, MODOS_PAD, temCorte, type ConfigPad } from '@shared/pads'
import { formatarTom } from '@shared/pitch'
import type { Sample } from '@shared/tipos'
import { arrastoAtual, iniciarArrastoPad } from '../arrasto'
import { EditorTrecho } from './EditorTrecho'
import { Modal } from './Modal'
import { SliderAjuste } from './SliderAjuste'

export const TOTAL_PADS = 9

/** Limites e padrão da largura do painel (px). */
export const LARGURA_PAINEL_PADRAO = 340
export const LARGURA_PAINEL_MIN = 300
export const LARGURA_PAINEL_MAX = 1100

const formatarVolume = (v: number): string => `${Math.round(v * 100)}%`
const formatarPan = (v: number): string => (v === 0 ? 'C' : `${v < 0 ? 'E' : 'D'}${Math.round(Math.abs(v) * 100)}`)

/** Ordem de exibição igual à do teclado numérico (7 8 9 / 4 5 6 / 1 2 3). */
const ORDEM_VISUAL = [6, 7, 8, 3, 4, 5, 0, 1, 2]

interface Props {
  pads: (Sample | null)[]
  configs: ConfigPad[]
  /** Pad selecionado para edição dos ajustes. */
  selecionado: number
  /** Pads que acabaram de ser disparados (para o brilho). */
  acesos: Set<number>
  /** Pads com som saindo agora. */
  tocando: Set<number>
  aoSelecionar: (i: number) => void
  aoDisparar: (i: number) => void
  aoSoltarTecla: (i: number) => void
  aoMudarConfig: (i: number, parcial: Partial<ConfigPad>) => void
  aoPararTudo: () => void
  aoResetarTodos: () => void
  /** Algo foi solto no pad (a origem vem de arrastoAtual). */
  aoSoltar: (i: number) => void
  aoRemover: (i: number) => void
  aoLimpar: () => void
  aoFechar: () => void
  /** Largura atual do painel (px). */
  largura: number
  aoRedimensionar: (l: number) => void
  aoFinalizarRedimensionar: (l: number) => void
}

/** Verdadeiro se a configuração já é a padrão (nada a resetar). */
const ehPadrao = (c: ConfigPad): boolean =>
  c.modo === CONFIG_PADRAO.modo &&
  c.volume === CONFIG_PADRAO.volume &&
  c.pan === CONFIG_PADRAO.pan &&
  c.tom === CONFIG_PADRAO.tom &&
  c.grupo === null &&
  !c.reverso &&
  !temCorte(c)

/** Painel de pads estilo MPC: 9 pads tocados pelo teclado numérico (1–9). */
export function PainelPads(p: Props): JSX.Element {
  const vazio = p.pads.every((s) => !s)
  const sel = p.selecionado
  const cfg = p.configs[sel] ?? CONFIG_PADRAO
  const sampleSel = p.pads[sel]
  const [expandido, setExpandido] = useState(false)

  // O painel fica à direita: arrastar a borda para a esquerda o alarga
  const limitar = (l: number): number => Math.min(LARGURA_PAINEL_MAX, Math.max(LARGURA_PAINEL_MIN, Math.round(l)))
  const iniciarArraste = (e: PointerEvent<HTMLDivElement>): void => {
    e.preventDefault()
    const alca = e.currentTarget
    alca.setPointerCapture(e.pointerId)
    const inicioX = e.clientX
    const larguraInicial = p.largura
    let atual = larguraInicial
    const mover = (ev: globalThis.PointerEvent): void => {
      // Não deixa a área central ficar estreita demais
      const maxJanela = window.innerWidth - 560
      atual = Math.min(limitar(larguraInicial + inicioX - ev.clientX), Math.max(LARGURA_PAINEL_MIN, maxJanela))
      p.aoRedimensionar(atual)
    }
    const soltar = (): void => {
      alca.removeEventListener('pointermove', mover)
      alca.removeEventListener('pointerup', soltar)
      alca.removeEventListener('pointercancel', soltar)
      document.body.classList.remove('redimensionando')
      p.aoFinalizarRedimensionar(atual)
    }
    document.body.classList.add('redimensionando')
    alca.addEventListener('pointermove', mover)
    alca.addEventListener('pointerup', soltar)
    alca.addEventListener('pointercancel', soltar)
  }
  const tecladoAlca = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    e.stopPropagation()
    const nova = limitar(p.largura + (e.key === 'ArrowLeft' ? 16 : -16))
    p.aoRedimensionar(nova)
    p.aoFinalizarRedimensionar(nova)
  }

  return (
    <aside className="painel-criar">
      <div
        className="painel-alca"
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={p.largura}
        aria-valuemin={LARGURA_PAINEL_MIN}
        aria-valuemax={LARGURA_PAINEL_MAX}
        tabIndex={0}
        title="Arraste para redimensionar o painel (duplo clique restaura)"
        onPointerDown={iniciarArraste}
        onKeyDown={tecladoAlca}
        onDoubleClick={() => {
          p.aoRedimensionar(LARGURA_PAINEL_PADRAO)
          p.aoFinalizarRedimensionar(LARGURA_PAINEL_PADRAO)
        }}
      />
      <div className="painel-rolagem">
      <div className="painel-topo">
        <h2>
          Pads <span className="selo">Beta</span>
        </h2>
        <button className="icone-botao" onClick={p.aoFechar} title="Fechar painel">
          <X size={17} />
        </button>
      </div>

      <div className="grade-pads">
        {ORDEM_VISUAL.map((i) => {
          const s = p.pads[i]
          const modo = p.configs[i]?.modo ?? 'oneshot'
          const cat = s ? (CATEGORIAS[s.categoria] ?? CATEGORIAS.outros) : null
          return (
            <div
              key={i}
              data-pad={i}
              className={`pad${s ? ' cheio' : ''}${p.acesos.has(i) ? ' aceso' : ''}${p.tocando.has(i) ? ' tocando' : ''}${sel === i ? ' selecionado' : ''}`}
              style={cat ? { background: cat.cor } : undefined}
              onClick={() => (modo === 'gate' ? p.aoSelecionar(i) : p.aoDisparar(i))}
              onMouseDown={(e) => {
                if (e.button === 0 && s && modo === 'gate') {
                  p.aoDisparar(i)
                }
              }}
              onMouseUp={() => p.aoSoltarTecla(i)}
              onMouseLeave={() => p.aoSoltarTecla(i)}
              onContextMenu={(e) => {
                e.preventDefault()
                p.aoSelecionar(i)
              }}
              draggable={!!s}
              onDragStart={(e) => {
                p.aoSoltarTecla(i)
                if (s) {
                  iniciarArrastoPad(e, s, i, p.configs[i] ?? CONFIG_PADRAO)
                }
              }}
              onDragEnter={(e) => arrastoAtual() && e.preventDefault()}
              onDragOver={(e) => {
                if (arrastoAtual()) {
                  e.preventDefault()
                  e.currentTarget.classList.add('alvo-soltar')
                }
              }}
              onDragLeave={(e) => e.currentTarget.classList.remove('alvo-soltar')}
              onDrop={(e) => {
                e.preventDefault()
                e.currentTarget.classList.remove('alvo-soltar')
                p.aoSoltar(i)
              }}
              title={s ? `${s.nome} — tecla ${i + 1} (arraste para mover, clique direito para ajustes)` : `Pad ${i + 1}: solte um sample aqui`}
            >
              <span className="pad-numero">
                {i + 1}
                {s && modo !== 'oneshot' && <em>{modo === 'gate' ? 'GATE' : 'LOOP'}</em>}
                {s && p.configs[i]?.reverso && <em title="Toca de trás para frente">REV</em>}
                {s && p.configs[i]?.grupo != null && (
                  <em className="pad-grupo" title={`Grupo de corte ${letraDoGrupo(p.configs[i].grupo!)}: tocar este pad silencia os outros do grupo`}>
                    {letraDoGrupo(p.configs[i].grupo!)}
                  </em>
                )}
                {s && p.configs[i] && temCorte(p.configs[i]) && (
                  <em title="Toca só um trecho do sample">
                    <Scissors size={9} />
                  </em>
                )}
              </span>
              {s ? (
                <>
                  <span className="pad-nome">{s.nome}</span>
                  <button
                    className="pad-remover"
                    title="Limpar pad"
                    onClick={(e) => {
                      e.stopPropagation()
                      p.aoRemover(i)
                    }}
                  >
                    <X size={11} />
                  </button>
                </>
              ) : (
                <span className="pad-nome vazio">vazio</span>
              )}
            </div>
          )
        })}
      </div>

      <div className="pads-acoes">
        <button className="pads-parar" onClick={p.aoPararTudo} title="Silencia todos os pads (Num 0)">
          <Square size={12} fill="currentColor" /> Parar tudo
        </button>
        <button
          className="chip-painel"
          onClick={p.aoResetarTodos}
          disabled={p.configs.every(ehPadrao)}
          title="Volta modo, volume, pan, tom, sentido, grupo e trecho de todos os pads ao padrão (mantém os samples)"
        >
          <RotateCcw size={13} /> Resetar ajustes de todos os pads
        </button>
        <button className="chip-painel" onClick={p.aoLimpar} disabled={vazio} title="Esvazia os pads e zera os ajustes">
          <Trash2 size={13} /> Limpar tudo
        </button>
      </div>

      <div className="pad-editor">
        <div className="pad-editor-titulo">
          Pad {sel + 1}
          <span>{p.pads[sel]?.nome ?? 'vazio'}</span>
          <button
            className="link pad-resetar"
            disabled={ehPadrao(cfg)}
            onClick={() => p.aoMudarConfig(sel, CONFIG_PADRAO)}
            title="Volta modo, volume, pan, tom, sentido, grupo e trecho deste pad ao padrão"
          >
            Resetar
          </button>
        </div>
        <div className="seg-modos">
          {MODOS_PAD.map((m) => (
            <button
              key={m.modo}
              className={cfg.modo === m.modo ? 'ativo' : ''}
              title={m.dica}
              onClick={() => p.aoMudarConfig(sel, { modo: m.modo })}
            >
              {m.rotulo}
            </button>
          ))}
        </div>
        <label className="ajuste">
          <span>Volume</span>
          <SliderAjuste
            tipo="volume"
            min={0}
            max={1}
            step={0.01}
            valor={cfg.volume}
            padrao={CONFIG_PADRAO.volume}
            formatar={formatarVolume}
            aoMudar={(v) => p.aoMudarConfig(sel, { volume: v })}
          />
          <b>{Math.round(cfg.volume * 100)}%</b>
        </label>
        <label className="ajuste">
          <span>Pan</span>
          <SliderAjuste
            tipo="pan"
            min={-1}
            max={1}
            step={0.01}
            passoRoda={0.05}
            valor={cfg.pan}
            padrao={CONFIG_PADRAO.pan}
            formatar={formatarPan}
            aoMudar={(v) => p.aoMudarConfig(sel, { pan: v })}
          />
          <b>{formatarPan(cfg.pan)}</b>
        </label>
        <label className="ajuste">
          <span>Tom</span>
          <SliderAjuste
            tipo="tom"
            min={-12}
            max={12}
            step={0.01}
            passoRoda={1}
            valor={cfg.tom}
            padrao={CONFIG_PADRAO.tom}
            formatar={(v) => `${formatarTom(v)} st`}
            aoMudar={(v) => p.aoMudarConfig(sel, { tom: v })}
          />
          <b className={cfg.tom !== 0 ? 'alterado' : ''}>{formatarTom(cfg.tom)} st</b>
        </label>
        <div className="ajuste ajuste-grupo">
          <span title="Toca o trecho de trás para frente">Sentido</span>
          <div className="seg-modos">
            <button className={!cfg.reverso ? 'ativo' : ''} onClick={() => p.aoMudarConfig(sel, { reverso: false })}>
              Normal
            </button>
            <button
              className={cfg.reverso ? 'ativo' : ''}
              title="Toca o trecho de trás para frente (vale também enquanto o pad toca)"
              onClick={() => p.aoMudarConfig(sel, { reverso: true })}
            >
              Reverso
            </button>
          </div>
        </div>
        <div className="ajuste ajuste-grupo">
          <span title="Pads no mesmo grupo não tocam ao mesmo tempo: tocar um corta os outros">Grupo</span>
          <div className="seg-modos seg-grupos">
            <button
              className={cfg.grupo === null ? 'ativo' : ''}
              title="Sem grupo: toca junto com qualquer pad"
              onClick={() => p.aoMudarConfig(sel, { grupo: null })}
            >
              —
            </button>
            {Array.from({ length: GRUPOS_CORTE }, (_, k) => k + 1).map((g) => {
              const membros = p.configs.flatMap((c, j) => (c.grupo === g ? [j + 1] : []))
              return (
                <button
                  key={g}
                  className={cfg.grupo === g ? 'ativo' : ''}
                  title={`Grupo de corte ${letraDoGrupo(g)}${membros.length ? ` (pads ${membros.join(', ')})` : ''}: tocar um pad do grupo silencia os outros`}
                  onClick={() => p.aoMudarConfig(sel, { grupo: g })}
                >
                  {letraDoGrupo(g)}
                  {membros.length > 0 && <small>{membros.length}</small>}
                </button>
              )
            })}
          </div>
        </div>
        <div className="pad-editor-dica">Duplo clique num controle volta ao padrão. O tom muda sem alterar a duração do áudio.</div>

        {sampleSel && (
          <div className="pad-trecho">
            <div className="pad-trecho-titulo">
              <Scissors size={12} /> Trecho
              {temCorte(cfg) && (
                <button className="link pad-resetar" onClick={() => p.aoMudarConfig(sel, { inicio: 0, fim: null })} title="Volta a tocar o arquivo inteiro">
                  Arquivo inteiro
                </button>
              )}
            </div>
            {!expandido && (
              <EditorTrecho
                sample={sampleSel}
                indice={sel}
                cfg={cfg}
                altura={78}
                tocando={p.tocando.has(sel)}
                aoMudar={(t) => p.aoMudarConfig(sel, t)}
                aoOuvir={() => p.aoDisparar(sel)}
                aoExpandir={() => setExpandido(true)}
              />
            )}
          </div>
        )}
      </div>

      {expandido && sampleSel && (
        <Modal titulo={`Trecho do pad ${sel + 1} — ${sampleSel.nome}`} aoFechar={() => setExpandido(false)} classe="modal-trecho">
          <EditorTrecho
            sample={sampleSel}
            indice={sel}
            cfg={cfg}
            altura={240}
            tocando={p.tocando.has(sel)}
            aoMudar={(t) => p.aoMudarConfig(sel, t)}
            aoOuvir={() => p.aoDisparar(sel)}
            focar
          />
          <p className="trecho-ajuda">
            Arraste na onda para marcar o trecho, ou arraste os marcadores <b>I</b> e <b>F</b>. Clique leva o marcador mais
            próximo até o ponto. Roda do mouse aproxima (até amostra por amostra); Shift + roda, Alt + arrastar ou o mapa
            embaixo movem a vista. Teclado: <kbd>←</kbd>/<kbd>→</kbd> movem o marcador ativo (Shift: 10×, Alt: 1 amostra),{' '}
            <kbd>I</kbd>/<kbd>F</kbd> escolhem o marcador, <kbd>+</kbd>/<kbd>-</kbd> zoom no marcador ativo, <kbd>S</kbd> enquadra o trecho, <kbd>0</kbd> mostra
            tudo, <kbd>Espaço</kbd> toca o pad.
          </p>
        </Modal>
      )}

      <p className="painel-dica">
        Toque com as teclas <kbd>1</kbd>–<kbd>9</kbd> do teclado numérico (<kbd>0</kbd> para parar tudo). Aperte <kbd>Enter</kbd> num
        sample da lista para colocá-lo num pad livre, ou arraste-o até um pad (substitui o áudio). Arraste um pad para outro para
        trocar de lugar.
      </p>
      </div>
    </aside>
  )
}
