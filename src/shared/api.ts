import type { Biblioteca, ProgressoVarredura, Sample } from './tipos'
import type { CapaOnline, ResultadoCopiaCapa } from './capa'
import type { PecaNota, ResultadoNota, ResultadoTom } from './analiseTom'
import type { ResultadoBpm } from './analiseBpm'

/** Tema de cores da interface. */
export type Tema = 'claro' | 'escuro'

/** Parte da biblioteca devolvida por operações que não alteram a lista de samples. */
export type AlteracaoBiblioteca = Partial<Biblioteca>

/** Samples novos ou alterados de uma varredura em andamento (só a diferença, não a biblioteca inteira). */
export interface LoteVarredura {
  pasta: string
  samples: Sample[]
}

/** Configuração de execução informada pelo processo principal. */
export interface ConfigExecucao {
  /** Modo demonstração: abre com camadas preenchidas (usado em capturas de tela). */
  demo: boolean
}

/**
 * Ponte entre a interface (renderer) e o processo principal, exposta em `window.api`.
 */
export interface ApiSampleDeck {
  config(): Promise<ConfigExecucao>
  /** Ajustes da interface gravados em preferencias.json, lidos ao abrir a janela. */
  preferenciasIniciais: Record<string, unknown>
  /** Grava um ajuste da interface (valor JSON); undefined remove. */
  salvarPreferencia(chave: string, valor: unknown): void
  /** Ajusta as cores nativas da janela (fundo e botões da barra de título) ao tema. */
  definirTema(tema: Tema): void
  /**
   * Liga/desliga o modo compacto: a janela vira uma lista estreita (para ficar ao lado da DAW)
   * ou volta ao tamanho normal. Cada modo lembra seu próprio tamanho e posição. Devolve o modo final.
   */
  definirCompacto(compacto: boolean): Promise<boolean>
  obterBiblioteca(): Promise<Biblioteca>
  /** Abre o seletor de pastas (múltipla seleção) e indexa as escolhidas; null se cancelado. */
  adicionarPasta(): Promise<Biblioteca | null>
  /** Reindexa uma pasta (ou todas, sem argumento). */
  reescanear(pasta?: string): Promise<Biblioteca>
  removerPasta(pasta: string): Promise<Biblioteca>
  /**
   * Capa da pasta: a escolhida pelo usuário (escolhida = true) ou a imagem encontrada
   * dentro dela (Cover.jpg, Artwork/...); null se não houver.
   */
  capaDaPasta(pasta: string): Promise<{ url: string; escolhida: boolean } | null>
  /**
   * Busca capas nas lojas de LOJAS (The Drum Broker, Prime Loops...); sem termo, usa o nome da pasta.
   * `falharam` lista as lojas que não responderam.
   */
  buscarCapasOnline(pasta: string, termo?: string): Promise<{ termo: string; capas: CapaOnline[]; falharam: string[] }>
  /** Baixa a imagem e grava como capa da pasta (na pasta de dados do app). */
  salvarCapaOnline(pasta: string, url: string): Promise<ResultadoCopiaCapa | null>
  /** Abre o seletor de imagem e grava a escolhida como capa; false se cancelado. */
  escolherCapaArquivo(pasta: string): Promise<boolean>
  /** Apaga a capa escolhida, voltando à imagem da pasta (ou à arte gerada). */
  removerCapa(pasta: string): Promise<void>
  /** Abre a página do produto no navegador. */
  abrirPaginaLoja(url: string): void
  favoritar(ids: string[], valor: boolean): Promise<AlteracaoBiblioteca>
  criarColecao(nome: string, sampleIds: string[]): Promise<{ alteracao: AlteracaoBiblioteca; id: string }>
  renomearColecao(id: string, nome: string, descricao: string): Promise<AlteracaoBiblioteca>
  excluirColecao(id: string): Promise<AlteracaoBiblioteca>
  adicionarAColecao(id: string, sampleIds: string[]): Promise<AlteracaoBiblioteca>
  removerDaColecao(id: string, sampleIds: string[]): Promise<AlteracaoBiblioteca>
  mostrarNaPasta(caminho: string): void
  /** Abre uma pasta da biblioteca no Explorer. */
  abrirPastaNoExplorer(pasta: string): void
  /** Inicia arrasto nativo dos arquivos (para soltar na DAW ou no Explorer). */
  iniciarArrasto(caminhos: string[]): void
  /** Inicia arrasto nativo de um WAV gerado na interface (gravado numa pasta do app). */
  iniciarArrastoAudio(dados: Uint8Array, nome: string): void
  /** Copia os arquivos para uma pasta escolhida; retorna a pasta ou null se cancelado. */
  exportarArquivos(caminhos: string[], titulo: string): Promise<string | null>
  /** Salva um WAV gerado na interface; retorna o caminho ou null se cancelado. */
  salvarMixdown(dados: Uint8Array, nomeSugerido: string): Promise<string | null>
  /** Registra ouvinte do progresso de varredura; retorna função para cancelar. */
  aoProgredir(fn: (p: ProgressoVarredura) => void): () => void
  /** Recebe os samples novos analisados durante uma indexação longa (aplique com `aplicarLote`). */
  aoLoteVarredura(fn: (lote: LoteVarredura) => void): () => void
  /** Uma capa foi encontrada e gravada sozinha para uma pasta recém-adicionada. */
  aoCapaAutomatica(fn: (c: { pasta: string; titulo: string; loja: string; copia: ResultadoCopiaCapa | null }) => void): () => void
  /** Interrompe a indexação em andamento, mantendo o que já foi analisado. */
  pararVarredura(): void
  /** Estima o tom (Essentia bgate/braw/edma e libKeyFinder) de um áudio mono já decodificado. Não grava nada. */
  analisarTom(amostras: Float32Array, taxa: number): Promise<ResultadoTom>
  /** Mede a nota (PitchYin) de um one-shot mono já decodificado. Não grava nada. */
  analisarNota(amostras: Float32Array, taxa: number, peca: PecaNota): Promise<ResultadoNota>
  /** Estima o BPM (Essentia LoopBpmEstimator) de um áudio mono já decodificado. Não grava nada. */
  analisarBpm(amostras: Float32Array, taxa: number): Promise<ResultadoBpm>
}
