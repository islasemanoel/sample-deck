import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  EllipsisVertical,
  Expand,
  FolderTree,
  Heart,
  Layers,
  Loader2,
  Play,
  Search,
  SkipBack,
  SkipForward,
  Square,
  Volume2,
  VolumeX,
  X
} from 'lucide-react'
import { formatarTonalidade, lerTonalidade, situacaoBpm } from '@shared/projeto'
import type { Biblioteca, Sample } from '@shared/tipos'
import { Arte } from './Arte'
import { PainelProjeto, projetoEfetivo, type AjustesProjeto } from './PainelProjeto'
import { VOLUME_PADRAO } from './Player'
import { SliderAjuste } from './SliderAjuste'
import { motor } from '../motorAudio'
import { formatarBpm, nomeDaPasta, ordenarPastas, type Visao } from '../visao'
import { lerAjuste } from '../preferencias'

/**
 * Modo compacto: janela estreita no estilo de app clássico, para ficar ao lado da DAW.
 * Mostra a lista de pastas (com capa) e, ao abrir uma, os samples dela para ouvir e arrastar.
 */

/** Capas já buscadas nesta sessão (evita uma chamada ao processo principal por linha a cada render). */
const capas = new Map<string, string | null>()

function CapaPasta({ pasta, tamanho }: { pasta: string; tamanho: number }): JSX.Element {
  const [url, setUrl] = useState<string | null | undefined>(() => capas.get(pasta))
  const [falhou, setFalhou] = useState(false)
  useEffect(() => {
    if (capas.has(pasta)) {
      setUrl(capas.get(pasta))
      return
    }
    let ativo = true
    void window.api.capaDaPasta(pasta).then(
      (c) => {
        capas.set(pasta, c?.url ?? null)
        if (ativo) setUrl(c?.url ?? null)
      },
      () => undefined
    )
    return () => {
      ativo = false
    }
  }, [pasta])
  if (url && !falhou) {
    return (
      <img
        className="compacto-capa"
        src={url}
        alt=""
        width={tamanho}
        height={tamanho}
        draggable={false}
        onError={() => setFalhou(true)}
      />
    )
  }
  return <Arte semente={pasta} tamanho={tamanho} raio={4} />
}

/** Esquece as capas guardadas (ex.: depois de reescanear ou trocar a capa no modo normal). */
export function esquecerCapasCompacto(): void {
  capas.clear()
}

interface Props {
  biblioteca: Biblioteca
  visao: Visao
  /** Samples da visão aberta, já com busca e filtros aplicados. */
  samples: Sample[]
  busca: string
  aoBuscar: (t: string) => void
  aoIr: (v: Visao) => void
  aoVoltarLista: () => void
  aoExpandir: () => void
  favoritos: Set<string>
  tocandoId: string | null
  carregandoId: string | null
  cursorId: string | null
  sampleEmFoco: Sample | null
  aoTocar: (s: Sample) => void
  aoTocarParar: () => void
  aoAnterior: () => void
  aoProximo: () => void
  aoFavoritar: (s: Sample) => void
  aoArrastar: (s: Sample, e: React.DragEvent) => void
  aoMenu: (s: Sample, rect: DOMRect) => void
  volume: number
  aoVolume: (v: number) => void
  /** Tom da pré-escuta em semitons (knob do modo completo / projeto). */
  tom: number
  projeto: AjustesProjeto
  aoProjeto: (a: AjustesProjeto) => void
  arrastarComAjustes: boolean
  aoArrastarComAjustes: (v: boolean) => void
}

