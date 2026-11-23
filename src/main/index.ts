import { app, BrowserWindow, dialog, ipcMain, nativeImage, net, protocol, screen, shell } from 'electron'
import { constants as fsConstants, existsSync, mkdirSync, promises as fs, writeFileSync } from 'fs'
import { basename, extname, join } from 'path'
import { pathToFileURL } from 'url'
import { createHash, randomUUID } from 'crypto'
import {
  adicionarAColecao,
  criarColecao,
  definirFavoritos,
  excluirColecao,
  mesclarVarredura,
  removerDaColecao,
  removerPasta,
  renomearColecao
} from '@shared/biblioteca'
import type { Biblioteca, ProgressoVarredura, Sample } from '@shared/tipos'
import type { LoteVarredura } from '@shared/api'
import { nomeArquivoSeguro } from '@shared/pads'
import type { CapaOnline } from '@shared/capa'
import type { PecaNota } from '@shared/analiseTom'
import { ArmazenamentoBiblioteca } from './armazenamento'
import * as v from './validacao'
import { ArmazenamentoPreferencias, janelaVisivel } from './preferencias'
import { varrerPasta } from './varredura'
import { analisarNota, analisarTom } from './detectorTom'
import { analisarBpm } from './detectorBpm'
import { capaDaPasta, copiarCapaParaPasta, gravarCapa, removerCapaSalva } from './capa'
import {
  capaAutomatica,
  ehPaginaDeLoja,
  extensaoDaImagem,
  juntarResultados,
  lerResultadosLoja,
  LOJAS,
  termoDeBusca,
  termosAlternativos,
  urlDeBusca,
  urlDeCapaPermitida,
  type ResultadoCopiaCapa
} from '@shared/capa'

/**
 * Processo principal do SampleDeck: janela, persistência, varredura de pastas,
 * protocolo `sample://` para tocar arquivos locais e operações de arquivo.
 */

// Permite isolar os dados (ex.: demonstração) sem tocar na biblioteca real
if (process.env.SAMPLEDECK_DADOS) {
  app.setPath('userData', process.env.SAMPLEDECK_DADOS)
}

/** Ícone do app (janela e barra de tarefas), em resources/ na raiz do projeto. */
const ICONE = join(app.getAppPath(), 'resources', process.platform === 'win32' ? 'icon.ico' : 'icon.png')

// No Windows, agrupa as janelas na barra de tarefas com o ícone do app (e não o do Electron)
if (process.platform === 'win32') {
  app.setAppUserModelId('com.sampledeck.app')
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'sample', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
])

let janela: BrowserWindow | null = null

/** Cores nativas da janela por tema (iguais a --fundo em estilos.css). */
const CORES_TEMA = {
  claro: { fundo: '#ffffff', simbolo: '#3a3a3a' },
  escuro: { fundo: '#121214', simbolo: '#d4d4d8' }
} as const
let armazenamento: ArmazenamentoBiblioteca
let preferencias: ArmazenamentoPreferencias
let biblioteca: Biblioteca
let caminhosPermitidos = new Set<string>()
/** Imagens de capa encontradas nas pastas cadastradas, também servidas por sample://. */
const capasPermitidas = new Set<string>()
/** Tamanho máximo de uma imagem de capa (bytes). */
const LIMITE_CAPA = 15 * 1024 * 1024

/** Busca o termo em todas as lojas ao mesmo tempo; uma loja fora do ar não impede as outras. */
async function buscarNasLojas(termo: string): Promise<{ ok: CapaOnline[][]; falharam: string[] }> {
  const respostas = await Promise.allSettled(
    LOJAS.map(async (loja) => {
      const resp = await net.fetch(urlDeBusca(loja, termo), {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10000)
      })
      if (!resp.ok) {
        throw new Error(`${loja.nome} respondeu ${resp.status}`)
      }
      return lerResultadosLoja(await resp.json(), loja)
    })
  )
  return {
    ok: respostas.filter((r): r is PromiseFulfilledResult<CapaOnline[]> => r.status === 'fulfilled').map((r) => r.value),
    falharam: LOJAS.filter((_, i) => respostas[i].status === 'rejected').map((l) => l.nome)
  }
}

