import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

/** Configuração dos testes unitários (lógica pura e varredura de disco). */
export default defineConfig({
  resolve: { alias: { '@shared': resolve(__dirname, 'src/shared') } },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' }
})
