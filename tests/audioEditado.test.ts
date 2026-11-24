import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { tmpdir } from 'os'
import { gravarAudioEditado, gravarNaPasta } from '../src/main/audioEditado'
import { localAudioEditado } from '@shared/audioEditado'

let dir: string
let dirApp: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sampledeck-edit-'))
  dirApp = join(dir, 'app')
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
})

const bytes = (n: number): Uint8Array => new Uint8Array(64).fill(n)

describe('localAudioEditado', () => {
  it('usa a pasta do app com valores ausentes ou inválidos', () => {
    expect(localAudioEditado({})).toEqual({ local: 'app', pasta: null })
    expect(localAudioEditado({ localAudioEditado: 'xyz' }).local).toBe('app')
  })

  it('não aceita "pasta" sem uma pasta escolhida', () => {
    expect(localAudioEditado({ localAudioEditado: 'pasta' }).local).toBe('app')
    expect(localAudioEditado({ localAudioEditado: 'pasta', pastaAudioEditado: 'D:\\x' })).toEqual({ local: 'pasta', pasta: 'D:\\x' })
  })

  it('lembra a pasta mesmo com outra opção escolhida', () => {
    expect(localAudioEditado({ localAudioEditado: 'original', pastaAudioEditado: 'D:\\x' })).toEqual({ local: 'original', pasta: 'D:\\x' })
  })
})

describe('gravarNaPasta', () => {
  it('reaproveita o arquivo com o mesmo conteúdo e numera quando o conteúdo é outro', () => {
    const a = gravarNaPasta(dir, 'kick.wav', bytes(1))
    expect(a).toBe(join(dir, 'kick.wav'))
    expect(gravarNaPasta(dir, 'kick.wav', bytes(1))).toBe(a)
    const b = gravarNaPasta(dir, 'kick.wav', bytes(2))
    expect(b).toBe(join(dir, 'kick (2).wav'))
    expect(readFileSync(a)[0]).toBe(1)
    expect(readFileSync(b)[0]).toBe(2)
  })
})

describe('gravarAudioEditado', () => {
  it('grava na pasta do app, numa subpasta por conteúdo', () => {
    const c = gravarAudioEditado({ local: 'app', pasta: null }, dirApp, 'kick.wav', bytes(1), null)
    expect(dirname(dirname(c))).toBe(dirApp)
  })

  it('grava ao lado do arquivo original', () => {
    const kit = join(dir, 'kit')
    mkdirSync(kit)
    writeFileSync(join(kit, 'kick.wav'), bytes(9))
    const c = gravarAudioEditado({ local: 'original', pasta: null }, dirApp, 'kick (pad 1).wav', bytes(1), join(kit, 'kick.wav'))
    expect(c).toBe(join(kit, 'kick (pad 1).wav'))
    expect(existsSync(dirApp)).toBe(false)
  })

  it('grava na pasta escolhida', () => {
    const escolhida = join(dir, 'editados')
    mkdirSync(escolhida)
    const c = gravarAudioEditado({ local: 'pasta', pasta: escolhida }, dirApp, 'kick.wav', bytes(1), null)
    expect(c).toBe(join(escolhida, 'kick.wav'))
  })

  it('usa a pasta do app se o destino não existir', () => {
    const c = gravarAudioEditado({ local: 'pasta', pasta: join(dir, 'sumiu') }, dirApp, 'kick.wav', bytes(1), null)
    expect(dirname(dirname(c))).toBe(dirApp)
    expect(readdirSync(dir)).not.toContain('sumiu')
  })
})
