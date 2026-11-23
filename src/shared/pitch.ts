/**
 * Mudança de tom (pitch shift) sem alterar a duração, em tempo real, em TypeScript puro
 * (roda no AudioWorklet e é testável em Node).
 *
 * Técnica: o sinal é esticado no tempo pela razão de frequência r com um phase vocoder
 * (com travamento de fase "identity phase locking" de Laroche & Dolson, que reduz o som
 * metálico/"phasey") e o resultado é reamostrado por r com interpolação sinc janelada
 * (com filtro anti-aliasing quando o tom sobe). Esticar por r e reamostrar por r mantém a
 * duração e multiplica todas as frequências por r. Tudo é feito em fluxo contínuo, quadro a
 * quadro, então o tom pode mudar a qualquer momento durante a reprodução.
 */

/** Limites do knob de tom, em semitons. */
export const TOM_MIN = -12
export const TOM_MAX = 12

const TAM_FFT = 2048
const HOP_SINTESE = TAM_FFT / 4
/** Meia largura (em zeros da sinc) do núcleo da reamostragem. */
const RAIO_SINC = 16
/** Resolução da tabela do núcleo sinc (pontos por unidade). */
const RESOLUCAO_SINC = 512
/** Tamanho (potência de 2) dos anéis de acúmulo e da fila do sinal esticado. */
const TAM_ANEL = 8192
const MASCARA_ANEL = TAM_ANEL - 1

/** Razão de frequência correspondente a `semitons` (12 = dobro). */
export function razaoDoTom(semitons: number): number {
  return Math.pow(2, semitons / 12)
}

/** Limita e arredonda o tom ao centésimo de semitom (cent), a precisão do knob. */
export function normalizarTom(semitons: number): number {
  if (!Number.isFinite(semitons)) {
    return 0
  }
  const v = Math.round(Math.max(TOM_MIN, Math.min(TOM_MAX, semitons)) * 100) / 100
  return Object.is(v, -0) ? 0 : v
}

/** Texto curto do tom: "0", "+3", "-1.25"... */
export function formatarTom(semitons: number): string {
  const v = normalizarTom(semitons)
  if (v === 0) {
    return '0'
  }
  const texto = Number.isInteger(v) ? String(Math.abs(v)) : Math.abs(v).toFixed(2)
  return `${v > 0 ? '+' : '-'}${texto}`
}

// ---------- FFT radix-2 complexa, in-place ----------

class Fft {
  private readonly cos: Float64Array
  private readonly sen: Float64Array
  private readonly inv: Uint32Array

  constructor(readonly n: number) {
    this.cos = new Float64Array(n / 2)
    this.sen = new Float64Array(n / 2)
    for (let i = 0; i < n / 2; i++) {
      this.cos[i] = Math.cos((-2 * Math.PI * i) / n)
      this.sen[i] = Math.sin((-2 * Math.PI * i) / n)
    }
    const bits = Math.log2(n)
    this.inv = new Uint32Array(n)
    for (let i = 0; i < n; i++) {
      let r = 0
      for (let b = 0; b < bits; b++) {
        r = (r << 1) | ((i >> b) & 1)
      }
      this.inv[i] = r
    }
  }

  /** Transformada direta (inversa = true aplica conjugado; sem normalização). */
  transformar(re: Float64Array, im: Float64Array, inversa: boolean): void {
    const n = this.n
    for (let i = 0; i < n; i++) {
      const j = this.inv[i]
      if (j > i) {
        let t = re[i]
        re[i] = re[j]
        re[j] = t
        t = im[i]
        im[i] = im[j]
        im[j] = t
      }
    }
    const sinal = inversa ? -1 : 1
    for (let tam = 2; tam <= n; tam <<= 1) {
      const meio = tam >> 1
      const passo = n / tam
      for (let ini = 0; ini < n; ini += tam) {
        for (let k = 0; k < meio; k++) {
          const wr = this.cos[k * passo]
          const wi = sinal * this.sen[k * passo]
          const a = ini + k
          const b = a + meio
          const tr = re[b] * wr - im[b] * wi
          const ti = re[b] * wi + im[b] * wr
          re[b] = re[a] - tr
          im[b] = im[a] - ti
          re[a] += tr
          im[a] += ti
        }
      }
    }
  }
}

