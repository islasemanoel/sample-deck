import { decodificarAiff, ehAiff } from '@shared/aiff'
import { type ConfigPad, trechoDoPad } from '@shared/pads'
import { normalizarTom } from '@shared/pitch'
import { modoDeAnalise, pecaDoSample } from '@shared/analiseTom'
import {
  type AjustesAudio,
  type SituacaoTom,
  ehPercussaoSemTom,
  precisaDetectarTom,
  tomDaNota,
  tomDoResultado,
  transposicaoParaProjeto,
  velocidadeParaProjeto
} from '@shared/projeto'
import type { Sample } from '@shared/tipos'
import { guardarTomDetectado, tomDetectado } from './tonsDetectados'
import urlWorkletTom from './tomWorklet?worker&url'
import type { MensagemTom, MensagemVozPad, OpcoesTom, OpcoesVozPad } from './tomWorklet'

/** URL interna que o processo principal serve a partir do arquivo local. */
export function urlDoSample(caminho: string): string {
  return `sample://arquivo/${encodeURIComponent(caminho)}`
}

interface Preview {
  sample: Sample
  /** Áudio original (usado para desenhar a forma de onda). */
  buffer: AudioBuffer
  /** Nó com tom ajustável em tempo real ou, se o worklet não carregou, nó simples. */
  fonte: AudioWorkletNode | AudioBufferSourceNode
  /**
   * Referência para calcular a posição: no instante `tempo` do contexto, o som estava em
   * `posicao` segundos do arquivo (na linha do tempo invertida, no modo reverso),
   * avançando `velocidade` segundos do arquivo por segundo.
   */
  tempo: number
  posicao: number
  velocidade: number
}

const LIMITE_CACHE = 60
/** Teto de memória dos áudios decodificados (Float32): 60 loops longos estourariam a memória. */
const LIMITE_BYTES_CACHE = 512 * 1024 * 1024
/** Áudio analisado na detecção automática de tom (mesmos limites da janela "Detectar tom"). */
const SEGUNDOS_TOM = 30
const SEGUNDOS_NOTA = 4
/** Quanto a pré-escuta espera pela detecção de tom antes de tocar (depois, ajusta no meio). */
const ESPERA_DETECCAO = 1500

interface VozPad {
  /**
   * Nó com tom ajustável sem mudar a duração ou, se o worklet não carregou, nó simples
   * (sem mudança de tom).
   */
  fonte: AudioWorkletNode | AudioBufferSourceNode
  ganho: GainNode
  pan: StereoPannerNode
  /** Referência para calcular a posição: no instante `tempo` do contexto, o som estava em `posicao` do arquivo. */
  tempo: number
  posicao: number
  /** Trecho tocado (segundos do arquivo). */
  inicio: number
  fim: number
  loop: boolean
  /** Duração e taxa do áudio do pad. */
  duracao: number
  taxa: number
}

/**
 * Reprodução de áudio com Web Audio: pré-escuta de um sample por vez,
 * pads (disparo imediato, estilo MPC).
 */
