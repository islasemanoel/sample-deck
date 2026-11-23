/**
 * Tons detectados pelo áudio para ajustar samples sem tom no nome ao tom do projeto.
 * Guardados em preferencias.json (chave "tonsDetectados") para não analisar de novo;
 * null = analisado sem resultado confiável. A chave inclui a data de modificação do
 * arquivo, então um arquivo alterado é analisado de novo.
 */
import type { Sample } from '@shared/tipos'
import { gravarAjuste, lerAjuste } from './preferencias'

const CHAVE = 'tonsDetectados'
/** Limite de entradas guardadas (as mais antigas saem primeiro). */
const LIMITE = 3000

const tons = new Map<string, string | null>()
{
  const salvo = lerAjuste(CHAVE)
  if (salvo && typeof salvo === 'object' && !Array.isArray(salvo)) {
    for (const [k, v] of Object.entries(salvo as Record<string, unknown>)) {
      if (typeof v === 'string' || v === null) {
        tons.set(k, v)
      }
    }
  }
}

let gravacao: number | undefined

function chave(s: Sample): string {
  return `${s.id}:${s.modificadoEm}`
}

/** Tom detectado (string), analisado sem resultado (null) ou ainda não analisado (undefined). */
export function tomDetectado(s: Sample): string | null | undefined {
  return tons.get(chave(s))
}

export function guardarTomDetectado(s: Sample, tom: string | null): void {
  const k = chave(s)
  tons.delete(k)
  tons.set(k, tom)
  while (tons.size > LIMITE) {
    tons.delete(tons.keys().next().value as string)
  }
  // Agrupa gravações seguidas (vários samples tocados em sequência)
  window.clearTimeout(gravacao)
  gravacao = window.setTimeout(() => gravarAjuste(CHAVE, Object.fromEntries(tons)), 1000)
}