let tabelaSinc: Float64Array | null = null

/** Núcleo sinc janelada (Blackman) K(t), t em [0, RAIO_SINC], tabelado. */
function obterTabelaSinc(): Float64Array {
  if (tabelaSinc) {
    return tabelaSinc
  }
  const n = RAIO_SINC * RESOLUCAO_SINC
  const t = new Float64Array(n + 2)
  for (let i = 0; i <= n; i++) {
    const x = i / RESOLUCAO_SINC
    const sinc = x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x)
    const u = x / RAIO_SINC
    t[i] = sinc * (0.42 + 0.5 * Math.cos(Math.PI * u) + 0.08 * Math.cos(2 * Math.PI * u))
  }
  tabelaSinc = t
  return t
}

function envolverFase(x: number): number {
  return x - 2 * Math.PI * Math.round(x / (2 * Math.PI))
}

/** Estado do phase vocoder de um canal. */
interface EstadoCanal {
  faseAnterior: Float64Array
  faseSintese: Float64Array
  /** Acúmulo do overlap-add (anel indexado pela posição no sinal esticado). */
  acumulado: Float64Array
  /** Fila do sinal esticado já pronto (anel indexado por t; t = 0 é o centro do 1º quadro). */
  fila: Float64Array
}

/**
 * Lê um áudio (um Float32Array por canal) a partir de uma posição, com o tom ajustável a
 * qualquer momento por {@link definirTom}. Não aloca memória em {@link ler}, para poder rodar
 * na thread de áudio sem engasgos.
 */
export class LeitorComTom {
  private readonly tamanho: number
  private razao = 1
  /** Amostras da origem consumidas por amostra de saída (1 = andamento original). */
  private velocidade = 1
  /** Posição (exclusiva) da origem a partir da qual tudo é silêncio. */
  private limite: number
  /** Posição atual na origem (avança `velocidade` por amostra de saída). */
  private posOrigem: number
  private terminou = false

  // Phase vocoder
  private readonly fft = new Fft(TAM_FFT)
  private readonly janela = new Float64Array(TAM_FFT)
  private readonly re = new Float64Array(TAM_FFT)
  private readonly im = new Float64Array(TAM_FFT)
  private readonly mag = new Float64Array(TAM_FFT / 2 + 1)
  private readonly fase = new Float64Array(TAM_FFT / 2 + 1)
  private readonly novaFase = new Float64Array(TAM_FFT / 2 + 1)
  private readonly picos = new Int32Array(TAM_FFT / 2 + 1)
  private readonly normalizacao = new Float64Array(TAM_ANEL)
  private readonly estados: EstadoCanal[]
  /** Centro (na origem) do próximo quadro de análise. */
  private posAnalise: number
  private centroAnterior = 0
  private quadro = 0
  /** Primeiro índice t ainda não escrito na fila. */
  private fimFila = 0

  // Reamostragem
  private readonly tabela = obterTabelaSinc()
  /** Posição de leitura (fracionária) na fila do sinal esticado. */
  private posLeitura = 0

  /**
   * @param canais áudio de origem (todos do mesmo tamanho)
   * @param inicio amostra da origem onde a leitura começa
   */
  constructor(
    private readonly canais: Float32Array[],
    inicio = 0,
    repetir = false,
    semitons = 0,
    velocidade = 1
  ) {
    this.tamanho = canais[0]?.length ?? 0
    this.posAnalise = inicio
    this.posOrigem = inicio
    this.limite = this.tamanho
    for (let i = 0; i < TAM_FFT; i++) {
      this.janela[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / TAM_FFT)
    }
    this.estados = canais.map(() => ({
      faseAnterior: new Float64Array(TAM_FFT / 2 + 1),
      faseSintese: new Float64Array(TAM_FFT / 2 + 1),
      acumulado: new Float64Array(TAM_ANEL),
      fila: new Float64Array(TAM_ANEL)
    }))
    this.definirRepetir(repetir)
    this.definirTom(semitons)
    this.definirVelocidade(velocidade)
  }

