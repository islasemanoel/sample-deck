import { ehPalavraDeInstrumento, tokenizar } from './analiseNome'

/**
 * Detecção do drum kit/pack de cada arquivo a partir da estrutura de pastas.
 *
 * A pasta cadastrada pode ser:
 * - um kit ("Metro Kit/Kicks/..."): todos os arquivos são desse kit;
 * - uma pasta com vários kits ("Drum Kits/Kit A/...", "Drum Kits/Trap/Kit B/..."): cada
 *   subpasta que se parece com um kit dá nome aos seus arquivos;
 * - uma subpasta de um kit ("Metro Kit/Kicks"): o kit é a pasta de cima.
 *
 * Um kit é reconhecido por conter pastas de categoria (Kicks, Snares, 808s, Loops, One Shots...)
 * ou arquivos soltos; uma pasta cujas subpastas são quase todas nomes próprios é um agrupador de kits.
 * Nomes com "kit", "pack", "vol." indicam kit; "kits", "packs" indicam agrupador.
 */

/** Palavras de organização de um kit que não são instrumentos. */
const PALAVRAS_ESTRUTURA = new Set([
  'shot', 'shots', 'oneshot', 'oneshots', 'loop', 'loops', 'hit', 'hits', 'open', 'closed',
  'midi', 'midis', 'stem', 'stems', 'wav', 'wavs', 'drum', 'drums', 'sfx', 'fx'
])

/** Palavras genéricas que, dentro de um kit, também indicam subpasta de organização. */
const PALAVRAS_GENERICAS = new Set([
  'sample', 'samples', 'sound', 'sounds', 'bonus', 'extra', 'extras', 'misc', 'other', 'others',
  'audio', 'folder', 'stuff', 'presets', 'preset'
])

/** Adjetivos comuns em pastas de categoria ("Hard Kicks", "Dark 808s"), neutros na decisão. */
const MODIFICADORES = new Set([
  'hard', 'soft', 'dark', 'heavy', 'punchy', 'clean', 'dirty', 'acoustic', 'analog', 'vintage', 'processed',
  'short', 'long', 'big', 'small', 'crispy', 'live', 'real', 'main', 'layered', 'dry', 'wet', 'distorted',
  'tuned', 'hitting', 'and', 'the', 'my', 'new', 'old', 'top', 'tops', 'groove', 'grooves', 'fill', 'fills',
  'break', 'breaks', 'ambience', 'misc', 'various', 'all', 'single', 'multi', 'reversed', 'reverse'
])

const PALAVRAS_KIT = new Set([
  'kit', 'drumkit', 'pack', 'samplepack', 'vol', 'volume', 'collection', 'edition', 'expansion'
])

const PALAVRAS_AGRUPADOR = new Set([
  'kits', 'drumkits', 'packs', 'samplepacks', 'collections', 'bundles', 'libraries'
])

/** Palavras do nome sem números, letras soltas e ruído ("808s" → ["808"]). */
function palavras(nome: string): string[] {
  // "One Shots" e "Hi Hats" viram uma palavra só, para "one"/"hi" soltos não contarem ("Loose One")
  const unido = nome.replace(/\b(one|hi)[\s_-]*(shots?|hats?)\b/gi, (_, a: string, b: string) => `${a}${b}`.toLowerCase())
  return tokenizar(unido).filter((t) => (/^\d+$/.test(t) ? t === '808' || t === '909' : t.length > 1))
}

/**
 * Indica se o nome da pasta é uma categoria de organização (Kicks, Hi Hats, Drum Loops, 808s).
 * @param genericas também aceita pastas genéricas como "Samples" e "Bonus"
 */
export function ehPastaDeCategoria(nome: string, genericas = false): boolean {
  const ps = palavras(nome)
  if (ps.length === 0 || ps.some((p) => PALAVRAS_KIT.has(p) || PALAVRAS_AGRUPADOR.has(p))) {
    return false
  }
  // Todas as palavras precisam ser de categoria ou adjetivos ("Hard Kicks", "Dark 808s"); uma palavra
  // própria ou de gênero faz dela um nome de pack ("Cinematic Strings", "808 Mafia")
  let conhecidas = 0
  for (const p of ps) {
    if (ehPalavraDeInstrumento(p) || PALAVRAS_ESTRUTURA.has(p) || (genericas && PALAVRAS_GENERICAS.has(p))) {
      conhecidas++
    } else if (!MODIFICADORES.has(p)) {
      return false
    }
  }
  return conhecidas > 0
}

function temPalavra(nome: string, conjunto: Set<string>): boolean {
  return palavras(nome).some((p) => conjunto.has(p))
}

/** Nó da árvore de pastas que contêm áudio. */
interface No {
  nome: string
  filhos: Map<string, No>
  temArquivos: boolean
}

function novoNo(nome: string): No {
  return { nome, filhos: new Map(), temArquivos: false }
}

/** Decide se as subpastas (nomes) indicam que o pai é um kit: ao menos metade são categorias. */
function subpastasDeKit(nomes: string[]): boolean {
  const categorias = nomes.filter((n) => ehPastaDeCategoria(n, true)).length
  return categorias > 0 && categorias >= nomes.length - categorias
}

/** Subpasta com nome próprio que contém pastas de categoria: é um kit, logo o pai agrupa kits. */
function temSubpastaQueEhKit(no: No): boolean {
  for (const filho of no.filhos.values()) {
    if (!ehPastaDeCategoria(filho.nome, true) && filho.filhos.size > 0 && subpastasDeKit([...filho.filhos.keys()])) {
      return true
    }
  }
  return false
}