export class MotorAudio {
  private ctx = new AudioContext({ latencyHint: 'interactive' })
  private saida = this.ctx.createGain()
  private cache = new Map<string, Promise<AudioBuffer>>()
  /** Os mesmos áudios do cache, já decodificados (para uso síncrono, como no arrasto). */
  private prontos = new Map<string, AudioBuffer>()
  /** Carrega o processador de tom em tempo real; false se não for possível. */
  private worklet: Promise<boolean> = this.ctx.audioWorklet
    .addModule(urlWorkletTom)
    .then(() => (this.tomPronto = true))
    .catch((e: unknown) => {
      console.error('Não foi possível carregar o processador de tom:', e)
      return false
    })
  /** Tom da pré-escuta em semitons (com precisão de cent). */
  private tom = 0
  /** Tom e BPM do projeto: a pré-escuta transpõe cada sample e estica os loops para eles. */
  private tomProjeto: string | null = null
  private bpmProjeto: number | null = null
  /** Último sample cujo tom foi ajustado ao do projeto (o ajuste manual dele é mantido ao buscar). */
  private ultimoAjustado: string | null = null
  /** Último valor que o próprio motor pôs no knob (se o knob ainda está nele, não foi mexido à mão). */
  private tomAuto: number | null = null
  /** Detecções de tom em andamento, por id do sample. */
  private deteccoes = new Map<string, Promise<void>>()
  private detectando = new Set<string>()
  /** Tocar a pré-escuta de trás para frente. */
  private reverso = false
  /** Cópia invertida do último áudio tocado de trás para frente. */
  private invertido: { original: AudioBuffer; buffer: AudioBuffer } | null = null
  /** Incrementado a cada pedido de reprodução/parada; invalida pedidos pendentes. */
  private versao = 0
  private preview: Preview | null = null
  private buffersPads = new Map<number, AudioBuffer>()
  /** Versão do áudio de cada pad (muda a cada sample carregado) e a última já enviada ao worklet. */
  private versoesPads = new Map<number, number>()
  private versoesEnviadas = new Map<number, number>()
  private proximaVersao = 1
  /** True quando o processador de tom carregou (os pads mudam o tom sem mudar a duração). */
  private tomPronto = false
  private idsPads = new Map<number, string | null>()
  private vozesPads = new Map<number, VozPad>()
  private ouvintes = new Set<() => void>()
  /** Repetir a pré-escuta ao terminar. */
  repetir = false
  /** Chamado quando a pré-escuta termina sozinha (para avançar na lista, por exemplo). */
  aoTerminar: (() => void) | null = null

  constructor() {
    this.saida.connect(this.ctx.destination)
  }

  /** Avisa quando muda o que está tocando. Retorna função para cancelar. */
  observar(fn: () => void): () => void {
    this.ouvintes.add(fn)
    return () => this.ouvintes.delete(fn)
  }

  private avisar(): void {
    this.ouvintes.forEach((fn) => fn())
  }

  /** Volume geral de 0 a 1. */
  definirVolume(v: number): void {
    this.saida.gain.value = v
  }

  /** Tom atual da pré-escuta, em semitons. */
  tomAtual(): number {
    return this.tom
  }

  /**
   * Muda o tom da pré-escuta sem alterar a duração. Vale na hora, inclusive no meio da
   * reprodução (o áudio segue do ponto em que está, já no novo tom).
   */
  definirTom(semitons: number): void {
    this.tom = normalizarTom(semitons)
    this.enviar({ tipo: 'tom', semitons: this.tom })
  }

  /** Tom e BPM do projeto em uso (null = desligado). */
  projeto(): { tom: string | null; bpm: number | null } {
    return { tom: this.tomProjeto, bpm: this.bpmProjeto }
  }

  /**
   * Define o tom e o BPM do projeto. Com tom, cada sample que começa a tocar tem o knob de
   * tom ajustado sozinho para levá-lo ao tom do projeto; com BPM, os loops tocam nesse
   * andamento. Vale também para o sample que já está tocando.
   */
  definirProjeto(tom: string | null, bpm: number | null): void {
    if (tom === this.tomProjeto && bpm === this.bpmProjeto) {
      return
    }
    const mudouTom = tom !== this.tomProjeto
    this.tomProjeto = tom
    this.bpmProjeto = bpm
    const p = this.preview
    if (p) {
      if (mudouTom) {
        this.ajustarTomAutomatico(p.sample)
        this.ultimoAjustado = p.sample.id
        this.enviar({ tipo: 'tom', semitons: this.tom })
        if (tom && this.precisaAnalisar(p.sample)) {
          void this.detectarTom(p.sample)
        }
      }
      this.aplicarVelocidade(p, this.velocidadePara(p.sample))
    } else if (mudouTom) {
      this.ultimoAjustado = null
    }
    this.avisar()
  }

  /** Tom conhecido do sample: o do nome do arquivo ou o detectado pelo áudio. */
  private tomConhecido(sample: Sample): { tom: string; detectado: boolean } | null {
    if (sample.tom) {
      return { tom: sample.tom, detectado: false }
    }
    const d = ehPercussaoSemTom(sample) ? null : tomDetectado(sample)
    return d ? { tom: d, detectado: true } : null
  }

