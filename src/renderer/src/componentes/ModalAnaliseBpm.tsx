import { useEffect, useState } from 'react'
import { Play } from 'lucide-react'
import { candidatosBpm, encaixeNaDuracao, formatarBpm, refinarBpmPelaDuracao, type ResultadoBpm } from '@shared/analiseBpm'
import type { Sample } from '@shared/tipos'
import { motor } from '../motorAudio'
import { Modal } from './Modal'

/** Mesmo limite do processo principal (src/main/detectorBpm.ts). */
const MAX_SEGUNDOS = 30
/** Duração máxima do metrônomo de conferência. */
const MAX_METRONOMO = 16

type Estado =
  | { tipo: 'carregando' }
  | { tipo: 'ok'; valor: ResultadoBpm; duracao: number }
  | { tipo: 'erro'; mensagem: string }

interface Props {
  sample: Sample
  aoFechar: () => void
}

const FATOR: Record<number, string> = { 0.5: '½×', 1: '1×', 2: '2×' }

/**
 * Janela "Detectar BPM": estimativa do Essentia LoopBpmEstimator, com metade/dobro, o encaixe
 * na duração do arquivo e um metrônomo para conferir de ouvido. Só exibe: nada é gravado.
 */
export function ModalAnaliseBpm({ sample, aoFechar }: Props): JSX.Element {
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' })

  useEffect(() => () => motor.pararReferencia(), [])

  useEffect(() => {
    let vivo = true
    motor
      .amostrasMono(sample, MAX_SEGUNDOS)
      .then(async ({ amostras, taxa, duracao }) => ({ valor: await window.api.analisarBpm(amostras, taxa), duracao }))
      .then(
        ({ valor, duracao }) => vivo && setEstado({ tipo: 'ok', valor, duracao }),
        (e: unknown) => vivo && setEstado({ tipo: 'erro', mensagem: e instanceof Error ? e.message : String(e) })
      )
    return () => {
      vivo = false
    }
  }, [sample])

  /** Toca o sample do início com o metrônomo por cima. */
  const ouvir = (bpm: number, duracao: number): void => {
    void motor.tocar(sample).then(() => motor.tocarMetronomo(bpm, Math.min(MAX_METRONOMO, Math.max(2, duracao))))
  }

  return (
    <Modal
      titulo={`Detectar BPM · ${sample.nome}`}
      aoFechar={aoFechar}
      largo
      rodape={
        <button className="botao secundario" onClick={aoFechar}>
          Fechar
        </button>
      }
    >
      <Conteudo estado={estado} sample={sample} aoOuvir={ouvir} />
    </Modal>
  )
}

