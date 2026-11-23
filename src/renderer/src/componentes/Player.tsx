import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Heart, ListMusic, Music2, Play, Repeat, Rewind, SkipBack, SkipForward, Square, Volume2, VolumeX } from 'lucide-react'
import { calcularPicos } from '@shared/audio'
import { formatarTom } from '@shared/pitch'
import { formatarTonalidade, lerTonalidade, situacaoBpm } from '@shared/projeto'
import type { Sample } from '@shared/tipos'
import { motor } from '../motorAudio'
import { formatarBpm, formatarDuracao } from '../visao'
import { Arte } from './Arte'
import { KnobTom } from './KnobTom'
import { PainelProjeto, projetoEfetivo, type AjustesProjeto } from './PainelProjeto'
import { SliderAjuste } from './SliderAjuste'

/** Volume inicial da pré-escuta (também o "padrão" restaurado pelo menu do slider). */
export const VOLUME_PADRAO = 0.8

const BARRAS = 140
const LIMITE_PICOS = 200

/** Formas de onda já calculadas, por id do sample (mais recentes no fim). */
const cachePicos = new Map<string, number[]>()

function guardarPicos(id: string, picos: number[]): void {
  cachePicos.delete(id)
  cachePicos.set(id, picos)
  while (cachePicos.size > LIMITE_PICOS) {
    cachePicos.delete(cachePicos.keys().next().value as string)
  }
}

function picosSincronos(id: string): number[] | null {
  const existente = cachePicos.get(id)
  if (existente) {
    return existente
  }
  const buffer = motor.sampleAtual()?.id === id ? motor.bufferAtual() : null
  if (!buffer) {
    return null
  }
  const picos = calcularPicos(buffer.getChannelData(0), BARRAS)
  guardarPicos(id, picos)
  return picos
}

interface Props {
  /** Sample em foco: o que está tocando ou o selecionado. */
  sample: Sample | null
  tocando: boolean
  favorito: boolean
  volume: number
  /** Tom da pré-escuta em semitons. */
  tom: number
  repetir: boolean
  /** Pré-escuta de trás para frente. */
  reverso: boolean
  /** Tom ("A min") e BPM do projeto, com as chaves liga/desliga de cada um. */
  projeto: AjustesProjeto
  arrastarComAjustes: boolean
  aoReverso: () => void
  aoProjeto: (a: AjustesProjeto) => void
  aoArrastarComAjustes: (v: boolean) => void
  aoTocarParar: () => void
  aoAnterior: () => void
  aoProximo: () => void
  aoVolume: (v: number) => void
  aoTom: (semitons: number) => void
  aoRepetir: () => void
  aoFavoritar: () => void
}

