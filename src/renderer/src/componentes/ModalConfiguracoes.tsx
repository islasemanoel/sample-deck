import { useState } from 'react'
import { gravarAjuste, lerAjuste } from '../preferencias'
import { Modal } from './Modal'

/** Chave em preferencias.json lida também pelo processo principal ao baixar capas. */
export const AJUSTE_CAPA_NA_PASTA = 'capaNaPastaDoKit'

/** Configurações do app. */
export function ModalConfiguracoes({ aoFechar }: { aoFechar: () => void }): JSX.Element {
  const [capaNaPasta, setCapaNaPasta] = useState(() => lerAjuste(AJUSTE_CAPA_NA_PASTA) === true)
  return (
    <Modal
      titulo="Configurações"
      aoFechar={aoFechar}
      rodape={
        <button className="botao primario" onClick={aoFechar}>
          Fechar
        </button>
      }
    >
      <h3 className="config-secao">Capas</h3>
      <label className="config-opcao">
        <input
          type="checkbox"
          checked={capaNaPasta}
          onChange={(e) => {
            setCapaNaPasta(e.target.checked)
            gravarAjuste(AJUSTE_CAPA_NA_PASTA, e.target.checked)
          }}
        />
        <span>
          <strong>Salvar capas encontradas na web também como cover.jpg na pasta do kit</strong>
          <small>
            Assim a capa aparece no Explorer e em outros programas. Só grava se houver espaço em disco e nunca substitui um
            cover que já esteja na pasta. Uma cópia continua guardada no app.
          </small>
        </span>
      </label>
    </Modal>
  )
}
