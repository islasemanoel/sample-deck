import { useCallback, useEffect, useRef, useState } from 'react'
import { ExternalLink, ImagePlus, Search, Trash2 } from 'lucide-react'
import { avisoCopiaCapa, LOJAS, type CapaOnline } from '@shared/capa'
import { Modal } from './Modal'

interface Props {
  pasta: string
  nome: string
  /** A pasta já tem uma capa escolhida pelo usuário (que pode ser removida). */
  temCapaEscolhida: boolean
  /** Chamado depois que a capa muda (salva, escolhida ou removida). */
  aoAlterar: (mensagem: string) => void
  aoErro: (mensagem: string) => void
  aoFechar: () => void
}

function mensagemDe(e: unknown): string {
  return e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e)
}

/**
 * Busca a capa do kit nas lojas (The Drum Broker, Prime Loops...): sugere um termo a partir do nome da
 * pasta, mostra os produtos encontrados e grava a imagem escolhida.
 * Também permite escolher uma imagem do computador (para packs da Splice e outros).
 */
export function ModalCapa(p: Props): JSX.Element {
  const [termo, setTermo] = useState('')
  const [capas, setCapas] = useState<CapaOnline[] | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [salvando, setSalvando] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [falharam, setFalharam] = useState<string[]>([])
  const ref = useRef<HTMLInputElement>(null)

  const buscar = useCallback(
    async (t?: string): Promise<void> => {
      setBuscando(true)
      setErro(null)
      try {
        const r = await window.api.buscarCapasOnline(p.pasta, t)
        setTermo(r.termo)
        setCapas(r.capas)
        setFalharam(r.falharam)
      } catch (e) {
        setErro(`Não foi possível buscar: ${mensagemDe(e)}`)
        setCapas([])
      } finally {
        setBuscando(false)
      }
    },
    [p.pasta]
  )

  // Primeira busca com o termo sugerido pelo nome da pasta
  useEffect(() => {
    void buscar()
  }, [buscar])

  const escolher = async (c: CapaOnline): Promise<void> => {
    setSalvando(c.imagem)
    try {
      const copia = await window.api.salvarCapaOnline(p.pasta, c.imagem)
      p.aoAlterar(`Capa salva${avisoCopiaCapa(copia)}`)
      p.aoFechar()
    } catch (e) {
      setErro(mensagemDe(e))
    } finally {
      setSalvando(null)
    }
  }

  const doComputador = async (): Promise<void> => {
    try {
      if (await window.api.escolherCapaArquivo(p.pasta)) {
        p.aoAlterar('Capa salva')
        p.aoFechar()
      }
    } catch (e) {
      p.aoErro(`Erro: ${mensagemDe(e)}`)
    }
  }

  const remover = async (): Promise<void> => {
    try {
      await window.api.removerCapa(p.pasta)
      p.aoAlterar('Capa removida')
      p.aoFechar()
    } catch (e) {
      p.aoErro(`Erro: ${mensagemDe(e)}`)
    }
  }

  return (
    <Modal
      titulo={`Capa de "${p.nome}"`}
      aoFechar={p.aoFechar}
      largo
      rodape={
        <>
          {p.temCapaEscolhida && (
            <button className="botao secundario" onClick={() => void remover()} style={{ marginRight: 'auto' }}>
              <Trash2 size={14} /> Remover capa
            </button>
          )}
          <button className="botao secundario" onClick={() => void doComputador()}>
            <ImagePlus size={14} /> Escolher do computador…
          </button>
          <button className="botao secundario" onClick={p.aoFechar}>
            Cancelar
          </button>
        </>
      }
    >
      <div className="capa-busca">
        <input
          ref={ref}
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && termo.trim() && void buscar(termo)}
          placeholder="Nome do kit"
          aria-label="Buscar capa"
          spellCheck={false}
        />
        <button className="botao primario" onClick={() => void buscar(termo)} disabled={buscando || !termo.trim()}>
          <Search size={14} /> Buscar
        </button>
      </div>
      <p className="capa-fonte">
        Lojas: {LOJAS.map((l) => l.nome).join(', ')}. Clique numa capa para usá-la nesta pasta.
        {falharam.length > 0 && <span className="capa-falharam"> Sem resposta: {falharam.join(', ')}.</span>}
      </p>
      {erro && <p className="capa-erro">{erro}</p>}
      {buscando && <p className="capa-status">Buscando…</p>}
      {!buscando && capas?.length === 0 && !erro && (
        <p className="capa-status">Nada encontrado. Tente outro termo (ex.: só o nome do produtor ou do kit) ou escolha uma imagem do computador.</p>
      )}
      {!buscando && capas && capas.length > 0 && (
        <div className="capa-grade">
          {capas.map((c) => (
            <div key={c.imagem} className={`capa-item${salvando === c.imagem ? ' salvando' : ''}`}>
              <button className="capa-imagem" onClick={() => void escolher(c)} disabled={!!salvando} title={`Usar “${c.titulo}”`}>
                <img src={c.miniatura} alt={c.titulo} loading="lazy" draggable={false} />
              </button>
              <div className="capa-titulo" title={c.titulo}>
                {c.titulo}
              </div>
              <div className="capa-loja">{c.loja}</div>
              <button className="link capa-pagina" onClick={() => window.api.abrirPaginaLoja(c.pagina)}>
                <ExternalLink size={11} /> Ver na loja
              </button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}
