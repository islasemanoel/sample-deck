import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { dirname } from 'path'

/**
 * Preferências do app num JSON próprio (preferencias.json, ao lado da biblioteca):
 * posição/tamanho da janela e ajustes da interface (larguras de colunas, volume...).
 * A gravação é síncrona e atômica: o arquivo é pequeno e precisa estar no disco
 * mesmo se o app for fechado logo em seguida.
 */

/** Posição e tamanho da janela (no estado normal, não maximizado). */
export interface EstadoJanela {
  x: number
  y: number
  largura: number
  altura: number
  maximizada: boolean
}

export interface Preferencias {
  janela: EstadoJanela | null
  /** Posição e tamanho da janela no modo compacto (estilo "ao lado da DAW"). */
  janelaCompacta: EstadoJanela | null
  /** Ajustes da interface, por chave (valores JSON). */
  interface: Record<string, unknown>
}

/** Retângulo de uma tela (área útil, sem a barra de tarefas). */
export interface Area {
  x: number
  y: number
  width: number
  height: number
}

const numero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

function lerJanela(bruto: unknown): EstadoJanela | null {
  const j = bruto as Record<string, unknown> | undefined
  if (j && typeof j === 'object' && numero(j.x) && numero(j.y) && numero(j.largura) && numero(j.altura) && j.largura > 0 && j.altura > 0) {
    return { x: j.x, y: j.y, largura: j.largura, altura: j.altura, maximizada: j.maximizada === true }
  }
  return null
}

/** Garante a forma esperada de um JSON lido do disco (ausente, antigo ou corrompido). */
export function normalizarPreferencias(bruto: unknown): Preferencias {
  const r: Preferencias = { janela: null, janelaCompacta: null, interface: {} }
  if (!bruto || typeof bruto !== 'object') {
    return r
  }
  const o = bruto as Record<string, unknown>
  r.janela = lerJanela(o.janela)
  r.janelaCompacta = lerJanela(o.janelaCompacta)
  if (o.interface && typeof o.interface === 'object' && !Array.isArray(o.interface)) {
    r.interface = { ...(o.interface as Record<string, unknown>) }
  }
  return r
}

/**
 * Indica se a janela salva ainda aparece numa das telas atuais: a faixa do título
 * (alto da janela) precisa ter ao menos 100×40 px visíveis, para dar para arrastá-la.
 * Evita abrir fora da tela depois de desconectar um monitor.
 */
export function janelaVisivel(j: EstadoJanela, areas: Area[]): boolean {
  return areas.some((a) => {
    const largura = Math.min(j.x + j.largura, a.x + a.width) - Math.max(j.x, a.x)
    const altura = Math.min(j.y + 40, a.y + a.height) - Math.max(j.y, a.y)
    return largura >= 100 && altura >= 40
  })
}

export class ArmazenamentoPreferencias {
  private atual: Preferencias
  private espera: ReturnType<typeof setTimeout> | undefined

  /** @param arquivo caminho do JSON (normalmente em userData) */
  constructor(private readonly arquivo: string) {
    try {
      this.atual = normalizarPreferencias(JSON.parse(readFileSync(arquivo, 'utf8')))
    } catch {
      this.atual = normalizarPreferencias(null)
    }
  }

  get janela(): EstadoJanela | null {
    return this.atual.janela
  }

  get janelaCompacta(): EstadoJanela | null {
    return this.atual.janelaCompacta
  }

  get interface(): Record<string, unknown> {
    return this.atual.interface
  }

  salvarJanela(j: EstadoJanela): void {
    this.atual = { ...this.atual, janela: j }
    this.gravar()
  }

  salvarJanelaCompacta(j: EstadoJanela): void {
    this.atual = { ...this.atual, janelaCompacta: j }
    this.gravar()
  }

  /** Grava um ajuste da interface; undefined remove a chave. */
  salvarInterface(chave: string, valor: unknown): void {
    const nova = { ...this.atual.interface }
    if (valor === undefined) {
      delete nova[chave]
    } else {
      nova[chave] = valor
    }
    this.atual = { ...this.atual, interface: nova }
    // Sliders (volume, pads) mudam várias vezes por segundo: agrupa as gravações
    clearTimeout(this.espera)
    this.espera = setTimeout(() => this.gravar(), 300)
  }

  /** Grava agora o que estiver pendente (chamar ao sair do app). */
  descarregar(): void {
    if (this.espera !== undefined) {
      this.gravar()
    }
  }

  private gravar(): void {
    clearTimeout(this.espera)
    this.espera = undefined
    try {
      mkdirSync(dirname(this.arquivo), { recursive: true })
      const tmp = `${this.arquivo}.tmp`
      writeFileSync(tmp, JSON.stringify(this.atual, null, 1), 'utf8')
      renameSync(tmp, this.arquivo)
    } catch {
      // disco cheio/sem permissão: as preferências continuam valendo nesta sessão
    }
  }
}