/** Busca a capa da pasta em todas as lojas; sem termo digitado, tenta também trechos do nome se achar pouco. */
async function buscarCapasDaPasta(pasta: string, termo?: string): Promise<{ termo: string; capas: CapaOnline[]; falharam: string[] }> {
  const nome = basename(pasta)
  const digitado = (termo ?? '').trim()
  const busca = digitado || termoDeBusca(nome)
  const principal = await buscarNasLojas(busca)
  if (principal.ok.length === 0) {
    throw new Error('nenhuma loja respondeu (verifique a internet)')
  }
  const listas = [...principal.ok]
  if (!digitado && principal.ok.flat().length < 4) {
    for (const alt of termosAlternativos(nome)) {
      listas.push(...(await buscarNasLojas(alt)).ok)
    }
  }
  return { termo: busca, capas: juntarResultados(nome, listas), falharam: principal.falharam }
}

/**
 * Se a opção "salvar capas da web também na pasta do kit" estiver ligada (Configurações),
 * grava uma cópia como cover.jpg na pasta (convertendo PNG para JPG quando possível).
 * Devolve null com a opção desligada.
 */
async function copiaNaPasta(pasta: string, dados: Uint8Array, ext: string): Promise<ResultadoCopiaCapa | null> {
  if (preferencias.interface.capaNaPastaDoKit !== true) {
    return null
  }
  let bytes = dados
  let extensao = ext
  if (ext !== 'jpg') {
    const img = nativeImage.createFromBuffer(Buffer.from(dados))
    if (!img.isEmpty()) {
      bytes = new Uint8Array(img.toJPEG(92))
      extensao = 'jpg'
    }
  }
  return copiarCapaParaPasta(pasta, bytes, extensao)
}

/** Baixa a imagem (só de hosts conhecidos, até 15 MB) e grava como capa escolhida da pasta. */
async function baixarCapa(pasta: string, url: string): Promise<ResultadoCopiaCapa | null> {
  if (!urlDeCapaPermitida(url)) {
    throw new Error('Endereço de imagem não permitido')
  }
  const resp = await net.fetch(url, { signal: AbortSignal.timeout(30000) })
  const ext = extensaoDaImagem(resp.headers.get('content-type') ?? '')
  if (!resp.ok || !ext) {
    throw new Error('Não foi possível baixar a imagem')
  }
  const dados = new Uint8Array(await resp.arrayBuffer())
  if (dados.byteLength > LIMITE_CAPA) {
    throw new Error('Imagem grande demais')
  }
  await gravarCapa(dirCapas(), pasta, dados, ext)
  return copiaNaPasta(pasta, dados, ext)
}

/**
 * Depois de adicionar pastas: para as que não têm capa (nem no kit nem escolhida), busca nas lojas
 * e grava sozinha quando o resultado é inequívoco (ver capaAutomatica). Roda em segundo plano,
 * uma pasta por vez, e avisa a janela de cada capa encontrada. Falhas são ignoradas em silêncio.
 */
async function capasAutomaticas(pastas: string[]): Promise<void> {
  for (const pasta of pastas) {
    try {
      if (!biblioteca.pastas.includes(pasta) || (await capaDaPasta(dirCapas(), pasta))) {
        continue
      }
      const { capas } = await buscarCapasDaPasta(pasta)
      const escolhida = capaAutomatica(basename(pasta), capas)
      if (escolhida) {
        const copia = await baixarCapa(pasta, escolhida.imagem)
        janela?.webContents.send('capaAutomatica', { pasta, titulo: escolhida.titulo, loja: escolhida.loja, copia })
      }
    } catch {
      // sem internet ou loja fora do ar: o usuário ainda pode buscar em "Capa"
    }
  }
}

/** Pasta das capas escolhidas pelo usuário (fora das pastas de samples). */
function dirCapas(): string {
  return join(app.getPath('userData'), 'capas')
}

/** Atualiza o estado em memória, a lista de arquivos servíveis e grava no disco. */
function atualizar(nova: Biblioteca): Biblioteca {
  if (nova.samples !== biblioteca?.samples) {
    caminhosPermitidos = new Set(nova.samples.map((s) => s.caminho))
  }
  biblioteca = nova
  armazenamento.agendar(nova)
  return nova
}

/** Parte leve da biblioteca (sem a lista de samples) para respostas rápidas. */
function leve(b: Biblioteca): Partial<Biblioteca> {
  return { favoritos: b.favoritos, colecoes: b.colecoes, pastas: b.pastas }
}

