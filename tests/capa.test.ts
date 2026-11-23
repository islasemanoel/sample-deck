import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  capaAutomatica,
  escolherCapa,
  ehImagem,
  ehPastaDeCapa,
  ehPaginaDeLoja,
  extensaoDaImagem,
  juntarResultados,
  LOJAS,
  lerResultadosLoja,
  ordenarCapas,
  semelhanca,
  termoDeBusca,
  termosAlternativos,
  urlDeBusca,
  urlDeCapaPermitida
} from '@shared/capa'
import type { CapaOnline } from '@shared/capa'
import { buscarCapa, capaDaPasta, copiarCapaParaPasta, FOLGA_DISCO, gravarCapa, nomeDaCapaSalva, removerCapaSalva } from '../src/main/capa'

describe('escolherCapa', () => {
  it('ignora arquivos que não são imagem', () => {
    expect(escolherCapa(['Kick 01.wav', 'readme.txt', 'license.pdf'])).toBeNull()
    expect(ehImagem('jpg')).toBe(false)
    expect(ehImagem('Cover.JPEG')).toBe(true)
  })

  it('prefere nomes de capa', () => {
    expect(escolherCapa(['banner.png', 'Cover.jpg', 'promo.png'])).toBe('Cover.jpg')
    expect(escolherCapa(['promo.png', 'Metro Kit - Artwork.png'])).toBe('Metro Kit - Artwork.png')
    expect(escolherCapa(['art.png', 'cover.png'])).toBe('cover.png')
  })

  it('reconhece a imagem com o nome do pack', () => {
    expect(escolherCapa(['promo.png', 'Metro_Kit.jpg'], 'Metro Kit')).toBe('Metro_Kit.jpg')
  })

  it('sem nome conhecido, usa a primeira imagem em ordem alfabética', () => {
    expect(escolherCapa(['z.png', 'a.jpg', 'kick.wav'])).toBe('a.jpg')
  })

  it('reconhece subpastas de capa', () => {
    expect(ehPastaDeCapa('Artwork')).toBe(true)
    expect(ehPastaDeCapa('Kicks')).toBe(false)
  })
})

describe('buscarCapa', () => {
  let raiz: string
  beforeEach(() => {
    raiz = mkdtempSync(join(tmpdir(), 'sampledeck-capa-'))
  })
  afterEach(() => {
    rmSync(raiz, { recursive: true, force: true })
  })

  it('acha a capa na própria pasta', async () => {
    writeFileSync(join(raiz, 'cover.png'), 'x')
    mkdirSync(join(raiz, 'Kicks'))
    expect((await buscarCapa(raiz))?.caminho).toBe(join(raiz, 'cover.png'))
  })

  it('acha a capa numa subpasta Artwork', async () => {
    mkdirSync(join(raiz, 'Artwork'))
    writeFileSync(join(raiz, 'Artwork', 'front.jpg'), 'x')
    expect((await buscarCapa(raiz))?.caminho).toBe(join(raiz, 'Artwork', 'front.jpg'))
  })

  it('devolve null sem imagem ou com pasta inexistente', async () => {
    writeFileSync(join(raiz, 'kick.wav'), 'x')
    expect(await buscarCapa(raiz)).toBeNull()
    expect(await buscarCapa(join(raiz, 'nao-existe'))).toBeNull()
  })
})

