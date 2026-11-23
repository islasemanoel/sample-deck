import { useEffect, useRef, useState, type RefObject } from 'react'
import { ArrowDown, ArrowUp, EllipsisVertical, Folder, Heart, Repeat, Zap } from 'lucide-react'
import type { Direcao, Ordenacao } from '@shared/filtros'
import type { Sample } from '@shared/tipos'
import { formatarBpm, formatarDuracao, nomeDaPasta } from '../visao'
import { gravarAjuste, lerAjuste } from '../preferencias'
import { limitarLargura, montarColunas, normalizarLarguras, type ColunaRedimensionavel, type Larguras } from '../colunas'
import { Arte } from './Arte'

const ALTURA_LINHA = 50
const ALTURA_CABECALHO = 34
const MARGEM_LINHAS = 10
const CHAVE_LARGURAS = 'larguras-colunas'

function lerLarguras(): Larguras {
  return normalizarLarguras(lerAjuste(CHAVE_LARGURAS))
}

function gravarLarguras(l: Larguras): void {
  gravarAjuste(CHAVE_LARGURAS, l)
}

interface Props {
  samples: Sample[]
  /** Elemento com rolagem que contém a tabela (para renderizar só as linhas visíveis). */
  rolagem: RefObject<HTMLDivElement>
  favoritos: Set<string>
  tocandoId: string | null
  carregandoId: string | null
  cursorId: string | null
  selecionados: Set<string>
  ordem: { campo: Ordenacao | 'padrao' | 'aleatorio'; direcao: Direcao }
  aoOrdenar: (campo: Ordenacao) => void
  aoClicar: (s: Sample) => void
  aoSelecionar: (s: Sample, intervalo: boolean) => void
  aoSelecionarTodos: (marcar: boolean) => void
  aoFavoritar: (s: Sample) => void
  aoMenu: (s: Sample, rect: DOMRect) => void
  aoClicarTag: (tag: string) => void
  aoArrastar: (s: Sample, e: React.DragEvent) => void
}

/**
 * Lista de samples com cabeçalho fixo e virtualização: só as linhas visíveis
 * (mais uma margem) são renderizadas, o que mantém a rolagem fluida com milhares de itens.
 */
