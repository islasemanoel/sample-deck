/**
 * Escolha da imagem de capa de um kit/pack entre os arquivos da pasta.
 *
 * Packs costumam trazer a arte como "Cover.jpg", "Artwork.png", "folder.jpg" ou com o
 * próprio nome do pack; às vezes dentro de uma subpasta "Artwork".
 */

const EXTENSOES_IMAGEM = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'])

/** Palavras que indicam a capa, da mais forte para a mais fraca. */
const PALAVRAS_CAPA = ['cover', 'capa', 'artwork', 'folder', 'front', 'art', 'thumbnail', 'thumb', 'logo', 'image', 'img']

/** Subpastas onde a capa costuma ficar. */
const PASTAS_CAPA = ['artwork', 'art', 'cover', 'covers', 'capa', 'images', 'image', 'imagens', 'img']

export function ehImagem(nome: string): boolean {
  const ext = nome.split('.').pop()?.toLowerCase() ?? ''
  return nome.includes('.') && EXTENSOES_IMAGEM.has(ext)
}

/** Indica se a subpasta costuma guardar a capa ("Artwork", "Images"). */
export function ehPastaDeCapa(nome: string): boolean {
  return PASTAS_CAPA.includes(nome.trim().toLowerCase())
}

function semExtensao(nome: string): string {
  return nome.replace(/\.[^.]+$/, '')
}

function palavrasDe(t: string): string[] {
  return t
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((p) => p.length > 0)
}

/**
 * Escolhe a capa entre os arquivos de uma pasta.
 * @param arquivos nomes dos arquivos (não pastas)
 * @param nomePasta nome da pasta do kit, para reconhecer "Metro Kit.jpg"
 * @returns nome do arquivo escolhido, ou null se não houver imagem
 */
export function escolherCapa(arquivos: string[], nomePasta = ''): string | null {
  const imagens = arquivos.filter(ehImagem)
  if (imagens.length === 0) {
    return null
  }
  const pasta = palavrasDe(nomePasta).join(' ')
  const pontuar = (nome: string): number => {
    const base = semExtensao(nome)
    const ps = palavrasDe(base)
    const i = PALAVRAS_CAPA.findIndex((p) => ps.includes(p))
    if (i >= 0) {
      return 100 - i
    }
    if (pasta && ps.join(' ') === pasta) {
      return 80
    }
    return 0
  }
  // Maior pontuação; empate fica com a ordem alfabética, para a escolha ser estável
  return [...imagens].sort((a, b) => pontuar(b) - pontuar(a) || a.localeCompare(b))[0]
}

// ---------- busca online (lojas Shopify) ----------

/**
 * Lojas onde a capa é procurada. Todas são lojas Shopify, que oferecem a busca pública
 * /search/suggest.json. A ordem é a de prioridade nos empates.
 */
export const LOJAS = [
  // thedrumbroker.com redireciona para hiphopdrumsamples.com
  { id: 'drumbroker', nome: 'The Drum Broker', url: 'https://hiphopdrumsamples.com' },
  { id: 'primeloops', nome: 'Prime Loops', url: 'https://primeloops.com' },
  { id: 'kingsway', nome: 'Kingsway Music Library', url: 'https://kingswaymusiclibrary.com' },
  { id: 'boombaplabs', nome: 'Boom Bap Labs', url: 'https://boombaplabs.com' },
  { id: 'touchloops', nome: 'Touch Loops', url: 'https://www.touchloops.com' },
  { id: 'cymatics', nome: 'Cymatics', url: 'https://cymatics.fm' }
] as const

export type Loja = (typeof LOJAS)[number]

/** Únicos hosts de onde o app aceita baixar capas: o CDN da Shopify e as próprias lojas. */
export const HOSTS_CAPA = ['cdn.shopify.com', 'thedrumbroker.com', ...LOJAS.map((l) => new URL(l.url).hostname)]

/** Capa candidata encontrada numa loja. */
export interface CapaOnline {
  titulo: string
  fornecedor: string
  /** Nome da loja onde foi encontrada. */
  loja: string
  /** Imagem em tamanho original (https). */
  imagem: string
  /** Miniatura para a lista de resultados. */
  miniatura: string
  /** Página do produto. */
  pagina: string
}

