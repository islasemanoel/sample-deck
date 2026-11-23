import * as fs from 'fs'
import * as path from 'path'
import { createContext, runInContext } from 'vm'

/**
 * libKeyFinder (motor de tom do Mixxx, GPL-3.0) compilado em WASM pelo projeto webKeyFinder
 * (github.com/dogayuksel/webkeyfinder). O arquivo é um Web Worker do Emscripten com o WASM
 * embutido; aqui ele roda num contexto isolado do Node, e as mensagens de worker são simuladas.
 * Cópia em resources/keyfinder (veja o LEIAME.md de lá).
 */

interface MensagemWorker {
  finalResponse?: boolean
  data?: Uint8Array | 0
}

interface ContextoKeyFinder {
  onmessage: (m: { data: { funcName: string; data: unknown[]; callbackId: number } }) => void
}

let carregado: Promise<ContextoKeyFinder> | null = null
let resposta: string | null = null

function carregar(arquivo: string): Promise<ContextoKeyFinder> {
  return new Promise((resolve, reject) => {
    const sandbox: Record<string, unknown> = {
      console,
      setTimeout,
      clearTimeout,
      WebAssembly,
      Buffer,
      setImmediate,
      performance,
      TextDecoder,
      TextEncoder,
      URL,
      process,
      require: (m: string) => {
        if (m === 'fs') {
          return fs
        }
        if (m === 'path') {
          return path
        }
        throw new Error(`módulo não permitido: ${m}`)
      },
      __dirname: path.dirname(arquivo),
      __filename: arquivo,
      postMessage: (o: MensagemWorker) => {
        if (o.finalResponse && o.data) {
          resposta = Buffer.from(o.data).toString('utf8')
        }
      }
    }
    sandbox.Module = {
      onRuntimeInitialized: () => setImmediate(() => resolve(sandbox as unknown as ContextoKeyFinder)),
      onAbort: (e: unknown) => reject(new Error(`libKeyFinder abortou: ${String(e)}`))
    }
    sandbox.globalThis = sandbox
    try {
      runInContext(fs.readFileSync(arquivo, 'utf8'), createContext(sandbox), { filename: arquivo })
    } catch (e) {
      reject(e)
    }
  })
}

/**
 * Detecta o tom com o libKeyFinder.
 * @param arquivo caminho do keyFinderProgressiveWorker.js
 * @returns texto do libKeyFinder ("A Minor", "Db Major", "Silence"...) ou null
 */
export async function detectarTomKeyFinder(arquivo: string, x: Float32Array, taxa: number): Promise<string | null> {
  carregado ??= carregar(arquivo)
  carregado.catch(() => (carregado = null))
  const ctx = await carregado
  resposta = null
  ctx.onmessage({ data: { funcName: 'initialize', data: [taxa, 1], callbackId: 1 } })
  ctx.onmessage({ data: { funcName: 'feedAudioData', data: [x], callbackId: 2 } })
  ctx.onmessage({ data: { funcName: 'finalDetection', data: [], callbackId: 3 } })
  return resposta
}
