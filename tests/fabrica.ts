import { VERSAO_ANALISE, type Sample } from '@shared/tipos'

let contador = 0

/** Cria um Sample de teste com valores padrão sobrescrevíveis. */
export function umSample(parcial: Partial<Sample> = {}): Sample {
  contador++
  return {
    id: `s${contador}`,
    caminho: `C:/samples/s${contador}.wav`,
    nome: `s${contador}`,
    extensao: 'wav',
    pastaRaiz: 'C:/samples',
    pastaRelativa: '',
    kit: 'samples',
    duracao: 2,
    bpm: null,
    bpmEstimado: false,
    versaoAnalise: VERSAO_ANALISE,
    tom: null,
    tipo: 'one-shot',
    tags: [],
    categoria: 'outros',
    modificadoEm: 1000,
    tamanho: 100,
    ...parcial
  }
}
