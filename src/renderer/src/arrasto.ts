import { codificarWav } from '@shared/audio'
import { alteraAudio, renderizarPad, type ConfigPad } from '@shared/pads'
import { alteraAudioAjustes, renderizarComAjustes, sufixoAjustes } from '@shared/projeto'
import type { Sample } from '@shared/tipos'
import { iniciarArrastoAnimado } from './arrastoAnimado'
import { gerarCartaoArrasto, semExtensao } from './cartaoArrasto'
import { motor } from './motorAudio'
import { lerAjuste } from './preferencias'

/** O que está sendo arrastado agora (o arrasto nativo não carrega dados do app). */
let atual: { sample: Sample; origemPad?: number } | null = null

/** Limpa o estado quando o mouse volta a agir fora de um arrasto. */
window.addEventListener('mousedown', () => (atual = null), true)
window.addEventListener('dragend', () => (atual = null), true)

export function arrastoAtual(): { sample: Sample; origemPad?: number } | null {
  return atual
}

/**
 * Inicia o arrasto nativo de arquivo (para DAWs e Explorer). Como o sistema operacional
 * assume o arrasto, os pads recebem o "drop" normalmente e consultam arrastoAtual().
 * Use no onDragStart de um elemento draggable.
 */
export function iniciarArrastoSample(e: React.DragEvent, sample: Sample, caminhos: string[], origemPad?: number): void {
  e.preventDefault()
  atual = { sample, origemPad }
  iniciarArrastoAnimado(
    sample,
    e.clientX,
    e.clientY,
    () => {
      if (origemPad === undefined && caminhos.length === 1 && caminhos[0] === sample.caminho && arrastarComAjustes(sample)) {
        return
      }
      window.api.iniciarArrasto(caminhos, gerarCartaoArrasto(sample))
    },
    () => (atual = null)
  )
}

/** Chave em preferencias.json: arrastar samples da lista com tom, BPM do projeto e reverso aplicados. */
export const AJUSTE_ARRASTAR_COM_AJUSTES = 'arrastarComAjustes'

/** Samples mais longos que isso são arrastados como o arquivo original (gerar o WAV travaria a janela). */
const DURACAO_MAX_PROCESSADA = 60

/**
 * Se a opção estiver ligada e a pré-escuta mudar o som do sample (tom, BPM do projeto ou
 * reverso), arrasta um WAV gerado na hora com esses ajustes. Retorna false quando o arquivo
 * original deve ser arrastado (opção desligada, sem ajustes, áudio ainda não carregado ou longo).
 */
function arrastarComAjustes(sample: Sample): boolean {
  if (lerAjuste(AJUSTE_ARRASTAR_COM_AJUSTES) !== true) {
    return false
  }
  const ajustes = motor.ajustesPara(sample)
  const buffer = motor.bufferPronto(sample)
  if (!alteraAudioAjustes(ajustes) || !buffer || buffer.duration > DURACAO_MAX_PROCESSADA) {
    return false
  }
  const canais = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c))
  const wav = codificarWav(renderizarComAjustes(canais, ajustes), buffer.sampleRate)
  const bpmFinal = sample.bpm && ajustes.velocidade !== 1 ? sample.bpm * ajustes.velocidade : null
  window.api.iniciarArrastoAudio(wav, `${sample.nome}${sufixoAjustes(ajustes, bpmFinal)}.wav`, gerarCartaoArrasto(sample))
  return true
}

/**
 * Arrasta um pad para fora do app (DAW, Explorer) já com o trecho, tom, volume e pan
 * do pad aplicados, num WAV gerado na hora. Sem ajustes (ou com o áudio ainda não
 * carregado), arrasta o arquivo original.
 */
export function iniciarArrastoPad(e: React.DragEvent, sample: Sample, indice: number, cfg: ConfigPad): void {
  const buffer = motor.bufferPad(indice)
  if (!buffer || !alteraAudio(cfg)) {
    iniciarArrastoSample(e, sample, [sample.caminho], indice)
    return
  }
  e.preventDefault()
  atual = { sample, origemPad: indice }
  iniciarArrastoAnimado(
    sample,
    e.clientX,
    e.clientY,
    () => {
      const canais = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c))
      const wav = codificarWav(renderizarPad(canais, buffer.sampleRate, cfg), buffer.sampleRate)
      window.api.iniciarArrastoAudio(wav, `${semExtensao(sample.nome)} (pad ${indice + 1}).wav`, gerarCartaoArrasto(sample))
    },
    () => (atual = null)
  )
}

/** Consome o arrasto em andamento (ao soltar num pad). */
export function consumirArrasto(): { sample: Sample; origemPad?: number } | null {
  const a = atual
  atual = null
  return a
}
