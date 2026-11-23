import { createHash } from 'crypto'
import { promises as fs } from 'fs'
import { basename, dirname, extname, join, relative, sep } from 'path'
import { parseFile } from 'music-metadata'
import { categoriaDe, extrairBpm, extrairTags, extrairTipo, extrairTom } from '@shared/analiseNome'
import { refinarBpmPelaDuracao } from '@shared/analiseBpm'
import { detectarKits } from '@shared/kits'
import { VERSAO_ANALISE, type ProgressoVarredura, type Sample } from '@shared/tipos'
import { estimarBpmArquivo } from './detectorBpm'

/**
 * Varredura de pastas de samples no disco.
 * Não depende do Electron, para poder ser testada em Node.
 */

const EXTENSOES = new Set(['wav', 'mp3', 'aif', 'aiff', 'flac', 'ogg', 'm4a'])

/** Opções da varredura. */
export interface OpcoesVarredura {
  /** Lê a duração de um arquivo (injetável em testes). */
  lerDuracao?: (caminho: string) => Promise<number | null>
  /** Recebe os samples analisados até o momento a cada `tamanhoLote` arquivos. */
  aoLote?: (parciais: Sample[]) => void
  tamanhoLote?: number
  /** Consultada a cada arquivo; true interrompe e devolve o que já foi analisado. */
  deveParar?: () => boolean
  /** Estima o BPM pelo áudio (injetável em testes); padrão: Essentia LoopBpmEstimator. */
  estimarBpm?: (caminho: string) => Promise<number | null>
}

export { VERSAO_ANALISE }

/** Indica se o arquivo tem extensão de áudio suportada. */
export function ehArquivoDeAudio(arquivo: string): boolean {
  const ext = extname(arquivo).slice(1).toLowerCase()
  return EXTENSOES.has(ext)
}

/** Id estável do sample: hash do caminho normalizado (barras e caixa ignoradas). */
export function idDoCaminho(caminho: string): string {
  const normal = caminho.replace(/\\/g, '/').toLowerCase()
  return createHash('sha1').update(normal).digest('hex').slice(0, 16)
}

/** Lista recursivamente os arquivos de áudio sob a raiz, avisando a quantidade encontrada. */
async function listarAudio(
  raiz: string,
  aoEncontrar: (quantidade: number) => void,
  deveParar: () => boolean
): Promise<string[]> {
  const encontrados: string[] = []
  const pendentes = [raiz]
  let ultimoAviso = 0
  while (pendentes.length > 0 && !deveParar()) {
    const dir = pendentes.pop() as string
    let entradas
    try {
      entradas = await fs.readdir(dir, { withFileTypes: true })
    } catch (e) {
      if (dir === raiz) {
        throw e
      }
      continue // subpasta sem permissão: ignora
    }
    for (const e of entradas) {
      const caminho = join(dir, e.name)
      if (e.isDirectory()) {
        pendentes.push(caminho)
      } else if (e.isFile() && ehArquivoDeAudio(e.name)) {
        encontrados.push(caminho)
      }
    }
    if (encontrados.length - ultimoAviso >= 500) {
      ultimoAviso = encontrados.length
      aoEncontrar(encontrados.length)
    }
  }
  // Ordem alfabética do caminho ≈ ordem das pastas: leitura sequencial, menos saltos da cabeça do HD
  return encontrados.sort()
}

/** Pasta relativa (separada por "/") do arquivo em relação à raiz. */
function pastaRelativaDe(raiz: string, caminho: string): string {
  return relative(raiz, caminho).split(sep).slice(0, -1).join('/')
}

/** Nomes das outras subpastas do pai da raiz (vazio se não der para ler). */
async function irmaosDa(raiz: string): Promise<string[]> {
  const pai = dirname(raiz)
  if (pai === raiz) {
    return []
  }
  try {
    const entradas = await fs.readdir(pai, { withFileTypes: true })
    return entradas.filter((e) => e.isDirectory() && e.name !== basename(raiz)).map((e) => e.name)
  } catch {
    return []
  }
}

/**
 * Abaixo disso o arquivo não é áudio utilizável. Também evita um vazamento do music-metadata 7.14:
 * em arquivos minúsculos ou vazios, parseFile falha ao ler o rodapé (posição negativa) antes do
 * `try` que fecharia o arquivo, e o handle fica aberto (no Windows, impede apagar a pasta).
 */
const TAMANHO_MIN_AUDIO = 64

/** Lê a duração real do arquivo; null se o arquivo estiver corrompido. */
async function lerDuracao(caminho: string): Promise<number | null> {
  try {
    if ((await fs.stat(caminho)).size < TAMANHO_MIN_AUDIO) {
      return null
    }
    const meta = await parseFile(caminho, { duration: true, skipCovers: true })
    const d = meta.format.duration
    return typeof d === 'number' && Number.isFinite(d) ? d : null
  } catch {
    return null
  }
}