/** Diretório inicial de um seletor, lembrado por contexto entre sessões. */
async function ultimoLocal(chave: string): Promise<string | undefined> {
  const dir = biblioteca.ultimosLocais[chave]
  if (!dir) {
    return undefined
  }
  try {
    await fs.access(dir)
    return dir
  } catch {
    return undefined // drive desconectado ou pasta removida
  }
}

/** Grava o último diretório usado num seletor. */
function lembrarLocal(chave: string, dir: string): void {
  atualizar({ ...biblioteca, ultimosLocais: { ...biblioteca.ultimosLocais, [chave]: dir } })
}

let varrendo = false
let pedidoParar = false
const INTERVALO_PARCIAL_MS = 10000

/**
 * Varre uma pasta enviando progresso para a janela. A cada ~10 s grava o resultado parcial
 * e atualiza a interface, para que nada se perca se o app for fechado no meio.
 * Só uma varredura roda por vez (uma sessão contínua de leitura por disco).
 */
async function indexar(pasta: string, lote?: ProgressoVarredura['lote']): Promise<Biblioteca> {
  if (varrendo) {
    throw new Error('Já existe uma indexação em andamento')
  }
  varrendo = true
  pedidoParar = false
  try {
    const antigos = biblioteca.samples.filter((s) => s.pastaRaiz === pasta)
    const conhecidos = new Map(antigos.map((s) => [s.caminho, s]))
    // Analisados até agora + antigos ainda não revisitados (para nada sumir no meio)
    const combinar = (parciais: Sample[]): Sample[] => {
      const feitos = new Set(parciais.map((s) => s.caminho))
      return [...parciais, ...antigos.filter((s) => !feitos.has(s.caminho))]
    }
    let ultimoEnvio = 0
    let ultimoParcial = Date.now()
    // Só o que a janela ainda não recebeu: os samples reaproveitados (mesmo objeto) ela já tem
    const enviados = new Set<string>()
    const samples = await varrerPasta(
      pasta,
      conhecidos,
      (p) => {
        const agora = Date.now()
        if (agora - ultimoEnvio > 80 || p.processados === p.total) {
          ultimoEnvio = agora
          janela?.webContents.send('progresso', { ...p, lote })
        }
      },
      {
        tamanhoLote: 500,
        deveParar: () => pedidoParar,
        aoLote: (parciais) => {
          if (Date.now() - ultimoParcial < INTERVALO_PARCIAL_MS) {
            return
          }
          ultimoParcial = Date.now()
          atualizar(mesclarVarredura(biblioteca, pasta, combinar(parciais)))
          const novos = parciais.filter((s) => conhecidos.get(s.caminho) !== s && !enviados.has(s.id))
          novos.forEach((s) => enviados.add(s.id))
          if (novos.length > 0) {
            janela?.webContents.send('loteVarredura', { pasta, samples: novos } satisfies LoteVarredura)
          }
        }
      }
    )
    const final = pedidoParar ? combinar(samples) : samples
    janela?.webContents.send('progresso', { pasta, fase: 'analisando', processados: 1, total: 1, lote })
    return atualizar(mesclarVarredura(biblioteca, pasta, final))
  } finally {
    varrendo = false
  }
}

/** Ícone exibido durante o arrasto de arquivos (círculo azul 32×32). */
function iconeArrasto(): Electron.NativeImage {
  const t = 32
  const buf = Buffer.alloc(t * t * 4)
  for (let y = 0; y < t; y++) {
    for (let x = 0; x < t; x++) {
      const d = Math.hypot(x - t / 2 + 0.5, y - t / 2 + 0.5)
      const i = (y * t + x) * 4
      if (d < t / 2 - 1) {
        buf[i] = 0xff // B
        buf[i + 1] = 0x4e // G
        buf[i + 2] = 0x1d // R
        buf[i + 3] = 0xff
      }
    }
  }
  return nativeImage.createFromBitmap(buf, { width: t, height: t })
}

/** Imagem do arrasto: o cartão (PNG base64 @2x) vindo da interface, ou o círculo padrão se inválido. */
function iconeDoCartao(cartao: unknown): Electron.NativeImage {
  if (typeof cartao === 'string' && cartao.length > 0 && cartao.length < 2_000_000 && /^[A-Za-z0-9+/=]+$/.test(cartao)) {
    const img = nativeImage.createFromBuffer(Buffer.from(cartao, 'base64'), { scaleFactor: 2 })
    if (!img.isEmpty()) {
      return img
    }
  }
  return iconeArrasto()
}

