import { describe, it, expect } from 'vitest'
import { escolherSubstituto, resumoProjeto, nomeProjetoAleatorio, sugerirCamadas } from '@shared/camadas'
import { umSample } from './fabrica'

const fixo = (v: number) => () => v

describe('escolherSubstituto', () => {
  const atual = umSample({ id: 'atual', categoria: 'bass', tom: 'A min', bpm: 120, tipo: 'loop' })

  it('prefere a mesma categoria com tom igual e bpm próximo', () => {
    const ideal = umSample({ id: 'ideal', categoria: 'bass', tom: 'A min', bpm: 122, tipo: 'loop' })
    const tomDiferente = umSample({ id: 'tom', categoria: 'bass', tom: 'C maj', bpm: 120, tipo: 'loop' })
    const outraCategoria = umSample({ id: 'cat', categoria: 'drums', tom: 'A min', bpm: 120 })
    const r = escolherSubstituto(atual, [atual, tomDiferente, outraCategoria, ideal], [], fixo(0))
    expect(r?.id).toBe('ideal')
  })

  it('sem candidato compatível, cai para qualquer um da mesma categoria', () => {
    const tomDiferente = umSample({ id: 'tom', categoria: 'bass', tom: 'C maj', bpm: 90 })
    expect(escolherSubstituto(atual, [atual, tomDiferente], [], fixo(0.9))?.id).toBe('tom')
  })

  it('ignora os ids excluídos (camadas já usadas) e retorna null sem opção', () => {
    const usado = umSample({ id: 'usado', categoria: 'bass', tom: 'A min', bpm: 120 })
    expect(escolherSubstituto(atual, [atual, usado], ['usado'], fixo(0))).toBeNull()
  })
})

describe('resumoProjeto', () => {
  it('usa o primeiro bpm e o primeiro tom disponíveis entre as camadas', () => {
    const r = resumoProjeto([
      umSample({ bpm: null, tom: 'E min' }),
      umSample({ bpm: 173, tom: 'A maj' })
    ])
    expect(r).toEqual({ bpm: 173, tom: 'E min' })
  })

  it('projeto vazio não tem bpm nem tom', () => {
    expect(resumoProjeto([])).toEqual({ bpm: null, tom: null })
  })
})

describe('sugerirCamadas', () => {
  const bateria = umSample({ id: 'bat', categoria: 'drums', tipo: 'loop', bpm: 120, tom: null })
  const baixoOk = umSample({ id: 'bx', categoria: 'bass', tipo: 'loop', bpm: 121, tom: 'A min' })
  const baixoLento = umSample({ id: 'bxl', categoria: 'bass', tipo: 'loop', bpm: 90, tom: 'A min' })
  const tecla = umSample({ id: 'tc', categoria: 'keys', tipo: 'loop', bpm: 120, tom: 'A min' })
  const teclaOutroTom = umSample({ id: 'tc2', categoria: 'synth', tipo: 'loop', bpm: 120, tom: 'C maj' })
  const vozOneShot = umSample({ id: 'vz', categoria: 'vocals', tipo: 'one-shot', bpm: null })

  it('mantém as camadas atuais e completa os grupos que faltam com loops de bpm compatível', () => {
    const r = escolhaIds(sugerirCamadas([bateria, baixoOk, baixoLento, tecla, vozOneShot], [bateria], fixo(0)))
    expect(r).toEqual(['bat', 'bx', 'tc'])
  })

  it('para instrumentos melódicos prefere o mesmo tom do projeto', () => {
    const r = escolhaIds(sugerirCamadas([bateria, baixoOk, teclaOutroTom, tecla], [bateria], fixo(0)))
    expect(r).toContain('tc')
    expect(r).not.toContain('tc2')
  })

  it('sem tom compatível aceita outro tom, mas nunca outro bpm', () => {
    const r = escolhaIds(sugerirCamadas([bateria, baixoLento, teclaOutroTom], [bateria], fixo(0)))
    expect(r).toEqual(['bat', 'tc2'])
  })

  it('projeto vazio começa por uma bateria em loop e segue o bpm dela', () => {
    const r = escolhaIds(sugerirCamadas([baixoLento, bateria, baixoOk], [], fixo(0)))
    expect(r[0]).toBe('bat')
    expect(r).toContain('bx')
    expect(r).not.toContain('bxl')
  })

  it('biblioteca sem loops não sugere nada', () => {
    expect(sugerirCamadas([vozOneShot], [], fixo(0))).toEqual([])
  })
})

function escolhaIds(lista: { id: string }[]): string[] {
  return lista.map((s) => s.id)
}

describe('nomeProjetoAleatorio', () => {
  it('gera duas palavras e varia conforme o gerador', () => {
    const a = nomeProjetoAleatorio(fixo(0))
    const b = nomeProjetoAleatorio(fixo(0.99))
    expect(a.split(' ')).toHaveLength(2)
    expect(a).not.toBe(b)
  })
})
