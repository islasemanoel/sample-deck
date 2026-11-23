/**
 * Larguras das colunas redimensionáveis da lista de samples.
 * A coluna "Arquivo" ocupa o espaço que sobra até o usuário definir uma largura para ela;
 * a partir daí, uma faixa vazia depois das ações absorve a sobra.
 */

export type ColunaRedimensionavel = 'nome' | 'kit' | 'duracao' | 'tom' | 'bpm'

export type Larguras = Partial<Record<ColunaRedimensionavel, number>>

/** Largura inicial de cada coluna (px); "nome" é só o mínimo, pois ela preenche a sobra. */
export const LARGURA_PADRAO: Record<ColunaRedimensionavel, number> = {
  nome: 180,
  kit: 170,
  duracao: 60,
  tom: 74,
  bpm: 56
}

/** Limites de largura (px) por coluna. */
const MINIMO: Record<ColunaRedimensionavel, number> = { nome: 120, kit: 60, duracao: 48, tom: 48, bpm: 44 }
const MAXIMO = 900

const COLUNAS: ColunaRedimensionavel[] = ['nome', 'kit', 'duracao', 'tom', 'bpm']

/** Restringe a largura aos limites da coluna, em pixels inteiros. */
export function limitarLargura(coluna: ColunaRedimensionavel, largura: number): number {
  return Math.round(Math.min(MAXIMO, Math.max(MINIMO[coluna], largura)))
}

/** Valor de grid-template-columns da tabela para as larguras escolhidas. */
export function montarColunas(l: Larguras): string {
  // A largura escolhida é o máximo: com pouco espaço (janela estreita, painel aberto) a coluna
  // encolhe até o mínimo, em vez de empurrar as outras para fora da tela
  const px = (c: ColunaRedimensionavel): string => `minmax(${MINIMO[c]}px, ${l[c] ?? LARGURA_PADRAO[c]}px)`
  const nome = l.nome === undefined ? `minmax(${LARGURA_PADRAO.nome}px, 1fr)` : px('nome')
  // Coluna vazia no fim (sem célula nas linhas): absorve a sobra quando Arquivo tem largura fixa
  const sobra = l.nome === undefined ? '' : ' minmax(0, 1fr)'
  return `34px 46px 30px ${nome} ${px('kit')} ${px('duracao')} ${px('tom')} ${px('bpm')} 76px${sobra}`
}

/** Lê larguras salvas, descartando valores inválidos. */
export function normalizarLarguras(bruto: unknown): Larguras {
  const r: Larguras = {}
  if (!bruto || typeof bruto !== 'object') {
    return r
  }
  for (const c of COLUNAS) {
    const v = (bruto as Record<string, unknown>)[c]
    if (typeof v === 'number' && Number.isFinite(v)) {
      r[c] = limitarLargura(c, v)
    }
  }
  return r
}