function registrarIpc(): void {
  ipcMain.handle('config', () => ({ demo: process.env.SAMPLEDECK_DEMO === '1' }))
  ipcMain.handle('obterBiblioteca', () => biblioteca)
  // Síncrono: a interface precisa dos ajustes já na primeira renderização
  ipcMain.on('lerPreferencias', (e) => {
    e.returnValue = preferencias.interface
  })
  ipcMain.on('salvarPreferencia', (_e, chave: unknown, valor: unknown) => {
    if (typeof chave === 'string' && chave.length > 0 && chave.length <= 100) {
      preferencias.salvarInterface(chave, valor)
    }
  })

  ipcMain.handle('definirCompacto', (_e, valor: unknown) => definirCompacto(v.booleano(valor, 'compacto')))
  ipcMain.on('definirTema', (_e, tema: unknown) => {
    if (janela && (tema === 'claro' || tema === 'escuro')) {
      const c = CORES_TEMA[tema]
      janela.setBackgroundColor(c.fundo)
      janela.setTitleBarOverlay({ color: c.fundo, symbolColor: c.simbolo, height: 52 })
    }
  })

  ipcMain.handle('capaDaPasta', async (_e, bruto: unknown) => {
    const pasta = v.texto(bruto, 'pasta')
    if (!biblioteca.pastas.includes(pasta)) {
      return null
    }
    const capa = await capaDaPasta(dirCapas(), pasta)
    if (!capa) {
      return null
    }
    capasPermitidas.add(capa.caminho)
    // ?v= muda quando a imagem é trocada, para o navegador não mostrar a antiga do cache
    return {
      url: `sample://arquivo/${encodeURIComponent(capa.caminho)}?v=${Math.round(capa.modificadoEm)}`,
      escolhida: capa.escolhida
    }
  })
  ipcMain.handle('buscarCapasOnline', (_e, pasta: unknown, termo: unknown) =>
    buscarCapasDaPasta(v.texto(pasta, 'pasta'), v.textoOpcional(termo, 'termo'))
  )
  ipcMain.handle('salvarCapaOnline', async (_e, brutoPasta: unknown, brutoUrl: unknown) => {
    const pasta = v.texto(brutoPasta, 'pasta')
    const url = v.texto(brutoUrl, 'url')
    if (!biblioteca.pastas.includes(pasta)) {
      throw new Error('Pasta desconhecida')
    }
    return baixarCapa(pasta, url)
  })
  ipcMain.handle('escolherCapaArquivo', async (_e, bruto: unknown) => {
    const pasta = v.texto(bruto, 'pasta')
    if (!janela || !biblioteca.pastas.includes(pasta)) {
      return false
    }
    const r = await dialog.showOpenDialog(janela, {
      title: 'Escolha a imagem de capa',
      defaultPath: pasta,
      properties: ['openFile'],
      filters: [{ name: 'Imagens', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }]
    })
    if (r.canceled || r.filePaths.length === 0) {
      return false
    }
    const origem = r.filePaths[0]
    const ext = extname(origem).slice(1).toLowerCase().replace('jpeg', 'jpg')
    const dados = await fs.readFile(origem)
    if (dados.byteLength > LIMITE_CAPA) {
      throw new Error('Imagem grande demais')
    }
    await gravarCapa(dirCapas(), pasta, dados, ext)
    return true
  })
  ipcMain.handle('removerCapa', (_e, pasta: unknown) => {
    const p = v.texto(pasta, 'pasta')
    return biblioteca.pastas.includes(p) ? removerCapaSalva(dirCapas(), p) : undefined
  })
  ipcMain.on('abrirPaginaLoja', (_e, url: unknown) => {
    if (typeof url === 'string' && ehPaginaDeLoja(url)) {
      void shell.openExternal(url)
    }
  })

  ipcMain.on('pararVarredura', () => {
    // Fora de uma varredura o pedido ficaria pendente e cancelaria a próxima sem o usuário pedir
    if (varrendo) {
      pedidoParar = true
    }
  })

  ipcMain.handle('adicionarPasta', async () => {
    if (!janela) {
      return null
    }
    if (varrendo) {
      throw new Error('Já existe uma indexação em andamento')
    }
    const r = await dialog.showOpenDialog(janela, {
      title: 'Escolha uma ou mais pastas de samples',
      defaultPath: await ultimoLocal('adicionar_pasta'),
      properties: ['openDirectory', 'multiSelections']
    })
    if (r.canceled || r.filePaths.length === 0) {
      return null
    }
    lembrarLocal('adicionar_pasta', r.filePaths[0])
    pedidoParar = false
    let resultado: Biblioteca | null = null
    let erro: unknown = null
    const total = r.filePaths.length
    const indexadas: string[] = []
    for (const [i, pasta] of r.filePaths.entries()) {
      if (resultado && pedidoParar) {
        break
      }
      try {
        resultado = await indexar(pasta, total > 1 ? { atual: i + 1, total } : undefined)
        indexadas.push(pasta)
      } catch (e) {
        erro = e
      }
    }
    if (!resultado) {
      throw erro
    }
    void capasAutomaticas(indexadas)
    return resultado
  })

  ipcMain.handle('reescanear', async (_e, bruto: unknown) => {
    if (varrendo) {
      throw new Error('Já existe uma indexação em andamento')
    }
    const pasta = bruto === undefined || bruto === null ? undefined : v.texto(bruto, 'pasta')
    if (pasta !== undefined && !biblioteca.pastas.includes(pasta)) {
      throw new Error('Pasta desconhecida')
    }
    const alvo = pasta ? [pasta] : [...biblioteca.pastas]
    pedidoParar = false
    for (const [i, p] of alvo.entries()) {
      if (pedidoParar) {
        break
      }
      try {
        await indexar(p, alvo.length > 1 ? { atual: i + 1, total: alvo.length } : undefined)
      } catch {
        // pasta inacessível (drive desconectado): mantém os dados anteriores
      }
    }
    void capasAutomaticas(alvo)
    return biblioteca
  })

  ipcMain.handle('removerPasta', async (_e, bruto: unknown) => {
    const pasta = v.texto(bruto, 'pasta')
    if (varrendo) {
      // A varredura em andamento recolocaria a pasta (e os samples) ao terminar
      throw new Error('Aguarde ou pare a indexação em andamento para remover a pasta')
    }
    await removerCapaSalva(dirCapas(), pasta).catch(() => undefined)
    return atualizar(removerPasta(biblioteca, pasta))
  })
  ipcMain.handle('favoritar', (_e, ids: unknown, valor: unknown) =>
    leve(atualizar(definirFavoritos(biblioteca, v.listaTextos(ids, 'ids'), v.booleano(valor, 'valor'))))
  )
  ipcMain.handle('criarColecao', (_e, nome: unknown, sampleIds: unknown) => {
    const ids = v.listaTextos(sampleIds, 'sampleIds')
    const id = randomUUID()
    let b = criarColecao(biblioteca, v.textoLivre(nome, 'nome'), id, Date.now())
    if (ids.length > 0) {
      b = adicionarAColecao(b, id, ids)
    }
    return { alteracao: leve(atualizar(b)), id }
  })
  ipcMain.handle('renomearColecao', (_e, id: unknown, nome: unknown, descricao: unknown) =>
    leve(atualizar(renomearColecao(biblioteca, v.texto(id, 'id'), v.textoLivre(nome, 'nome'), v.textoLivre(descricao, 'descricao'))))
  )
  ipcMain.handle('excluirColecao', (_e, id: unknown) => leve(atualizar(excluirColecao(biblioteca, v.texto(id, 'id')))))
  ipcMain.handle('adicionarAColecao', (_e, id: unknown, ids: unknown) =>
    leve(atualizar(adicionarAColecao(biblioteca, v.texto(id, 'id'), v.listaTextos(ids, 'ids'))))
  )
  ipcMain.handle('removerDaColecao', (_e, id: unknown, ids: unknown) =>
    leve(atualizar(removerDaColecao(biblioteca, v.texto(id, 'id'), v.listaTextos(ids, 'ids'))))
  )

  ipcMain.on('mostrarNaPasta', (_e, caminho: unknown) => {
    if (typeof caminho === 'string' && caminhosPermitidos.has(caminho)) {
      shell.showItemInFolder(caminho)
    }
  })

  ipcMain.on('abrirPastaNoExplorer', (_e, pasta: unknown) => {
    if (typeof pasta === 'string' && biblioteca.pastas.includes(pasta)) {
      void shell.openPath(pasta)
    }
  })

  ipcMain.on('iniciarArrasto', (e, caminhos: unknown, cartao: unknown) => {
    if (!Array.isArray(caminhos)) {
      return
    }
    const validos = caminhos.filter((c): c is string => typeof c === 'string' && caminhosPermitidos.has(c))
    if (validos.length === 0) {
      return
    }
    e.sender.startDrag({ file: validos[0], files: validos, icon: iconeDoCartao(cartao) })
  })

  // Áudio gerado na interface (o pad com trecho, tom, volume e pan aplicados). Fica numa pasta
  // permanente, uma subpasta por conteúdo: a DAW pode referenciar o arquivo sem que um
  // arrasto posterior com outros ajustes o sobrescreva.
  ipcMain.on('iniciarArrastoAudio', (e, brutoDados: unknown, brutoNome: unknown, cartao: unknown) => {
    if (!(brutoDados instanceof Uint8Array) || brutoDados.length < 44 || typeof brutoNome !== 'string') {
      return
    }
    const dados = brutoDados
    const nome = brutoNome
    const limpo = nomeArquivoSeguro(nome)
    const arquivo = /\.wav$/i.test(limpo) ? limpo : `${limpo}.wav`
    const hash = createHash('sha1').update(dados).digest('hex').slice(0, 12)
    const pasta = join(app.getPath('userData'), 'pads-arrastados', hash)
    const caminho = join(pasta, arquivo)
    try {
      if (!existsSync(caminho)) {
        mkdirSync(pasta, { recursive: true })
        writeFileSync(caminho, dados)
      }
    } catch (erro) {
      console.error('Não foi possível gravar o áudio do pad para arrastar:', erro)
      return
    }
    e.sender.startDrag({ file: caminho, icon: iconeDoCartao(cartao) })
  })

  ipcMain.handle('exportarArquivos', async (_e, brutoCaminhos: unknown, brutoTitulo: unknown) => {
    const caminhos = v.listaTextos(brutoCaminhos, 'caminhos')
    const titulo = v.textoOpcional(brutoTitulo, 'titulo') || 'Copiar para a pasta'
    if (!janela) {
      return null
    }
    const r = await dialog.showOpenDialog(janela, {
      title: titulo,
      defaultPath: await ultimoLocal('exportar_arquivos'),
      properties: ['openDirectory', 'createDirectory']
    })
    if (r.canceled || r.filePaths.length === 0) {
      return null
    }
    const destino = r.filePaths[0]
    lembrarLocal('exportar_arquivos', destino)
    const usados = new Set<string>()
    for (const c of caminhos.filter((x) => caminhosPermitidos.has(x))) {
      // Samples de pastas diferentes podem ter o mesmo nome: numera em vez de sobrescrever
      const ext = extname(c)
      const base = basename(c, ext)
      let nome = `${base}${ext}`
      for (let n = 2; usados.has(nome.toLowerCase()); n++) {
        nome = `${base} (${n})${ext}`
      }
      usados.add(nome.toLowerCase())
      await fs.copyFile(c, join(destino, nome), fsConstants.COPYFILE_EXCL).catch(async (e: NodeJS.ErrnoException) => {
        if (e.code !== 'EEXIST') {
          throw e
        }
        // Já existe um arquivo com esse nome no destino: nunca sobrescreve
        const livre = join(destino, `${base} (cópia)${ext}`)
        await fs.copyFile(c, livre, fsConstants.COPYFILE_EXCL)
      })
    }
    return destino
  })

  ipcMain.handle('analisarTom', (_e, amostras: unknown, taxa: unknown) =>
    analisarTom(
      v.amostras(amostras),
      v.taxa(taxa),
      join(app.getAppPath(), 'resources', 'keyfinder', 'keyFinderProgressiveWorker.js')
    )
  )
  ipcMain.handle('analisarNota', (_e, amostras: unknown, taxa: unknown, peca: PecaNota) =>
    analisarNota(v.amostras(amostras), v.taxa(taxa), peca === 'kick' || peca === 'snare' ? peca : 'normal')
  )

  ipcMain.handle('analisarBpm', (_e, amostras: unknown, taxa: unknown) => analisarBpm(v.amostras(amostras), v.taxa(taxa)))

  ipcMain.handle('salvarMixdown', async (_e, brutoDados: unknown, brutoNome: unknown) => {
    const dados = v.bytes(brutoDados, 'dados', 44)
    const nomeSugerido = nomeArquivoSeguro(v.textoOpcional(brutoNome, 'nome') || 'mixdown.wav')
    if (!janela) {
      return null
    }
    const dir = await ultimoLocal('salvar_mixdown')
    const r = await dialog.showSaveDialog(janela, {
      title: 'Salvar mixdown',
      defaultPath: dir ? join(dir, nomeSugerido) : nomeSugerido,
      filters: [{ name: 'Áudio WAV', extensions: ['wav'] }]
    })
    if (r.canceled || !r.filePath) {
      return null
    }
    await fs.writeFile(r.filePath, dados)
    lembrarLocal('salvar_mixdown', join(r.filePath, '..'))
    return r.filePath
  })
}

