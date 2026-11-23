import { useCallback, useState } from 'react'
import { mesmaVisao, type Visao } from '../visao'

export interface Historico {
  pilha: Visao[]
  i: number
}

/** Navegação entre visões (pasta, coleção, Curtidos...) com voltar e avançar, como num navegador. */
export function useHistorico(): {
  hist: Historico
  visao: Visao
  ir: (v: Visao) => void
  voltar: () => void
  avancar: () => void
} {
  const [hist, setHist] = useState<Historico>({ pilha: [{ tipo: 'todos' }], i: 0 })

  const ir = useCallback((v: Visao) => {
    setHist((h) => {
      if (mesmaVisao(h.pilha[h.i], v)) {
        return h
      }
      const pilha = [...h.pilha.slice(0, h.i + 1), v]
      return { pilha, i: pilha.length - 1 }
    })
  }, [])
  const voltar = useCallback(() => setHist((h) => ({ ...h, i: Math.max(0, h.i - 1) })), [])
  const avancar = useCallback(() => setHist((h) => ({ ...h, i: Math.min(h.pilha.length - 1, h.i + 1) })), [])

  return { hist, visao: hist.pilha[hist.i], ir, voltar, avancar }
}
