import { useCallback, useRef, useState } from 'react'

/** Aviso temporário na tela (toast) e execução de operações assíncronas com erro amigável. */
export function useAviso(): {
  aviso: string | null
  avisar: (texto: string) => void
  executar: <T>(fn: () => Promise<T>) => Promise<T | undefined>
} {
  const [aviso, setAviso] = useState<string | null>(null)
  const temporizador = useRef<number>()

  const avisar = useCallback((texto: string) => {
    setAviso(texto)
    window.clearTimeout(temporizador.current)
    temporizador.current = window.setTimeout(() => setAviso(null), 3200)
  }, [])

  /** Executa uma operação assíncrona mostrando erro amigável se falhar. */
  const executar = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
      try {
        return await fn()
      } catch (e) {
        avisar(`Erro: ${e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e)}`)
        return undefined
      }
    },
    [avisar]
  )

  return { aviso, avisar, executar }
}
