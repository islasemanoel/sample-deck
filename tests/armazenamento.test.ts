import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { ArmazenamentoBiblioteca } from '../src/main/armazenamento'
import { bibliotecaVazia } from '@shared/tipos'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sampledeck-arm-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('ArmazenamentoBiblioteca', () => {
  it('primeira execução (sem arquivo) carrega biblioteca vazia', () => {
    expect(new ArmazenamentoBiblioteca(join(dir, 'b.json')).carregar()).toEqual(bibliotecaVazia())
  })

  it('salva e carrega de volta, criando a pasta se preciso', async () => {
    const arq = join(dir, 'sub', 'b.json')
    const a = new ArmazenamentoBiblioteca(arq)
    await a.salvar({ ...bibliotecaVazia(), pastas: ['C:/X'], favoritos: ['f'] })
    const lida = new ArmazenamentoBiblioteca(arq).carregar()
    expect(lida.pastas).toEqual(['C:/X'])
    expect(lida.favoritos).toEqual(['f'])
    expect(existsSync(`${arq}.tmp`)).toBe(false)
  })

  it('gravações seguidas terminam com o último estado', async () => {
    const arq = join(dir, 'b.json')
    const a = new ArmazenamentoBiblioteca(arq)
    void a.salvar({ ...bibliotecaVazia(), pastas: ['1'] })
    void a.salvar({ ...bibliotecaVazia(), pastas: ['2'] })
    await a.salvar({ ...bibliotecaVazia(), pastas: ['3'] })
    expect(JSON.parse(readFileSync(arq, 'utf8')).pastas).toEqual(['3'])
  })

  it('arquivo corrompido não derruba o app: carrega biblioteca vazia', () => {
    const arq = join(dir, 'b.json')
    writeFileSync(arq, '{ isto não é json')
    expect(new ArmazenamentoBiblioteca(arq).carregar()).toEqual(bibliotecaVazia())
  })
})

describe('gravação agrupada', () => {
  it('agendar junta alterações seguidas numa gravação com o último estado', async () => {
    const arq = join(dir, 'b.json')
    const a = new ArmazenamentoBiblioteca(arq, 20)
    a.agendar({ ...bibliotecaVazia(), pastas: ['1'] })
    a.agendar({ ...bibliotecaVazia(), pastas: ['2'] })
    expect(existsSync(arq)).toBe(false)
    await new Promise((r) => setTimeout(r, 120))
    expect(JSON.parse(readFileSync(arq, 'utf8')).pastas).toEqual(['2'])
  })

  it('esvaziar grava na hora o que está agendado e espera terminar', async () => {
    const arq = join(dir, 'b.json')
    const a = new ArmazenamentoBiblioteca(arq, 60_000)
    a.agendar({ ...bibliotecaVazia(), favoritos: ['f'] })
    await a.esvaziar()
    expect(JSON.parse(readFileSync(arq, 'utf8')).favoritos).toEqual(['f'])
    await a.esvaziar() // sem nada pendente: não falha
  })

  it('falha numa gravação agendada vai para o callback, sem exceção solta', async () => {
    const falhas: unknown[] = []
    // o "arquivo" está dentro de um arquivo comum, então mkdir/gravar falham
    const bloqueio = join(dir, 'arquivo')
    writeFileSync(bloqueio, 'x')
    const a = new ArmazenamentoBiblioteca(join(bloqueio, 'b.json'), 10, (e) => falhas.push(e))
    a.agendar(bibliotecaVazia())
    await new Promise((r) => setTimeout(r, 150))
    expect(falhas).toHaveLength(1)
  })
})
