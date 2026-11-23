import { useState } from 'react'
import { ChevronLeft, ChevronRight, CircleHelp, Moon, PanelRight, RefreshCw, Search, Settings, Shrink, X } from 'lucide-react'
import { escolherTema, lerTema } from '../tema'

/** Switch do tema escuro: ligado = escuro. */
function SwitchTema(): JSX.Element {
  const [escuro, setEscuro] = useState(() => lerTema() === 'escuro')
  const alternar = (): void => {
    const novo = !escuro
    setEscuro(novo)
    escolherTema(novo ? 'escuro' : 'claro')
  }
  return (
    <label className="switch-tema" title="Tema escuro">
      <Moon size={15} />
      <input type="checkbox" role="switch" checked={escuro} onChange={alternar} aria-label="Tema escuro" />
      <span className="switch-trilho" aria-hidden="true">
        <span className="switch-botao" />
      </span>
    </label>
  )
}

interface Props {
  podeVoltar: boolean
  podeAvancar: boolean
  aoVoltar: () => void
  aoAvancar: () => void
  busca: string
  aoBuscar: (t: string) => void
  /** Rótulo do escopo restrito da visão atual ("Nesta pasta"...); null quando a visão já é a biblioteca toda. */
  escopoLocal: string | null
  buscaEmTudo: boolean
  aoAlternarEscopo: () => void
  painelAberto: boolean
  aoAlternarPainel: () => void
  aoAjuda: () => void
  aoConfiguracoes: () => void
  aoReescanear: () => void
  varrendo: boolean
  /** Reduz a janela ao modo compacto (lista estreita para usar ao lado da DAW). */
  aoCompactar: () => void
}

/**
 * Barra superior (também serve para arrastar a janela): navegação, busca global e atalhos.
 * Deixa espaço à direita para os botões nativos da janela.
 */
export function BarraTitulo(p: Props): JSX.Element {
  return (
    <header className="barra-titulo">
      <div className="barra-titulo-esquerda">
        <div className="logo" title="SampleDeck">
          <svg width="22" height="22" viewBox="0 0 24 24">
            <rect width="24" height="24" rx="6" fill="#1a4bff" />
            <path d="M5 12h2M8.5 8v8M12 5v14M15.5 9v6M19 11v2" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
        <button className="icone-botao" disabled={!p.podeVoltar} onClick={p.aoVoltar} title="Voltar (Alt+←)">
          <ChevronLeft size={18} />
        </button>
        <button className="icone-botao" disabled={!p.podeAvancar} onClick={p.aoAvancar} title="Avançar (Alt+→)">
          <ChevronRight size={18} />
        </button>
        <button className={`botao-companheiro${p.painelAberto ? ' ativo' : ''}`} onClick={p.aoAlternarPainel}>
          <PanelRight size={14} />
          Pads
        </button>
      </div>
      <div className="busca-global">
        <Search size={14} />
        <input
          id="campo-busca"
          placeholder={p.escopoLocal && !p.buscaEmTudo ? `Buscar samples (${p.escopoLocal.toLowerCase()})` : 'Buscar samples'}
          value={p.busca}
          onChange={(e) => p.aoBuscar(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.altKey && p.escopoLocal) {
              e.preventDefault()
              p.aoAlternarEscopo()
            }
          }}
          spellCheck={false}
        />
        {p.escopoLocal && (
          <button
            className={`busca-escopo${p.buscaEmTudo ? ' ativo' : ''}`}
            onClick={p.aoAlternarEscopo}
            title={p.buscaEmTudo ? `Buscar e filtrar só ${p.escopoLocal.toLowerCase()} (Alt+Enter)` : 'Buscar e filtrar em todas as pastas (Alt+Enter)'}
          >
            {p.buscaEmTudo ? 'Todas as pastas' : p.escopoLocal}
            {!p.buscaEmTudo && <X size={11} className="busca-escopo-x" />}
          </button>
        )}
        {p.busca && (
          <button className="busca-limpar" onClick={() => p.aoBuscar('')} title="Limpar busca">
            <X size={13} />
          </button>
        )}
        {!p.busca && <kbd>Ctrl K</kbd>}
      </div>
      <div className="barra-titulo-direita">
        <SwitchTema />
        <button className="icone-botao" onClick={p.aoReescanear} title="Reescanear todas as pastas" disabled={p.varrendo}>
          <RefreshCw size={17} className={p.varrendo ? 'girando' : ''} />
        </button>
        <button className="icone-botao" onClick={p.aoConfiguracoes} title="Configurações">
          <Settings size={17} />
        </button>
        <button className="icone-botao" onClick={p.aoAjuda} title="Ajuda e atalhos">
          <CircleHelp size={19} />
        </button>
        <button className="icone-botao botao-compactar" onClick={p.aoCompactar} title="Modo compacto (para usar ao lado da DAW)">
          <Shrink size={17} />
        </button>
      </div>
    </header>
  )
}
