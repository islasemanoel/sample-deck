import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface PropsBase {
  titulo: string
  aoFechar: () => void
  children: ReactNode
  rodape?: ReactNode
  /** Janela mais larga (para grades de imagens). */
  largo?: boolean
  /** Classe extra da janela. */
  classe?: string
}

/** Janela modal simples sobre a interface; fecha com Esc ou clique no fundo. */
export function Modal({ titulo, aoFechar, children, rodape, largo, classe }: PropsBase): JSX.Element {
  useEffect(() => {
    const tecla = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        aoFechar()
      }
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [aoFechar])
  return createPortal(
    <div className="modal-fundo" onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}>
      <div className={`modal${largo ? ' largo' : ''}${classe ? ` ${classe}` : ''}`} role="dialog" aria-label={titulo}>
        <h2>{titulo}</h2>
        <div className="modal-corpo">{children}</div>
        {rodape && <div className="modal-rodape">{rodape}</div>}
      </div>
    </div>,
    document.body
  )
}

interface PropsTexto {
  titulo: string
  rotuloConfirmar: string
  nomeInicial?: string
  descricaoInicial?: string
  /** Exibe também um campo de descrição. */
  comDescricao?: boolean
  aoConfirmar: (nome: string, descricao: string) => void
  aoFechar: () => void
}

/** Modal para digitar nome (e opcionalmente descrição), usado por coleções. */
export function ModalTexto(p: PropsTexto): JSX.Element {
  const [nome, setNome] = useState(p.nomeInicial ?? '')
  const [descricao, setDescricao] = useState(p.descricaoInicial ?? '')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  const confirmar = (): void => {
    if (nome.trim()) {
      p.aoConfirmar(nome.trim(), descricao.trim())
      p.aoFechar()
    }
  }
  return (
    <Modal
      titulo={p.titulo}
      aoFechar={p.aoFechar}
      rodape={
        <>
          <button className="botao secundario" onClick={p.aoFechar}>
            Cancelar
          </button>
          <button className="botao primario" disabled={!nome.trim()} onClick={confirmar}>
            {p.rotuloConfirmar}
          </button>
        </>
      }
    >
      <label className="campo">
        <span>Nome</span>
        <input ref={ref} value={nome} onChange={(e) => setNome(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && confirmar()} />
      </label>
      {p.comDescricao && (
        <label className="campo">
          <span>Descrição</span>
          <textarea rows={3} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        </label>
      )}
    </Modal>
  )
}

interface PropsConfirmacao {
  titulo: string
  mensagem: string
  rotuloConfirmar: string
  aoConfirmar: () => void
  aoFechar: () => void
}

/** Modal de confirmação para ações destrutivas. */
export function ModalConfirmacao(p: PropsConfirmacao): JSX.Element {
  return (
    <Modal
      titulo={p.titulo}
      aoFechar={p.aoFechar}
      rodape={
        <>
          <button className="botao secundario" onClick={p.aoFechar}>
            Cancelar
          </button>
          <button
            className="botao perigo"
            onClick={() => {
              p.aoConfirmar()
              p.aoFechar()
            }}
          >
            {p.rotuloConfirmar}
          </button>
        </>
      }
    >
      <p>{p.mensagem}</p>
    </Modal>
  )
}
