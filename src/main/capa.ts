import { promises as fs } from 'fs'
import { createHash } from 'crypto'
import { basename, join } from 'path'
import { ehPastaDeCapa, escolherCapa, type ResultadoCopiaCapa } from '@shared/capa'

/** Capa encontrada numa pasta: caminho absoluto e data de modificação (para atualizar o cache). */
export interface CapaEncontrada {
  caminho: string
  modificadoEm: number
}

async function lerPasta(dir: string): Promise<{ arquivos: string[]; pastas: string[] } | null> {
  try {
    const entradas = await fs.readdir(dir, { withFileTypes: true })
    return {
      arquivos: entradas.filter((e) => e.isFile()).map((e) => e.name),
      pastas: entradas.filter((e) => e.isDirectory()).map((e) => e.name)
    }
  } catch {
    return null
  }
}

/**
 * Procura a imagem de capa de uma pasta de kit: primeiro na própria pasta,
 * depois em subpastas como "Artwork" ou "Images". Não altera nada no disco.
 */
export async function buscarCapa(pasta: string): Promise<CapaEncontrada | null> {
  const conteudo = await lerPasta(pasta)
  if (!conteudo) {
    return null
  }
  let escolhida: string | null = null
  const direta = escolherCapa(conteudo.arquivos, basename(pasta))
  if (direta) {
    escolhida = join(pasta, direta)
  } else {
    for (const sub of conteudo.pastas.filter(ehPastaDeCapa).sort()) {
      const interno = await lerPasta(join(pasta, sub))
      const achada = interno && escolherCapa(interno.arquivos, basename(pasta))
      if (achada) {
        escolhida = join(pasta, sub, achada)
        break
      }
    }
  }
  if (!escolhida) {
    return null
  }
  try {
    const st = await fs.stat(escolhida)
    return { caminho: escolhida, modificadoEm: st.mtimeMs }
  } catch {
    return null
  }
}

// ---------- capas escolhidas pelo usuário ----------
// Ficam na pasta de dados do app (não na pasta do kit), para nada ser alterado no disco dos samples.

const EXTENSOES_SALVAS = ['jpg', 'png', 'webp', 'gif']

/** Nome-base do arquivo da capa de uma pasta: hash do caminho, sem diferenciar maiúsculas e barras. */
export function nomeDaCapaSalva(pasta: string): string {
  const normal = pasta.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
  return createHash('sha1').update(normal).digest('hex').slice(0, 20)
}

/** Capa escolhida pelo usuário para a pasta, se existir. */
async function capaSalva(dirCapas: string, pasta: string): Promise<CapaEncontrada | null> {
  const base = nomeDaCapaSalva(pasta)
  for (const ext of EXTENSOES_SALVAS) {
    const caminho = join(dirCapas, `${base}.${ext}`)
    try {
      const st = await fs.stat(caminho)
      return { caminho, modificadoEm: st.mtimeMs }
    } catch {
      // tenta a próxima extensão
    }
  }
  return null
}

/** Apaga a capa escolhida para a pasta (todas as extensões). */
export async function removerCapaSalva(dirCapas: string, pasta: string): Promise<void> {
  const base = nomeDaCapaSalva(pasta)
  await Promise.all(EXTENSOES_SALVAS.map((ext) => fs.rm(join(dirCapas, `${base}.${ext}`), { force: true })))
}

/** Grava a capa da pasta, substituindo a anterior; devolve o caminho gravado. */
export async function gravarCapa(dirCapas: string, pasta: string, dados: Uint8Array, ext: string): Promise<string> {
  if (!EXTENSOES_SALVAS.includes(ext)) {
    throw new Error(`Formato de imagem não suportado: ${ext}`)
  }
  await fs.mkdir(dirCapas, { recursive: true })
  await removerCapaSalva(dirCapas, pasta)
  const caminho = join(dirCapas, `${nomeDaCapaSalva(pasta)}.${ext}`)
  await fs.writeFile(caminho, dados)
  return caminho
}

/** Capa a mostrar: a escolhida pelo usuário tem prioridade sobre a imagem dentro da pasta. */
export async function capaDaPasta(dirCapas: string, pasta: string): Promise<(CapaEncontrada & { escolhida: boolean }) | null> {
  const salva = await capaSalva(dirCapas, pasta)
  if (salva) {
    return { ...salva, escolhida: true }
  }
  const naPasta = await buscarCapa(pasta)
  return naPasta && { ...naPasta, escolhida: false }
}

/** Espaço livre mínimo que precisa sobrar no disco do kit depois de gravar a cópia da capa. */
export const FOLGA_DISCO = 50 * 1024 * 1024

export type { ResultadoCopiaCapa }

/** Bytes livres no disco onde fica a pasta (null se não der para saber). */
async function espacoLivre(pasta: string): Promise<number | null> {
  try {
    const s = await fs.statfs(pasta)
    return s.bavail * s.bsize
  } catch {
    return null
  }
}

/**
 * Grava também uma cópia da capa dentro da pasta do kit (cover.jpg), para outros programas e o
 * Explorer verem. Nunca sobrescreve: se já existir um arquivo com esse nome, não faz nada.
 * Só grava se sobrar pelo menos FOLGA_DISCO livre no disco.
 * @param livre espaço livre conhecido (para testes); por padrão consulta o disco
 */
export async function copiarCapaParaPasta(
  pasta: string,
  dados: Uint8Array,
  ext: string,
  livre?: number | null
): Promise<ResultadoCopiaCapa> {
  if (!/^(jpg|png|webp|gif)$/.test(ext)) {
    return 'erro'
  }
  const destino = join(pasta, `cover.${ext}`)
  try {
    await fs.access(destino)
    return 'ja-existe'
  } catch {
    // não existe: segue
  }
  const disponivel = livre === undefined ? await espacoLivre(pasta) : livre
  if (disponivel === null || disponivel < dados.byteLength + FOLGA_DISCO) {
    return 'sem-espaco'
  }
  try {
    // 'wx' falha se o arquivo surgir entre a checagem e a gravação: nunca sobrescreve
    await fs.writeFile(destino, dados, { flag: 'wx' })
    return 'gravada'
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EEXIST' ? 'ja-existe' : 'erro'
  }
}
