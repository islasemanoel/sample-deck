import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { ApiSampleDeck, LoteVarredura } from '@shared/api'
import type { ResultadoCopiaCapa } from '@shared/capa'
import type { ProgressoVarredura } from '@shared/tipos'

/**
 * Expõe à interface somente as operações da ApiSampleDeck (window.api),
 * sem dar acesso direto ao Node ou ao ipcRenderer.
 */
const api: ApiSampleDeck = {
  config: () => ipcRenderer.invoke('config'),
  preferenciasIniciais: ipcRenderer.sendSync('lerPreferencias') as Record<string, unknown>,
  salvarPreferencia: (chave, valor) => ipcRenderer.send('salvarPreferencia', chave, valor),
  definirTema: (tema) => ipcRenderer.send('definirTema', tema),
  definirCompacto: (compacto) => ipcRenderer.invoke('definirCompacto', compacto),
  obterBiblioteca: () => ipcRenderer.invoke('obterBiblioteca'),
  adicionarPasta: () => ipcRenderer.invoke('adicionarPasta'),
  reescanear: (pasta) => ipcRenderer.invoke('reescanear', pasta),
  removerPasta: (pasta) => ipcRenderer.invoke('removerPasta', pasta),
  capaDaPasta: (pasta) => ipcRenderer.invoke('capaDaPasta', pasta),
  buscarCapasOnline: (pasta, termo) => ipcRenderer.invoke('buscarCapasOnline', pasta, termo),
  salvarCapaOnline: (pasta, url) => ipcRenderer.invoke('salvarCapaOnline', pasta, url),
  escolherCapaArquivo: (pasta) => ipcRenderer.invoke('escolherCapaArquivo', pasta),
  removerCapa: (pasta) => ipcRenderer.invoke('removerCapa', pasta),
  abrirPaginaLoja: (url) => ipcRenderer.send('abrirPaginaLoja', url),
  favoritar: (ids, valor) => ipcRenderer.invoke('favoritar', ids, valor),
  criarColecao: (nome, ids) => ipcRenderer.invoke('criarColecao', nome, ids),
  renomearColecao: (id, nome, descricao) => ipcRenderer.invoke('renomearColecao', id, nome, descricao),
  excluirColecao: (id) => ipcRenderer.invoke('excluirColecao', id),
  adicionarAColecao: (id, ids) => ipcRenderer.invoke('adicionarAColecao', id, ids),
  removerDaColecao: (id, ids) => ipcRenderer.invoke('removerDaColecao', id, ids),
  mostrarNaPasta: (caminho) => ipcRenderer.send('mostrarNaPasta', caminho),
  abrirPastaNoExplorer: (pasta) => ipcRenderer.send('abrirPastaNoExplorer', pasta),
  prepararArrasto: (html, x, y) => ipcRenderer.send('prepararArrasto', html, x, y),
  cancelarArrasto: () => ipcRenderer.send('cancelarArrasto'),
  mostrarArrasto: () => ipcRenderer.send('mostrarArrasto'),
  aoArrastoExternoVisivel: (fn) => {
    const ouvinte = (): void => fn()
    ipcRenderer.on('arrastoExternoVisivel', ouvinte)
    return () => ipcRenderer.removeListener('arrastoExternoVisivel', ouvinte)
  },
  esconderArrasto: () => ipcRenderer.send('esconderArrasto'),
  iniciarArrasto: (caminhos, cartao) => ipcRenderer.send('iniciarArrasto', caminhos, cartao),
  iniciarArrastoAudio: (dados, nome, cartao, original) => ipcRenderer.send('iniciarArrastoAudio', dados, nome, cartao, original),
  escolherPastaAudioEditado: () => ipcRenderer.invoke('escolherPastaAudioEditado'),
  exportarArquivos: (caminhos, titulo) => ipcRenderer.invoke('exportarArquivos', caminhos, titulo),
  salvarMixdown: (dados, nome) => ipcRenderer.invoke('salvarMixdown', dados, nome),
  aoProgredir: (fn) => {
    const ouvinte = (_e: IpcRendererEvent, p: ProgressoVarredura): void => fn(p)
    ipcRenderer.on('progresso', ouvinte)
    return () => ipcRenderer.removeListener('progresso', ouvinte)
  },
  aoLoteVarredura: (fn) => {
    const ouvinte = (_e: IpcRendererEvent, lote: LoteVarredura): void => fn(lote)
    ipcRenderer.on('loteVarredura', ouvinte)
    return () => ipcRenderer.removeListener('loteVarredura', ouvinte)
  },
  aoCapaAutomatica: (fn) => {
    const ouvinte = (_e: IpcRendererEvent, c: { pasta: string; titulo: string; loja: string; copia: ResultadoCopiaCapa | null }): void => fn(c)
    ipcRenderer.on('capaAutomatica', ouvinte)
    return () => ipcRenderer.removeListener('capaAutomatica', ouvinte)
  },
  pararVarredura: () => ipcRenderer.send('pararVarredura'),
  analisarTom: (amostras, taxa) => ipcRenderer.invoke('analisarTom', amostras, taxa),
  analisarNota: (amostras, taxa, peca) => ipcRenderer.invoke('analisarNota', amostras, taxa, peca),
  analisarBpm: (amostras, taxa) => ipcRenderer.invoke('analisarBpm', amostras, taxa)
}

contextBridge.exposeInMainWorld('api', api)
