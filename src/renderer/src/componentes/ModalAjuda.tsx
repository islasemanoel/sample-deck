import { Modal } from './Modal'

const ATALHOS: [string, string][] = [
  ['Espaço', 'Tocar / parar'],
  ['→', 'Tocar o sample em foco do início'],
  ['↑ / ↓', 'Sample anterior / próximo (toca automaticamente)'],
  ['L', 'Curtir o sample em foco'],
  ['Enter', 'Adicionar o sample (ou a seleção) a um pad livre'],
  ['Num 1–9', 'Tocar os pads'],
  ['Ctrl + K', 'Buscar'],
  ['Alt + Enter (na busca)', 'Alternar entre esta pasta e todas as pastas'],
  ['Shift + clique na caixa', 'Selecionar um intervalo'],
  ['Alt + ← / →', 'Voltar / avançar'],
  ['Esc', 'Limpar seleção']
]

/** Janela "Como usar o SampleDeck". */
export function ModalAjuda({ aoFechar }: { aoFechar: () => void }): JSX.Element {
  return (
    <Modal titulo="Como usar o SampleDeck" aoFechar={aoFechar}>
      <div className="ajuda">
        <p>
          Adicione pastas com seus samples em <b>Pastas → +</b>. O app lê BPM, tom e tipo (loop ou one-shot) pelo nome do arquivo e cria tags
          a partir do nome e das subpastas. Nada é alterado no disco.
        </p>
        <p>
          Clique num sample para ouvir. Arraste uma linha para a sua DAW ou para o Explorer para usar o arquivo. No painel <b>Pads</b>, solte
          samples nos 9 pads e toque-os com o teclado numérico, como numa MPC.
        </p>
        <table>
          <tbody>
            {ATALHOS.map(([k, d]) => (
              <tr key={k}>
                <td>
                  <kbd>{k}</kbd>
                </td>
                <td>{d}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  )
}
