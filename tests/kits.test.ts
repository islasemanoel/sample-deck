import { describe, it, expect } from 'vitest'
import { detectarKits, ehPastaDeCategoria, preencherKits } from '@shared/kits'
import { normalizarBiblioteca } from '@shared/biblioteca'
import { ordenarSamples, filtrarSamples, filtrosVazios } from '@shared/filtros'
import { umSample } from './fabrica'

const kitsDe = (raiz: string, pastas: string[], irmaos: string[] = []): Record<string, string> =>
  Object.fromEntries(detectarKits(raiz, pastas, irmaos))

describe('ehPastaDeCategoria', () => {
  it('reconhece pastas de organização de um kit', () => {
    for (const n of ['Kicks', '808s', 'Hi Hats', 'One Shots', 'Drum Loops', 'Hard Kicks', 'Open Hats (12)', 'FX', 'Vox']) {
      expect(ehPastaDeCategoria(n), n).toBe(true)
    }
  })

  it('não confunde nomes de kits com categorias', () => {
    for (const n of ['Metro Boomin Drum Kit', 'Filth Vol. 4', 'Taz Taylor', 'Drum Kits', 'Producer Pack', 'Trap']) {
      expect(ehPastaDeCategoria(n), n).toBe(false)
    }
  })

  it('pastas genéricas só contam quando pedido', () => {
    expect(ehPastaDeCategoria('Samples')).toBe(false)
    expect(ehPastaDeCategoria('Bonus', true)).toBe(true)
  })
})

describe('detectarKits', () => {
  it('pasta cadastrada que é um kit', () => {
    expect(kitsDe('E:\\Samples\\Cuban Kit', ['Kicks', 'Snares', 'Loops/Drum Loops', ''])).toEqual({
      Kicks: 'Cuban Kit',
      Snares: 'Cuban Kit',
      'Loops/Drum Loops': 'Cuban Kit',
      '': 'Cuban Kit'
    })
  })

  it('kit sem "kit" no nome, reconhecido pelas subpastas de categoria', () => {
    expect(kitsDe('E:/Taz Taylor', ['Kicks', 'Snares', 'Bonus Stuff'])).toEqual({
      Kicks: 'Taz Taylor',
      Snares: 'Taz Taylor',
      'Bonus Stuff': 'Taz Taylor'
    })
  })

  it('pasta com vários kits', () => {
    expect(
      kitsDe('E:/Drum Kits', ['Metro Kit/Kicks', 'Metro Kit/Snares', 'Taz Taylor/808s', 'Taz Taylor/Hi Hats', 'Loose One/Other', 'Loose One'])
    ).toEqual({
      'Metro Kit/Kicks': 'Metro Kit',
      'Metro Kit/Snares': 'Metro Kit',
      'Taz Taylor/808s': 'Taz Taylor',
      'Taz Taylor/Hi Hats': 'Taz Taylor',
      'Loose One/Other': 'Loose One',
      'Loose One': 'Loose One'
    })
  })

  it('pasta de packs com nomes parecidos com categorias', () => {
    const k = kitsDe('D:/demo-samples', [
      'Cinematic Strings', 'Deep House Tools/Loops', 'Deep House Tools/One Shots', 'Guitar Grooves',
      'Lo-Fi Sessions/Drums', 'Lo-Fi Sessions/Music', 'Trap Nights'
    ])
    expect(k).toEqual({
      'Cinematic Strings': 'Cinematic Strings',
      'Deep House Tools/Loops': 'Deep House Tools',
      'Deep House Tools/One Shots': 'Deep House Tools',
      'Guitar Grooves': 'Guitar Grooves',
      'Lo-Fi Sessions/Drums': 'Lo-Fi Sessions',
      'Lo-Fi Sessions/Music': 'Lo-Fi Sessions',
      'Trap Nights': 'Trap Nights'
    })
  })

  it('agrupadores aninhados (por gênero) dentro de uma pasta de kits', () => {
    expect(kitsDe('D:/Meus Samples', ['Trap/Kit A/Kicks', 'Trap/Kit A/Snares', 'Trap/Kit B/Claps', 'Drill/Kit C/Kicks', 'Drill/Kit C/Percs'])).toEqual({
      'Trap/Kit A/Kicks': 'Kit A',
      'Trap/Kit A/Snares': 'Kit A',
      'Trap/Kit B/Claps': 'Kit B',
      'Drill/Kit C/Kicks': 'Kit C',
      'Drill/Kit C/Percs': 'Kit C'
    })
  })

  it('kit com arquivos direto na pasta, sem subpastas de categoria', () => {
    expect(kitsDe('D:/Packs', ['Lofi Dreams', 'Vinyl Chops Vol 2'])).toEqual({
      'Lofi Dreams': 'Lofi Dreams',
      'Vinyl Chops Vol 2': 'Vinyl Chops Vol 2'
    })
  })

  it('subpasta de categoria cadastrada: o kit é a pasta de cima', () => {
    expect(kitsDe('E:\\Drum Kits\\Metro Kit\\Kicks', [''])).toEqual({ '': 'Metro Kit' })
    expect(kitsDe('E:/Kits/Metro Kit/Drums/One Shots', ['', 'Hard'])).toEqual({ '': 'Metro Kit', Hard: 'Metro Kit' })
  })

  it('subpasta sem nome de categoria, reconhecida pelas pastas vizinhas', () => {
    expect(kitsDe('E:/Kits/Taz Taylor/Bangers', [''], ['Kicks', 'Snares', 'Hi Hats'])).toEqual({ '': 'Taz Taylor' })
    // Vizinhas que são outros kits: a raiz é um kit
    expect(kitsDe('E:/Kits/Taz Taylor', ['Kicks'], ['Metro Kit', 'Cuban Pack'])).toEqual({ Kicks: 'Taz Taylor' })
  })

  it('categoria logo abaixo da unidade fica com o próprio nome', () => {
    expect(kitsDe('E:/Kicks', [''])).toEqual({ '': 'Kicks' })
  })
})

