import { useEffect, useState } from 'react'
import { ArrowLeft, ChevronRight, EllipsisVertical, Expand, Heart, Layers, Loader2, Play, Search, SkipBack, SkipForward, Square, X } from 'lucide-react'
import type { Biblioteca, Sample } from '@shared/tipos'
import { Arte } from './Arte'
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

      <footer className="compacto-player">
        <button className="icone-botao" onClick={p.aoAnterior} title="Anterior (↑)" disabled={!listaDeSamples}>
          <SkipBack size={15} />
        </button>
        <button className="compacto-play" onClick={p.aoTocarParar} title="Tocar/parar (Espaço)" disabled={!foco && !listaDeSamples}>
          {p.tocandoId ? <Square size={13} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
        </button>
        <button className="icone-botao" onClick={p.aoProximo} title="Próximo (↓)" disabled={!listaDeSamples}>
          <SkipForward size={15} />
        </button>
        <span className="compacto-player-nome" title={foco?.nome}>
          {foco ? foco.nome : 'Nenhum sample selecionado'}
        </span>
        {foco && (
          <button
            className={`compacto-sample-fav${p.favoritos.has(foco.id) ? ' ativo' : ''}`}
            onClick={() => p.aoFavoritar(foco)}
            title="Curtir (L)"
          >
            <Heart size={14} fill={p.favoritos.has(foco.id) ? 'currentColor' : 'none'} />
          </button>
        )}
      </footer>
    </div>
  )
}