/** Ruído comum em nomes de pasta de pack que atrapalha a busca na loja. */
const RUIDO_BUSCA = new Set([
  'drum', 'drums', 'kit', 'kits', 'drumkit', 'pack', 'samplepack', 'sample', 'samples', 'wav', 'wavs', 'free',
  'the', 'drumbroker', 'broker', 'tdb', 'by', 'prod', 'official', 'final', 'zip', 'rar', 'sounds', 'sound',
  'midi', 'multiformat', 'selected', 'com', 'loops', 'and', 'presents'
])

/** Nomes de lojas e sites que aparecem no nome das pastas ("... - ProducerLoops.com"). */
const NOMES_DE_LOJA =
  /\b(the drum broker|drum broker|producer ?loops(\.com)?|prime ?loops|splice( sounds?| originals)?|samples (&|and) loops|wav ?supply|loopmasters|loop ?boutique|black octopus( sound)?|modeaudio|maschine masters|producers? cloud|the producers choice|the kit plug|theproducersplug(\.com)?|tru-urban|boom bap labs)\b/gi

/**
 * Transforma o nome da pasta num termo de busca: separa "Metro_Kit_Vol2", tira ruído
 * ("Drum Kit", "[WAV]", "- The Drum Broker", "ProducerLoops.com"), anos e marcadores entre colchetes.
 */
export function termoDeBusca(nomePasta: string): string {
  const limpo = nomePasta
    .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ') // [WAV], (2021)
    .replace(NOMES_DE_LOJA, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2') // MetroBoomin → Metro Boomin
    .replace(/[_\-–]+/g, ' ')
    .replace(/\b(vol|volume)\.?\s*(\d+)/gi, 'vol $2') // Vol2, Vol.2
    .replace(/\./g, ' ')
  const ps = limpo
    .split(/\s+/)
    .filter((p) => p.length > 0 && !/^[&+,~]$/.test(p))
    .filter((p) => !RUIDO_BUSCA.has(p.toLowerCase()))
    .filter((p) => !/^(19|20)\d\d$/.test(p))
  // Se sobrou nada (pasta "Drum Kit"), usa o nome original
  return (ps.length > 0 ? ps.join(' ') : nomePasta.replace(/[_\-]+/g, ' ')).trim()
}

/**
 * Termos mais curtos para tentar quando a busca pelo nome inteiro acha pouco: cada trecho
 * entre " - " do nome da pasta ("2DEEP - Aftermath - ProducerLoops.com" → "Aftermath"),
 * começando pelo nome do kit (depois do produtor).
 */
export function termosAlternativos(nomePasta: string): string[] {
  const principal = termoDeBusca(nomePasta).toLowerCase()
  const trechos = nomePasta
    .split(/\s+[-–]\s+/)
    .map((t) => t.replace(/\[[^\]]*\]|\([^)]*\)/g, ' ').replace(NOMES_DE_LOJA, ' ').trim())
    .filter((t) => t.length > 0)
  const ordem = trechos.length > 1 ? [...trechos.slice(1), trechos[0]] : []
  const vistos = new Set<string>([principal])
  const resultado: string[] = []
  for (const t of ordem) {
    const termo = termoDeBusca(t)
    if (termo.length >= 3 && !vistos.has(termo.toLowerCase()) && !RUIDO_BUSCA.has(termo.toLowerCase())) {
      vistos.add(termo.toLowerCase())
      resultado.push(termo)
    }
  }
  return resultado.slice(0, 2)
}

/** URL da busca de produtos da loja (endpoint JSON público da Shopify). */
export function urlDeBusca(loja: Loja, termo: string, limite = 8): string {
  const q = new URLSearchParams({ q: termo, 'resources[type]': 'product', 'resources[limit]': String(limite) })
  return `${loja.url}/search/suggest.json?${q.toString()}`
}

/** Indica se a URL é a página de uma das lojas (para abrir no navegador). */
export function ehPaginaDeLoja(url: string): boolean {
  return typeof url === 'string' && LOJAS.some((l) => url.startsWith(`${l.url}/`))
}

