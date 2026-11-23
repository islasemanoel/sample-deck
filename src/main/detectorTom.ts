import { reamostrar } from '@shared/bpm'
import {
  lerTom,
  METODOS_TOM,
  type PecaNota,
  type ResultadoNota,
  type ResultadoTom
} from '@shared/analiseTom'
import { CONSENSO_MINIMO, medirNotaOneShot } from './detectorNota'
import { comVetor, obterEssentia } from './essentia'
import { detectarTomKeyFinder } from './keyfinder'

/**
 * Análise de tom sob demanda (menu "Detectar tom"), com os métodos e parâmetros da avaliação
 * em 396 samples com o tom no nome: Essentia KeyExtractor (perfis bgate, braw, edma) e libKeyFinder.
 * Nenhum acerta o tom exato em mais de ~40% desses samples; por isso o resultado só é exibido.
 */

const TAXA_ANALISE = 22050
/**
 * Limite de áudio analisado. No gabarito, o acerto sobe até ~8 s e depois estabiliza
 * (2 s: 34%, 8 s: 38%, 16 s: 39%, 30 s: 36%); 30 s é o limite usado na avaliação.
 */
export const MAX_SEGUNDOS_TOM = 30

/** Kicks: a altura cai nos primeiros ~60 ms; a nota é medida depois disso. */
const PULAR_KICK_MS = 60

/**
 * Estima o tom com os quatro métodos.
 * @param arquivoKeyFinder caminho do keyFinderProgressiveWorker.js
 */
export async function analisarTom(amostras: Float32Array, taxa: number, arquivoKeyFinder: string): Promise<ResultadoTom> {
  const x = reamostrar(amostras.subarray(0, Math.floor(MAX_SEGUNDOS_TOM * taxa)), taxa, TAXA_ANALISE)
  const e = await obterEssentia()
  const estimativas: ResultadoTom['estimativas'] = []
  for (const { id } of METODOS_TOM) {
    try {
      if (id === 'keyfinder') {
        const texto = await detectarTomKeyFinder(arquivoKeyFinder, x, TAXA_ANALISE)
        const [tonica = '', escala = ''] = (texto ?? '').split(' ')
        const t = lerTom(tonica, escala)
        estimativas.push(t ? { metodo: id, ...t, forca: null } : { metodo: id, erro: 'sem resposta (silêncio?)' })
      } else {
        const r = comVetor(e, x, (v) => e.KeyExtractor(v, true, 4096, 4096, 12, 3500, 60, 25, 0.2, id, TAXA_ANALISE))
        const t = lerTom(r.key, r.scale)
        estimativas.push(t ? { metodo: id, ...t, forca: r.strength } : { metodo: id, erro: 'sem resposta' })
      }
    } catch (err) {
      estimativas.push({ metodo: id, erro: err instanceof Error ? err.message : String(err) })
    }
  }
  return { estimativas, segundos: x.length / TAXA_ANALISE }
}

/** Mede a nota de um one-shot (PitchYin), mostrando também resultados abaixo do consenso calibrado. */
export async function analisarNota(amostras: Float32Array, taxa: number, peca: PecaNota): Promise<ResultadoNota> {
  const voto = await medirNotaOneShot(amostras, taxa, peca === 'kick' ? PULAR_KICK_MS : 0)
  if (!voto) {
    return { classe: null, consenso: 0, quadros: 0, hz: null, confiavel: false, peca }
  }
  return {
    classe: voto.classe,
    consenso: voto.consenso,
    quadros: voto.total,
    hz: voto.hz,
    confiavel: voto.consenso >= CONSENSO_MINIMO && peca !== 'snare',
    peca
  }
}
