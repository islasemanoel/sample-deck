import { useEffect, useState } from 'react'
import { Play } from 'lucide-react'
import {
  acordeDeReferencia,
  consensoDosTons,
  frequenciaMidi,
  METODOS_TOM,
  modoDeAnalise,
  nomeDoTom,
  notaDaFrequencia,
  pecaDoSample,
  type ModoAnalise,
  type ResultadoNota,
  type ResultadoTom
} from '@shared/analiseTom'
import type { Sample } from '@shared/tipos'
import { motor } from '../motorAudio'
import { Modal } from './Modal'

/** Mesmo limite do processo principal (src/main/detectorTom.ts): além disso não melhora o acerto. */
const MAX_SEGUNDOS_TOM = 30
const MAX_SEGUNDOS_NOTA = 4

type Estado<T> = { tipo: 'carregando' } | { tipo: 'ok'; valor: T } | { tipo: 'erro'; mensagem: string }

interface Props {
  sample: Sample
  aoFechar: () => void
}

/**
 * Janela "Detectar tom": mostra a nota (one-shots curtos, 808, kick, snare) ou o tom (o resto)
 * estimados pelo áudio, com um botão para conferir de ouvido. Só exibe: nada é gravado.
 */
export function ModalAnaliseTom({ sample, aoFechar }: Props): JSX.Element {
  const [aba, setAba] = useState<ModoAnalise>(() => modoDeAnalise(sample))
  const [tom, setTom] = useState<Estado<ResultadoTom> | null>(null)
  const [nota, setNota] = useState<Estado<ResultadoNota> | null>(null)

  useEffect(() => () => motor.pararReferencia(), [])

  useEffect(() => {
    const falhar = (e: unknown): { tipo: 'erro'; mensagem: string } => ({
      tipo: 'erro',
      mensagem: e instanceof Error ? e.message : String(e)
    })
    if (aba === 'tom' && !tom) {
      setTom({ tipo: 'carregando' })
      motor
        .amostrasMono(sample, MAX_SEGUNDOS_TOM)
        .then(({ amostras, taxa }) => window.api.analisarTom(amostras, taxa))
        .then((valor) => setTom({ tipo: 'ok', valor }), (e) => setTom(falhar(e)))
    }
    if (aba === 'nota' && !nota) {
      setNota({ tipo: 'carregando' })
      motor
        .amostrasMono(sample, MAX_SEGUNDOS_NOTA)
        .then(({ amostras, taxa }) => window.api.analisarNota(amostras, taxa, pecaDoSample(sample)))
        .then((valor) => setNota({ tipo: 'ok', valor }), (e) => setNota(falhar(e)))
    }
  }, [aba, tom, nota, sample])

  /** Toca o sample do início com a referência por cima. */
  const ouvir = (frequencias: number[]): void => {
    const duracao = Math.max(1.5, Math.min(6, sample.duracao ?? 2))
    void motor.tocar(sample).then(() => motor.tocarReferencia(frequencias, duracao))
  }

  return (
    <Modal
      titulo={`Detectar tom · ${sample.nome}`}
      aoFechar={aoFechar}
      largo
      rodape={
        <button className="botao secundario" onClick={aoFechar}>
          Fechar
        </button>
      }
    >
      <div className="analise-abas" role="tablist">
        {(['nota', 'tom'] as const).map((a) => (
          <button key={a} role="tab" aria-selected={aba === a} className={aba === a ? 'ativa' : ''} onClick={() => setAba(a)}>
            {a === 'nota' ? 'Nota (one-shot)' : 'Tom (loop / harmonia)'}
          </button>
        ))}
      </div>
      {aba === 'tom' ? <AbaTom estado={tom} sample={sample} aoOuvir={ouvir} /> : <AbaNota estado={nota} sample={sample} aoOuvir={ouvir} />}
    </Modal>
  )
}

function Carregando(): JSX.Element {
  return (
    <p className="analise-status">
      <span className="mini-carregando" /> Analisando o áudio…
    </p>
  )
}

function Erro({ mensagem }: { mensagem: string }): JSX.Element {
  return <p className="analise-status capa-erro">Não foi possível analisar: {mensagem}</p>
}

function DoNome({ sample }: { sample: Sample }): JSX.Element {
  return (
    <p className="analise-nome">
      No nome do arquivo: <strong>{sample.tom ?? '—'}</strong>
    </p>
  )
}