describe('preencherKits', () => {
  it('detecta o kit de samples antigos sem o campo, sem mexer nos que já têm', () => {
    const antigos = [
      { ...umSample({ pastaRaiz: 'E:/Drum Kits', pastaRelativa: 'Metro Kit/Kicks' }), kit: undefined },
      { ...umSample({ pastaRaiz: 'E:/Drum Kits', pastaRelativa: 'Taz/Snares' }), kit: undefined },
      umSample({ pastaRaiz: 'E:/Outro', pastaRelativa: '', kit: 'Manual' })
    ]
    const b = normalizarBiblioteca({ samples: antigos })
    expect(b.samples.map((s) => s.kit)).toEqual(['Metro Kit', 'Taz', 'Manual'])
    const comKit = [umSample()]
    expect(preencherKits(comKit)).toBe(comKit)
  })
})

describe('kit na busca e na ordenação', () => {
  it('ordena por kit e, dentro dele, por nome; busca pelo nome do kit', () => {
    const lista = [
      umSample({ id: 'a', nome: 'z', kit: 'Metro Kit' }),
      umSample({ id: 'b', nome: 'a', kit: 'Cuban Pack' }),
      umSample({ id: 'c', nome: 'b', kit: '' }),
      umSample({ id: 'd', nome: 'a', kit: 'Metro Kit' })
    ]
    expect(ordenarSamples(lista, 'kit', 'asc').map((s) => s.id)).toEqual(['b', 'd', 'a', 'c'])
    expect(ordenarSamples(lista, 'kit', 'desc').map((s) => s.id)).toEqual(['d', 'a', 'b', 'c'])
    expect(filtrarSamples(lista, { ...filtrosVazios(), busca: 'metro' }).map((s) => s.id)).toEqual(['a', 'd'])
  })
})
