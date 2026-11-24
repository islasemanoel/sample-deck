/**
 * Onde gravar os WAVs gerados na interface (pads e samples com tom/BPM/reverso aplicados)
 * antes de arrastá-los para a DAW ou o Explorer. Escolhido em Configurações.
 * - `app`: pasta do próprio app (padrão), uma subpasta por conteúdo
 * - `original`: a mesma pasta do arquivo original do sample
 * - `pasta`: uma pasta escolhida pelo usuário
 */
export type LocalAudioEditado = 'app' | 'original' | 'pasta'

/** Chaves em preferencias.json (escritas pela tela de Configurações). */
export const AJUSTE_LOCAL_AUDIO_EDITADO = 'localAudioEditado'
export const AJUSTE_PASTA_AUDIO_EDITADO = 'pastaAudioEditado'

/** Lê a opção das preferências, caindo no padrão com valores ausentes ou inválidos. */
export function localAudioEditado(prefs: Record<string, unknown>): { local: LocalAudioEditado; pasta: string | null } {
  const local = prefs[AJUSTE_LOCAL_AUDIO_EDITADO]
  const pasta = prefs[AJUSTE_PASTA_AUDIO_EDITADO]
  const pastaValida = typeof pasta === 'string' && pasta.length > 0 ? pasta : null
  if (local === 'original') {
    return { local, pasta: pastaValida }
  }
  if (local === 'pasta' && pastaValida) {
    return { local, pasta: pastaValida }
  }
  return { local: 'app', pasta: pastaValida }
}