interface PropsAba<T> {
  estado: Estado<T> | null
  sample: Sample
  aoOuvir: (frequencias: number[]) => void
}

function AbaTom({ estado, sample, aoOuvir }: PropsAba<ResultadoTom>): JSX.Element {
  if (!estado || estado.tipo === 'carregando') {
    return <Carregando />
  }
  if (estado.tipo === 'erro') {
    return <Erro mensagem={estado.mensagem} />
  }
  const r = estado.valor
  const c = consensoDosTons(r.estimativas)
  return (
    <>
      <div className="analise-destaque">
        {c ? (
          <>
            <span className="analise-valor">{nomeDoTom(c.tonica, c.menor)}</span>
            <span className="analise-sub">
              {c.votos} de {c.total} métodos concordam
            </span>
            <button className="botao pequeno" title="Toca o sample com o acorde da tônica por cima" onClick={() => aoOuvir(acordeDeReferencia(c.tonica, c.menor))}>
              <Play size={13} /> Ouvir com referência
            </button>
          </>
        ) : (
          <span className="analise-sub">Nenhum método respondeu.</span>
        )}
      </div>
      <DoNome sample={sample} />
      <table className="analise-tabela">
        <thead>
          <tr>
            <th>Método</th>
            <th>Tom</th>
            <th title="Força informada pelo método (0–100%)">Força</th>
            <th title="Acerto do tom exato na avaliação com 396 samples da sua biblioteca">Acerto nos testes</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {METODOS_TOM.map((m) => {
            const e = r.estimativas.find((x) => x.metodo === m.id)
            const ok = e && 'tonica' in e ? e : null
            return (
              <tr key={m.id}>
                <td>{m.nome}</td>
                <td>{ok ? <strong>{nomeDoTom(ok.tonica, ok.menor)}</strong> : <span className="analise-fraco">{e && 'erro' in e ? e.erro : '—'}</span>}</td>
                <td>{ok?.forca != null ? `${Math.round(ok.forca * 100)}%` : '—'}</td>
                <td>{m.exato}%</td>
                <td>
                  {ok && (
                    <button className="botao-icone" title="Ouvir com o acorde deste tom" onClick={() => aoOuvir(acordeDeReferencia(ok.tonica, ok.menor))}>
                      <Play size={13} />
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="analise-nota">
        Analisados os primeiros {Math.round(r.segundos)} s. Nos testes, o melhor método acertou o tom exato em ~39% dos samples: confira de
        ouvido. O resultado não é gravado na biblioteca.
      </p>
    </>
  )
}

function AbaNota({ estado, sample, aoOuvir }: PropsAba<ResultadoNota>): JSX.Element {
  if (!estado || estado.tipo === 'carregando') {
    return <Carregando />
  }
  if (estado.tipo === 'erro') {
    return <Erro mensagem={estado.mensagem} />
  }
  const r = estado.valor
  const nota = r.hz ? notaDaFrequencia(r.hz) : null
  return (
    <>
      <div className="analise-destaque">
        {nota && r.hz ? (
          <>
            <span className="analise-valor">{nota.nome}</span>
            <span className="analise-sub">
              {r.hz.toFixed(1)} Hz · {nota.cents >= 0 ? '+' : ''}
              {nota.cents} cents · {Math.round(r.consenso * 100)}% de {r.quadros} quadros
            </span>
            <span className={`analise-selo${r.confiavel ? ' bom' : ''}`}>{r.confiavel ? 'Estável' : 'Incerta'}</span>
            <button className="botao pequeno" title="Toca o sample com a nota por cima" onClick={() => aoOuvir([frequenciaMidi(nota.midi)])}>
              <Play size={13} /> Ouvir com referência
            </button>
          </>
        ) : (
          <span className="analise-sub">Sem altura definida (som percussivo, ruído ou nota que desliza).</span>
        )}
      </div>
      <DoNome sample={sample} />
      <p className="analise-nota">
        Método: Essentia PitchYin, quadro a quadro, com votação. Nos testes, acertou ~73% dos one-shots em que respondeu (808: 82%).
        {r.peca === 'kick' && ' Kick: medido depois da queda de altura do ataque.'}
        {r.peca === 'snare' && ' Snare: afinação aproximada do corpo; caixas têm muito ruído.'} O resultado não é gravado na biblioteca.
      </p>
    </>
  )
}