/** Serve arquivos da biblioteca em `sample://arquivo/<caminho codificado>`. */
function registrarProtocolo(): void {
  protocol.handle('sample', (req) => {
    let caminho: string
    try {
      caminho = decodeURIComponent(new URL(req.url).pathname.slice(1))
    } catch {
      return new Response('Endereço inválido', { status: 400 })
    }
    if (!caminhosPermitidos.has(caminho) && !capasPermitidas.has(caminho)) {
      return new Response('Arquivo fora da biblioteca', { status: 403 })
    }
    return net.fetch(pathToFileURL(caminho).toString())
  })
}

/** Tamanhos do modo normal e do compacto (lista estreita para ficar ao lado da DAW). */
const MODO_NORMAL = { minLargura: 1100, minAltura: 640, largura: 1440, altura: 900 }
const MODO_COMPACTO = { minLargura: 320, minAltura: 480, largura: 380, altura: 820 }

/** Modo compacto ligado (gravado em preferencias.json, chave "compacto" da interface). */
let compacto = false
/** Ignora os eventos de resize/move gerados pela própria troca de modo. */
let trocandoModo = false

type Limites = { x?: number; y?: number; width: number; height: number }

/** Tamanho e posição da última sessão no modo pedido, se a janela ainda couber numa das telas. */
function limitesSalvos(modoCompacto: boolean): Limites {
  const j = modoCompacto ? preferencias.janelaCompacta : preferencias.janela
  if (j && janelaVisivel(j, screen.getAllDisplays().map((d) => d.workArea))) {
    return { x: j.x, y: j.y, width: j.largura, height: j.altura }
  }
  if (modoCompacto) {
    // Primeira vez: encostada à direita da tela onde a janela está, quase na altura toda
    const area = (janela ? screen.getDisplayMatching(janela.getBounds()) : screen.getPrimaryDisplay()).workArea
    const altura = Math.min(area.height - 32, Math.max(MODO_COMPACTO.minAltura, 900))
    return {
      x: area.x + area.width - MODO_COMPACTO.largura - 16,
      y: area.y + Math.round((area.height - altura) / 2),
      width: MODO_COMPACTO.largura,
      height: altura
    }
  }
  return { width: j?.largura ?? MODO_NORMAL.largura, height: j?.altura ?? MODO_NORMAL.altura }
}

