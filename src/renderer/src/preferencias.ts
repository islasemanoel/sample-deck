/**
 * Ajustes da interface guardados em preferencias.json pelo processo principal
 * (sobrevivem a reinícios e fechamentos forçados, ao contrário do localStorage).
 * Valores antigos do localStorage são migrados na primeira leitura.
 */

const valores = new Map<string, unknown>(Object.entries(window.api?.preferenciasIniciais ?? {}))

/** Valor salvo da chave, ou undefined. */
export function lerAjuste(chave: string): unknown {
  if (valores.has(chave)) {
    return valores.get(chave)
  }
  try {
    const antigo = localStorage.getItem(chave)
    if (antigo !== null) {
      let v: unknown
      try {
        v = JSON.parse(antigo)
      } catch {
        v = antigo
      }
      gravarAjuste(chave, v)
      localStorage.removeItem(chave)
      return v
    }
  } catch {
    // sem localStorage: segue sem valor
  }
  return undefined
}

/** Número salvo na chave, ou o padrão. */
export function lerAjusteNumero(chave: string, padrao: number): number {
  const v = lerAjuste(chave)
  return typeof v === 'number' && Number.isFinite(v) ? v : padrao
}

/** Grava (ou remove, com undefined) um ajuste. */
export function gravarAjuste(chave: string, valor: unknown): void {
  if (valor === undefined) {
    valores.delete(chave)
  } else {
    valores.set(chave, valor)
  }
  window.api?.salvarPreferencia(chave, valor)
}