/** Miniatura de uma imagem do CDN da Shopify (aceita o parâmetro width). */
function miniaturaShopify(url: string, largura: number): string {
  try {
    const u = new URL(url)
    if (u.hostname === 'cdn.shopify.com') {
      u.searchParams.set('width', String(largura))
    }
    return u.toString()
  } catch {
    return url
  }
}

/** Indica se a URL é https num host permitido para baixar capas. */
export function urlDeCapaPermitida(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && HOSTS_CAPA.includes(u.hostname)
  } catch {
    return false
  }
}

/** Extrai as capas da resposta de /search/suggest.json; ignora produtos sem imagem. */
export function lerResultadosLoja(json: unknown, loja: Loja = LOJAS[0]): CapaOnline[] {
  const produtos = (json as { resources?: { results?: { products?: unknown } } })?.resources?.results?.products
  if (!Array.isArray(produtos)) {
    return []
  }
  const resultado: CapaOnline[] = []
  for (const p of produtos as Record<string, unknown>[]) {
    const destaque = p.featured_image as { url?: unknown } | undefined
    const bruta = typeof destaque?.url === 'string' ? destaque.url : typeof p.image === 'string' ? p.image : null
    if (!bruta) {
      continue
    }
    const imagem = bruta.startsWith('//') ? `https:${bruta}` : bruta
    if (!urlDeCapaPermitida(imagem)) {
      continue
    }
    const caminho = typeof p.url === 'string' ? p.url.split('?')[0] : ''
    resultado.push({
      titulo: typeof p.title === 'string' ? p.title : '',
      fornecedor: typeof p.vendor === 'string' ? p.vendor : '',
      loja: loja.nome,
      imagem,
      miniatura: miniaturaShopify(imagem, 240),
      pagina: caminho ? `${loja.url}${caminho}` : loja.url
    })
  }
  return resultado
}

/** Semelhança entre o nome da pasta e o título do produto (0 a 1), por palavras em comum. */
export function semelhanca(nomePasta: string, titulo: string): number {
  const a = new Set(palavrasDe(termoDeBusca(nomePasta)))
  // O título passa pela mesma limpeza ("VOLUME 3" → "vol 3", sem "Drum Kit")
  const b = new Set(palavrasDe(termoDeBusca(titulo)))
  if (a.size === 0 || b.size === 0) {
    return 0
  }
  let comuns = 0
  for (const p of a) {
    if (b.has(p)) {
      comuns++
    }
  }
  const nota = comuns / Math.max(a.size, b.size)
  // Volume diferente ("Vol. 4" para a pasta "Vol. 3") é outro produto: vale metade
  const numeros = (s: Set<string>): string[] => [...s].filter((p) => /^\d+$/.test(p))
  const na = numeros(a)
  const nb = numeros(b)
  const volumeDiferente = na.length > 0 && nb.length > 0 && !na.some((n) => nb.includes(n))
  return volumeDiferente ? nota / 2 : nota
}

/**
 * Junta os resultados de várias lojas, sem imagens repetidas, e ordena pela semelhança
 * com o nome da pasta. Nos empates, alterna as lojas (1º de cada, depois 2º de cada...).
 */
export function juntarResultados(nomePasta: string, porLoja: CapaOnline[][]): CapaOnline[] {
  const intercalados: CapaOnline[] = []
  const vistas = new Set<string>()
  const maior = Math.max(0, ...porLoja.map((l) => l.length))
  for (let i = 0; i < maior; i++) {
    for (const lista of porLoja) {
      const c = lista[i]
      const chave = c?.imagem.split('?')[0]
      if (c && !vistas.has(chave)) {
        vistas.add(chave)
        intercalados.push(c)
      }
    }
  }
  return ordenarCapas(nomePasta, intercalados)
}

/** Ordena as capas pela semelhança com o nome da pasta (mantém a ordem recebida nos empates). */
export function ordenarCapas(nomePasta: string, capas: CapaOnline[]): CapaOnline[] {
  return capas
    .map((c, i) => ({ c, i, s: semelhanca(nomePasta, `${c.fornecedor} ${c.titulo}`) }))
    .sort((x, y) => y.s - x.s || x.i - y.i)
    .map((x) => x.c)
}

