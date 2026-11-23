import { useCallback, useEffect, useState } from 'react'
import { aplicarLote } from '@shared/biblioteca'
import type { Biblioteca, ProgressoVarredura } from '@shared/tipos'

/**
 * Estado da biblioteca vindo do processo principal: carga inicial, progresso da varredura e os
 * lotes parciais (só os samples novos) enquanto uma pasta grande é indexada.
 */
export function useBiblioteca(): {
  bib: Biblioteca | null
  setBib: (b: Biblioteca) => void
  /** Mescla a parte leve (favoritos, coleções, pastas) devolvida por operações que não mexem nos samples. */
  aplicar: (alteracao: Partial<Biblioteca>) => void
  progresso: ProgressoVarredura | null
} {
  const [bib, setBib] = useState<Biblioteca | null>(null)
  const [progresso, setProgresso] = useState<ProgressoVarredura | null>(null)

  useEffect(() => {
    void window.api.obterBiblioteca().then(setBib)
    const pararProgresso = window.api.aoProgredir((p) => {
      setProgresso(p.fase === 'analisando' && p.processados >= p.total ? null : p)
    })
    const pararLotes = window.api.aoLoteVarredura((lote) => {
      setBib((b) => (b ? aplicarLote(b, lote.pasta, lote.samples) : b))
    })
    return () => {
      pararProgresso()
      pararLotes()
    }
  }, [])

  const aplicar = useCallback((alteracao: Partial<Biblioteca>) => {
    setBib((b) => (b ? { ...b, ...alteracao } : b))
  }, [])

  return { bib, setBib, aplicar, progresso }
}