  /**
   * Semitons que levam o sample ao tom do projeto; 0 quando o tom dele é desconhecido ou é
   * percussão (sem ajuste). null sem tom do projeto.
   */
  tomAutomatico(sample: Sample): number | null {
    if (!this.tomProjeto) {
      return null
    }
    return transposicaoParaProjeto(this.tomConhecido(sample)?.tom ?? null, this.tomProjeto) ?? 0
  }

  /** Põe o knob na transposição automática do sample (lembrando o valor, para saber se foi mexido). */
  private ajustarTomAutomatico(sample: Sample): void {
    this.tom = normalizarTom(this.tomAutomatico(sample) ?? 0)
    this.tomAuto = this.tom
  }

  /** Situação do tom do sample diante do projeto (para o aviso no player). */
  situacaoTom(sample: Sample): SituacaoTom {
    if (!this.tomProjeto) {
      return { tipo: 'desligado' }
    }
    const t = this.tomConhecido(sample)
    if (t) {
      return { tipo: 'conhecido', ...t }
    }
    if (ehPercussaoSemTom(sample)) {
      return { tipo: 'percussao' }
    }
    if (this.detectando.has(sample.id)) {
      return { tipo: 'detectando' }
    }
    return tomDetectado(sample) === null ? { tipo: 'desconhecido' } : { tipo: 'pendente' }
  }

  /** Sample sem tom conhecido que ainda não foi analisado. */
  private precisaAnalisar(sample: Sample): boolean {
    return precisaDetectarTom(sample) && tomDetectado(sample) === undefined
  }

  /**
   * Detecta o tom pelo áudio (uma vez por arquivo; o resultado fica guardado). One-shots curtos
   * usam a análise de nota; o resto, a de tom. Ao terminar, se o sample ainda estiver tocando
   * com o knob na transposição automática, aplica a nova transposição.
   */
  detectarTom(sample: Sample): Promise<void> {
    const existente = this.deteccoes.get(sample.id)
    if (existente) {
      return existente
    }
    this.detectando.add(sample.id)
    const p = (async () => {
      let tom: string | null = null
      try {
        if (modoDeAnalise(sample) === 'nota') {
          const { amostras, taxa } = await this.amostrasMono(sample, SEGUNDOS_NOTA)
          tom = tomDaNota(await window.api.analisarNota(amostras, taxa, pecaDoSample(sample)))
        } else {
          const { amostras, taxa } = await this.amostrasMono(sample, SEGUNDOS_TOM)
          tom = tomDoResultado(await window.api.analisarTom(amostras, taxa))
        }
      } catch (e) {
        console.error('Não foi possível detectar o tom:', e)
      }
      guardarTomDetectado(sample, tom)
    })().finally(() => {
      this.detectando.delete(sample.id)
      this.deteccoes.delete(sample.id)
      const atual = this.preview
      if (atual?.sample.id === sample.id && this.tomProjeto && this.tom === this.tomAuto) {
        this.ajustarTomAutomatico(sample)
        this.enviar({ tipo: 'tom', semitons: this.tom })
      }
      this.avisar()
    })
    this.deteccoes.set(sample.id, p)
    this.avisar()
    return p
  }

  /** Razão de andamento do sample no BPM do projeto (só loops com BPM conhecido; senão 1). */
  velocidadePara(sample: Sample): number {
    if (!this.bpmProjeto || sample.tipo !== 'loop') {
      return 1
    }
    return velocidadeParaProjeto(sample.bpm, this.bpmProjeto) ?? 1
  }

  /**
   * Ajustes com que o sample soa (ou soaria) na pré-escuta: o tom do knob se for o último
   * sample tocado (ou sem tom do projeto, quando o knob vale para todos); senão, a
   * transposição automática para o tom do projeto.
   */
  ajustesPara(sample: Sample): AjustesAudio {
    const atual = this.ultimoAjustado === sample.id
    const semitons = atual || !this.tomProjeto ? this.tom : (this.tomAutomatico(sample) ?? 0)
    return { semitons, velocidade: this.velocidadePara(sample), reverso: this.reverso }
  }