/** Classifica a pasta: kit (com seus arquivos) ou agrupador de kits. */
function ehKit(no: No): boolean {
  const filhos = [...no.filhos.keys()]
  if (filhos.length === 0) {
    return true
  }
  if (temPalavra(no.nome, PALAVRAS_AGRUPADOR)) {
    return false
  }
  if (temPalavra(no.nome, PALAVRAS_KIT) || no.temArquivos) {
    return true
  }
  return subpastasDeKit(filhos) && !temSubpastaQueEhKit(no)
}

/** Separa um caminho absoluto em pastas (aceita "\" e "/"). */
function partesDoCaminho(caminho: string): string[] {
  return caminho.split(/[\\/]+/).filter((p) => p.length > 0)
}

/** Primeira pasta acima da raiz que não é categoria (para raízes como "Kit/Drums/Kicks"). */
function kitAcimaDaRaiz(ancestrais: string[]): string | null {
  for (let i = ancestrais.length - 1; i >= 0; i--) {
    const nome = ancestrais[i]
    if (/^[a-z]:$/i.test(nome)) {
      return null // chegou na unidade
    }
    if (!ehPastaDeCategoria(nome, true)) {
      return nome
    }
  }
  return null
}

/**
 * Nome do kit/pack de cada pasta relativa (as pastas que contêm áudio, separadas por "/").
 * @param raiz pasta cadastrada (caminho absoluto)
 * @param pastasRelativas pastas relativas à raiz; "" para arquivos direto na raiz
 * @param irmaosDaRaiz nomes das outras subpastas do pai da raiz (se conhecidos), para
 *   reconhecer que a raiz é uma subpasta de um kit ("Kit/Kicks" com irmãs "Snares", "Hats")
 * @returns mapa pastaRelativa → nome do kit
 */
export function detectarKits(raiz: string, pastasRelativas: Iterable<string>, irmaosDaRaiz: string[] = []): Map<string, string> {
  const partes = partesDoCaminho(raiz)
  const nomeRaiz = partes[partes.length - 1] ?? raiz
  const ancestrais = partes.slice(0, -1)

  const arvore = novoNo(nomeRaiz)
  const unicas = [...new Set(pastasRelativas)]
  for (const rel of unicas) {
    let no = arvore
    for (const seg of rel.split('/').filter((s) => s.length > 0)) {
      let filho = no.filhos.get(seg)
      if (!filho) {
        filho = novoNo(seg)
        no.filhos.set(seg, filho)
      }
      no = filho
    }
    no.temArquivos = true
  }

  const resultado = new Map<string, string>()
  const atribuir = (no: No, prefixo: string, kit: string): void => {
    if (no.temArquivos) {
      resultado.set(prefixo, kit)
    }
    for (const [nome, filho] of no.filhos) {
      atribuir(filho, prefixo ? `${prefixo}/${nome}` : nome, kit)
    }
  }
  // Agrupador: cada subpasta é um kit (ou outro agrupador); arquivos soltos ficam com o nome do agrupador
  const percorrer = (no: No, prefixo: string): void => {
    if (ehKit(no)) {
      atribuir(no, prefixo, no.nome)
      return
    }
    if (no.temArquivos) {
      resultado.set(prefixo, no.nome)
    }
    for (const [nome, filho] of no.filhos) {
      percorrer(filho, prefixo ? `${prefixo}/${nome}` : nome)
    }
  }

  // A raiz é uma subpasta de um kit: pelo nome ("Kicks", "One Shots") ou pelas pastas vizinhas
  const raizEhCategoria = ehPastaDeCategoria(nomeRaiz)
  if (!temPalavra(nomeRaiz, PALAVRAS_KIT)) {
    const vizinhasDeKit = ehKit(arvore) && irmaosDaRaiz.length > 0 && subpastasDeKit([nomeRaiz, ...irmaosDaRaiz])
    if (raizEhCategoria || vizinhasDeKit) {
      const acima = kitAcimaDaRaiz(ancestrais)
      if (acima) {
        atribuir(arvore, '', acima)
        return resultado
      }
    }
  }
  percorrer(arvore, '')
  return resultado
}

/** Atribui o kit aos samples que ainda não o têm, agrupando pela pasta raiz. */
export function preencherKits<T extends { pastaRaiz: string; pastaRelativa: string; kit?: string }>(samples: T[]): T[] {
  const faltando = new Map<string, Set<string>>()
  for (const s of samples) {
    if (typeof s.kit !== 'string') {
      const set = faltando.get(s.pastaRaiz) ?? new Set<string>()
      set.add(s.pastaRelativa)
      faltando.set(s.pastaRaiz, set)
    }
  }
  if (faltando.size === 0) {
    return samples
  }
  // Usa todas as pastas conhecidas da raiz, não só as que faltam, para a estrutura ficar completa
  const kits = new Map<string, Map<string, string>>()
  for (const raiz of faltando.keys()) {
    const pastas = samples.filter((s) => s.pastaRaiz === raiz).map((s) => s.pastaRelativa)
    kits.set(raiz, detectarKits(raiz, pastas))
  }
  return samples.map((s) =>
    typeof s.kit === 'string' ? s : { ...s, kit: kits.get(s.pastaRaiz)?.get(s.pastaRelativa) ?? '' }
  )
}