/** Grava posição, tamanho (do estado normal) e se está maximizada, no modo atual. */
function gravarLimites(w: BrowserWindow): void {
  if (w.isDestroyed() || w.isMinimized() || w.isFullScreen() || trocandoModo) {
    return
  }
  const b = w.getNormalBounds()
  const estado = { x: b.x, y: b.y, largura: b.width, altura: b.height, maximizada: w.isMaximized() }
  if (compacto) {
    preferencias.salvarJanelaCompacta({ ...estado, maximizada: false })
  } else {
    preferencias.salvarJanela(estado)
  }
}

/** Grava posição e tamanho a cada mudança e ao fechar. */
function lembrarJanela(w: BrowserWindow): void {
  let espera: ReturnType<typeof setTimeout> | undefined
  const gravar = (): void => {
    clearTimeout(espera)
    gravarLimites(w)
  }
  const agendar = (): void => {
    clearTimeout(espera)
    espera = setTimeout(gravar, 400)
  }
  w.on('resize', agendar)
  w.on('move', agendar)
  w.on('maximize', gravar)
  w.on('unmaximize', gravar)
  w.on('close', gravar)
}

/** Limites mínimos e botão maximizar conforme o modo. */
function aplicarRestricoes(w: BrowserWindow, modoCompacto: boolean): void {
  const m = modoCompacto ? MODO_COMPACTO : MODO_NORMAL
  w.setMinimumSize(m.minLargura, m.minAltura)
  w.setMaximizable(!modoCompacto)
  w.setFullScreenable(!modoCompacto)
}