  /**
   * Muda o andamento sem mudar o tom (2 = duas vezes mais rápido), entre 0,25 e 4.
   * Vale a partir das próximas amostras lidas.
   */
  definirVelocidade(v: number): void {
    this.velocidade = Number.isFinite(v) && v > 0 ? Math.min(4, Math.max(0.25, v)) : 1
  }

  /** Muda o tom imediatamente (vale a partir das próximas amostras lidas). */
  definirTom(semitons: number): void {
    this.razao = razaoDoTom(normalizarTom(semitons))
  }

  /** Liga/desliga a repetição; ao desligar, toca até o fim da passada atual. */
  definirRepetir(v: boolean): void {
    if (v || this.tamanho === 0) {
      this.limite = v ? Infinity : this.tamanho
      return
    }
    const atual = Math.ceil(this.posOrigem)
    this.limite = Math.max(this.tamanho, Math.ceil(atual / this.tamanho) * this.tamanho)
  }

  /** Amostra `i` da origem considerando repetição e fim. */
  private amostra(c: Float32Array, i: number): number {
    if (i < 0 || i >= this.limite) {
      return 0
    }
    return c[i % this.tamanho]
  }

  /** Gera mais um quadro do phase vocoder, acrescentando HOP_SINTESE amostras à fila. */
  private gerarQuadro(): void {
    const n = TAM_FFT
    const meioN = n / 2
    const bins = meioN + 1
    const hs = HOP_SINTESE
    const { re, im, mag, fase, novaFase, picos, janela } = this
    const centro = Math.round(this.posAnalise)
    const haReal = Math.max(1, centro - this.centroAnterior)
    const base = this.quadro * hs

    for (let c = 0; c < this.canais.length; c++) {
      const origem = this.canais[c]
      const est = this.estados[c]
      const ini = centro - meioN
      for (let i = 0; i < n; i++) {
        re[i] = this.amostra(origem, ini + i) * janela[i]
        im[i] = 0
      }
      this.fft.transformar(re, im, false)
      for (let k = 0; k < bins; k++) {
        mag[k] = Math.hypot(re[k], im[k])
        fase[k] = Math.atan2(im[k], re[k])
      }

      if (this.quadro === 0) {
        novaFase.set(fase)
      } else {
        // Picos espectrais (máximos locais em ±2 bins).
        let nPicos = 0
        for (let k = 0; k < bins; k++) {
          const v = mag[k]
          if (
            v > 0 &&
            (k < 1 || v > mag[k - 1]) &&
            (k < 2 || v > mag[k - 2]) &&
            (k + 1 >= bins || v >= mag[k + 1]) &&
            (k + 2 >= bins || v >= mag[k + 2])
          ) {
            picos[nPicos++] = k
          }
        }
        if (nPicos === 0) {
          for (let k = 0; k < bins; k++) {
            const omega = (2 * Math.PI * k) / n
            const desvio = envolverFase(fase[k] - est.faseAnterior[k] - omega * haReal)
            novaFase[k] = est.faseSintese[k] + (omega + desvio / haReal) * hs
          }
        } else {
          // Fase de síntese dos picos pela frequência instantânea; os demais bins da região
          // de cada pico mantêm a relação de fase com ele que tinham na análise.
          for (let p = 0; p < nPicos; p++) {
            const k = picos[p]
            const omega = (2 * Math.PI * k) / n
            const desvio = envolverFase(fase[k] - est.faseAnterior[k] - omega * haReal)
            novaFase[k] = est.faseSintese[k] + (omega + desvio / haReal) * hs
          }
          let p = 0
          for (let k = 0; k < bins; k++) {
            while (p + 1 < nPicos && Math.abs(picos[p + 1] - k) < Math.abs(picos[p] - k)) {
              p++
            }
            const kp = picos[p]
            if (k !== kp) {
              novaFase[k] = novaFase[kp] + (fase[k] - fase[kp])
            }
          }
        }
      }
      for (let k = 0; k < bins; k++) {
        est.faseAnterior[k] = fase[k]
        est.faseSintese[k] = envolverFase(novaFase[k])
        re[k] = mag[k] * Math.cos(est.faseSintese[k])
        im[k] = mag[k] * Math.sin(est.faseSintese[k])
      }
      for (let k = bins; k < n; k++) {
        re[k] = re[n - k]
        im[k] = -im[n - k]
      }
      this.fft.transformar(re, im, true)
      const acc = est.acumulado
      for (let i = 0; i < n; i++) {
        acc[(base + i) & MASCARA_ANEL] += (re[i] / n) * janela[i]
      }
    }
    for (let i = 0; i < n; i++) {
      this.normalizacao[(base + i) & MASCARA_ANEL] += janela[i] * janela[i]
    }

    // As posições [base, base + hs) não recebem mais contribuições: vão para a fila.
    // A posição esticada s corresponde a t = s − meioN (t = 0 é o centro do primeiro quadro).
    for (let s = base; s < base + hs; s++) {
      const j = s & MASCARA_ANEL
      const w = this.normalizacao[j]
      if (s >= meioN) {
        const t = (s - meioN) & MASCARA_ANEL
        for (const est of this.estados) {
          est.fila[t] = w > 1e-6 ? est.acumulado[j] / w : 0
        }
      }
      for (const est of this.estados) {
        est.acumulado[j] = 0
      }
      this.normalizacao[j] = 0
    }
    this.fimFila = Math.max(0, base + hs - meioN)

    this.centroAnterior = centro
    this.posAnalise += (hs * this.velocidade) / this.razao
    this.quadro++
  }

