import { mkdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { createHash } from 'crypto'
import { basename, dirname, extname, join } from 'path'
import type { LocalAudioEditado } from '@shared/audioEditado'

/** Se o arquivo existe e tem exatamente estes bytes. */
function mesmoConteudo(caminho: string, dados: Uint8Array): boolean {
  try {
    if (statSync(caminho).size !== dados.length) {
      return false
    }
    return Buffer.from(readFileSync(caminho)).equals(Buffer.from(dados.buffer, dados.byteOffset, dados.byteLength))
  } catch {
    return false
  }
}

/**
 * Grava o áudio em `dir` com o nome pedido. Se já houver um arquivo com esse nome e o mesmo
 * conteúdo, reaproveita; se o conteúdo for outro, numera ("nome (2).wav") em vez de
 * sobrescrever — a DAW pode estar usando o arquivo de um arrasto anterior.
 */
export function gravarNaPasta(dir: string, arquivo: string, dados: Uint8Array): string {
  const ext = extname(arquivo)
  const base = basename(arquivo, ext)
  for (let n = 1; n < 1000; n++) {
    const caminho = join(dir, n === 1 ? arquivo : `${base} (${n})${ext}`)
    if (mesmoConteudo(caminho, dados)) {
      return caminho
    }
    try {
      writeFileSync(caminho, dados, { flag: 'wx' })
      return caminho
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw e
      }
    }
  }
  throw new Error('Nomes livres esgotados na pasta de destino')
}

/** Grava na pasta do app: uma subpasta por conteúdo, para nunca sobrescrever um arrasto anterior. */
export function gravarNaPastaDoApp(dirApp: string, arquivo: string, dados: Uint8Array): string {
  const hash = createHash('sha1').update(dados).digest('hex').slice(0, 12)
  const pasta = join(dirApp, hash)
  mkdirSync(pasta, { recursive: true })
  return gravarNaPasta(pasta, arquivo, dados)
}

/**
 * Grava o áudio editado conforme a opção escolhida. Se o destino escolhido falhar (drive
 * desconectado, pasta sem permissão de escrita), grava na pasta do app para o arrasto
 * continuar funcionando.
 */
export function gravarAudioEditado(
  opcao: { local: LocalAudioEditado; pasta: string | null },
  dirApp: string,
  arquivo: string,
  dados: Uint8Array,
  original: string | null
): string {
  const destino = opcao.local === 'original' ? (original ? dirname(original) : null) : opcao.local === 'pasta' ? opcao.pasta : null
  if (destino) {
    try {
      return gravarNaPasta(destino, arquivo, dados)
    } catch (erro) {
      console.error(`Não foi possível gravar o áudio editado em ${destino}; usando a pasta do app:`, erro)
    }
  }
  return gravarNaPastaDoApp(dirApp, arquivo, dados)
}