/** Alterna entre a janela normal e a compacta, guardando o tamanho de cada uma. */
function definirCompacto(novo: boolean): boolean {
  const w = janela
  if (!w || w.isDestroyed() || novo === compacto) {
    return compacto
  }
  gravarLimites(w)
  trocandoModo = true
  if (w.isFullScreen()) {
    w.setFullScreen(false)
  }
  if (w.isMaximized()) {
    w.unmaximize()
  }
  compacto = novo
  preferencias.salvarInterface('compacto', novo)
  aplicarRestricoes(w, novo)
  const l = limitesSalvos(novo)
  if (l.x === undefined || l.y === undefined) {
    // Sem posição salva: mantém o centro da janela atual
    const atual = w.getBounds()
    l.x = Math.round(atual.x + (atual.width - l.width) / 2)
    l.y = Math.max(atual.y, 0)
  }
  w.setBounds({ x: l.x, y: l.y, width: l.width, height: l.height }, false)
  if (!novo && preferencias.janela?.maximizada) {
    w.maximize()
  }
  setTimeout(() => {
    trocandoModo = false
  }, 600)
  return compacto
}

function criarJanela(): void {
  const cores = CORES_TEMA[preferencias.interface.tema === 'escuro' ? 'escuro' : 'claro']
  compacto = preferencias.interface.compacto === true
  const modo = compacto ? MODO_COMPACTO : MODO_NORMAL
  janela = new BrowserWindow({
    ...limitesSalvos(compacto),
    minWidth: modo.minLargura,
    minHeight: modo.minAltura,
    maximizable: !compacto,
    fullscreenable: !compacto,
    // Mostrada já na criação: o fundo branco evita o "flash" e não dependemos do
    // evento ready-to-show, que nem sempre dispara
    show: true,
    title: 'SampleDeck',
    icon: ICONE,
    backgroundColor: cores.fundo,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: cores.fundo, symbolColor: cores.simbolo, height: 52 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true
    }
  })
  if (!compacto && preferencias.janela?.maximizada) {
    janela.maximize()
  }
  lembrarJanela(janela)
  // Links externos abrem no navegador padrão, nunca dentro do app
  janela.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  const captura = process.env.SAMPLEDECK_CAPTURA
  if (captura) {
    janela.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        const img = await janela?.webContents.capturePage()
        if (img) {
          writeFileSync(captura, img.toPNG())
        }
        app.quit()
      }, Number(process.env.SAMPLEDECK_ESPERA ?? 3000))
    })
  }

  if (process.env.ELECTRON_RENDERER_URL) {
    void janela.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void janela.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Duas instâncias com a mesma pasta de dados gravariam por cima uma da outra (biblioteca.json):
// a segunda só traz a primeira para a frente. (O bloqueio é por pasta de dados, então a demonstração
// com SAMPLEDECK_DADOS própria abre normalmente ao lado do app real.)
const temTrava = app.requestSingleInstanceLock()
if (!temTrava) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (janela) {
      if (janela.isMinimized()) {
        janela.restore()
      }
      janela.focus()
    }
  })
}