  /** Áudio já decodificado de um sample, sem esperar (null se ainda não carregou). */
  bufferPronto(sample: Sample): AudioBuffer | null {
    return this.prontos.get(sample.id) ?? null
  }

  reversoAtivo(): boolean {
    return this.reverso
  }

  /**
   * Liga/desliga a reprodução de trás para frente. Se algo estiver tocando, continua do
   * mesmo ponto do som, agora no outro sentido.
   */
  definirReverso(v: boolean): void {
    if (v === this.reverso) {
      return
    }
    this.reverso = v
    const p = this.preview
    if (p) {
      const pos = this.posicao()
      void this.tocar(p.sample, Math.max(0, p.buffer.duration - pos))
    } else {
      this.avisar()
    }
  }

  /** Muda o andamento da pré-escuta em andamento, mantendo a posição. */
  private aplicarVelocidade(p: Preview, velocidade: number): void {
    if (!(p.fonte instanceof AudioWorkletNode) || velocidade === p.velocidade) {
      return
    }
    p.posicao = this.posicao()
    p.tempo = this.ctx.currentTime
    p.velocidade = velocidade
    this.enviar({ tipo: 'velocidade', valor: velocidade })
  }

  /** Áudio invertido no tempo (com cache do último). */
  private inverter(b: AudioBuffer): AudioBuffer {
    if (this.invertido?.original === b) {
      return this.invertido.buffer
    }
    const r = this.ctx.createBuffer(b.numberOfChannels, b.length, b.sampleRate)
    for (let c = 0; c < b.numberOfChannels; c++) {
      r.copyToChannel(b.getChannelData(c).slice().reverse(), c)
    }
    this.invertido = { original: b, buffer: r }
    return r
  }

  /** Envia uma mensagem ao processador de tom da pré-escuta atual, se houver. */
  private enviar(m: MensagemTom): void {
    const f = this.preview?.fonte
    if (f instanceof AudioWorkletNode) {
      f.port.postMessage(m)
    }
  }

  /** Decodifica (com cache) o áudio de um sample. */
  carregar(sample: Sample): Promise<AudioBuffer> {
    const existente = this.cache.get(sample.id)
    if (existente) {
      this.cache.delete(sample.id)
      this.cache.set(sample.id, existente) // marca como usado recentemente
      return existente
    }
    const p = fetch(urlDoSample(sample.caminho))
      .then((r) => {
        if (!r.ok) {
          throw new Error(`Não foi possível ler o arquivo (${r.status})`)
        }
        return r.arrayBuffer()
      })
      .then((dados) => this.decodificar(dados))
    p.then(
      (b) => {
        if (this.cache.get(sample.id) === p) {
          this.prontos.set(sample.id, b)
          this.enxugarCache()
        }
      },
      () => this.cache.delete(sample.id)
    )
    this.cache.set(sample.id, p)
    this.enxugarCache()
    return p
  }

  /** Descarta os áudios menos usados até caber no limite de quantidade e de memória (mantém o mais recente). */
  private enxugarCache(): void {
    const bytes = (): number => {
      let total = 0
      for (const b of this.prontos.values()) {
        total += b.length * b.numberOfChannels * 4
      }
      return total
    }
    let usados = this.prontos.size > 0 ? bytes() : 0
    while (this.cache.size > 1 && (this.cache.size > LIMITE_CACHE || usados > LIMITE_BYTES_CACHE)) {
      const velho = this.cache.keys().next().value as string
      const b = this.prontos.get(velho)
      if (b) {
        usados -= b.length * b.numberOfChannels * 4
      }
      this.cache.delete(velho)
      this.prontos.delete(velho)
    }
  }

  /**
   * Decodifica os bytes de um arquivo. AIFF é lido pelo decodificador próprio,
   * porque o Chromium não suporta esse formato em `decodeAudioData`.
   */
  private decodificar(dados: ArrayBuffer): Promise<AudioBuffer> {
    if (!ehAiff(dados)) {
      return this.ctx.decodeAudioData(dados)
    }
    const { canais, taxa } = decodificarAiff(dados)
    const buffer = this.ctx.createBuffer(canais.length, Math.max(1, canais[0].length), taxa)
    canais.forEach((c, i) => buffer.copyToChannel(c, i))
    return Promise.resolve(buffer)
  }