describe('termoDeBusca', () => {
  it('tira ruído do nome da pasta', () => {
    expect(termoDeBusca('Beat_Butcha-Filth_Vol2_Drum_Kit')).toBe('Beat Butcha Filth vol 2')
    expect(termoDeBusca('Cookin Soul - LO-BAP Kit [WAV] (2020)')).toBe('Cookin Soul LO BAP')
    expect(termoDeBusca('The Drum Broker - Metro Pack 2021')).toBe('Metro')
    expect(termoDeBusca('MetroBoominKit')).toBe('Metro Boomin')
  })
  it('tira nomes de lojas e formatos do nome da pasta', () => {
    expect(termoDeBusca('2DEEP - Aftermath - ProducerLoops.com (WAV, MiDi)')).toBe('2DEEP Aftermath')
    expect(termoDeBusca('Julez Jadon - Codeine Drum Kit - Prime Loops - Splice Sounds')).toBe('Julez Jadon Codeine')
    expect(termoDeBusca('KRANE Samples Vol. 4 - Samples & Loops - Splice Sounds')).toBe('KRANE vol 4')
    expect(termoDeBusca('JRHITMAKER - Graffiti - WavSupply (Drum Kit)')).toBe('JRHITMAKER Graffiti')
    expect(termoDeBusca('Marco Polo - Pad Thai Vol. 3 (Drum Kit) - The Drum Broker')).toBe('Marco Polo Pad Thai vol 3')
  })
  it('mantém o nome quando só sobra ruído', () => {
    expect(termoDeBusca('Drum Kit')).toBe('Drum Kit')
  })
  it('sugere termos mais curtos a partir dos trechos do nome', () => {
    expect(termosAlternativos('2DEEP - Aftermath - ProducerLoops.com (WAV, MiDi)')).toEqual(['Aftermath', '2DEEP'])
    expect(termosAlternativos('Julez Jadon - Codeine Drum Kit - Prime Loops - Splice Sounds')).toEqual(['Codeine', 'Julez Jadon'])
    expect(termosAlternativos('Memphis')).toEqual([])
  })
  it('monta a URL de busca da loja', () => {
    const u = new URL(urlDeBusca(LOJAS[1], 'Filth vol 2'))
    expect(u.origin).toBe('https://primeloops.com')
    expect(u.pathname).toBe('/search/suggest.json')
    expect(u.searchParams.get('q')).toBe('Filth vol 2')
    expect(u.searchParams.get('resources[type]')).toBe('product')
  })
})

describe('resultados da loja', () => {
  const resposta = {
    resources: {
      results: {
        products: [
          { title: 'Cookin Soul - LO-BAP BUNDLE KIT', vendor: 'Cookin Soul', url: '/products/lobap?_pos=1', image: 'https://cdn.shopify.com/a.jpg?v=1' },
          {
            title: 'Beat Butcha - Filth Vol. 2 - Drum Kit',
            vendor: 'Beat Butcha',
            url: '/products/filth-2?_pos=2',
            featured_image: { url: '//cdn.shopify.com/b.jpg?v=2' }
          },
          { title: 'Sem imagem', url: '/products/x' },
          { title: 'Host estranho', image: 'https://evil.example.com/c.jpg' }
        ]
      }
    }
  }

  it('extrai imagem, miniatura e página; ignora sem imagem e hosts não permitidos', () => {
    const capas = lerResultadosLoja(resposta)
    expect(capas).toHaveLength(2)
    expect(capas[1].imagem).toBe('https://cdn.shopify.com/b.jpg?v=2')
    expect(capas[1].miniatura).toContain('width=240')
    expect(capas[1].pagina).toBe('https://hiphopdrumsamples.com/products/filth-2')
    expect(lerResultadosLoja({})).toEqual([])
    expect(lerResultadosLoja(null)).toEqual([])
  })

  it('ordena pelo nome da pasta', () => {
    const capas = ordenarCapas('Beat Butcha - Filth Vol 2', lerResultadosLoja(resposta))
    expect(capas[0].titulo).toContain('Filth')
  })

  it('marca a loja e junta resultados de várias lojas sem repetir imagens', () => {
    const kingsway = LOJAS.find((l) => l.id === 'kingsway')!
    const a = lerResultadosLoja(resposta)
    const b = lerResultadosLoja(resposta, kingsway)
    expect(b[0].loja).toBe('Kingsway Music Library')
    expect(b[0].pagina.startsWith('https://kingswaymusiclibrary.com/products/')).toBe(true)
    const juntos = juntarResultados('Beat Butcha - Filth Vol 2', [a, b])
    expect(juntos).toHaveLength(2)
    expect(juntos[0].titulo).toContain('Filth')
    expect(juntarResultados('x', [])).toEqual([])
  })

  it('volume diferente conta menos', () => {
    const pasta = '!llmind - BLAP-KIT VOLUME 3 - The Drum Broker'
    expect(semelhanca(pasta, '!llmind Blap Kit Vol. 3')).toBeGreaterThan(semelhanca(pasta, '!llmind Blap Kit Vol. 4'))
  })

  it('só abre páginas das lojas conhecidas', () => {
    expect(ehPaginaDeLoja('https://primeloops.com/products/x')).toBe(true)
    expect(ehPaginaDeLoja('https://primeloops.com.evil.com/x')).toBe(false)
  })

  it('só aceita baixar de hosts conhecidos via https', () => {
    expect(urlDeCapaPermitida('https://cymatics.fm/cdn/shop/files/a.webp')).toBe(true)
    expect(urlDeCapaPermitida('https://cdn.shopify.com/a.jpg')).toBe(true)
    expect(urlDeCapaPermitida('http://cdn.shopify.com/a.jpg')).toBe(false)
    expect(urlDeCapaPermitida('https://cdn.shopify.com.evil.com/a.jpg')).toBe(false)
    expect(urlDeCapaPermitida('file:///C:/a.jpg')).toBe(false)
  })

  it('reconhece o tipo da imagem baixada', () => {
    expect(extensaoDaImagem('image/jpeg')).toBe('jpg')
    expect(extensaoDaImagem('image/png; charset=binary')).toBe('png')
    expect(extensaoDaImagem('text/html')).toBeNull()
  })
})

