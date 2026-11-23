import { useState } from 'react'
import { ArrowDownAZ, Clock, Compass, Folder, FolderOpen, FolderPlus, FolderTree, Heart, Layers, LayoutGrid, ListOrdered, Music, Plus, RefreshCw, Search, X } from 'lucide-react'
import type { Biblioteca, ProgressoVarredura } from '@shared/tipos'
import { mesmaVisao, nomeDaPasta, ordenarPastas, type OrdemPastas, type Visao } from '../visao'
import { gravarAjuste, lerAjuste } from '../preferencias'

interface Props {
  biblioteca: Biblioteca
  visao: Visao
  aoIr: (v: Visao) => void
  aoNovaColecao: () => void
  aoAdicionarPasta: () => void
  aoRemoverPasta: (pasta: string) => void
  aoReescanearPasta: (pasta: string) => void
  aoAbrirPasta: (pasta: string) => void
  progresso: ProgressoVarredura | null
  aoPararVarredura: () => void
  largura: number
  aoRedimensionar: (largura: number) => void
  aoFinalizarRedimensionar: (largura: number) => void
}

const LARGURA_MIN = 160
const LARGURA_MAX = 480

/** Navegação principal: biblioteca, pastas e coleções. */
export function BarraLateral(p: Props): JSX.Element {
  const limitar = (l: number): number => Math.min(LARGURA_MAX, Math.max(LARGURA_MIN, Math.round(l)))

  const iniciarArraste = (e: React.PointerEvent<HTMLDivElement>): void => {
    e.preventDefault()
    const alca = e.currentTarget
    alca.setPointerCapture(e.pointerId)
    const inicioX = e.clientX
    const larguraInicial = p.largura
    let atual = larguraInicial
    const mover = (ev: PointerEvent): void => {
      atual = limitar(larguraInicial + ev.clientX - inicioX)
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

  const teclado = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const nova = limitar(p.largura + (e.key === 'ArrowRight' ? 16 : -16))
    p.aoRedimensionar(nova)
    p.aoFinalizarRedimensionar(nova)
  }

  const [ordem, setOrdem] = useState<OrdemPastas>(() =>
    lerAjuste('ordemPastas') === 'alfabetica' ? 'alfabetica' : 'inclusao'
  )
  const alternarOrdem = (): void => {
    const nova: OrdemPastas = ordem === 'alfabetica' ? 'inclusao' : 'alfabetica'
    setOrdem(nova)
    gravarAjuste('ordemPastas', nova)
  }

  const [filtro, setFiltro] = useState('')
  const normalizar = (s: string): string =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const termo = normalizar(filtro.trim())
  const pastasOrdenadas = ordenarPastas(p.biblioteca.pastas, ordem)
  const pastasFiltradas = termo
    ? pastasOrdenadas.filter((pasta) => normalizar(`${nomeDaPasta(pasta)} ${pasta}`).includes(termo))
    : pastasOrdenadas

  const item = (v: Visao, rotulo: string, icone: JSX.Element, extra?: JSX.Element): JSX.Element => (
    <div
      key={JSON.stringify(v)}
      className={`lateral-item${mesmaVisao(v, p.visao) ? ' ativo' : ''}`}
      onClick={() => p.aoIr(v)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && p.aoIr(v)}
    >
      <span className="lateral-icone">{icone}</span>
      <span className="lateral-rotulo">{rotulo}</span>
      {extra}
    </div>
  )
  return (
    <nav className="barra-lateral">
      <div className="lateral-rolagem">
        {item({ tipo: 'explorar' }, 'Explorar', <Compass size={15} />)}

        <div className="lateral-secao">Sua biblioteca</div>
        {item({ tipo: 'todos' }, 'Sons', <Music size={15} />)}
        {item({ tipo: 'recentes' }, 'Recentes', <Clock size={15} />)}

        <div className="lateral-secao">
          Pastas
          <span className="lateral-secao-acoes">
            {p.biblioteca.pastas.length > 1 && (
              <button
                className="lateral-mais"
                onClick={alternarOrdem}
                title={
                  ordem === 'alfabetica'
                    ? 'Ordem alfabética (clique para ordem de inclusão)'
                    : 'Ordem de inclusão (clique para ordem alfabética)'
                }
                aria-label={ordem === 'alfabetica' ? 'Ordenar por inclusão' : 'Ordenar alfabeticamente'}
              >
                {ordem === 'alfabetica' ? <ArrowDownAZ size={14} /> : <ListOrdered size={14} />}
              </button>
            )}
            <button className="lateral-mais" onClick={p.aoAdicionarPasta} title="Adicionar pasta">
              <Plus size={15} />
            </button>
          </span>
        </div>
        {p.biblioteca.pastas.length === 0 && (
          <button className="lateral-vazio" onClick={p.aoAdicionarPasta}>
            <FolderPlus size={14} /> Adicionar pasta
          </button>
        )}
        {p.biblioteca.pastas.length > 0 && (
          <div className="lateral-filtro">
            <Search size={13} />
            <input
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setFiltro('')}
              placeholder="Filtrar pastas"
              aria-label="Filtrar pastas"
              spellCheck={false}
            />
            {filtro && (
              <button title="Limpar filtro" onClick={() => setFiltro('')}>
                <X size={12} />
              </button>
            )}
          </div>
        )}
        {p.biblioteca.pastas.length > 0 &&
          item({ tipo: 'todasPastas' }, 'Todas as pastas', <FolderTree size={15} />)}
        {filtro.trim() && pastasFiltradas.length === 0 && (
          <div className="lateral-sem-resultado">Nenhuma pasta encontrada</div>
        )}
        {pastasFiltradas.map((pasta) =>
          item(
            { tipo: 'pasta', caminho: pasta },
            nomeDaPasta(pasta),
            <Folder size={15} />,
            <span className="lateral-acoes">
              <button
                title="Abrir no Explorer"
                onClick={(e) => {
                  e.stopPropagation()
                  p.aoAbrirPasta(pasta)
                }}
              >
                <FolderOpen size={12} />
              </button>
              <button
                title="Reescanear"
                onClick={(e) => {
                  e.stopPropagation()
                  p.aoReescanearPasta(pasta)
                }}
              >
                <RefreshCw size={12} />
              </button>
              <button
                title="Remover da biblioteca"
                onClick={(e) => {
                  e.stopPropagation()
                  p.aoRemoverPasta(pasta)
                }}
              >
                <X size={13} />
              </button>
            </span>
          )
        )}

        <div className="lateral-secao">
          Coleções
          <button className="lateral-mais" onClick={p.aoNovaColecao} title="Nova coleção">
            <Plus size={15} />
          </button>
        </div>
        {item({ tipo: 'colecoes' }, 'Todas as coleções', <LayoutGrid size={14} />)}
        {item({ tipo: 'favoritos' }, 'Curtidos', <Heart size={14} fill="currentColor" />)}
        {p.biblioteca.colecoes.map((c) =>
          item({ tipo: 'colecao', id: c.id }, c.nome, <Layers size={14} />)
        )}
      </div>
      {p.progresso && (
        <div className="lateral-progresso">
          <div className="lateral-progresso-cabeca">
            <span className="lateral-progresso-pasta" title={p.progresso.pasta}>
              {nomeDaPasta(p.progresso.pasta)}
            </span>
            <button className="link" onClick={p.aoPararVarredura} title="Parar e manter o que já foi indexado">
              Parar
            </button>
          </div>
          {p.progresso.lote && (
            <div className="lateral-progresso-texto">
              Pasta {p.progresso.lote.atual} de {p.progresso.lote.total}
            </div>
          )}
          <div className="lateral-progresso-texto">
            {p.progresso.fase === 'listando'
              ? `Procurando arquivos… ${p.progresso.processados.toLocaleString('pt-BR')} encontrados`
              : `Indexando ${p.progresso.processados.toLocaleString('pt-BR')} de ${p.progresso.total.toLocaleString('pt-BR')}`}
          </div>
          <div className={`lateral-progresso-barra${p.progresso.fase === 'listando' ? ' indeterminada' : ''}`}>
            <div
              style={
                p.progresso.fase === 'listando'
                  ? undefined
                  : { width: `${(100 * p.progresso.processados) / Math.max(1, p.progresso.total)}%` }
              }
            />
          </div>
        </div>
      )}
      <div
        className="lateral-alca"
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={p.largura}
        aria-valuemin={LARGURA_MIN}
        aria-valuemax={LARGURA_MAX}
        tabIndex={0}
        title="Arraste para redimensionar (duplo clique restaura)"
        onPointerDown={iniciarArraste}
        onKeyDown={teclado}
        onDoubleClick={() => {
          p.aoRedimensionar(212)
          p.aoFinalizarRedimensionar(212)
        }}
      />
    </nav>
  )
}