/** Palavras que não distinguem um produto de outro na comparação exata ("Part 2" = "Vol. 2"). */
const RUIDO_COMPARACAO = new Set([
  'vol', 'volume', 'part', 'pt', 'edition', 'limited', 'special', 'digital', 'download', 'bundle', 'series',
  'collection', 'compositions', 'stems', 'one', 'shots', 'shot', 'of', 'a', 'in', 'launch'
])

function palavrasComparaveis(t: string): string[] {
  return palavrasDe(termoDeBusca(t)).filter((p) => !RUIDO_COMPARACAO.has(p) && !RUIDO_BUSCA.has(p))
}

/**
 * Escolhe sozinha a capa só quando não há dúvida, para kits recém-adicionados:
 * - o título do produto não traz nenhuma palavra que não esteja no nome da pasta;
 * - o nome do kit (o que vem depois do produtor: "Produtor - Kit - Loja") aparece inteiro no produto;
 * - os números (volume) são os mesmos;
 * - o autor confere (produtor da pasta no produto, ou a marca do produto no nome da pasta);
 * - e sobra pelo menos uma palavra de verdade (não só "Vol. 1").
 * Na dúvida devolve null — o usuário ainda pode escolher em "Capa".
 */
export function capaAutomatica(nomePasta: string, capas: CapaOnline[]): CapaOnline | null {
  const pasta = new Set(palavrasComparaveis(nomePasta))
  const trechos = nomePasta
    .split(/\s+[-–]\s+/)
    .map((t) => palavrasComparaveis(t.replace(/\[[^\]]*\]|\([^)]*\)/g, ' ').replace(NOMES_DE_LOJA, ' ')))
    .filter((ps) => ps.length > 0)
  const produtor = trechos.length > 1 ? trechos[0] : []
  const kit = trechos.length > 1 ? trechos.slice(1).flat() : [...pasta]
  if (!kit.some((p) => !/^\d+$/.test(p))) {
    return null
  }
  const numeros = (ps: Iterable<string>): string => [...new Set([...ps].filter((p) => /^\d+$/.test(p)))].sort().join(',')
  for (const c of ordenarCapas(nomePasta, capas)) {
    const titulo = palavrasComparaveis(c.titulo)
    const fornecedor = palavrasComparaveis(c.fornecedor)
    const produto = new Set([...titulo, ...fornecedor])
    // Mesmo autor: o produtor da pasta aparece no produto, ou a marca da loja aparece na pasta ("Blap Kits")
    const mesmoAutor =
      (produtor.length > 0 && produtor.every((p) => produto.has(p))) ||
      (fornecedor.length > 0 && fornecedor.every((p) => pasta.has(p)))
    if (
      mesmoAutor &&
      titulo.length > 0 &&
      titulo.every((p) => pasta.has(p)) &&
      kit.every((p) => produto.has(p)) &&
      numeros(titulo) === numeros(pasta)
    ) {
      return c
    }
  }
  return null
}

/** Resultado da cópia da capa para dentro da pasta do kit (opção das Configurações). */
export type ResultadoCopiaCapa = 'gravada' | 'ja-existe' | 'sem-espaco' | 'erro'

/** Complemento do aviso de capa salva, conforme o que aconteceu com a cópia na pasta do kit. */
export function avisoCopiaCapa(r: ResultadoCopiaCapa | null): string {
  switch (r) {
    case 'gravada':
      return ' — também gravada como cover.jpg na pasta do kit'
    case 'ja-existe':
      return ' — a pasta do kit já tem um cover; não foi substituído'
    case 'sem-espaco':
      return ' — sem espaço em disco para gravar cover.jpg na pasta do kit'
    case 'erro':
      return ' — não foi possível gravar cover.jpg na pasta do kit'
    default:
      return ''
  }
}

/** Extensão de arquivo para o tipo de imagem baixado; null se não for imagem aceita. */
export function extensaoDaImagem(contentType: string): string | null {
  const t = contentType.split(';')[0].trim().toLowerCase()
  const mapa: Record<string, string> = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }
  return mapa[t] ?? null
}
