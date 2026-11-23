/** Loop (repetível, com andamento) ou one-shot (som único: batida, hit, efeito). */
export type TipoSample = 'loop' | 'one-shot'

/** Um arquivo de áudio indexado na biblioteca. */
export interface Sample {
  /** Identificador estável derivado do caminho. */
  id: string
  /** Caminho absoluto do arquivo. */
  caminho: string
  /** Nome do arquivo sem extensão. */
  nome: string
  /** Extensão em minúsculas, sem ponto (wav, mp3...). */
  extensao: string
  /** Pasta raiz cadastrada que contém o arquivo. */
  pastaRaiz: string
  /** Subpastas entre a raiz e o arquivo, separadas por "/". */
  pastaRelativa: string
  /** Drum kit/pack que contém o arquivo (nome da pasta do kit), ou "" se não identificado. */
  kit: string
  /** Duração em segundos, ou null se não foi possível ler. */
  duracao: number | null
  bpm: number | null
  /** true quando o BPM foi estimado pelo áudio (não veio do nome do arquivo). */
  bpmEstimado: boolean
  /** Versão da análise que gerou os metadados; versões antigas são refeitas ao reescanear. */
  versaoAnalise: number
  /** Tom normalizado, ex.: "A min", "C# maj", "F#". */
  tom: string | null
  tipo: TipoSample
  tags: string[]
  /** Categoria de instrumento (chave de CATEGORIAS). */
  categoria: string
  /** Data de modificação do arquivo (ms). */
  modificadoEm: number
  tamanho: number
}

/** Coleção criada pelo usuário. */
export interface Colecao {
  id: string
  nome: string
  descricao: string
  sampleIds: string[]
  criadaEm: number
}

/** Estado persistido da biblioteca. */
export interface Biblioteca {
  pastas: string[]
  samples: Sample[]
  favoritos: string[]
  colecoes: Colecao[]
  /** Últimos diretórios usados em cada seletor de pasta/arquivo, por contexto. */
  ultimosLocais: Record<string, string>
}

/** Andamento de uma varredura de pasta. */
export interface ProgressoVarredura {
  pasta: string
  /** "listando": procurando arquivos (total ainda desconhecido); "analisando": lendo cada arquivo. */
  fase: 'listando' | 'analisando'
  /** Na listagem, arquivos de áudio encontrados até agora; na análise, arquivos analisados. */
  processados: number
  total: number
  /** Presente quando várias pastas são indexadas em sequência: posição desta pasta (1-based) e total. */
  lote?: { atual: number; total: number }
}

/**
 * Versão da análise de metadados. Samples de versões anteriores são reanalisados
 * ao reescanear. 2 = BPM estimado pelo áudio em loops sem BPM no nome;
 * 3 = breaks/breakbeats/grooves passam a ser loops (e ganham BPM estimado);
 * 4 = dicionário ampliado, categoria "melodic", números colados separados ("Clap21") e
 *     pasta mais funda com prioridade sobre as de cima;
 * 5 = one-shots com uma só tag entre hi-hat, prato, sino e chimes; "ride bell" e "wind chimes".
 * 6 = BPM com decimais (do nome, como "81.5bpm", e do áudio, com uma casa).
 */
export const VERSAO_ANALISE = 6

/** Biblioteca vazia, usada na primeira execução. */
export function bibliotecaVazia(): Biblioteca {
  return { pastas: [], samples: [], favoritos: [], colecoes: [], ultimosLocais: {} }
}