describe('capa escolhida', () => {
  let dados: string
  let pasta: string
  beforeEach(() => {
    dados = mkdtempSync(join(tmpdir(), 'sampledeck-dados-'))
    pasta = mkdtempSync(join(tmpdir(), 'sampledeck-kit-'))
  })
  afterEach(() => {
    rmSync(dados, { recursive: true, force: true })
    rmSync(pasta, { recursive: true, force: true })
  })

  it('tem prioridade sobre a imagem da pasta e pode ser removida', async () => {
    writeFileSync(join(pasta, 'cover.png'), 'x')
    expect((await capaDaPasta(dados, pasta))?.escolhida).toBe(false)

    await gravarCapa(dados, pasta, new Uint8Array([1, 2, 3]), 'jpg')
    const escolhida = await capaDaPasta(dados, pasta)
    expect(escolhida?.escolhida).toBe(true)
    expect(escolhida?.caminho.startsWith(dados)).toBe(true)

    // Trocar de formato substitui a anterior
    await gravarCapa(dados, pasta, new Uint8Array([4]), 'png')
    expect((await capaDaPasta(dados, pasta))?.caminho.endsWith('.png')).toBe(true)

    await removerCapaSalva(dados, pasta)
    expect((await capaDaPasta(dados, pasta))?.caminho).toBe(join(pasta, 'cover.png'))
  })

  it('não grava formatos desconhecidos e ignora barras e maiúsculas no nome', async () => {
    await expect(gravarCapa(dados, pasta, new Uint8Array([1]), 'exe')).rejects.toThrow()
    expect(nomeDaCapaSalva('C:\\Kits\\Metro')).toBe(nomeDaCapaSalva('c:/kits/metro/'))
  })
})

