import { promises as fs } from 'fs'
import { contrasteDeEnergia, decodificarWavMono, reamostrar } from '@shared/bpm'
import { CONFIANCA_LOOP, alternativaBpm, type ResultadoBpm } from '@shared/analiseBpm'
import { obterEssentia, type Essentia, type VetorWasm } from './essentia'

/**
 * Estimativa de BPM de loops com o LoopBpmEstimator do Essentia (UPF), via essentia.js (WASM).
 *
 * Escolhido por comparação em 397 loops reais com BPM conhecido (contra Percival,
 * RhythmExtractor2013, music-tempo e um detector próprio): responde em ~60% dos loops,
 * acerto exato 70%, 98% contando dobro/metade, ~2% de erros reais.
 * Licença do essentia.js: AGPL-3.0 (ok para uso pessoal/local).
 */

const TAXA_ESSENTIA = 44100
/** Trecho analisado: loops raramente passam disso e a leitura fica leve. */
const MAX_SEGUNDOS = 30
const MIN_SEGUNDOS = 1.5
/**
 * Abaixo disso não há ataques (som contínuo ou ruído), e o Essentia chegaria a dar BPM para
 * ruído branco. Calibrado nos 397 loops reais: custa ~1% dos acertos.
 */
const CONTRASTE_MINIMO = 1.4

/**
 * Segunda estimativa, com decimais (RhythmExtractor2013, multifeature, 40–208 BPM), mostrada como
 * alternativa ao LoopBpmEstimator, que só dá inteiros. null se falhar.
 */
function ritmo(e: Essentia, vetor: VetorWasm): { bpm: number; confianca: number } | null {
  try {
    const r = e.RhythmExtractor2013(vetor, 208, 'multifeature', 40)
    return Number.isFinite(r.bpm) && r.bpm > 0 ? { bpm: r.bpm, confianca: r.confidence } : null
  } catch {
    return null
  }
}

/**
 * Estima o BPM de um trecho de áudio mono.
 * @returns BPM (inteiro: o LoopBpmEstimator só dá inteiros), ou null se o trecho for curto demais ou o Essentia não tiver confiança
 */
export async function estimarBpmLoop(amostras: Float32Array, taxa: number): Promise<number | null> {
  if (amostras.length / taxa < MIN_SEGUNDOS || contrasteDeEnergia(amostras, taxa) < CONTRASTE_MINIMO) {
    return null
  }
  const e = await obterEssentia()
  const sinal = reamostrar(amostras.subarray(0, Math.floor(MAX_SEGUNDOS * taxa)), taxa, TAXA_ESSENTIA)
  const vetor = e.arrayToVector(sinal)
  try {
    const { bpm } = e.LoopBpmEstimator(vetor)
    if (!(bpm > 0) || !Number.isFinite(bpm)) {
      return null
    }
    // Só estimativas confiáveis chegam aqui (limiar padrão): nos loops com BPM conhecido, refiná-las
    // com o RhythmExtractor2013 mais atrapalhou que ajudou (76 → 76.5, 120 → 120.3)
    return Math.round(bpm * 10) / 10
  } catch {
    return null // o Essentia lança exceção em sinais sem ataques (ex.: silêncio)
  } finally {
    vetor.delete?.() // libera a memória do WASM
  }
}

/**
 * Estima o BPM de um arquivo WAV (outros formatos ainda não são decodificados aqui).
 * @returns BPM ou null
 */
export async function estimarBpmArquivo(caminho: string): Promise<number | null> {
  if (!/\.wav$/i.test(caminho)) {
    return null
  }
  const audio = decodificarWavMono(await fs.readFile(caminho), MAX_SEGUNDOS)
  return audio ? estimarBpmLoop(audio.amostras, audio.taxa) : null
}

/**
 * Análise sob demanda (menu "Detectar BPM"): o mesmo LoopBpmEstimator, mas devolvendo também a
 * estimativa de baixa confiança e o valor da confiança (LoopBpmConfidence), para exibir.
 */
export async function analisarBpm(amostras: Float32Array, taxa: number): Promise<ResultadoBpm> {
  const segundos = Math.min(amostras.length / taxa, MAX_SEGUNDOS)
  const vazio = (motivo: string): ResultadoBpm => ({ bpm: null, confianca: 0, confiavel: false, motivo, segundos, alternativa: null })
  if (amostras.length / taxa < MIN_SEGUNDOS) {
    return vazio(`Curto demais: são precisos pelo menos ${MIN_SEGUNDOS} s.`)
  }
  if (contrasteDeEnergia(amostras, taxa) < CONTRASTE_MINIMO) {
    return vazio('Sem pulsação: o som não tem ataques marcados (som contínuo, ruído ou nota única).')
  }
  const e = await obterEssentia()
  const sinal = reamostrar(amostras.subarray(0, Math.floor(MAX_SEGUNDOS * taxa)), taxa, TAXA_ESSENTIA)
  const vetor = e.arrayToVector(sinal)
  try {
    const { bpm } = e.LoopBpmEstimator(vetor, 0)
    if (!(bpm > 0) || !Number.isFinite(bpm)) {
      return vazio('O Essentia não encontrou um andamento.')
    }
    const { confidence } = e.LoopBpmConfidence(vetor, bpm, TAXA_ESSENTIA)
    return {
      bpm: Math.round(bpm * 10) / 10,
      alternativa: alternativaBpm(bpm, ritmo(e, vetor)),
      confianca: confidence,
      confiavel: confidence >= CONFIANCA_LOOP,
      motivo: null,
      segundos
    }
  } catch {
    return vazio('O Essentia não encontrou um andamento.')
  } finally {
    vetor.delete?.()
  }
}
