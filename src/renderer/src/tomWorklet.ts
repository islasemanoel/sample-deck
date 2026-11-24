/**
 * AudioWorklet da pré-escuta: toca um áudio com o tom ajustável em tempo real
 * (sem mudar a duração) e o andamento ajustável (sem mudar o tom). Recebe o áudio nas
 * opções do nó e mensagens pela porta: `{ tipo: 'tom', semitons }`,
 * `{ tipo: 'velocidade', valor }`, `{ tipo: 'repetir', valor }`, `{ tipo: 'parar' }`.
 * Avisa `{ tipo: 'fim' }` quando o áudio termina sozinho.
 */
import { LeitorComTom } from '@shared/pitch'

// Tipos mínimos do escopo global do AudioWorklet (não fazem parte da lib DOM).
declare class AudioWorkletProcessor {
  readonly port: MessagePort
  constructor(opcoes?: unknown)
}
declare function registerProcessor(nome: string, classe: unknown): void
declare const currentTime: number

export interface OpcoesTom {
  canais: Float32Array[]
  inicio: number
  repetir: boolean
  semitons: number
  /** Razão de andamento (1 = original). */
  velocidade: number
}

export type MensagemTom =
  | { tipo: 'tom'; semitons: number }
  | { tipo: 'velocidade'; valor: number }
  | { tipo: 'repetir'; valor: boolean }
  | { tipo: 'parar' }

class ProcessadorTom extends AudioWorkletProcessor {
  private readonly leitor: LeitorComTom
  private ativo = true

  constructor(opcoes: { processorOptions: OpcoesTom }) {
    super()
    const o = opcoes.processorOptions
    this.leitor = new LeitorComTom(o.canais, o.inicio, o.repetir, o.semitons, o.velocidade)
    this.port.onmessage = (e: MessageEvent<MensagemTom>) => {
      const m = e.data
      if (m.tipo === 'tom') {
        this.leitor.definirTom(m.semitons)
      } else if (m.tipo === 'velocidade') {
        this.leitor.definirVelocidade(m.valor)
      } else if (m.tipo === 'repetir') {
        this.leitor.definirRepetir(m.valor)
      } else {
        this.ativo = false
      }
    }
  }

  process(_entradas: Float32Array[][], saidas: Float32Array[][]): boolean {
    const saida = saidas[0]
    if (!this.ativo || !saida || saida.length === 0) {
      return this.ativo
    }
    if (!this.leitor.ler(saida, saida[0].length)) {
      this.ativo = false
      this.port.postMessage({ tipo: 'fim' })
    }
    return this.ativo
  }
}

registerProcessor('sampledeck-tom', ProcessadorTom)

// ---------- Vozes dos pads ----------

/**
 * Áudio dos pads, compartilhado por todas as vozes (o escopo do worklet é um só por
 * contexto). Cada pad envia o áudio só na primeira voz após carregar um sample; as
 * seguintes mandam só a chave, para o disparo não copiar o áudio inteiro a cada toque.
 */
const bancoPads = new Map<number, { versao: number; canais: Float32Array[] }>()

export interface OpcoesVozPad {
  chave: number
  versao: number
  /** Presente só quando o áudio desta versão ainda não foi enviado. */
  canais?: Float32Array[]
  /** Trecho tocado, em amostras do arquivo. */
  inicio: number
  fim: number
  /** Amostras do trecho puladas no começo (retomar de um ponto, como ao inverter o pad tocando). */
  desde?: number
  repetir: boolean
  semitons: number
}

export type MensagemVozPad =
  | { tipo: 'tom'; semitons: number }
  | { tipo: 'repetir'; valor: boolean }
  | { tipo: 'trecho'; inicio: number; fim: number }
  /** Para no instante `quando` (tempo do contexto), depois do fade feito no ganho. */
  | { tipo: 'parar'; quando: number }

/** Uma voz de pad: toca o trecho com o tom ajustável sem mudar a duração. */
class ProcessadorVozPad extends AudioWorkletProcessor {
  private canais: Float32Array[]
  private leitor: LeitorComTom
  private inicio: number
  private fim: number
  private repetir: boolean
  private semitons: number
  /** Posição (no trecho) onde o leitor atual começou e amostras lidas desde então. */
  private origem = 0
  private lidas = 0
  private pararEm = Infinity
  private ativo = true

  constructor(opcoes: { processorOptions: OpcoesVozPad }) {
    super()
    const o = opcoes.processorOptions
    if (o.canais) {
      bancoPads.set(o.chave, { versao: o.versao, canais: o.canais })
    }
    const banco = bancoPads.get(o.chave)
    this.canais = banco && banco.versao === o.versao ? banco.canais : []
    this.inicio = o.inicio
    this.fim = o.fim
    this.repetir = o.repetir
    this.semitons = o.semitons
    this.leitor = this.criarLeitor(Math.max(0, Math.min(o.desde ?? 0, Math.max(0, o.fim - o.inicio - 1))))
    this.port.onmessage = (e: MessageEvent<MensagemVozPad>) => {
      const m = e.data
      if (m.tipo === 'tom') {
        this.semitons = m.semitons
        this.leitor.definirTom(m.semitons)
      } else if (m.tipo === 'repetir') {
        this.repetir = m.valor
        this.leitor.definirRepetir(m.valor)
      } else if (m.tipo === 'trecho') {
        this.mudarTrecho(m.inicio, m.fim)
      } else {
        this.pararEm = m.quando
      }
    }
  }

  private criarLeitor(origem: number): LeitorComTom {
    this.origem = origem
    this.lidas = 0
    const trecho = this.canais.map((c) => c.subarray(this.inicio, this.fim))
    return new LeitorComTom(trecho.length > 0 ? trecho : [new Float32Array(0)], origem, this.repetir, this.semitons)
  }

  /** Troca o trecho no meio da reprodução, seguindo do mesmo ponto do arquivo. */
  private mudarTrecho(inicio: number, fim: number): void {
    const tamanho = this.fim - this.inicio
    let rel = this.origem + this.lidas
    if (this.repetir && tamanho > 0) {
      rel %= tamanho
    }
    const pos = this.inicio + rel
    this.inicio = inicio
    this.fim = fim
    if (pos >= fim && !this.repetir) {
      this.ativo = false
      return
    }
    this.leitor = this.criarLeitor(pos >= inicio && pos < fim ? pos - inicio : 0)
  }

  process(_entradas: Float32Array[][], saidas: Float32Array[][]): boolean {
    const saida = saidas[0]
    if (this.ativo && currentTime >= this.pararEm) {
      this.ativo = false
    }
    if (!this.ativo || !saida || saida.length === 0) {
      if (!this.ativo) {
        this.port.postMessage({ tipo: 'fim' })
      }
      return false
    }
    const n = saida[0].length
    const continua = this.leitor.ler(saida, n)
    this.lidas += n
    if (!continua) {
      this.ativo = false
      this.port.postMessage({ tipo: 'fim' })
      return false
    }
    return true
  }
}

registerProcessor('sampledeck-pad', ProcessadorVozPad)