  /**
   * Preenche `saida` (um array por canal) com as próximas `n` amostras.
   * Retorna false quando o áudio terminou (o restante é preenchido com silêncio).
   */
  ler(saida: Float32Array[], n: number): boolean {
    const nCanais = Math.min(saida.length, this.canais.length)
    for (let i = 0; i < n; i++) {
      if (this.terminou || this.posOrigem >= this.limite) {
        this.terminou = true
        for (let c = 0; c < saida.length; c++) {
          saida[c][i] = 0
        }
        continue
      }
      const razao = this.razao
      if (razao === 1 && this.velocidade === 1 && this.quadro === 0) {
        // Tom e andamento originais desde o início: cópia direta, sem processamento.
        // Quando algum deles mudar, o phase vocoder começa a partir deste ponto.
        const pos = this.posOrigem
        for (let c = 0; c < nCanais; c++) {
          saida[c][i] = this.amostra(this.canais[c], pos)
        }
        this.posOrigem++
        this.posAnalise++
        continue
      }
      const corte = Math.min(1, 1 / razao)
      const raio = Math.ceil(RAIO_SINC / corte)
      const x = this.posLeitura
      const centro = Math.floor(x)
      while (this.fimFila <= centro + raio) {
        this.gerarQuadro()
      }
      for (let c = 0; c < nCanais; c++) {
        const fila = this.estados[c].fila
        let soma = 0
        let pesos = 0
        for (let j = Math.max(0, centro - raio + 1); j <= centro + raio; j++) {
          const pt = Math.abs(x - j) * corte * RESOLUCAO_SINC
          const k = Math.floor(pt)
          if (k >= RAIO_SINC * RESOLUCAO_SINC) {
            continue // fora do núcleo
          }
          const peso = this.tabela[k] + (this.tabela[k + 1] - this.tabela[k]) * (pt - k)
          soma += fila[j & MASCARA_ANEL] * peso
          pesos += peso
        }
        saida[c][i] = pesos !== 0 ? soma / pesos : 0
      }
      this.posOrigem += this.velocidade
      this.posLeitura += razao
    }
    for (let c = nCanais; c < saida.length; c++) {
      saida[c].set(saida[0].subarray(0, n))
    }
    return !this.terminou
  }
}

/** Muda o tom de um canal inteiro em `semitons`, mantendo o mesmo número de amostras. */
export function deslocarTom(canal: Float32Array, semitons: number): Float32Array {
  const saida = new Float32Array(canal.length)
  new LeitorComTom([canal], 0, false, semitons).ler([saida], canal.length)
  return saida
}