describe('capaAutomatica', () => {
  const capa = (fornecedor: string, titulo: string): CapaOnline => ({
    titulo,
    fornecedor,
    loja: 'Loja',
    imagem: `https://cdn.shopify.com/${encodeURIComponent(titulo)}.jpg`,
    miniatura: '',
    pagina: ''
  })

  it('escolhe quando o produto é claramente o kit da pasta', () => {
    expect(capaAutomatica('!llmind - BLAP-KIT VOLUME 3 - The Drum Broker', [capa('Blap Kits', 'S.T.A.S.H. Loops Vol.3'), capa('Blap Kits', 'Blap Kit Vol. 3')])?.titulo).toBe('Blap Kit Vol. 3')
    expect(capaAutomatica('Alchemist - Secret Sauce Vol. 2', [capa('Alchemist', 'Alchemist - Secret Sauce Part 2 Drum Kit')])).not.toBeNull()
    expect(capaAutomatica('Marco Polo - Pad Thai Vol. 1 (Drum Kit) - The Drum Broker', [capa('Marco Polo', 'Marco Polo - Pad Thai Vol. 1')])).not.toBeNull()
    expect(capaAutomatica('Tamuz The Tribute Vol.2', [capa('Tamuz', 'Tamuz - The Tribute Vol. 2')])).not.toBeNull()
    expect(
      capaAutomatica('Kingsway Music Library - Coleman Vol. 1 (Compositions and Stems)', [
        capa('Kingsway Music Library by Frank Dukes - Original Samples & Music', 'Kingsway Music Library - Coleman Vol. 1')
      ])
    ).not.toBeNull()
  })

  it('não escolhe na dúvida', () => {
    // outro kit do mesmo produtor
    expect(capaAutomatica('Shroom - Killer Breaks Vol. 2 - The Drum Broker', [capa('Shroom', 'Shroom - Divine Breaks Vol. 2')])).toBeNull()
    // outro volume
    expect(capaAutomatica('!llmind - BLAP-KIT VOLUME 2 - The Drum Broker', [capa('Blap Kits', 'Blap Kit Vol. 4')])).toBeNull()
    // só bate o nome da série e o volume
    expect(
      capaAutomatica('Kingsway Music Library - ILLNIGHT Vol. 1 (Compositions)', [capa('Kingsway Music Library', 'Kingsway Music Library Vol. 1')])
    ).toBeNull()
    // mesmo nome de kit, outro produtor
    expect(capaAutomatica('AngelicVibes - Vox Chops (Vox Loop Pack)', [capa('Blap Kits', 'Vox Chops [Special Edition]')])).toBeNull()
    expect(capaAutomatica('Drum Kit', [capa('X', 'Drum Kit')])).toBeNull()
    expect(capaAutomatica('Metro', [])).toBeNull()
  })
})

describe('copiarCapaParaPasta', () => {
  let pasta: string
  beforeEach(() => {
    pasta = mkdtempSync(join(tmpdir(), 'sampledeck-kit-'))
  })
  afterEach(() => {
    rmSync(pasta, { recursive: true, force: true })
  })
  const GB = 1024 ** 3

  it('grava cover.jpg na pasta do kit', async () => {
    expect(await copiarCapaParaPasta(pasta, new Uint8Array([1, 2]), 'jpg', GB)).toBe('gravada')
    expect(readFileSync(join(pasta, 'cover.jpg'))).toEqual(Buffer.from([1, 2]))
  })

  it('nunca sobrescreve um arquivo existente', async () => {
    writeFileSync(join(pasta, 'cover.jpg'), 'original')
    expect(await copiarCapaParaPasta(pasta, new Uint8Array([1]), 'jpg', GB)).toBe('ja-existe')
    expect(readFileSync(join(pasta, 'cover.jpg'), 'utf8')).toBe('original')
  })

  it('não grava sem espaço livre suficiente ou sem saber o espaço', async () => {
    expect(await copiarCapaParaPasta(pasta, new Uint8Array([1]), 'jpg', FOLGA_DISCO)).toBe('sem-espaco')
    expect(await copiarCapaParaPasta(pasta, new Uint8Array([1]), 'jpg', null)).toBe('sem-espaco')
    expect(existsSync(join(pasta, 'cover.jpg'))).toBe(false)
  })

  it('consulta o disco quando o espaço não é informado', async () => {
    expect(await copiarCapaParaPasta(pasta, new Uint8Array([1]), 'png')).toBe('gravada')
    expect(await copiarCapaParaPasta(pasta, new Uint8Array([1]), 'exe', GB)).toBe('erro')
  })
})
