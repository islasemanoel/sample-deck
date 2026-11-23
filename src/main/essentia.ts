/**
 * Carregamento único do Essentia (essentia.js, WASM), compartilhado pelos detectores.
 * Licença do essentia.js: AGPL-3.0 (ok para uso pessoal/local).
 */

/** Vetor alocado na memória do WASM; precisa ser liberado com delete(). */
export interface VetorWasm {
  delete?: () => void
}

/** Parte da API do Essentia usada pelo app. */
export interface Essentia {
  arrayToVector(x: Float32Array): VetorWasm
  LoopBpmEstimator(sinal: VetorWasm, limiarConfianca?: number): { bpm: number }
  LoopBpmConfidence(sinal: VetorWasm, bpm: number, taxa?: number): { confidence: number }
  RhythmExtractor2013(
    sinal: VetorWasm,
    maxTempo?: number,
    metodo?: 'multifeature' | 'degara',
    minTempo?: number
  ): { bpm: number; confidence: number }
  PitchYin(
    quadro: VetorWasm,
    tamanho?: number,
    interpolar?: boolean,
    freqMax?: number,
    freqMin?: number,
    taxa?: number,
    tolerancia?: number
  ): { pitch: number; pitchConfidence: number }
  KeyExtractor(
    sinal: VetorWasm,
    usarPerfilMedio?: boolean,
    tamanhoQuadro?: number,
    salto?: number,
    tamanhoHpcp?: number,
    freqMax?: number,
    picosMax?: number,
    freqMin?: number,
    limiarPicos?: number,
    perfil?: string,
    taxa?: number
  ): { key: string; scale: string; strength: number }
}

let instancia: Essentia | null = null

/** Devolve a instância do Essentia, criando-a na primeira chamada. */
export async function obterEssentia(): Promise<Essentia> {
  if (!instancia) {
    const pacote = (await import('essentia.js')) as unknown as {
      Essentia: new (wasm: unknown) => Essentia
      EssentiaWASM: unknown
      default?: { Essentia: new (wasm: unknown) => Essentia; EssentiaWASM: unknown }
    }
    const p = pacote.Essentia ? pacote : (pacote.default as typeof pacote)
    const wasm = (p.EssentiaWASM as { EssentiaWASM?: unknown }).EssentiaWASM ?? p.EssentiaWASM
    instancia = new p.Essentia(wasm)
  }
  return instancia
}

/** Executa `fn` com um vetor WASM e o libera em seguida. */
export function comVetor<T>(e: Essentia, x: Float32Array, fn: (v: VetorWasm) => T): T {
  const v = e.arrayToVector(x)
  try {
    return fn(v)
  } finally {
    v.delete?.()
  }
}