export function TabelaSamples(p: Props): JSX.Element {
  const corpo = useRef<HTMLDivElement>(null)
  const [faixa, setFaixa] = useState({ ini: 0, fim: 40 })
  const [larguras, setLarguras] = useState<Larguras>(lerLarguras)
  const arrasto = useRef<{ coluna: ColunaRedimensionavel; x0: number; largura0: number } | null>(null)
  const n = p.samples.length

  useEffect(() => {
    const c = p.rolagem.current
    if (!c) {
      return
    }
    let quadro = 0
    const atualizar = (): void => {
      quadro = 0
      const el = corpo.current
      if (!el) {
        return
      }
      const deslocado = c.getBoundingClientRect().top - el.getBoundingClientRect().top
      const ini = Math.max(0, Math.floor(deslocado / ALTURA_LINHA) - MARGEM_LINHAS)
      const fim = Math.min(n, Math.ceil((deslocado + c.clientHeight) / ALTURA_LINHA) + MARGEM_LINHAS)
      setFaixa((f) => (f.ini === ini && f.fim === fim ? f : { ini, fim }))
    }
    const agendar = (): void => {
      if (!quadro) {
        quadro = requestAnimationFrame(atualizar)
      }
    }
    atualizar()
    c.addEventListener('scroll', agendar, { passive: true })
    window.addEventListener('resize', agendar)
    return () => {
      c.removeEventListener('scroll', agendar)
      window.removeEventListener('resize', agendar)
      cancelAnimationFrame(quadro)
    }
  }, [p.rolagem, n])

  // Mantém a linha do cursor visível ao navegar pelo teclado. Só quando o cursor muda: se a
  // lista mudou (filtro, ordem), seguir o cursor faria a rolagem saltar para onde ele foi parar
  const cursorAnterior = useRef(p.cursorId)
  useEffect(() => {
    const mudou = cursorAnterior.current !== p.cursorId
    cursorAnterior.current = p.cursorId
    const c = p.rolagem.current
    const el = corpo.current
    if (!mudou || !c || !el || !p.cursorId) {
      return
    }
    const i = p.samples.findIndex((s) => s.id === p.cursorId)
    if (i < 0) {
      return
    }
    const topoCorpo = el.getBoundingClientRect().top - c.getBoundingClientRect().top + c.scrollTop
    const topo = topoCorpo + i * ALTURA_LINHA
    if (topo - ALTURA_CABECALHO < c.scrollTop) {
      c.scrollTop = topo - ALTURA_CABECALHO - 8
    } else if (topo + ALTURA_LINHA > c.scrollTop + c.clientHeight) {
      c.scrollTop = topo + ALTURA_LINHA - c.clientHeight + 8
    }
  }, [p.cursorId, p.samples, p.rolagem])

  const todosMarcados = n > 0 && p.samples.every((s) => p.selecionados.has(s.id))
  /** Alça na borda direita do cabeçalho: arrastar muda a largura; duplo clique volta ao padrão. */
  const alca = (coluna: ColunaRedimensionavel): JSX.Element => (
    <span
      className="alca-coluna"
      title="Arraste para redimensionar (duplo clique: largura padrão)"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => {
        e.preventDefault()
        e.stopPropagation()
        const th = e.currentTarget.parentElement as HTMLElement
        arrasto.current = { coluna, x0: e.clientX, largura0: th.getBoundingClientRect().width }
        e.currentTarget.setPointerCapture(e.pointerId)
        document.body.classList.add('redimensionando')
      }}
      onPointerMove={(e) => {
        const a = arrasto.current
        if (a) {
          const largura = limitarLargura(a.coluna, a.largura0 + e.clientX - a.x0)
          setLarguras((l) => (l[a.coluna] === largura ? l : { ...l, [a.coluna]: largura }))
        }
      }}
      onPointerUp={(e) => {
        if (!arrasto.current) {
          return
        }
        arrasto.current = null
        e.currentTarget.releasePointerCapture(e.pointerId)
        document.body.classList.remove('redimensionando')
        setLarguras((l) => {
          gravarLarguras(l)
          return l
        })
      }}
      onDoubleClick={(e) => {
        e.stopPropagation()
        setLarguras((l) => {
          const { [coluna]: _removida, ...resto } = l
          gravarLarguras(resto)
          return resto
        })
      }}
    />
  )

  const cabecalho = (campo: Ordenacao, rotulo: string, redimensionavel?: ColunaRedimensionavel): JSX.Element => {
    const ativo = p.ordem.campo === campo
    return (
      <button className={`tabela-th ordenavel${ativo ? ' ativo' : ''}`} onClick={() => p.aoOrdenar(campo)}>
        {redimensionavel ? <span className="rotulo-th">{rotulo}</span> : rotulo}
        {ativo ? (
          p.ordem.direcao === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />
        ) : (
          <span className="seta-ordem">⇅</span>
        )}
        {redimensionavel && alca(redimensionavel)}
      </button>
    )
  }

  return (
    <div className="tabela" style={{ '--colunas': montarColunas(larguras) } as React.CSSProperties}>
      <div className="tabela-cabecalho">
        <span className="tabela-th">
          <input
            type="checkbox"
            checked={todosMarcados}
            onChange={(e) => p.aoSelecionarTodos(e.target.checked)}
            title="Selecionar todos"
          />
        </span>
        {cabecalho('pasta', 'Pasta')}
        <span className="tabela-th" />
        {cabecalho('nome', 'Arquivo', 'nome')}
        {cabecalho('kit', 'Drum kit/pack', 'kit')}
        {cabecalho('duracao', 'Tempo', 'duracao')}
        {cabecalho('tom', 'Tom', 'tom')}
        {cabecalho('bpm', 'BPM', 'bpm')}
        <span className="tabela-th" />
      </div>
      <div ref={corpo} className="tabela-corpo" style={{ height: n * ALTURA_LINHA }}>
        {p.samples.slice(faixa.ini, faixa.fim).map((s, k) => {
          const i = faixa.ini + k
          const tocando = p.tocandoId === s.id
          const classes = [
            'linha',
            tocando ? 'tocando' : '',
            p.cursorId === s.id ? 'cursor' : '',
            p.selecionados.has(s.id) ? 'selecionada' : ''
          ].join(' ')
          const fav = p.favoritos.has(s.id)
          return (
            <div
              key={s.id}
              className={classes}
              style={{ top: i * ALTURA_LINHA }}
              onClick={() => p.aoClicar(s)}
              onContextMenu={(e) => {
                e.preventDefault()
                p.aoMenu(s, new DOMRect(e.clientX, e.clientY, 0, 0))
              }}
              draggable
              onDragStart={(e) => p.aoArrastar(s, e)}
              title={s.caminho}
            >
              <span className="celula" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={p.selecionados.has(s.id)}
                  onChange={() => undefined}
                  onClick={(e) => p.aoSelecionar(s, e.shiftKey)}
                />
              </span>
              <span className="celula" title={s.pastaRelativa ? `${s.pastaRaiz} › ${s.pastaRelativa}` : s.pastaRaiz}>
                <Arte semente={s.pastaRelativa || s.pastaRaiz} tamanho={34} />
              </span>
              <span className="celula icone-tipo" title={s.tipo === 'loop' ? 'Loop' : 'One-shot'}>
                {tocando ? (
                  <span className="equalizador">
                    <i />
                    <i />
                    <i />
                  </span>
                ) : p.carregandoId === s.id ? (
                  <span className="mini-carregando" />
                ) : s.tipo === 'loop' ? (
                  <Repeat size={15} />
                ) : (
                  <Zap size={14} />
                )}
              </span>
              <span className="celula nome">
                <span className="nome-arquivo">{s.nome}</span>
                <span className="nome-tags">
                  <span className="nome-pasta" title={s.pastaRelativa ? `${s.pastaRaiz} › ${s.pastaRelativa}` : s.pastaRaiz}>
                    <Folder size={11} />
                    {p.ordem.campo === 'pasta'
                      ? s.pastaRelativa || nomeDaPasta(s.pastaRaiz)
                      : nomeDaPasta(s.pastaRelativa || s.pastaRaiz)}
                  </span>
                  {s.tags.slice(0, 6).map((t) => (
                    <button
                      key={t}
                      onClick={(e) => {
                        e.stopPropagation()
                        p.aoClicarTag(t)
                      }}
                    >
                      {t}
                    </button>
                  ))}
                </span>
              </span>
              <span className="celula suave kit" title={s.kit || undefined}>
                <span className="texto-kit">{s.kit || '--'}</span>
              </span>
              <span className="celula suave">{formatarDuracao(s.duracao)}</span>
              <span className="celula suave">{s.tom ?? '--'}</span>
              <span
                className={`celula suave${s.bpmEstimado ? ' estimado' : ''}`}
                title={s.bpmEstimado ? 'BPM estimado pelo áudio (pode ser o dobro ou a metade)' : undefined}
              >
                {formatarBpm(s)}
              </span>
              <span className="celula acoes" onClick={(e) => e.stopPropagation()}>
                <button className={`acao-coracao${fav ? ' ativo' : ''}`} onClick={() => p.aoFavoritar(s)} title={fav ? 'Descurtir' : 'Curtir'}>
                  <Heart size={15} fill={fav ? 'currentColor' : 'none'} />
                </button>
                <button
                  className="acao-menu"
                  onClick={(e) => p.aoMenu(s, e.currentTarget.getBoundingClientRect())}
                  title="Mais ações"
                >
                  <EllipsisVertical size={16} />
                </button>
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
