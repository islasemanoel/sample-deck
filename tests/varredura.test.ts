import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { varrerPasta, idDoCaminho, ehArquivoDeAudio, VERSAO_ANALISE } from '../src/main/varredura'
import { codificarWav } from '@shared/audio'
import { batida } from './sinteticos'
import type { Sample } from '@shared/tipos'

let raiz: string

/** Escreve um WAV mono real com a duração informada. */
function escreverWav(caminho: string, segundos: number): void {
  const taxa = 8000
  writeFileSync(caminho, codificarWav([new Float32Array(taxa * segundos)], taxa))
}

beforeEach(() => {
  raiz = mkdtempSync(join(tmpdir(), 'sampledeck-'))
  mkdirSync(join(raiz, 'Drums', 'One Shots'), { recursive: true })
  escreverWav(join(raiz, 'Drums', 'OS_DPS_160_drum_loop_homie.wav'), 2)
  escreverWav(join(raiz, 'Drums', 'One Shots', 'Kick_Punchy.wav'), 1)
  writeFileSync(join(raiz, 'leia-me.txt'), 'não é áudio')
})

afterEach(() => {
  rmSync(raiz, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
})

describe('ehArquivoDeAudio', () => {
  it('aceita extensões de áudio em qualquer caixa', () => {
    expect(ehArquivoDeAudio('a.WAV')).toBe(true)
    expect(ehArquivoDeAudio('a.flac')).toBe(true)
    expect(ehArquivoDeAudio('a.aiff')).toBe(true)
    expect(ehArquivoDeAudio('a.txt')).toBe(false)
    expect(ehArquivoDeAudio('wav')).toBe(false)
  })
})

describe('idDoCaminho', () => {
  it('é estável e não diferencia barras nem caixa', () => {
    expect(idDoCaminho('C:\\A\\b.wav')).toBe(idDoCaminho('c:/a/B.WAV'))
    expect(idDoCaminho('C:/a/b.wav')).not.toBe(idDoCaminho('C:/a/c.wav'))
  })
})

describe('varrerPasta', () => {
  it('indexa apenas áudio, com duração real e metadados do nome e da pasta', async () => {
    const progresso: number[] = []
    const samples = await varrerPasta(raiz, new Map(), (p) => progresso.push(p.processados))
    const porNome = Object.fromEntries(samples.map((s) => [s.nome, s]))

    expect(samples).toHaveLength(2)
    const loop = porNome['OS_DPS_160_drum_loop_homie']
    expect(loop.bpm).toBe(160)
    expect(loop.tipo).toBe('loop')
    expect(loop.categoria).toBe('drums')
    expect(loop.pastaRelativa).toBe('Drums')
    expect(loop.duracao).toBeCloseTo(2, 1)
    expect(loop.pastaRaiz).toBe(raiz)

    const kick = porNome['Kick_Punchy']
    expect(kick.tipo).toBe('one-shot')
    expect(kick.pastaRelativa).toBe('Drums/One Shots')
    expect(kick.tags).toContain('kick')
    expect(kick.duracao).toBeCloseTo(1, 1)

    expect(progresso[progresso.length - 1]).toBe(2)
  })

  it('reaproveita a análise de arquivos que não mudaram', async () => {
    const primeira = await varrerPasta(raiz, new Map(), () => {})
    const marcado: Sample[] = primeira.map((s) => ({ ...s, tags: [...s.tags, 'marcado'] }))
    const conhecidos = new Map(marcado.map((s) => [s.caminho, s]))
    const segunda = await varrerPasta(raiz, conhecidos, () => {})
    expect(segunda.every((s) => s.tags.includes('marcado'))).toBe(true)
  })

  it('arquivo de áudio corrompido entra com duração nula, sem derrubar a varredura', async () => {
    writeFileSync(join(raiz, 'quebrado.wav'), 'lixo')
    const samples = await varrerPasta(raiz, new Map(), () => {})
    const quebrado = samples.find((s) => s.nome === 'quebrado')
    expect(samples).toHaveLength(3)
    expect(quebrado?.duracao).toBeNull()
  })

  it('arquivo vazio ou minúsculo não deixa o arquivo aberto (a pasta pode ser apagada em seguida)', async () => {
    writeFileSync(join(raiz, 'vazio.wav'), '')
    writeFileSync(join(raiz, 'curto.mp3'), 'abc')
    const samples = await varrerPasta(raiz, new Map(), () => {})
    expect(samples.find((s) => s.nome === 'vazio')?.duracao).toBeNull()
    expect(samples.find((s) => s.nome === 'curto')?.duracao).toBeNull()
  })

  it('informa a fase de listagem antes da análise, para a interface não parecer travada', async () => {
    const fases: string[] = []
    await varrerPasta(raiz, new Map(), (p) => fases.push(`${p.fase}:${p.processados}/${p.total}`))
    expect(fases[0]).toBe('listando:0/0')
    expect(fases).toContain('analisando:0/2')
    expect(fases.indexOf('analisando:0/2')).toBeGreaterThan(0)
    expect(fases[fases.length - 1]).toBe('analisando:2/2')
  })

  it('lê um arquivo por vez (sem leituras simultâneas no mesmo disco)', async () => {
    escreverWav(join(raiz, 'Drums', 'Snare_01.wav'), 1)
    escreverWav(join(raiz, 'Drums', 'Hat_01.wav'), 1)
    let ativas = 0
    let maximo = 0
    const lerDuracao = async (): Promise<number> => {
      ativas++
      maximo = Math.max(maximo, ativas)
      await new Promise((r) => setTimeout(r, 5))
      ativas--
      return 1
    }
    const samples = await varrerPasta(raiz, new Map(), () => {}, { lerDuracao })
    expect(samples).toHaveLength(4)
    expect(maximo).toBe(1)
  })

  it('entrega lotes parciais durante a análise', async () => {
    escreverWav(join(raiz, 'Drums', 'Snare_01.wav'), 1)
    const lotes: number[] = []
    const samples = await varrerPasta(raiz, new Map(), () => {}, {
      tamanhoLote: 2,
      aoLote: (parciais) => lotes.push(parciais.length)
    })
    expect(samples).toHaveLength(3)
    expect(lotes).toEqual([2])
  })

  it('pode ser interrompida, devolvendo o que já foi analisado', async () => {
    escreverWav(join(raiz, 'Drums', 'Snare_01.wav'), 1)
    let analisados = 0
    const samples = await varrerPasta(raiz, new Map(), (p) => (analisados = p.processados), {
      deveParar: () => analisados >= 1
    })
    expect(samples).toHaveLength(1)
    expect(samples[0]).toBeDefined()
  })

  it('estima o BPM pelo áudio de loops WAV sem BPM no nome, marcando como estimado', async () => {
    mkdirSync(join(raiz, 'Music Loops'))
    const { taxa, amostras } = batida(92, { compassos: 4 })
    writeFileSync(join(raiz, 'Music Loops', 'Emo 1.wav'), codificarWav([amostras], taxa))
    const samples = await varrerPasta(raiz, new Map(), () => {})
    const emo = samples.find((s) => s.nome === 'Emo 1')
    expect(emo?.tipo).toBe('loop')
    expect(emo?.bpm).toBe(92)
    expect(emo?.bpmEstimado).toBe(true)
    expect(emo?.versaoAnalise).toBe(VERSAO_ANALISE)
  })

  it('não analisa o áudio quando o nome já tem BPM nem em one-shots', async () => {
    const analisados: string[] = []
    const samples = await varrerPasta(raiz, new Map(), () => {}, {
      estimarBpm: async (c) => {
        analisados.push(c)
        return 100
      }
    })
    expect(analisados).toEqual([])
    const loop = samples.find((s) => s.nome === 'OS_DPS_160_drum_loop_homie')
    expect(loop?.bpm).toBe(160)
    expect(loop?.bpmEstimado).toBe(false)
    expect(samples.find((s) => s.nome === 'Kick_Punchy')?.bpm).toBeNull()
  })

  it('reanalisa samples indexados por uma versão anterior da análise', async () => {
    mkdirSync(join(raiz, 'Loops'))
    escreverWav(join(raiz, 'Loops', 'Groove.wav'), 2)
    const primeira = await varrerPasta(raiz, new Map(), () => {}, { estimarBpm: async () => null })
    const antigos = primeira.map((s) => ({ ...s, versaoAnalise: VERSAO_ANALISE - 1 }))
    const segunda = await varrerPasta(raiz, new Map(antigos.map((s) => [s.caminho, s])), () => {}, {
      estimarBpm: async () => 97
    })
    expect(segunda.find((s) => s.nome === 'Groove')?.bpm).toBe(97)
    expect(segunda.every((s) => s.versaoAnalise === VERSAO_ANALISE)).toBe(true)
  })

  it('falha na estimativa não derruba a varredura', async () => {
    mkdirSync(join(raiz, 'Loops'))
    escreverWav(join(raiz, 'Loops', 'Groove.wav'), 2)
    const samples = await varrerPasta(raiz, new Map(), () => {}, {
      estimarBpm: async () => {
        throw new Error('arquivo ilegível')
      }
    })
    const groove = samples.find((s) => s.nome === 'Groove')
    expect(groove?.bpm).toBeNull()
    expect(groove?.bpmEstimado).toBe(false)
  })

  it('identifica o drum kit/pack de cada arquivo, inclusive em pasta com vários kits ou subpasta de kit', async () => {
    const kits = join(raiz, 'Drum Kits')
    mkdirSync(join(kits, 'Metro Kit', 'Kicks'), { recursive: true })
    mkdirSync(join(kits, 'Metro Kit', 'Snares'), { recursive: true })
    mkdirSync(join(kits, 'Taz Taylor', '808s'), { recursive: true })
    escreverWav(join(kits, 'Metro Kit', 'Kicks', 'Kick 1.wav'), 1)
    escreverWav(join(kits, 'Metro Kit', 'Snares', 'Snare 1.wav'), 1)
    escreverWav(join(kits, 'Taz Taylor', '808s', '808 C.wav'), 1)
    const kitDe = (ss: Sample[]): Record<string, string> => Object.fromEntries(ss.map((s) => [s.nome, s.kit]))

    // Pasta com vários kits
    expect(kitDe(await varrerPasta(kits, new Map(), () => {}))).toEqual({ 'Kick 1': 'Metro Kit', 'Snare 1': 'Metro Kit', '808 C': 'Taz Taylor' })
    // Um kit
    expect(kitDe(await varrerPasta(join(kits, 'Metro Kit'), new Map(), () => {}))).toEqual({ 'Kick 1': 'Metro Kit', 'Snare 1': 'Metro Kit' })
    // Subpasta de um kit
    expect(kitDe(await varrerPasta(join(kits, 'Taz Taylor', '808s'), new Map(), () => {}))).toEqual({ '808 C': 'Taz Taylor' })
  })

  it('atualiza o kit de samples reaproveitados sem reanalisar', async () => {
    const primeira = await varrerPasta(raiz, new Map(), () => {})
    const antigos = primeira.map((s) => ({ ...s, kit: 'velho', tags: [...s.tags, 'marcado'] }))
    const segunda = await varrerPasta(raiz, new Map(antigos.map((s) => [s.caminho, s])), () => {})
    expect(segunda.every((s) => s.tags.includes('marcado') && s.kit === primeira[0].kit)).toBe(true)
  })

  it('pasta inexistente gera erro', async () => {
    await expect(varrerPasta(join(raiz, 'nao-existe'), new Map(), () => {})).rejects.toThrow()
  })
})