  /**
   * Áudio mono (média dos canais) de um sample, decodificado pelo mesmo caminho da pré-escuta
   * (WAV, MP3, FLAC, OGG, M4A, AIFF), limitado aos primeiros `maxSegundos`.
   */
  async amostrasMono(sample: Sample, maxSegundos: number): Promise<{ amostras: Float32Array; taxa: number; duracao: number }> {
    const b = await this.carregar(sample)
    const n = Math.min(b.length, Math.floor(maxSegundos * b.sampleRate))
    const mono = new Float32Array(n)
    for (let c = 0; c < b.numberOfChannels; c++) {
      const canal = b.getChannelData(c)
      for (let i = 0; i < n; i++) {
        mono[i] += canal[i] / b.numberOfChannels
      }
    }
    return { amostras: mono, taxa: b.sampleRate, duracao: b.duration }
  }

  /** Tom de referência em andamento (osciladores e ganho), para poder parar. */
  private referencia: { osc: OscillatorNode[]; ganho: GainNode } | null = null

  /**
   * Toca um tom de referência (uma nota ou um acorde) por cima do que estiver tocando,
   * com ataque e soltura suaves.
   */
  async tocarReferencia(frequencias: number[], duracao: number): Promise<void> {
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume()
    }
    this.pararReferencia()
    const t = this.ctx.currentTime
    const ganho = this.ctx.createGain()
    const pico = 0.35 / Math.max(1, frequencias.length)
    ganho.gain.setValueAtTime(0, t)
    ganho.gain.linearRampToValueAtTime(pico, t + 0.02)
    ganho.gain.setValueAtTime(pico, t + Math.max(0.05, duracao - 0.3))
    ganho.gain.linearRampToValueAtTime(0, t + duracao)
    ganho.connect(this.saida)
    const osc = frequencias.map((f) => {
      const o = this.ctx.createOscillator()
      o.type = f < 120 ? 'sine' : 'triangle' // graves em seno, para não embolar
      o.frequency.value = f
      o.connect(ganho)
      o.start(t)
      o.stop(t + duracao + 0.05)
      return o
    })
    const atual = { osc, ganho }
    osc[osc.length - 1].onended = () => {
      ganho.disconnect()
      if (this.referencia === atual) {
        this.referencia = null
      }
    }
    this.referencia = atual
  }

  /**
   * Metrônomo por cima do que estiver tocando: um clique por tempo durante `duracao` segundos,
   * com o primeiro tempo de cada compasso (4/4) mais agudo.
   */
  async tocarMetronomo(bpm: number, duracao: number): Promise<void> {
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume()
    }
    this.pararReferencia()
    const t0 = this.ctx.currentTime
    const ganho = this.ctx.createGain()
    ganho.connect(this.saida)
    const osc: OscillatorNode[] = []
    const passo = 60 / bpm
    for (let i = 0; i * passo < duracao; i++) {
      const t = t0 + i * passo
      const o = this.ctx.createOscillator()
      const env = this.ctx.createGain()
      o.type = 'square'
      o.frequency.value = i % 4 === 0 ? 1760 : 1320
      env.gain.setValueAtTime(0, t)
      env.gain.linearRampToValueAtTime(i % 4 === 0 ? 0.22 : 0.14, t + 0.002)
      env.gain.exponentialRampToValueAtTime(0.0001, t + 0.05)
      o.connect(env).connect(ganho)
      o.start(t)
      o.stop(t + 0.06)
      osc.push(o)
    }
    const atual = { osc, ganho }
    if (osc.length > 0) {
      osc[osc.length - 1].onended = () => {
        ganho.disconnect()
        if (this.referencia === atual) {
          this.referencia = null
        }
      }
    }
    this.referencia = atual
  }

  pararReferencia(): void {
    const r = this.referencia
    if (!r) {
      return
    }
    this.referencia = null
    const t = this.ctx.currentTime
    r.ganho.gain.cancelScheduledValues(t)
    r.ganho.gain.setTargetAtTime(0, t, 0.02)
    r.osc.forEach((o) => {
      try {
        o.stop(t + 0.1)
      } catch {
        // já parado
      }
    })
  }

  /** Buffer já carregado da pré-escuta atual (para desenhar a forma de onda). */
  bufferAtual(): AudioBuffer | null {
    return this.preview?.buffer ?? null
  }

  sampleAtual(): Sample | null {
    return this.preview?.sample ?? null
  }

  /** Toca um sample a partir de `offset` segundos, interrompendo o anterior. */
  async tocar(sample: Sample, offset = 0): Promise<void> {
    const versao = ++this.versao
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume()
    }
    const [buffer, comTom] = await Promise.all([this.carregar(sample), this.worklet])
    if (versao !== this.versao) {
      return // outro pedido chegou enquanto carregava
    }
    if (this.tomProjeto && this.ultimoAjustado !== sample.id && this.precisaAnalisar(sample)) {
      // Sem tom no nome: detecta antes de tocar (leva ~0,2 s), para não mudar de tom no meio.
      // Se demorar, toca no tom original e ajusta quando a detecção terminar.
      let espera: number | undefined
      await Promise.race([
        this.detectarTom(sample),
        new Promise<void>((r) => (espera = window.setTimeout(r, ESPERA_DETECCAO)))
      ])
      window.clearTimeout(espera)
      if (versao !== this.versao) {
        return
      }
    }
    this.soltarPreview()
    if (this.tomProjeto && this.ultimoAjustado !== sample.id) {
      // Outro sample com tom do projeto: o knob vai sozinho para a transposição dele
      this.ajustarTomAutomatico(sample)
    }
    this.ultimoAjustado = sample.id
    const tocado = this.reverso ? this.inverter(buffer) : buffer
    const off = Math.max(0, Math.min(offset, buffer.duration - 0.01))
    let fonte: AudioWorkletNode | AudioBufferSourceNode
    let velocidade = 1
    if (comTom) {
      velocidade = this.velocidadePara(sample)
      const canais: Float32Array[] = []
      for (let c = 0; c < tocado.numberOfChannels; c++) {
        canais.push(tocado.getChannelData(c))
      }
      const opcoes: OpcoesTom = {
        canais,
        inicio: Math.round(off * buffer.sampleRate),
        repetir: this.repetir,
        semitons: this.tom,
        velocidade
      }
      fonte = new AudioWorkletNode(this.ctx, 'sampledeck-tom', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [buffer.numberOfChannels],
        processorOptions: opcoes
      })
    } else {
      fonte = this.ctx.createBufferSource()
      fonte.buffer = tocado
      fonte.loop = this.repetir
      fonte.start(this.ctx.currentTime, off)
    }
    fonte.connect(this.saida)
    const atual: Preview = { sample, buffer, fonte, tempo: this.ctx.currentTime, posicao: off, velocidade }
    const terminar = (): void => {
      if (this.preview === atual) {
        this.preview = null
        this.avisar()
        this.aoTerminar?.()
      }
    }
    if (fonte instanceof AudioWorkletNode) {
      const no = fonte
      no.port.onmessage = (e: MessageEvent<{ tipo: string }>) => {
        if (e.data.tipo === 'fim') {
          no.disconnect()
          terminar()
        }
      }
    } else {
      fonte.onended = terminar
    }
    this.preview = atual
    this.avisar()
  }

  /** Para a pré-escuta. */
  pararPreview(avisar = true): void {
    this.versao++
    this.soltarPreview()
    if (avisar) {
      this.avisar()
    }
  }

  private soltarPreview(): void {
    const p = this.preview
    if (!p) {
      return
    }
    this.preview = null
    if (p.fonte instanceof AudioWorkletNode) {
      p.fonte.port.postMessage({ tipo: 'parar' } satisfies MensagemTom)
      p.fonte.port.onmessage = null
      p.fonte.disconnect()
    } else {
      try {
        p.fonte.stop()
      } catch {
        // já parada
      }
    }
  }

  /** Posição da pré-escuta em segundos do arquivo (considerando repetição; invertida no modo reverso). */
  posicao(): number {
    const p = this.preview
    if (!p) {
      return 0
    }
    const t = p.posicao + (this.ctx.currentTime - p.tempo) * p.velocidade
    const d = p.buffer.duration
    return this.repetir && d > 0 ? t % d : Math.min(t, d)
  }

  /** Liga/desliga repetição inclusive na pré-escuta em andamento. */
  definirRepetir(v: boolean): void {
    this.repetir = v
    const f = this.preview?.fonte
    if (f instanceof AudioBufferSourceNode) {
      f.loop = v
    } else {
      this.enviar({ tipo: 'repetir', valor: v })
    }
  }

  /** Decodifica o sample e o deixa pronto para disparo imediato no pad (só recarrega se o sample mudou). */
  async prepararPad(indice: number, sample: Sample | null): Promise<void> {
    if ((this.idsPads.get(indice) ?? null) === (sample?.id ?? null)) {
      return
    }
    this.pararPad(indice)
    this.idsPads.set(indice, sample?.id ?? null)
    this.buffersPads.delete(indice)
    if (!sample) {
      return
    }
    // Espera também o worklet, para o primeiro disparo já sair com o tom certo
    const [buffer] = await Promise.all([this.carregar(sample), this.worklet])
    if (this.idsPads.get(indice) === sample.id) {
      this.buffersPads.set(indice, buffer)
      this.versoesPads.set(indice, this.proximaVersao++)
    }
  }

  /** Áudio já decodificado de um pad (para o editor de trecho). */
  bufferPad(indice: number): AudioBuffer | null {
    return this.buffersPads.get(indice) ?? null
  }

  /** Dispara o pad do início do trecho (reinicia se já estiver tocando). Retorna false se ainda não está pronto. */
  dispararPad(indice: number, cfg: ConfigPad): boolean {
    const buffer = this.buffersPads.get(indice)
    if (!buffer) {
      return false
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume()
    }
    this.pararPad(indice, 0.005)
    const { inicio, fim } = trechoDoPad(cfg, buffer.duration, buffer.sampleRate)
    const loop = cfg.modo === 'loop'
    const agora = this.ctx.currentTime
    let fonte: AudioWorkletNode | AudioBufferSourceNode
    if (this.tomPronto) {
      // Tom sem mudar a duração (phase vocoder no worklet), como na pré-escuta
      const versao = this.versoesPads.get(indice) ?? 0
      const opcoes: OpcoesVozPad = {
        chave: indice,
        versao,
        ...amostrasDoTrecho(inicio, fim, buffer.sampleRate),
        repetir: loop,
        semitons: normalizarTom(cfg.tom)
      }
      if (this.versoesEnviadas.get(indice) !== versao) {
        // Primeira voz desta versão: leva o áudio; as próximas usam o que ficou no worklet
        opcoes.canais = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c))
        this.versoesEnviadas.set(indice, versao)
      }
      fonte = new AudioWorkletNode(this.ctx, 'sampledeck-pad', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [buffer.numberOfChannels],
        processorOptions: opcoes
      })
    } else {
      fonte = this.ctx.createBufferSource()
      fonte.buffer = buffer
      fonte.loop = loop
      fonte.loopStart = inicio
      fonte.loopEnd = fim
    }
    const ganho = this.ctx.createGain()
    ganho.gain.value = cfg.volume
    const pan = this.ctx.createStereoPanner()
    pan.pan.value = cfg.pan
    fonte.connect(ganho).connect(pan).connect(this.saida)
    const voz: VozPad = {
      fonte,
      ganho,
      pan,
      tempo: agora,
      posicao: inicio,
      inicio,
      fim,
      loop,
      duracao: buffer.duration,
      taxa: buffer.sampleRate
    }
    const terminar = (): void => {
      fonte.disconnect()
      pan.disconnect()
      if (this.vozesPads.get(indice) === voz) {
        this.vozesPads.delete(indice)
        this.avisar()
      }
    }
    if (fonte instanceof AudioWorkletNode) {
      const no = fonte
      no.port.onmessage = (e: MessageEvent<{ tipo: string }>) => {
        if (e.data.tipo === 'fim') {
          no.port.onmessage = null
          terminar()
        }
      }
    } else {
      fonte.onended = terminar
      if (loop) {
        fonte.start(agora, inicio)
      } else {
        fonte.start(agora, inicio, fim - inicio)
      }
    }
    this.vozesPads.set(indice, voz)
    this.avisar()
    return true
  }

  /** Envia uma mensagem à voz de um pad, se ela usa o processador de tom. */
  private enviarVoz(v: VozPad, m: MensagemVozPad): void {
    if (v.fonte instanceof AudioWorkletNode) {
      v.fonte.port.postMessage(m)
    }
  }

  /** Posição (em segundos do arquivo) do som que sai do pad agora, ou null se está parado. */
  posicaoPad(indice: number): number | null {
    const v = this.vozesPads.get(indice)
    if (!v) {
      return null
    }
    // O tom não muda a duração: o arquivo avança em tempo real
    const p = v.posicao + (this.ctx.currentTime - v.tempo)
    const tamanho = v.fim - v.inicio
    if (p < v.fim || tamanho <= 0) {
      return p
    }
    return v.loop ? v.inicio + ((p - v.inicio) % tamanho) : v.fim
  }

  /** Aplica volume, pan, tom, loop e trecho ao vivo no pad que estiver tocando. */
  atualizarPad(indice: number, cfg: ConfigPad): void {
    const v = this.vozesPads.get(indice)
    if (!v) {
      return
    }
    const t = this.ctx.currentTime
    v.ganho.gain.setTargetAtTime(cfg.volume, t, 0.01)
    v.pan.pan.setTargetAtTime(cfg.pan, t, 0.01)
    this.enviarVoz(v, { tipo: 'tom', semitons: normalizarTom(cfg.tom) })
    const loop = cfg.modo === 'loop'
    if (loop !== v.loop) {
      v.posicao = this.posicaoPad(indice) ?? v.posicao
      v.tempo = t
      v.loop = loop
      if (v.fonte instanceof AudioBufferSourceNode) {
        v.fonte.loop = loop
      } else {
        this.enviarVoz(v, { tipo: 'repetir', valor: loop })
      }
    }
    const { inicio, fim } = trechoDoPad(cfg, v.duracao, v.taxa)
    if (inicio !== v.inicio || fim !== v.fim) {
      const pos = this.posicaoPad(indice) ?? v.posicao
      v.posicao = pos >= inicio && pos < fim ? pos : inicio
      v.tempo = t
      v.inicio = inicio
      v.fim = fim
      if (v.fonte instanceof AudioBufferSourceNode) {
        v.fonte.loopStart = inicio
        v.fonte.loopEnd = fim
      } else {
        this.enviarVoz(v, { tipo: 'trecho', ...amostrasDoTrecho(inicio, fim, v.taxa) })
      }
    }
  }

  padTocando(indice: number): boolean {
    return this.vozesPads.has(indice)
  }

  /** Para o pad com um fade curto (evita estalo). */
  pararPad(indice: number, fade = 0.02): void {
    const v = this.vozesPads.get(indice)
    if (!v) {
      return
    }
    this.vozesPads.delete(indice)
    const t = this.ctx.currentTime
    v.ganho.gain.cancelScheduledValues(t)
    v.ganho.gain.setValueAtTime(v.ganho.gain.value, t)
    v.ganho.gain.linearRampToValueAtTime(0, t + fade)
    if (v.fonte instanceof AudioWorkletNode) {
      this.enviarVoz(v, { tipo: 'parar', quando: t + fade })
    } else {
      try {
        v.fonte.stop(t + fade)
      } catch {
        // já parada
      }
    }
    this.avisar()
  }

  /** Silencia todos os pads. */
  pararPads(): void {
    for (const i of [...this.vozesPads.keys()]) {
      this.pararPad(i)
    }
  }
}

/** Trecho em amostras do arquivo (pelo menos uma amostra). */
function amostrasDoTrecho(inicio: number, fim: number, taxa: number): { inicio: number; fim: number } {
  const a = Math.round(inicio * taxa)
  return { inicio: a, fim: Math.max(a + 1, Math.round(fim * taxa)) }
}

/** Instância única usada por toda a interface. */
export const motor = new MotorAudio()