/** Monta o Sample a partir do arquivo, analisando nome, pastas e, se preciso, o áudio. */
async function analisarArquivo(
  caminho: string,
  raiz: string,
  kit: string,
  mtime: number,
  tamanho: number,
  lerDuracaoFn: (caminho: string) => Promise<number | null>,
  estimarBpmFn: (caminho: string) => Promise<number | null>
): Promise<Sample> {
  const ext = extname(caminho)
  const nome = basename(caminho, ext)
  const pastaRelativa = pastaRelativaDe(raiz, caminho)
  const bpmDoNome = extrairBpm(nome)
  const tipo = extrairTipo(nome, pastaRelativa, bpmDoNome)
  const tags = extrairTags(nome, pastaRelativa, tipo)
  const duracao = await lerDuracaoFn(caminho)
  let bpm = bpmDoNome
  let bpmEstimado = false
  // Só loops sem BPM no nome: one-shots não têm andamento
  if (bpm === null && tipo === 'loop') {
    try {
      bpm = await estimarBpmFn(caminho)
      bpmEstimado = bpm !== null
      if (bpm !== null) {
        // O Essentia dá inteiros: a duração em compassos exatos acerta os ".5" (81 → 81.5)
        bpm = refinarBpmPelaDuracao(bpm, duracao).bpm
      }
    } catch {
      bpm = null // arquivo ilegível: segue sem BPM
    }
  }
  return {
    id: idDoCaminho(caminho),
    caminho,
    nome,
    extensao: ext.slice(1).toLowerCase(),
    pastaRaiz: raiz,
    pastaRelativa,
    kit,
    duracao,
    bpm,
    bpmEstimado,
    versaoAnalise: VERSAO_ANALISE,
    tom: extrairTom(nome),
    tipo,
    tags,
    categoria: categoriaDe(tags),
    modificadoEm: mtime,
    tamanho
  }
}

/**
 * Varre a pasta raiz e retorna os samples encontrados, lendo um arquivo por vez
 * (sessão contínua e sequencial, para não fazer o HD alternar entre arquivos).
 * Arquivos já conhecidos com mesma data e tamanho são reaproveitados sem reanálise.
 * @param conhecidos samples da varredura anterior, indexados pelo caminho
 * @param aoProgredir chamado durante a listagem e a cada arquivo analisado
 * @param opcoes lotes parciais, interrupção e leitor de duração
 */
export async function varrerPasta(
  raiz: string,
  conhecidos: Map<string, Sample>,
  aoProgredir: (p: ProgressoVarredura) => void,
  opcoes: OpcoesVarredura = {}
): Promise<Sample[]> {
  const deveParar = opcoes.deveParar ?? (() => false)
  const lerDuracaoFn = opcoes.lerDuracao ?? lerDuracao
  const estimarBpmFn = opcoes.estimarBpm ?? estimarBpmArquivo
  const tamanhoLote = opcoes.tamanhoLote ?? 2000

  aoProgredir({ pasta: raiz, fase: 'listando', processados: 0, total: 0 })
  const arquivos = await listarAudio(
    raiz,
    (n) => aoProgredir({ pasta: raiz, fase: 'listando', processados: n, total: 0 }),
    deveParar
  )
  aoProgredir({ pasta: raiz, fase: 'analisando', processados: 0, total: arquivos.length })
  // O kit depende da estrutura inteira (e das pastas vizinhas da raiz), então é decidido antes da análise
  const kits = detectarKits(raiz, arquivos.map((c) => pastaRelativaDe(raiz, c)), await irmaosDa(raiz))
  const kitDe = (caminho: string): string => kits.get(pastaRelativaDe(raiz, caminho)) ?? ''

  const resultado: Sample[] = []
  for (const caminho of arquivos) {
    if (deveParar()) {
      break
    }
    let st
    try {
      st = await fs.stat(caminho)
    } catch {
      continue // arquivo removido durante a varredura
    }
    const antigo = conhecidos.get(caminho)
    const kit = kitDe(caminho)
    resultado.push(
      antigo &&
        antigo.modificadoEm === st.mtimeMs &&
        antigo.tamanho === st.size &&
        antigo.versaoAnalise === VERSAO_ANALISE
        ? antigo.kit === kit
          ? antigo
          : { ...antigo, kit }
        : await analisarArquivo(caminho, raiz, kit, st.mtimeMs, st.size, lerDuracaoFn, estimarBpmFn)
    )
    aoProgredir({ pasta: raiz, fase: 'analisando', processados: resultado.length, total: arquivos.length })
    if (opcoes.aoLote && resultado.length % tamanhoLote === 0 && resultado.length < arquivos.length) {
      opcoes.aoLote([...resultado])
    }
  }
  return resultado
}
