import type { ApiSampleDeck } from '@shared/api'

declare global {
  interface Window {
    /** Ponte com o processo principal, exposta pelo preload. */
    api: ApiSampleDeck
  }
}

export {}