function Conteudo({
  estado,
  sample,
  aoOuvir
}: {
  estado: Estado
  sample: Sample
  aoOuvir: (bpm: number, duracao: number) => void
}): JSX.Element {
  if (estado.tipo === 'carregando') {
    return (
      <p className="analise-status">
        <span className="mini-carregando" /> Analisando o áudio…
      </p>
    )
  }
  if (estado.tipo === 'erro') {
    return <p className="analise-status capa-erro">Não foi possível analisar: {estado.mensagem}</p>
  }
  const { valor: r, duracao } = estado
  const doNome = (
    <p className="analise-nome">
      {sample.bpm === null ? (
        <>
          No nome do arquivo: <strong>—</strong>
        </>
      ) : sample.bpmEstimado ? (
        <>
          Estimado na varredura: <strong>~{sample.bpm}</strong>
        </>
      ) : (
        <>
          No nome do arquivo: <strong>{sample.bpm} BPM</strong>
        </>
      )}
    </p>
  )
  const rodape = (
    <p className="analise-nota">
      Método: Essentia LoopBpmEstimator. Nos seus 397 loops com BPM no nome, acertou 70% exato e 98% contando metade/dobro.
      {r.bpm !== null && ` Analisados ${r.segundos >= 29.5 ? 'os primeiros 30 s' : `${r.segundos.toFixed(1)} s`}.`} O resultado
      não é gravado na biblioteca.
    </p>
  )
  if (r.bpm === null) {
    return (
      <>
        <div className="analise-destaque">
          <span className="analise-sub">{r.motivo}</span>
        </div>
        {doNome}
        {rodape}
      </>
    )
  }
  // O Essentia dá inteiros: se a duração fecha compassos exatos num BPM ".5" vizinho, usa esse
  const refino = refinarBpmPelaDuracao(r.bpm, duracao)
  const bpm = refino.bpm
  const refinado = bpm !== r.bpm
  const encaixe = encaixeNaDuracao(bpm, duracao)
  // A duração fecha num número inteiro de compassos com um BPM bem próximo (±2%)?
  const sugestao =
    encaixe && !encaixe.encaixa && Math.abs(encaixe.bpmExato / bpm - 1) <= 0.02 ? encaixe : null
  return (
    <>
      <div className="analise-destaque">
        <span className="analise-valor">{formatarBpm(bpm)} BPM</span>
        <span className="analise-sub">confiança {Math.round(r.confianca * 100)}%</span>
        <span className={`analise-selo${r.confiavel ? ' bom' : ''}`}>{r.confiavel ? 'Confiável' : 'Incerto'}</span>
        <button className="botao pequeno" title="Toca o sample com um metrônomo por cima" onClick={() => aoOuvir(bpm, duracao)}>
          <Play size={13} /> Ouvir com metrônomo
        </button>
      </div>
      {doNome}
      {refinado && (
        <p className="analise-nome">
          O Essentia estimou {formatarBpm(r.bpm)} (ele só dá números inteiros); a duração ({duracao.toFixed(2)} s) fecha
          exatamente {refino.compassos} compassos a <strong>{formatarBpm(bpm)} BPM</strong>.
        </p>
      )}
      {r.alternativa !== null && (
        <p className="analise-nome">
          Outro método do Essentia sugere <strong>{formatarBpm(r.alternativa)} BPM</strong>. Os dois às vezes erram por pouco:
          confira os dois com o metrônomo.
        </p>
      )}
      {sugestao && (
        <p className="analise-nome">
          A duração ({duracao.toFixed(2)} s) fecha exatamente {sugestao.compassos} compassos a{' '}
          <strong>{sugestao.bpmExato.toFixed(1)} BPM</strong>.
        </p>
      )}
      <table className="analise-tabela">
        <thead>
          <tr>
            <th title="Metade e dobro: a confusão mais comum entre detectores">Opção</th>
            <th>BPM</th>
            <th title="Loops costumam ser cortados em compassos exatos (4/4)">Encaixe na duração</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {[
            ...candidatosBpm(bpm).map((c) => ({ chave: String(c.fator), rotulo: FATOR[c.fator], dica: '', bpm: c.bpm, destaque: c.fator === 1 })),
            ...(r.alternativa !== null
              ? [
                  {
                    chave: 'alt',
                    rotulo: 'Outro método',
                    dica: 'Essentia RhythmExtractor2013: dá decimais, mas erra mais que o principal. Confira com o metrônomo.',
                    bpm: r.alternativa,
                    destaque: false
                  }
                ]
              : [])
          ].map((c) => {
            const e = encaixeNaDuracao(c.bpm, duracao)
            return (
              <tr key={c.chave}>
                <td title={c.dica || undefined}>{c.rotulo}</td>
                <td>{c.destaque ? <strong>{formatarBpm(c.bpm)}</strong> : formatarBpm(c.bpm)}</td>
                <td>
                  {!e ? (
                    <span className="analise-fraco">—</span>
                  ) : e.encaixa ? (
                    e.compassos === 1 ? '1 compasso exato' : `${e.compassos} compassos exatos`
                  ) : (
                    <span className="analise-fraco">não fecha em compassos inteiros</span>
                  )}
                </td>
                <td>
                  <button className="botao-icone" title="Ouvir com metrônomo neste BPM" onClick={() => aoOuvir(c.bpm, duracao)}>
                    <Play size={13} />
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {rodape}
    </>
  )
}