/** Barra de reprodução inferior com linha de progresso, forma de onda, volume e tom. */
export function Player(p: Props): JSX.Element {
  // Posição associada ao sample/estado que a gerou: ao trocar de sample, o valor antigo é
  // descartado já na renderização (sem mostrar por um quadro o progresso do anterior).
  const [medida, setMedida] = useState<{ chave: string; t: number }>({ chave: '', t: 0 })
  const [, forcarDesenho] = useState(0)
  // Redesenha quando o motor avisa (ex.: terminou a detecção de tom), para atualizar o detalhe do projeto
  useEffect(() => motor.observar(() => forcarDesenho((n) => n + 1)), [])
  const ultimoVolume = useRef(VOLUME_PADRAO)

  // Progresso: atualizado ~30x por segundo somente enquanto toca. Usa timer em vez de
  // requestAnimationFrame, que o Chromium quase pausa quando a janela está encoberta.
  const chave = p.tocando && p.sample ? p.sample.id : ''
  useEffect(() => {
    if (!chave) {
      return
    }
    const medir = (): void => setMedida({ chave, t: motor.posicao() })
    medir()
    const t = window.setInterval(medir, 33)
    return () => window.clearInterval(t)
  }, [chave])
  const posicao = chave && medida.chave === chave ? medida.t : 0

  // Forma de onda do sample em foco. Obtida de forma síncrona quando já calculada (ou quando o
  // buffer é o que está tocando), para não piscar barras planas por um quadro ao trocar de sample;
  // senão decodifica e calcula em segundo plano.
  const idFoco = p.sample?.id ?? null
  const picos = idFoco ? picosSincronos(idFoco) : null
  useEffect(() => {
    const s = p.sample
    if (!s || cachePicos.has(s.id)) {
      return
    }
    let ativo = true
    motor
      .carregar(s)
      .then((b) => {
        guardarPicos(s.id, calcularPicos(b.getChannelData(0), BARRAS))
        if (ativo) {
          forcarDesenho((n) => n + 1)
        }
      })
      .catch(() => undefined)
    return () => {
      ativo = false
    }
  }, [idFoco])

  const duracao = p.sample?.duracao ?? motor.bufferAtual()?.duration ?? 0
  const fracao = duracao > 0 ? Math.min(1, posicao / duracao) : 0
  // Alturas das barras em % (0–100). Sem forma de onda ainda, mostra barras baixas e uniformes.
  const alturas = useMemo(() => {
    if (!picos) {
      return new Array<number>(BARRAS).fill(6)
    }
    const max = Math.max(0.0001, ...picos)
    const h = picos.map((v) => Math.min(100, Math.max(6, (v / max) * 100)))
    // No reverso a posição corre na linha do tempo invertida: a onda é desenhada espelhada
    return p.reverso ? h.reverse() : h
  }, [picos, p.reverso])
  const [ancoraProjeto, setAncoraProjeto] = useState<DOMRect | null>(null)
  const fecharProjeto = useCallback(() => setAncoraProjeto(null), [])
  const { tom: tomProjeto, bpm: bpmProjeto } = projetoEfetivo(p.projeto)
  const destino = p.sample ? destinoNoProjeto(p.sample, p.tom, bpmProjeto) : []
  const tonalidadeProjeto = lerTonalidade(tomProjeto)
  const resumoProjeto = [tonalidadeProjeto ? formatarTonalidade(tonalidadeProjeto) : '', bpmProjeto ? String(bpmProjeto) : '']
    .filter(Boolean)
    .join(' · ')

  const buscar = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (!p.sample || duracao <= 0) {
      return
    }
    const r = e.currentTarget.getBoundingClientRect()
    const f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))
    void motor.tocar(p.sample, f * duracao)
  }

  return (
    <footer className="player">
      <div className="player-progresso" onClick={buscar}>
        <div style={{ width: `${fracao * 100}%` }} />
      </div>
      <div className="player-controles">
        <button className="icone-botao" onClick={p.aoAnterior} title="Anterior (↑)">
          <SkipBack size={17} />
        </button>
        <button className="player-principal" onClick={p.aoTocarParar} disabled={!p.sample} title="Tocar/parar (Espaço)">
          {p.tocando ? <Square size={15} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
        </button>
        <button className="icone-botao" onClick={p.aoProximo} title="Próximo (↓)">
          <SkipForward size={17} />
        </button>
      </div>

      <div className="player-centro">
        {p.sample ? (
          <>
            <Arte semente={p.sample.pastaRelativa || p.sample.pastaRaiz} tamanho={38} raio={3} />
            <ListMusic size={17} className="player-fila" />
            <div className="player-info">
              <div className="player-nome" title={p.sample.caminho}>
                {p.sample.nome}
              </div>
              <div className="player-detalhe">
                {formatarBpm(p.sample)} BPM • {p.sample.tom ?? '--'}
                {destino.length > 0 && (
                  <span className="player-destino">
                    {' → '}
                    {destino.map((d, i) => (
                      <span key={i} className={d.aviso ? 'aviso-projeto' : undefined}>
                        {i > 0 && ' · '}
                        {d.texto}
                      </span>
                    ))}
                  </span>
                )}
              </div>
            </div>
            <button className={`acao-coracao${p.favorito ? ' ativo' : ''}`} onClick={p.aoFavoritar} title="Curtir (L)">
              <Heart size={15} fill={p.favorito ? 'currentColor' : 'none'} />
            </button>
            <div className="onda" onClick={buscar} title="Clique para tocar a partir deste ponto">
              {alturas.map((h, i) => (
                <i
                  key={i}
                  className={i / BARRAS < fracao ? 'passada' : ''}
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
            <span className="player-tempo">
              {formatarDuracao(posicao)} / {formatarDuracao(duracao || null)}
            </span>
          </>
        ) : (
          <span className="player-vazio">Clique num sample para ouvir</span>
        )}
      </div>

      <div className="player-direita">
        <button
          className="icone-botao"
          onClick={() => {
            if (p.volume > 0) {
              ultimoVolume.current = p.volume
              p.aoVolume(0)
            } else {
              p.aoVolume(ultimoVolume.current || VOLUME_PADRAO)
            }
          }}
          title="Silenciar"
        >
          {p.volume === 0 ? <VolumeX size={17} /> : <Volume2 size={17} />}
        </button>
        <SliderAjuste
          tipo="volume"
          className="volume"
          min={0}
          max={1}
          step={0.01}
          valor={p.volume}
          padrao={VOLUME_PADRAO}
          formatar={(v) => `${Math.round(v * 100)}%`}
          aoMudar={p.aoVolume}
          style={{ ['--v' as string]: `${p.volume * 100}%` }}
        />
        <KnobTom valor={p.tom} aoMudar={p.aoTom} />
        <button
          className={`botao-repetir botao-projeto${tomProjeto || bpmProjeto ? ' ativo' : ''}`}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            setAncoraProjeto((a) => (a ? null : r))
          }}
          title="Tom e BPM do projeto: transpõe cada sample e ajusta o andamento dos loops"
        >
          <Music2 size={16} />
          <span>{resumoProjeto || 'PROJETO'}</span>
        </button>
        <button className={`botao-repetir botao-reverso${p.reverso ? ' ativo' : ''}`} onClick={p.aoReverso} title="Tocar de trás para frente">
          <Rewind size={16} />
          <span>REV</span>
        </button>
        <button className={`botao-repetir${p.repetir ? ' ativo' : ''}`} onClick={p.aoRepetir} title="Repetir pré-escuta">
          <Repeat size={16} />
          <span>LOOP</span>
        </button>
        {ancoraProjeto && (
          <PainelProjeto
            ancora={ancoraProjeto}
            projeto={p.projeto}
            arrastarComAjustes={p.arrastarComAjustes}
            aoMudar={p.aoProjeto}
            aoArrastarComAjustes={p.aoArrastarComAjustes}
            aoFechar={fecharProjeto}
          />
        )}
      </div>
    </footer>
  )
}

/** Um trecho do detalhe do projeto no player; `aviso` = o projeto não pôde ser aplicado. */
interface TrechoProjeto {
  texto: string
  aviso?: boolean
}

/**
 * Como o sample soa com os ajustes do projeto, para o detalhe do player: "C#m (+3) · 140 BPM",
 * ou avisos quando o tom/BPM do sample é desconhecido e o ajuste não é aplicado.
 */
function destinoNoProjeto(s: Sample, tom: number, bpmProjeto: number | null): TrechoProjeto[] {
  const partes: TrechoProjeto[] = []
  const st = motor.situacaoTom(s)
  if (st.tipo === 'conhecido') {
    const t = lerTonalidade(st.tom)
    if (st.detectado && t) {
      partes.push({ texto: `tom detectado: ${formatarTonalidade(t)}` })
    }
    if (tom !== 0) {
      const nome = t && Number.isInteger(tom) ? `${formatarTonalidade({ ...t, tonica: (((t.tonica + tom) % 12) + 12) % 12 })} ` : ''
      partes.push({ texto: `${nome}(${formatarTom(tom)})` })
    }
  } else if (st.tipo === 'percussao') {
    partes.push({ texto: 'percussão · tom sem ajuste', aviso: true })
  } else if (st.tipo === 'detectando') {
    partes.push({ texto: 'detectando tom…' })
  } else if (st.tipo === 'pendente') {
    partes.push({ texto: 'tom será detectado ao tocar' })
  } else if (st.tipo === 'desconhecido') {
    partes.push({ texto: 'tom desconhecido · sem ajuste', aviso: true })
  }
  const sb = situacaoBpm(s, bpmProjeto)
  if (sb.tipo === 'aplicado' && sb.velocidade !== 1 && s.bpm) {
    const final = Math.round(s.bpm * sb.velocidade * 10) / 10
    const relacao = bpmProjeto && Math.abs(final * 2 - bpmProjeto) < 0.5 ? ' (meio tempo)' : bpmProjeto && Math.abs(final - bpmProjeto * 2) < 0.5 ? ' (tempo dobrado)' : ''
    partes.push({ texto: `${final} BPM${relacao}` })
  } else if (sb.tipo === 'desconhecido') {
    partes.push({ texto: 'BPM desconhecido · velocidade original', aviso: true })
  }
  return partes
}