// Em desenvolvimento os módulos vêm do servidor do Vite: o cache HTTP em disco só atrapalha e, se
// corromper (duas instâncias abertas ao mesmo tempo, por exemplo), a janela abre em branco.
if (process.env.ELECTRON_RENDERER_URL) {
  app.commandLine.appendSwitch('disable-http-cache')
}

if (temTrava) {
  app.whenReady().then(() => {
    armazenamento = new ArmazenamentoBiblioteca(join(app.getPath('userData'), 'biblioteca.json'), undefined, (e) =>
      console.error('Não foi possível gravar a biblioteca:', e)
    )
    preferencias = new ArmazenamentoPreferencias(join(app.getPath('userData'), 'preferencias.json'))
    biblioteca = armazenamento.carregar()
    caminhosPermitidos = new Set(biblioteca.samples.map((s) => s.caminho))
    registrarProtocolo()
    registrarIpc()
    criarJanela()
  })
}

// Antes de sair, espera a gravação pendente da biblioteca (as alterações são agrupadas)
let saindo = false
app.on('before-quit', (e) => {
  if (saindo || !armazenamento) {
    return
  }
  e.preventDefault()
  saindo = true
  armazenamento
    .esvaziar()
    .catch((erro: unknown) => console.error('Não foi possível gravar a biblioteca ao sair:', erro))
    .finally(() => app.quit())
})

app.on('will-quit', () => {
  preferencias?.descarregar()
})

app.on('window-all-closed', () => {
  app.quit()
})
