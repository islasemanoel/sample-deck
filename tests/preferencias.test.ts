import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { ArmazenamentoPreferencias, janelaVisivel, normalizarPreferencias } from '../src/main/preferencias'

let dir: string
const arquivo = (): string => join(dir, 'preferencias.json')

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sampledeck-pref-'))
})

afterEach(() => {
  vi.useRealTimers()
  rmSync(dir, { recursive: true, force: true })
})

describe('normalizarPreferencias', () => {
  it('aceita arquivo ausente, corrompido ou com janela inválida', () => {
    expect(normalizarPreferencias(null)).toEqual({ janela: null, janelaCompacta: null, interface: {} })
    expect(normalizarPreferencias({ janela: { x: 1, y: 2, largura: 'a', altura: 3 }, interface: [] })).toEqual({
      janela: null,
      janelaCompacta: null,
      interface: {}
    })
    expect(normalizarPreferencias({ janela: { x: -5, y: 0, largura: 1200, altura: 800, maximizada: true }, interface: { a: 1 } })).toEqual({
      janela: { x: -5, y: 0, largura: 1200, altura: 800, maximizada: true },
      janelaCompacta: null,
      interface: { a: 1 }
    })
  })

  it('lê a janela do modo compacto separada da normal', () => {
    const r = normalizarPreferencias({
      janela: { x: 0, y: 0, largura: 1400, altura: 900 },
      janelaCompacta: { x: 1500, y: 10, largura: 380, altura: 820 }
    })
    expect(r.janela?.largura).toBe(1400)
    expect(r.janelaCompacta).toEqual({ x: 1500, y: 10, largura: 380, altura: 820, maximizada: false })
  })
})

describe('janelaVisivel', () => {
  const telas = [
    { x: 0, y: 0, width: 1920, height: 1040 },
    { x: 1920, y: 0, width: 1280, height: 1000 }
  ]
  it('aceita janela em qualquer tela, inclusive parcialmente fora', () => {
    expect(janelaVisivel({ x: 100, y: 50, largura: 1200, altura: 800, maximizada: false }, telas)).toBe(true)
    expect(janelaVisivel({ x: 2000, y: 10, largura: 1100, altura: 700, maximizada: false }, telas)).toBe(true)
    expect(janelaVisivel({ x: -1000, y: 10, largura: 1200, altura: 700, maximizada: false }, telas)).toBe(true)
  })
  it('recusa janela num monitor que foi desconectado ou com o título fora da tela', () => {
    expect(janelaVisivel({ x: 3500, y: 0, largura: 1200, altura: 800, maximizada: false }, telas)).toBe(false)
    expect(janelaVisivel({ x: 100, y: -500, largura: 1200, altura: 800, maximizada: false }, telas)).toBe(false)
  })
})

describe('ArmazenamentoPreferencias', () => {
  it('grava a janela na hora e os ajustes agrupados; tudo volta ao reabrir', () => {
    vi.useFakeTimers()
    const p = new ArmazenamentoPreferencias(arquivo())
    expect(p.janela).toBeNull()
    p.salvarJanela({ x: 10, y: 20, largura: 1300, altura: 850, maximizada: true })
    expect(new ArmazenamentoPreferencias(arquivo()).janela).toEqual({ x: 10, y: 20, largura: 1300, altura: 850, maximizada: true })

    p.salvarInterface('larguras-colunas', { kit: 250 })
    p.salvarInterface('volume', 0.5)
    expect(new ArmazenamentoPreferencias(arquivo()).interface).toEqual({})
    vi.advanceTimersByTime(300)
    expect(new ArmazenamentoPreferencias(arquivo()).interface).toEqual({ 'larguras-colunas': { kit: 250 }, volume: 0.5 })

    p.salvarInterface('volume', undefined)
    p.descarregar()
    const relida = new ArmazenamentoPreferencias(arquivo())
    expect(relida.interface).toEqual({ 'larguras-colunas': { kit: 250 } })
    expect(relida.janela?.largura).toBe(1300)
    expect(existsSync(`${arquivo()}.tmp`)).toBe(false)
  })

  it('arquivo corrompido não impede abrir', () => {
    writeFileSync(arquivo(), '{lixo')
    const p = new ArmazenamentoPreferencias(arquivo())
    expect(p.janela).toBeNull()
    p.salvarJanela({ x: 0, y: 0, largura: 1200, altura: 700, maximizada: false })
    expect(JSON.parse(readFileSync(arquivo(), 'utf8')).janela.largura).toBe(1200)
  })

  it('grava a janela compacta sem mexer na normal', () => {
    const p = new ArmazenamentoPreferencias(arquivo())
    p.salvarJanela({ x: 0, y: 0, largura: 1300, altura: 800, maximizada: false })
    p.salvarJanelaCompacta({ x: 900, y: 20, largura: 380, altura: 760, maximizada: false })
    const relida = new ArmazenamentoPreferencias(arquivo())
    expect(relida.janela?.largura).toBe(1300)
    expect(relida.janelaCompacta?.largura).toBe(380)
  })
})
