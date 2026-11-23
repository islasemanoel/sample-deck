/**
 * Validação dos argumentos que chegam do renderer pelo IPC. Mesmo com o isolamento de contexto
 * ligado, o processo principal não confia no formato do que recebe: cada handler converte os
 * argumentos com estas funções, que lançam um erro claro em vez de quebrar mais adiante.
 */

/** Teto de itens numa lista vinda da interface (ids de samples, caminhos). */
const MAX_ITENS = 200_000
/** Teto do tamanho de um texto (caminho, nome, termo de busca). */
const MAX_TEXTO = 4096
/** Teto de um áudio enviado pela interface (WAV de mixdown/pad): 512 MB. */
const MAX_BYTES = 512 * 1024 * 1024

function invalido(nome: string): never {
  throw new Error(`Argumento inválido: ${nome}`)
}

/** Texto não vazio. */
export function texto(v: unknown, nome: string): string {
  if (typeof v !== 'string' || v.length === 0 || v.length > MAX_TEXTO) {
    invalido(nome)
  }
  return v
}

/** Texto que pode faltar ou ser vazio (vira ''). */
export function textoOpcional(v: unknown, nome: string): string {
  if (v === undefined || v === null) {
    return ''
  }
  if (typeof v !== 'string' || v.length > MAX_TEXTO) {
    invalido(nome)
  }
  return v
}

/** Texto (pode ser vazio), como a descrição de uma coleção. */
export function textoLivre(v: unknown, nome: string): string {
  if (typeof v !== 'string' || v.length > MAX_TEXTO) {
    invalido(nome)
  }
  return v
}

export function booleano(v: unknown, nome: string): boolean {
  if (typeof v !== 'boolean') {
    invalido(nome)
  }
  return v
}

/** Lista de textos não vazios. */
export function listaTextos(v: unknown, nome: string): string[] {
  if (!Array.isArray(v) || v.length > MAX_ITENS || !v.every((x) => typeof x === 'string' && x.length > 0 && x.length <= MAX_TEXTO)) {
    invalido(nome)
  }
  return v as string[]
}

/** Número finito dentro de [min, max]. */
export function numero(v: unknown, nome: string, min = -Infinity, max = Infinity): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) {
    invalido(nome)
  }
  return v
}

/** Bytes (Uint8Array) com pelo menos `minimo` bytes. */
export function bytes(v: unknown, nome: string, minimo = 1): Uint8Array {
  if (!(v instanceof Uint8Array) || v.byteLength < minimo || v.byteLength > MAX_BYTES) {
    invalido(nome)
  }
  return v
}

/** Áudio mono (Float32Array) não vazio. */
export function amostras(v: unknown, nome = 'amostras'): Float32Array {
  if (!(v instanceof Float32Array) || v.length === 0 || v.length > 48_000 * 60 * 10) {
    invalido(nome)
  }
  return v
}

/** Taxa de amostragem plausível em Hz. */
export function taxa(v: unknown): number {
  return numero(v, 'taxa', 3000, 400_000)
}
