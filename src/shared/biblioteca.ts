import { preencherKits } from './kits'
import { bibliotecaVazia, type Biblioteca, type Sample } from './tipos'

/**
 * Operações imutáveis sobre o estado da biblioteca.
 * Cada função retorna uma nova Biblioteca, sem alterar a recebida.
 */

/** Marca ou desmarca um sample como favorito. */
export function alternarFavorito(b: Biblioteca, id: string): Biblioteca {
  const favoritos = b.favoritos.includes(id) ? b.favoritos.filter((f) => f !== id) : [...b.favoritos, id]
  return { ...b, favoritos }
}

/** Marca (valor=true) ou desmarca vários samples como favoritos. */
export function definirFavoritos(b: Biblioteca, ids: string[], valor: boolean): Biblioteca {
  if (!valor) {
    return { ...b, favoritos: b.favoritos.filter((f) => !ids.includes(f)) }
  }
  const favoritos = [...b.favoritos]
  for (const id of ids) {
    if (!favoritos.includes(id)) {
      favoritos.push(id)
    }
  }
  return { ...b, favoritos }
}

/** Cria uma coleção vazia. Lança erro se o nome estiver vazio. */
export function criarColecao(b: Biblioteca, nome: string, id: string, agora: number): Biblioteca {
  const limpo = nome.trim()
  if (!limpo) {
    throw new Error('Nome da coleção vazio')
  }
  return { ...b, colecoes: [...b.colecoes, { id, nome: limpo, descricao: '', sampleIds: [], criadaEm: agora }] }
}

/** Aplica uma alteração à coleção indicada; erro se não existir. */
function alterarColecao(b: Biblioteca, id: string, fn: (c: Biblioteca['colecoes'][number]) => Biblioteca['colecoes'][number]): Biblioteca {
  if (!b.colecoes.some((c) => c.id === id)) {
    throw new Error(`Coleção inexistente: ${id}`)
  }
  return { ...b, colecoes: b.colecoes.map((c) => (c.id === id ? fn(c) : c)) }
}

/** Altera nome e descrição de uma coleção. */
export function renomearColecao(b: Biblioteca, id: string, nome: string, descricao: string): Biblioteca {
  const limpo = nome.trim()
  if (!limpo) {
    throw new Error('Nome da coleção vazio')
  }
  return alterarColecao(b, id, (c) => ({ ...c, nome: limpo, descricao: descricao.trim() }))
}

/** Exclui uma coleção (os samples permanecem na biblioteca). */
export function excluirColecao(b: Biblioteca, id: string): Biblioteca {
  return { ...b, colecoes: b.colecoes.filter((c) => c.id !== id) }
}

/** Adiciona samples ao fim da coleção, ignorando os que já estão nela. */
export function adicionarAColecao(b: Biblioteca, id: string, sampleIds: string[]): Biblioteca {
  return alterarColecao(b, id, (c) => {
    const novos = sampleIds.filter((s, i) => !c.sampleIds.includes(s) && sampleIds.indexOf(s) === i)
    return { ...c, sampleIds: [...c.sampleIds, ...novos] }
  })
}

/** Remove samples de uma coleção. */
export function removerDaColecao(b: Biblioteca, id: string, sampleIds: string[]): Biblioteca {
  return alterarColecao(b, id, (c) => ({ ...c, sampleIds: c.sampleIds.filter((s) => !sampleIds.includes(s)) }))
}

/** Mantém em favoritos e coleções apenas ids de samples existentes. */
function limparReferencias(b: Biblioteca): Biblioteca {
  const ids = new Set(b.samples.map((s) => s.id))
  return {
    ...b,
    favoritos: b.favoritos.filter((f) => ids.has(f)),
    colecoes: b.colecoes.map((c) => ({ ...c, sampleIds: c.sampleIds.filter((s) => ids.has(s)) }))
  }
}

/** Remove uma pasta raiz e todos os seus samples (os arquivos no disco não são tocados). */
export function removerPasta(b: Biblioteca, pasta: string): Biblioteca {
  return limparReferencias({
    ...b,
    pastas: b.pastas.filter((p) => p !== pasta),
    samples: b.samples.filter((s) => s.pastaRaiz !== pasta)
  })
}

/** Substitui os samples de uma pasta pelo resultado de uma nova varredura. */
export function mesclarVarredura(b: Biblioteca, pasta: string, samples: Sample[]): Biblioteca {
  return limparReferencias({
    ...b,
    pastas: b.pastas.includes(pasta) ? b.pastas : [...b.pastas, pasta],
    samples: [...b.samples.filter((s) => s.pastaRaiz !== pasta), ...samples]
  })
}

/**
 * Incorpora um lote parcial de uma varredura em andamento: samples novos entram no fim e os que já
 * existem (mesmo id) são substituídos. Não remove nada: a remoção só vale no resultado final.
 */
export function aplicarLote(b: Biblioteca, pasta: string, lote: Sample[]): Biblioteca {
  const indice = new Map(b.samples.map((s, i) => [s.id, i]))
  const samples = [...b.samples]
  for (const s of lote) {
    const i = indice.get(s.id)
    if (i === undefined) {
      indice.set(s.id, samples.length)
      samples.push(s)
    } else {
      samples[i] = s
    }
  }
  return { ...b, pastas: b.pastas.includes(pasta) ? b.pastas : [...b.pastas, pasta], samples }
}

/** Garante a forma esperada de um JSON lido do disco (antigo, parcial ou corrompido). */
export function normalizarBiblioteca(bruto: unknown): Biblioteca {
  const base = bibliotecaVazia()
  if (!bruto || typeof bruto !== 'object') {
    return base
  }
  const o = bruto as Record<string, unknown>
  const lista = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])
  return {
    pastas: lista<string>(o.pastas),
    // Bibliotecas antigas não têm o kit: detecta pela estrutura de pastas já indexada
    samples: preencherKits(lista<Sample>(o.samples)),
    favoritos: lista<string>(o.favoritos),
    colecoes: lista<Biblioteca['colecoes'][number]>(o.colecoes),
    ultimosLocais:
      o.ultimosLocais && typeof o.ultimosLocais === 'object' ? (o.ultimosLocais as Record<string, string>) : {}
  }
}