const normalizar = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function ModoCompacto(p: Props): JSX.Element {
  const listaDeSamples = p.visao.tipo === 'pasta' || p.visao.tipo === 'todasPastas' || p.visao.tipo === 'favoritos' || p.visao.tipo === 'colecao'
  const [filtroPastas, setFiltroPastas] = useState('')

  const titulo =
    p.visao.tipo === 'pasta'
      ? nomeDaPasta(p.visao.caminho)
      : p.visao.tipo === 'todasPastas'
        ? 'Todas as pastas'
        : p.visao.tipo === 'favoritos'
          ? 'Curtidos'
          : p.visao.tipo === 'colecao'
            ? (p.biblioteca.colecoes.find((c) => c.id === (p.visao as { id: string }).id)?.nome ?? 'Coleção')
            : 'Pastas'

  const filtro = listaDeSamples ? p.busca : filtroPastas
  const mudarFiltro = (t: string): void => (listaDeSamples ? p.aoBuscar(t) : setFiltroPastas(t))

  const termo = normalizar(filtroPastas.trim())
  const ordem = lerAjuste('ordemPastas') === 'alfabetica' ? 'alfabetica' : 'inclusao'
  const pastas = ordenarPastas(p.biblioteca.pastas, ordem).filter(
    (pasta) => !termo || normalizar(`${nomeDaPasta(pasta)} ${pasta}`).includes(termo)
  )
  const contagem = new Map<string, number>()
  for (const s of p.biblioteca.samples) {
    contagem.set(s.pastaRaiz, (contagem.get(s.pastaRaiz) ?? 0) + 1)
  }
  const colecoes = p.biblioteca.colecoes.filter((c) => !termo || normalizar(c.nome).includes(termo))
  const mostrarCurtidos = !termo || normalizar('Curtidos').includes(termo)
  const mostrarTodasPastas = !termo || normalizar('Todas as pastas').includes(termo)

  const foco = p.sampleEmFoco

  return (
    <div className="app-compacto">
      <header className="compacto-titulo">
        <div className="logo" title="SampleDeck">
          <svg width="20" height="20" viewBox="0 0 24 24">
            <rect width="24" height="24" rx="6" fill="#1a4bff" />
            <path d="M5 12h2M8.5 8v8M12 5v14M15.5 9v6M19 11v2" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span>SampleDeck</span>
        </div>
        <button className="icone-botao compacto-alternar" onClick={p.aoExpandir} title="Expandir para o modo completo">
          <Expand size={17} />
        </button>
      </header>

      <div className="compacto-nav">
        {listaDeSamples ? (
          <button className="icone-botao compacto-voltar" onClick={p.aoVoltarLista} title="Voltar às pastas">
            <ArrowLeft size={20} />
          </button>
        ) : (
          <span className="compacto-voltar-vazio" />
        )}
        <h1 title={titulo}>{titulo}</h1>
        <span className="compacto-voltar-vazio" />
      </div>

      <div className="compacto-filtro">
        <Search size={15} />
        <input
          value={filtro}
          onChange={(e) => mudarFiltro(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && mudarFiltro('')}
          placeholder="Filtrar"
          aria-label="Filtrar"
          spellCheck={false}
        />
        {filtro && (
          <button title="Limpar filtro" onClick={() => mudarFiltro('')}>
            <X size={13} />
          </button>
        )}
      </div>

      <div className="compacto-rolagem">
        {listaDeSamples ? (
          p.samples.length === 0 ? (
            <div className="compacto-vazio">{p.busca ? 'Nenhum sample combina com o filtro.' : 'Nenhum sample aqui.'}</div>
          ) : (
            p.samples.map((s) => {
              const tocando = p.tocandoId === s.id
              const carregando = p.carregandoId === s.id
              const fav = p.favoritos.has(s.id)
              const meta = [s.bpm !== null ? `${formatarBpm(s)} BPM` : null, s.tom, s.categoria].filter(Boolean).join(' · ')
              return (
                <div
                  key={s.id}
                  className={`compacto-sample${tocando ? ' tocando' : ''}${p.cursorId === s.id ? ' cursor' : ''}`}
                  onClick={() => p.aoTocar(s)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    p.aoMenu(s, new DOMRect(e.clientX, e.clientY, 0, 0))
                  }}
                  draggable
                  onDragStart={(e) => p.aoArrastar(s, e)}
                  title="Clique para ouvir; arraste para a DAW"
                >
                  <span className="compacto-sample-kit" title={s.kit || nomeDaPasta(s.pastaRaiz)}>
                    <CapaPasta pasta={s.pastaRaiz} tamanho={30} />
                  </span>
                  <span className="compacto-sample-tocar">
                    {carregando ? <Loader2 size={15} className="girando" /> : tocando ? <Square size={13} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
                  </span>
                  <span className="compacto-sample-texto">
                    <span className="compacto-sample-nome">{s.nome}</span>
                    {meta && <span className="compacto-sample-meta">{meta}</span>}
                  </span>
                  <button
                    className={`compacto-sample-fav${fav ? ' ativo' : ''}`}
                    title={fav ? 'Descurtir' : 'Curtir'}
                    onClick={(e) => {
                      e.stopPropagation()
                      p.aoFavoritar(s)
                    }}
                  >
                    <Heart size={14} fill={fav ? 'currentColor' : 'none'} />
                  </button>
                  <button
                    className="compacto-sample-mais"
                    title="Mais opções"
                    onClick={(e) => {
                      e.stopPropagation()
                      p.aoMenu(s, e.currentTarget.getBoundingClientRect())
                    }}
                  >
                    <EllipsisVertical size={15} />
                  </button>
                </div>
              )
            })
          )
        ) : (
          <>
            <div className="compacto-secao">Sua biblioteca</div>
            {p.biblioteca.pastas.length > 0 && mostrarTodasPastas && (
              <button className="compacto-pacote" onClick={() => p.aoIr({ tipo: 'todasPastas' })} title="Samples de todas as pastas">
                <span className="compacto-icone-colecao">
                  <FolderTree size={20} />
                </span>
                <span className="compacto-pacote-texto">
                  <span className="compacto-pacote-nome">Todas as pastas</span>
                  <span className="compacto-pacote-sub">{p.biblioteca.samples.length.toLocaleString('pt-BR')} samples</span>
                </span>
                <ChevronRight size={18} className="compacto-seta" />
              </button>
            )}
            {pastas.length === 0 && (
              <div className="compacto-vazio">
                {termo ? 'Nenhuma pasta encontrada.' : 'Nenhuma pasta ainda. Expanda o app para adicionar uma.'}
              </div>
            )}
            {pastas.map((pasta) => (
              <button key={pasta} className="compacto-pacote" onClick={() => p.aoIr({ tipo: 'pasta', caminho: pasta })} title={pasta}>
                <CapaPasta pasta={pasta} tamanho={44} />
                <span className="compacto-pacote-texto">
                  <span className="compacto-pacote-nome">{nomeDaPasta(pasta)}</span>
                  <span className="compacto-pacote-sub">{(contagem.get(pasta) ?? 0).toLocaleString('pt-BR')} samples</span>
                </span>
                <ChevronRight size={18} className="compacto-seta" />
              </button>
            ))}

            {(mostrarCurtidos || colecoes.length > 0) && <div className="compacto-secao">Coleções</div>}
            {mostrarCurtidos && (
              <button className="compacto-pacote" onClick={() => p.aoIr({ tipo: 'favoritos' })}>
                <span className="compacto-icone-colecao curtidos">
                  <Heart size={20} fill="currentColor" />
                </span>
                <span className="compacto-pacote-texto">
                  <span className="compacto-pacote-nome">Curtidos</span>
                  <span className="compacto-pacote-sub">{p.biblioteca.favoritos.length.toLocaleString('pt-BR')} samples</span>
                </span>
                <ChevronRight size={18} className="compacto-seta" />
              </button>
            )}
            {colecoes.map((c) => (
              <button key={c.id} className="compacto-pacote" onClick={() => p.aoIr({ tipo: 'colecao', id: c.id })}>
                <span className="compacto-icone-colecao">
                  <Layers size={20} />
                </span>
                <span className="compacto-pacote-texto">
                  <span className="compacto-pacote-nome">{c.nome}</span>
                  <span className="compacto-pacote-sub">{c.sampleIds.length.toLocaleString('pt-BR')} samples</span>
                </span>
                <ChevronRight size={18} className="compacto-seta" />
              </button>
            ))}
          </>
        )}
      </div>

      <PlayerCompacto
        foco={foco}
        tocando={!!p.tocandoId}
        podeNavegar={listaDeSamples}
        volume={p.volume}
        tom={p.tom}
        projeto={p.projeto}
        arrastarComAjustes={p.arrastarComAjustes}
        aoTocarParar={p.aoTocarParar}
        aoAnterior={p.aoAnterior}
        aoProximo={p.aoProximo}
        aoVolume={p.aoVolume}
        aoProjeto={p.aoProjeto}
        aoArrastarComAjustes={p.aoArrastarComAjustes}
      />
    </div>
  )
}

interface PropsPlayer {
  foco: Sample | null
  tocando: boolean
  podeNavegar: boolean
  volume: number
  tom: number
  projeto: AjustesProjeto
  arrastarComAjustes: boolean
  aoTocarParar: () => void
  aoAnterior: () => void
  aoProximo: () => void
  aoVolume: (v: number) => void
  aoProjeto: (a: AjustesProjeto) => void
  aoArrastarComAjustes: (v: boolean) => void
}

/**
 * Player do modo compacto: transporte, capa e nome do sample, tom (KEY) e BPM como soam na
 * pré-escuta (em azul quando ajustados pelo projeto; a seta abre o painel do projeto) e volume.
 */
function PlayerCompacto(p: PropsPlayer): JSX.Element {
  const [ancoraProjeto, setAncoraProjeto] = useState<DOMRect | null>(null)
  const [ancoraVolume, setAncoraVolume] = useState<DOMRect | null>(null)
  const fecharProjeto = useCallback(() => setAncoraProjeto(null), [])
  const ultimoVolume = useRef(VOLUME_PADRAO)
  const [, forcarDesenho] = useState(0)
  // Redesenha quando o motor avisa (ex.: terminou a detecção de tom)
  useEffect(() => motor.observar(() => forcarDesenho((n) => n + 1)), [])

  const s = p.foco
  const { tom: tomProjeto, bpm: bpmProjeto } = projetoEfetivo(p.projeto)
  const projetoLigado = !!(tomProjeto || bpmProjeto)

  // Tom como soa: o do sample (ou detectado) transposto pelo knob
  let tomTexto = '--'
  let tomAjustado = false
  if (s) {
    const st = motor.situacaoTom(s)
    const t = st.tipo === 'conhecido' ? lerTonalidade(st.tom) : lerTonalidade(s.tom)
    if (t) {
      const desloc = Number.isInteger(p.tom) ? p.tom : 0
      tomTexto = formatarTonalidade({ ...t, tonica: (((t.tonica + desloc) % 12) + 12) % 12 })
      tomAjustado = p.tom !== 0
    } else if (st.tipo === 'detectando') {
      tomTexto = '…'
    }
  }

  // BPM como soa: o do sample, esticado para o do projeto quando é um loop
  let bpmTexto = '--'
  let bpmAjustado = false
  if (s && s.bpm !== null) {
    const sb = situacaoBpm(s, bpmProjeto)
    if (sb.tipo === 'aplicado' && sb.velocidade !== 1) {
      bpmTexto = String(Math.round(s.bpm * sb.velocidade * 10) / 10)
      bpmAjustado = true
    } else {
      bpmTexto = formatarBpm(s)
    }
  }

  const abrirProjeto = (e: React.MouseEvent<HTMLButtonElement>): void => {
    const r = e.currentTarget.getBoundingClientRect()
    setAncoraProjeto((a) => (a ? null : r))
  }

  return (
    <footer className="compacto-player">
      <button className="icone-botao" onClick={p.aoAnterior} title="Anterior (↑)" disabled={!p.podeNavegar}>
        <SkipBack size={15} />
      </button>
      <button className="compacto-play" onClick={p.aoTocarParar} title="Tocar/parar (Espaço)" disabled={!s && !p.podeNavegar}>
        {p.tocando ? <Square size={13} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
      </button>
      <button className="icone-botao" onClick={p.aoProximo} title="Próximo (↓)" disabled={!p.podeNavegar}>
        <SkipForward size={15} />
      </button>

      <span className="compacto-player-sample" title={s?.caminho}>
        {s && <Arte semente={s.pastaRelativa || s.pastaRaiz} tamanho={28} raio={3} />}
        <span className="compacto-player-nome">{s ? s.nome : 'Nenhum sample selecionado'}</span>
      </span>

      <button
        className={`compacto-medida botao-projeto${tomAjustado ? ' ajustado' : ''}`}
        onClick={abrirProjeto}
        title="Tom da pré-escuta (clique para o tom do projeto)"
      >
        <strong>{tomTexto}</strong>
        <small>KEY</small>
      </button>
      <button
        className={`compacto-medida compacto-medida-bpm botao-projeto${bpmAjustado ? ' ajustado' : ''}${projetoLigado ? ' projeto-ligado' : ''}`}
        onClick={abrirProjeto}
        title="BPM da pré-escuta (clique para o BPM do projeto)"
      >
        <span>
          <strong>{bpmTexto}</strong>
          <small>BPM</small>
        </span>
        <ChevronDown size={13} />
      </button>

      <button
        className="icone-botao compacto-volume"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          setAncoraVolume((a) => (a ? null : r))
        }}
        title="Volume"
      >
        {p.volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
      </button>

      {ancoraVolume &&
        createPortal(
          <PopoverVolume
            ancora={ancoraVolume}
            volume={p.volume}
            aoVolume={p.aoVolume}
            aoSilenciar={() => {
              if (p.volume > 0) {
                ultimoVolume.current = p.volume
                p.aoVolume(0)
              } else {
                p.aoVolume(ultimoVolume.current || VOLUME_PADRAO)
              }
            }}
            aoFechar={() => setAncoraVolume(null)}
          />,
          document.body
        )}
      {ancoraProjeto && (
        <PainelProjeto
          ancora={ancoraProjeto}
          projeto={p.projeto}
          arrastarComAjustes={p.arrastarComAjustes}
          aoMudar={p.aoProjeto}
          aoArrastarComAjustes={p.aoArrastarComAjustes}
          aoFechar={fecharProjeto}
        />
      )}
    </footer>
  )
}

/** Balão acima do botão de volume com o slider e o botão de silenciar. */
function PopoverVolume(p: {
  ancora: DOMRect
  volume: number
  aoVolume: (v: number) => void
  aoSilenciar: () => void
  aoFechar: () => void
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: -9999, y: -9999 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) {
      return
    }
    const x = Math.min(window.innerWidth - el.offsetWidth - 8, Math.max(8, p.ancora.right - el.offsetWidth))
    setPos({ x, y: Math.max(8, p.ancora.top - el.offsetHeight - 6) })
  }, [p.ancora])
  const { aoFechar } = p
  useEffect(() => {
    const fora = (e: MouseEvent): void => {
      const alvo = e.target as HTMLElement
      // O menu do slider (botão direito) também fica fora do balão
      if (!alvo.closest('.compacto-popover-volume') && !alvo.closest('.compacto-volume') && !alvo.closest('.menu')) {
        aoFechar()
      }
    }
    const tecla = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        aoFechar()
      }
    }
    window.addEventListener('mousedown', fora, true)
    window.addEventListener('keydown', tecla, true)
    return () => {
      window.removeEventListener('mousedown', fora, true)
      window.removeEventListener('keydown', tecla, true)
    }
  }, [aoFechar])

  return (
    <div ref={ref} className="menu compacto-popover-volume" style={{ left: pos.x, top: pos.y }}>
      <button className="icone-botao" onClick={p.aoSilenciar} title={p.volume === 0 ? 'Reativar som' : 'Silenciar'}>
        {p.volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
      </button>
      <SliderAjuste
        tipo="volume"
        className="volume"
        min={0}
        max={1}
        step={0.01}
        valor={p.volume}
        padrao={VOLUME_PADRAO}
        formatar={(v) => `${Math.round(v * 100)}%`}
        aoMudar={p.aoVolume}
        style={{ ['--v' as string]: `${p.volume * 100}%` }}
      />
      <span className="compacto-popover-valor">{Math.round(p.volume * 100)}%</span>
    </div>
  )
}
