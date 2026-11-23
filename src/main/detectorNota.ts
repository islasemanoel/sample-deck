import { reamostrar } from '@shared/bpm'
import { classeDeFrequencia, nomeDaClasse, regiaoDoCorpo, votarNota } from '@shared/nota'
import { comVetor, obterEssentia } from './essentia'

/**
 * Nota fundamental de one-shots, medida quadro a quadro com o YIN do Essentia (PitchYin).
 *
 * Parâmetros escolhidos por comparação com 415 one-shots melódicos reais com a nota no nome:
 * janela de 2048 amostras a 22,05 kHz (~93 ms, cobre 2 períodos de ~22 Hz), salto de 1024,
 * quadros com confiança do YIN ≥ 0,8 e consenso de votos ≥ 0,7 → responde em ~60% e acerta
 * ~73% (808 82%, baixo 78%, synth 83%, guitarra 70%, cordas 75%).
 */

const TAXA_ANALISE = 22050
const JANELA = 2048
const SALTO = 1024
const CONFIANCA_MINIMA = 0.8
export const CONSENSO_MINIMO = 0.7
const FREQ_MIN = 25
const FREQ_MAX = 2000
/** One-shots longos não precisam ser lidos inteiros. */
const MAX_SEGUNDOS = 4

/**
 * Mede a nota de um one-shot quadro a quadro e vota.
 * @param pularMs ignora mais este tempo após o pico, além dos 20 ms padrão (kicks: queda de altura)
 * @returns classe vencedora, consenso, quadros válidos e mediana (Hz) dos quadros da classe; null sem altura
 */
export async function medirNotaOneShot(
  amostras: Float32Array,
  taxa: number,
  pularMs = 0
): Promise<{ classe: number; consenso: number; total: number; hz: number } | null> {
  const x = reamostrar(amostras.subarray(0, Math.floor(MAX_SEGUNDOS * taxa)), taxa, TAXA_ANALISE)
  const corpo = regiaoDoCorpo(x, TAXA_ANALISE)
  if (!corpo) {
    return null
  }
  const inicio = corpo.inicio + Math.round((pularMs / 1000) * TAXA_ANALISE)
  const e = await obterEssentia()
  const alturas: number[] = []
  for (let i = inicio; i + JANELA <= Math.min(corpo.fim, x.length); i += SALTO) {
    const r = comVetor(e, x.subarray(i, i + JANELA), (v) =>
      e.PitchYin(v, JANELA, true, FREQ_MAX, FREQ_MIN, TAXA_ANALISE, 0.15)
    )
    if (r.pitch > 0 && r.pitchConfidence >= CONFIANCA_MINIMA) {
      alturas.push(r.pitch)
    }
  }
  const voto = votarNota(alturas)
  if (!voto) {
    return null
  }
  const daClasse = alturas.filter((hz) => classeDeFrequencia(hz) === voto.classe).sort((a, b) => a - b)
  return { ...voto, hz: daClasse[Math.floor(daClasse.length / 2)] }
}

/**
 * Estima a nota (sem oitava, ex.: "F#") de um one-shot.
 * @returns nota, ou null se não houver altura estável e consensual
 */
export async function estimarNotaOneShot(amostras: Float32Array, taxa: number): Promise<string | null> {
  const voto = await medirNotaOneShot(amostras, taxa)
  return voto && voto.consenso >= CONSENSO_MINIMO ? nomeDaClasse(voto.classe) : null
}
