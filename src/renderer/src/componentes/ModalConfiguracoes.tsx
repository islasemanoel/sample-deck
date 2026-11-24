import { useState } from 'react'
import {
  AJUSTE_LOCAL_AUDIO_EDITADO,
  AJUSTE_PASTA_AUDIO_EDITADO,
  localAudioEditado,
  type LocalAudioEditado
} from '@shared/audioEditado'
import { gravarAjuste, lerAjuste } from '../preferencias'
import { Modal } from './Modal'

/** Chave em preferencias.json lida também pelo processo principal ao baixar capas. */
export const AJUSTE_CAPA_NA_PASTA = 'capaNaPastaDoKit'

const OPCOES_LOCAL: { valor: LocalAudioEditado; titulo: string; detalhe: string }[] = [
  {
    valor: 'app',
    titulo: 'Na pasta do aplicativo',
    detalhe: 'Padrão. Os arquivos ficam em %APPDATA%\\sampledeck\\pads-arrastados, sem mexer nas pastas dos kits.'
  },
  {
    valor: 'original',
    titulo: 'Na mesma pasta do arquivo original',
    detalhe: 'O WAV editado fica ao lado do sample de onde veio (aparece na biblioteca ao reescanear a pasta).'
  },
  {
    valor: 'pasta',
    titulo: 'Numa pasta específica',
    detalhe: 'Todos os áudios editados vão para a pasta escolhida abaixo.'
  }
]

/** Configurações do app. */
export function ModalConfiguracoes({ aoFechar }: { aoFechar: () => void }): JSX.Element {
  const [capaNaPasta, setCapaNaPasta] = useState(() => lerAjuste(AJUSTE_CAPA_NA_PASTA) === true)
  const [salvamento, setSalvamento] = useState(() =>
    localAudioEditado({
      [AJUSTE_LOCAL_AUDIO_EDITADO]: lerAjuste(AJUSTE_LOCAL_AUDIO_EDITADO),
      [AJUSTE_PASTA_AUDIO_EDITADO]: lerAjuste(AJUSTE_PASTA_AUDIO_EDITADO)
    })
  )

  const escolherPasta = async (): Promise<boolean> => {
    const pasta = await window.api.escolherPastaAudioEditado()
    if (!pasta) {
      return false
    }
    gravarAjuste(AJUSTE_PASTA_AUDIO_EDITADO, pasta)
    gravarAjuste(AJUSTE_LOCAL_AUDIO_EDITADO, 'pasta')
    setSalvamento({ local: 'pasta', pasta })
    return true
  }

  const mudarLocal = (local: LocalAudioEditado): void => {
    if (local === 'pasta' && !salvamento.pasta) {
      void escolherPasta() // sem pasta escolhida ainda: só muda se o usuário escolher uma
      return
    }
    gravarAjuste(AJUSTE_LOCAL_AUDIO_EDITADO, local)
    setSalvamento((s) => ({ ...s, local }))
  }

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

      <h3 className="config-secao config-secao-separada">Áudios editados</h3>
      <p className="config-texto">
        Onde salvar os WAVs gerados ao arrastar um pad ou um sample com ajustes (trecho, tom, BPM, reverso) para a DAW ou
        o Explorer. Um arquivo existente nunca é sobrescrito.
      </p>
      <div className="config-grupo" role="radiogroup" aria-label="Local de salvamento dos áudios editados">
        {OPCOES_LOCAL.map((o) => (
          <label key={o.valor} className="config-opcao">
            <input
              type="radio"
              name="localAudioEditado"
              checked={salvamento.local === o.valor}
              onChange={() => mudarLocal(o.valor)}
            />
            <span>
              <strong>{o.titulo}</strong>
              <small>{o.detalhe}</small>
            </span>
          </label>
        ))}
        <div className="config-pasta">
          <span className="config-pasta-caminho" title={salvamento.pasta ?? undefined}>
            {salvamento.pasta ?? 'Nenhuma pasta escolhida'}
          </span>
          <button className="botao" onClick={() => void escolherPasta()}>
            {salvamento.pasta ? 'Alterar…' : 'Escolher pasta…'}
          </button>
        </div>
        <small className="config-nota">
          Se o local escolhido não estiver disponível (drive desconectado, pasta sem permissão), o arquivo é salvo na pasta
          do aplicativo.
        </small>
      </div>
    </Modal>
  )
}
