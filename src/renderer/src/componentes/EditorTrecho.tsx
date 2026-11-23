import { Maximize2, Play, Scan, ZoomIn, ZoomOut } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as KeyboardEventReact, type PointerEvent as PointerEventReact } from 'react'
import { formatarDuracao, formatarTempo, lerTempo, trechoDoPad, type ConfigPad } from '@shared/pads'
import type { Sample } from '@shared/tipos'
import { motor } from '../motorAudio'

/** Menor janela visível, em amostras (com isso dá para ver amostra por amostra). */
const MIN_AMOSTRAS_VISTA = 24
/** Distância (px) em que o clique pega um marcador. */
const RAIO_MARCADOR = 7
/** Altura da régua de tempo desenhada embaixo da onda. */
const ALTURA_REGUA = 15
/** Tamanho do bloco do resumo min/máx (acelera arquivos longos). */
const BLOCO = 256

interface Resumo {
  min: Float32Array
  max: Float32Array
}

/** Resumo min/máx por bloco de todos os canais, calculado uma vez por buffer. */
const resumos = new WeakMap<AudioBuffer, Resumo>()

function resumoDe(b: AudioBuffer): Resumo {
  const existente = resumos.get(b)
  if (existente) {
    return existente
  }
  const n = Math.ceil(b.length / BLOCO)
  const min = new Float32Array(n).fill(Infinity)
  const max = new Float32Array(n).fill(-Infinity)
  for (let c = 0; c < b.numberOfChannels; c++) {
    const d = b.getChannelData(c)
    for (let k = 0; k < n; k++) {
      let lo = min[k]
      let hi = max[k]
      const fim = Math.min(d.length, (k + 1) * BLOCO)
      for (let i = k * BLOCO; i < fim; i++) {
        const v = d[i]
        if (v < lo) lo = v
        if (v > hi) hi = v
      }
      min[k] = lo
      max[k] = hi
    }
  }
  const r = { min, max }
  resumos.set(b, r)
  return r
}

interface Vista {
  ini: number
  fim: number
}

/** Passos "redondos" da régua, em segundos. */
const PASSOS = [
  0.00005, 0.0001, 0.0002, 0.0005, 0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600
]

function cor(el: Element, nome: string, padrao: string): string {
  return getComputedStyle(el).getPropertyValue(nome).trim() || padrao
}

/** Desenha a forma de onda de [ini, fim] no canvas; com zoom extremo, mostra as amostras. */
function desenharOnda(cv: HTMLCanvasElement, b: AudioBuffer, vista: Vista, largura: number, altura: number, comRegua: boolean): void {
  const dpr = window.devicePixelRatio || 1
  cv.width = Math.max(1, Math.round(largura * dpr))
  cv.height = Math.max(1, Math.round(altura * dpr))
  const g = cv.getContext('2d')
  if (!g) {
    return
  }
  g.setTransform(dpr, 0, 0, dpr, 0, 0)
  g.clearRect(0, 0, largura, altura)
  const corOnda = cor(cv, '--azul', '#1a4bff')
  const corTexto = cor(cv, '--texto-3', '#999')
  const corLinha = cor(cv, '--borda-forte', '#ddd')
  const hOnda = comRegua ? altura - ALTURA_REGUA : altura
  const meio = hOnda / 2
  const escala = meio * 0.92
  const taxa = b.sampleRate
  const a0 = vista.ini * taxa
  const amostrasPorPx = ((vista.fim - vista.ini) * taxa) / largura

  // linha central
  g.fillStyle = corLinha
  g.fillRect(0, Math.round(meio), largura, 1)

  const canais: Float32Array[] = []
  for (let c = 0; c < b.numberOfChannels; c++) {
    canais.push(b.getChannelData(c))
  }

  g.fillStyle = corOnda
  g.strokeStyle = corOnda
  if (amostrasPorPx < 1) {
    // Zoom profundo: linha ligando as amostras (média dos canais) e pontos quando há espaço
    const primeira = Math.max(0, Math.floor(a0) - 1)
    const ultima = Math.min(b.length - 1, Math.ceil(vista.fim * taxa) + 1)
    const valor = (i: number): number => {
      let s = 0
      for (const d of canais) s += d[i]
      return s / canais.length
    }
    const xDe = (i: number): number => (i - a0) / amostrasPorPx
    g.lineWidth = 1.25
    g.beginPath()
    for (let i = primeira; i <= ultima; i++) {
      const x = xDe(i)
      const y = meio - valor(i) * escala
      if (i === primeira) g.moveTo(x, y)
      else g.lineTo(x, y)
    }
    g.stroke()
    if (amostrasPorPx < 0.25) {
      for (let i = primeira; i <= ultima; i++) {
        g.beginPath()
        g.arc(xDe(i), meio - valor(i) * escala, 2, 0, Math.PI * 2)
        g.fill()
      }
    }
  } else {
    const resumo = amostrasPorPx >= BLOCO * 2 ? resumoDe(b) : null
    for (let x = 0; x < largura; x++) {
      const s0 = Math.max(0, Math.floor(a0 + x * amostrasPorPx))
      const s1 = Math.min(b.length, Math.max(s0 + 1, Math.floor(a0 + (x + 1) * amostrasPorPx)))
      if (s0 >= b.length) {
        break
      }
      let lo = Infinity
      let hi = -Infinity
      if (resumo) {
        const k1 = Math.min(resumo.min.length, Math.ceil(s1 / BLOCO))
        for (let k = Math.floor(s0 / BLOCO); k < k1; k++) {
          if (resumo.min[k] < lo) lo = resumo.min[k]
          if (resumo.max[k] > hi) hi = resumo.max[k]
        }
      } else {
        for (const d of canais) {
          for (let i = s0; i < s1; i++) {
            const v = d[i]
            if (v < lo) lo = v
            if (v > hi) hi = v
          }
        }
      }
      if (lo === Infinity) {
        continue
      }
      const y0 = meio - hi * escala
      const y1 = meio - lo * escala
      g.fillRect(x, y0, 1, Math.max(1, y1 - y0))
    }
  }

  if (!comRegua) {
    return
  }
  // Régua de tempo
  g.fillStyle = corLinha
  g.fillRect(0, hOnda, largura, 1)
  const dur = vista.fim - vista.ini
  const passo = PASSOS.find((p) => (p / dur) * largura >= 64) ?? PASSOS[PASSOS.length - 1]
  const casas = Math.max(0, Math.min(5, Math.ceil(-Math.log10(passo) - 1e-9)))
  g.font = '10px Inter, system-ui, sans-serif'
  g.textBaseline = 'top'
  for (let t = Math.ceil(vista.ini / passo) * passo; t <= vista.fim; t += passo) {
    const x = ((t - vista.ini) / dur) * largura
    g.fillStyle = corLinha
    g.fillRect(Math.round(x), hOnda, 1, 4)
    g.fillStyle = corTexto
    g.fillText(formatarTempo(t, casas), Math.round(x) + 3, hOnda + 3)
  }
}

/** Campo de tempo: mostra formatado e aceita "1.25", "250ms", "1:05.3". */
function CampoTempo(p: { valor: number; titulo: string; aoMudar: (s: number) => void }): JSX.Element {
  const [texto, setTexto] = useState<string | null>(null)
  const confirmar = (): void => {
    if (texto !== null) {
      const s = lerTempo(texto)
      if (s !== null) {
        p.aoMudar(s)
      }
    }
    setTexto(null)
  }
  return (
    <input
      className="campo-tempo"
      value={texto ?? formatarTempo(p.valor, 5)}
      title={p.titulo}
      spellCheck={false}
      onFocus={(e) => {
        setTexto(formatarTempo(p.valor, 5))
        e.currentTarget.select()
      }}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={confirmar}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          confirmar()
          e.currentTarget.blur()
        } else if (e.key === 'Escape') {
          setTexto(null)
          e.currentTarget.blur()
          e.stopPropagation()
        }
      }}
    />
  )
}

interface Props {
  sample: Sample
  indice: number
  cfg: ConfigPad
  /** Altura da forma de onda (px). */
  altura: number
  tocando: boolean
  aoMudar: (parcial: Pick<ConfigPad, 'inicio' | 'fim'>) => void
  aoOuvir: () => void
  /** Se presente, mostra o botão para abrir o editor grande. */
  aoExpandir?: () => void
  /** Foca o editor ao montar (atalhos de teclado). */
  focar?: boolean
}

type Arrasto =
  | { tipo: 'inicio' | 'fim'; moveu: boolean; x0: number }
  | { tipo: 'selecao'; ancora: number; x0: number; moveu: boolean }
  | { tipo: 'mover'; x0: number; vista: Vista }

/**
 * Editor do trecho tocado pelo pad: forma de onda com zoom (até amostra por amostra),
 * marcadores de início e fim arrastáveis e campos para digitar os tempos.
 */
export function EditorTrecho(p: Props): JSX.Element {
  const [buffer, setBuffer] = useState<AudioBuffer | null>(() => motor.bufferPad(p.indice))
  const [erro, setErro] = useState(false)
  const [largura, setLargura] = useState(0)
  const [vista, setVista] = useState<Vista | null>(null)
  /** Trecho em edição durante o arrasto (só é gravado ao soltar). */
  const [rascunho, setRascunho] = useState<{ inicio: number; fim: number } | null>(null)
  const [ativo, setAtivo] = useState<'inicio' | 'fim'>('inicio')
  const raiz = useRef<HTMLDivElement>(null)
  const area = useRef<HTMLDivElement>(null)
  const cvOnda = useRef<HTMLCanvasElement>(null)
  const cvMapa = useRef<HTMLCanvasElement>(null)
  const cabeca = useRef<HTMLDivElement>(null)
  const arrasto = useRef<Arrasto | null>(null)

  // Carrega o áudio do sample (normalmente já está no cache do pad)
  useEffect(() => {
    let vivo = true
    setErro(false)
    const jaCarregado = motor.bufferPad(p.indice)
    if (jaCarregado) {
      setBuffer(jaCarregado)
    } else {
      setBuffer(null)
    }
    motor
      .carregar(p.sample)
      .then((b) => vivo && setBuffer(b))
      .catch(() => vivo && setErro(true))
    return () => {
      vivo = false
    }
  }, [p.sample, p.indice])

  // Ao trocar de áudio, mostra o arquivo inteiro
  useEffect(() => {
    setVista(buffer ? { ini: 0, fim: buffer.duration } : null)
  }, [buffer])

  const pronto = !!buffer && !!vista

  useLayoutEffect(() => {
    const el = area.current
    if (!el) {
      return
    }
    const ro = new ResizeObserver(() => setLargura(el.clientWidth))
    ro.observe(el)
    setLargura(el.clientWidth)
    return () => ro.disconnect()
  }, [pronto])

  useEffect(() => {
    if (p.focar) {
      raiz.current?.focus()
    }
  }, [p.focar, pronto])

  const duracao = buffer?.duration ?? 0
  const taxa = buffer?.sampleRate ?? 48000
  const trecho = rascunho ?? (buffer ? trechoDoPad(p.cfg, duracao, taxa) : { inicio: 0, fim: 0 })

  /** Ajusta a vista aos limites do arquivo e ao zoom máximo. */
  const limitarVista = useCallback(
    (v: Vista): Vista => {
      const minimo = Math.min(duracao, MIN_AMOSTRAS_VISTA / taxa)
      let tam = Math.max(minimo, Math.min(duracao, v.fim - v.ini))
      if (!Number.isFinite(tam)) tam = duracao
      let ini = Math.max(0, Math.min(v.ini, duracao - tam))
      if (!Number.isFinite(ini)) ini = 0
      return { ini, fim: ini + tam }
    },
    [duracao, taxa]
  )

  /** Zoom mantendo o instante `c` no mesmo ponto da tela (o tamanho é limitado antes de posicionar). */
  const zoomEm = useCallback(
    (v: Vista, fator: number, c: number): Vista => {
      const minimo = Math.min(duracao, MIN_AMOSTRAS_VISTA / taxa)
      const tam = Math.max(minimo, Math.min(duracao, (v.fim - v.ini) * fator))
      const rel = (c - v.ini) / (v.fim - v.ini)
      return limitarVista({ ini: c - rel * tam, fim: c - rel * tam + tam })
    },
    [limitarVista, duracao, taxa]
  )

  const zoom = useCallback(
    (fator: number, centro?: number): void => {
      setVista((v) => (v ? zoomEm(v, fator, centro ?? (v.ini + v.fim) / 2) : v))
    },
    [zoomEm]
  )

  // Desenha a onda
  useEffect(() => {
    if (buffer && vista && cvOnda.current && largura > 0) {
      desenharOnda(cvOnda.current, buffer, vista, largura, p.altura, true)
    }
  }, [buffer, vista, largura, p.altura])

  // Desenha o mapa (arquivo inteiro)
  useEffect(() => {
    if (buffer && cvMapa.current && largura > 0) {
      desenharOnda(cvMapa.current, buffer, { ini: 0, fim: buffer.duration }, largura, 22, false)
    }
  }, [buffer, largura])

  // Roda do mouse: zoom no ponto do cursor; Shift ou rolagem horizontal movem a vista
  useEffect(() => {
    const el = area.current
    if (!el) {
      return
    }
    const roda = (e: WheelEvent): void => {
      e.preventDefault()
      setVista((v) => {
        if (!v) return v
        const r = el.getBoundingClientRect()
        const porPx = (v.fim - v.ini) / r.width
        const horizontal = e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)
        if (horizontal) {
          const d = (e.shiftKey ? e.deltaY || e.deltaX : e.deltaX) * porPx
          return limitarVista({ ini: v.ini + d, fim: v.fim + d })
        }
        const fator = Math.exp(Math.max(-0.5, Math.min(0.5, e.deltaY * 0.0025)))
        return zoomEm(v, fator, v.ini + (e.clientX - r.left) * porPx)
      })
    }
    el.addEventListener('wheel', roda, { passive: false })
    return () => el.removeEventListener('wheel', roda)
  }, [limitarVista, zoomEm, pronto])

  // Cabeça de reprodução enquanto o pad toca
  useEffect(() => {
    if (!p.tocando || !vista) {
      if (cabeca.current) cabeca.current.style.display = 'none'
      return
    }
    let raf = 0
    const passo = (): void => {
      const el = cabeca.current
      const pos = motor.posicaoPad(p.indice)
      if (el) {
        if (pos === null || pos < vista.ini || pos > vista.fim) {
          el.style.display = 'none'
        } else {
          el.style.display = 'block'
          el.style.left = `${((pos - vista.ini) / (vista.fim - vista.ini)) * 100}%`
        }
      }
      raf = requestAnimationFrame(passo)
    }
    raf = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(raf)
  }, [p.tocando, p.indice, vista])

  if (erro) {
    return <div className="trecho-vazio">Não foi possível ler o áudio deste pad.</div>
  }
  if (!buffer || !vista) {
    return <div className="trecho-vazio">Carregando forma de onda…</div>
  }

  const tamVista = vista.fim - vista.ini
  const xDe = (t: number): number => ((t - vista.ini) / tamVista) * largura
  const pct = (t: number): string => `${((t - vista.ini) / tamVista) * 100}%`
  /** Converte a posição do mouse em tempo, encaixado na amostra mais próxima. */
  const tempoDe = (clientX: number): number => {
    const r = area.current!.getBoundingClientRect()
    const t = vista.ini + ((clientX - r.left) / r.width) * tamVista
    return Math.max(0, Math.min(duracao, Math.round(t * taxa) / taxa))
  }
  const umaAmostra = 1 / taxa

  /** Grava o trecho; o fim no fim do arquivo vira null (acompanha o arquivo). */
  const gravar = (inicio: number, fim: number): void => {
    const ini = Math.max(0, Math.min(inicio, duracao - umaAmostra))
    const f = Math.max(ini + umaAmostra, Math.min(fim, duracao))
    p.aoMudar({ inicio: ini <= umaAmostra / 2 ? 0 : ini, fim: f >= duracao - umaAmostra / 2 ? null : f })
  }

  const moverMarcador = (qual: 'inicio' | 'fim', t: number, base = trecho): { inicio: number; fim: number } =>
    qual === 'inicio'
      ? { inicio: Math.min(t, base.fim - umaAmostra), fim: base.fim }
      : { inicio: base.inicio, fim: Math.max(t, base.inicio + umaAmostra) }

  const aoApertar = (e: PointerEventReact<HTMLDivElement>): void => {
    if (e.button === 2) {
      return
    }
    raiz.current?.focus()
    e.currentTarget.setPointerCapture(e.pointerId)
    const r = area.current!.getBoundingClientRect()
    const x = e.clientX - r.left
    if (e.button === 1 || e.altKey) {
      arrasto.current = { tipo: 'mover', x0: e.clientX, vista }
      return
    }
    const dIni = Math.abs(x - xDe(trecho.inicio))
    const dFim = Math.abs(x - xDe(trecho.fim))
    if (Math.min(dIni, dFim) <= RAIO_MARCADOR) {
      const qual = dIni < dFim || (dIni === dFim && x < xDe(trecho.inicio)) ? 'inicio' : 'fim'
      setAtivo(qual)
      arrasto.current = { tipo: qual, moveu: false, x0: e.clientX }
      setRascunho(trecho)
      return
    }
    arrasto.current = { tipo: 'selecao', ancora: tempoDe(e.clientX), x0: e.clientX, moveu: false }
  }

  const aoMover = (e: PointerEventReact<HTMLDivElement>): void => {
    const a = arrasto.current
    if (!a) {
      return
    }
    if (a.tipo === 'mover') {
      const porPx = (a.vista.fim - a.vista.ini) / largura
      const d = (a.x0 - e.clientX) * porPx
      setVista(limitarVista({ ini: a.vista.ini + d, fim: a.vista.fim + d }))
      return
    }
    if (Math.abs(e.clientX - a.x0) > 2) {
      a.moveu = true
    }
    if (!a.moveu) {
      return
    }
    const t = tempoDe(e.clientX)
    let n: { inicio: number; fim: number }
    if (a.tipo === 'selecao') {
      const ini = Math.min(a.ancora, t)
      setAtivo(t < a.ancora ? 'inicio' : 'fim')
      n = { inicio: ini, fim: Math.max(Math.max(a.ancora, t), ini + umaAmostra) }
    } else {
      n = moverMarcador(a.tipo, t, rascunho ?? trecho)
    }
    setRascunho(n)
    // Grava já durante o arrasto: tocar o pad agora usa o ponto em que o marcador está
    gravar(n.inicio, n.fim)
  }

  const aoSoltar = (): void => {
    const a = arrasto.current
    arrasto.current = null
    if (!a || a.tipo === 'mover') {
      return
    }
    if (a.moveu && rascunho) {
      gravar(rascunho.inicio, rascunho.fim)
    } else if (!a.moveu && a.tipo === 'selecao') {
      // Clique simples: leva o marcador mais próximo até ali
      const t = a.ancora
      const qual = Math.abs(t - trecho.inicio) <= Math.abs(t - trecho.fim) ? 'inicio' : 'fim'
      setAtivo(qual)
      const n = moverMarcador(qual, t)
      gravar(n.inicio, n.fim)
    }
    setRascunho(null)
  }

  const tecla = (e: KeyboardEventReact<HTMLDivElement>): void => {
    if (e.code.startsWith('Numpad') || (e.target as HTMLElement).tagName === 'INPUT') {
      return // deixa os pads e os campos de texto funcionarem
    }
    let tratou = true
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      // ←/→ movem o marcador ativo 1 px na vista atual; Shift: 10 px; Alt: 1 amostra
      const dir = e.key === 'ArrowLeft' ? -1 : 1
      const passo = e.altKey ? umaAmostra : Math.max(umaAmostra, (tamVista / Math.max(1, largura)) * (e.shiftKey ? 10 : 1))
      const atual = ativo === 'inicio' ? trecho.inicio : trecho.fim
      const t = Math.max(0, Math.min(duracao, Math.round((atual + dir * passo) * taxa) / taxa))
      const n = moverMarcador(ativo, t)
      gravar(n.inicio, n.fim)
    } else if (e.ctrlKey || e.metaKey) {
      tratou = false // atalhos globais (Ctrl+F etc.)
    } else if (e.key.toLowerCase() === 'i') {
      setAtivo('inicio')
    } else if (e.key.toLowerCase() === 'f') {
      setAtivo('fim')
    } else if (e.key === ' ' || e.key === 'Enter') {
      p.aoOuvir()
    } else if (e.key === '+' || e.key === '=') {
      zoomNoMarcador(0.5)
    } else if (e.key === '-') {
      zoomNoMarcador(2)
    } else if (e.key === '0') {
      setVista(limitarVista({ ini: 0, fim: duracao }))
    } else if (e.key.toLowerCase() === 's') {
      ajustarSelecao()
    } else {
      tratou = false
    }
    if (tratou) {
      e.preventDefault()
      e.stopPropagation()
    }
  }

  /** Zoom por botão/tecla: ancora no marcador ativo se ele está na tela, senão no centro. */
  const zoomNoMarcador = (fator: number): void => {
    const t = ativo === 'inicio' ? trecho.inicio : trecho.fim
    zoom(fator, t >= vista.ini && t <= vista.fim ? t : undefined)
  }

  const ajustarSelecao = (): void => {
    const tam = trecho.fim - trecho.inicio
    const folga = Math.max(tam * 0.08, MIN_AMOSTRAS_VISTA / taxa / 2)
    setVista(limitarVista({ ini: trecho.inicio - folga, fim: trecho.fim + folga }))
  }

  // Mapa: clicar/arrastar centraliza a vista no ponto
  const aoMapa = (e: PointerEventReact<HTMLDivElement>): void => {
    if (e.type === 'pointerdown') {
      e.currentTarget.setPointerCapture(e.pointerId)
    } else if (!e.currentTarget.hasPointerCapture(e.pointerId)) {
      return
    }
    const r = e.currentTarget.getBoundingClientRect()
    const c = ((e.clientX - r.left) / r.width) * duracao
    setVista(limitarVista({ ini: c - tamVista / 2, fim: c + tamVista / 2 }))
  }

  const pctMapa = (t: number): string => `${(t / duracao) * 100}%`
  const xIni = xDe(trecho.inicio)
  const xFim = xDe(trecho.fim)
  const verTudo = tamVista >= duracao - 1e-9

  return (
    <div className="editor-trecho" ref={raiz} tabIndex={0} onKeyDown={tecla}>
      <div className="trecho-barra">
        <button className="icone-botao" title="Aproximar no marcador ativo (+) — a roda do mouse aproxima no cursor" onClick={() => zoomNoMarcador(0.5)} disabled={tamVista * taxa <= MIN_AMOSTRAS_VISTA + 1}>
          <ZoomIn size={14} />
        </button>
        <button className="icone-botao" title="Afastar (-)" onClick={() => zoomNoMarcador(2)} disabled={verTudo}>
          <ZoomOut size={14} />
        </button>
        <button className="icone-botao" title="Enquadrar o trecho marcado (S)" onClick={ajustarSelecao}>
          <Scan size={14} />
        </button>
        <button className="chip-painel mini" title="Ver o arquivo inteiro (0)" onClick={() => setVista({ ini: 0, fim: duracao })} disabled={verTudo}>
          Tudo
        </button>
        <span className="trecho-zoom" title="Janela visível">
          {formatarDuracao(tamVista)}
        </span>
        <button className="icone-botao trecho-ouvir" title="Ouvir o pad (Espaço)" onClick={p.aoOuvir}>
          <Play size={14} />
        </button>
        {p.aoExpandir && (
          <button className="icone-botao" title="Abrir editor grande" onClick={p.aoExpandir}>
            <Maximize2 size={14} />
          </button>
        )}
      </div>

      <div
        ref={area}
        className="trecho-onda"
        style={{ height: p.altura }}
        onPointerDown={aoApertar}
        onPointerMove={(e) => {
          aoMover(e)
          if (!arrasto.current) {
            const r = e.currentTarget.getBoundingClientRect()
            const x = e.clientX - r.left
            const perto = Math.min(Math.abs(x - xIni), Math.abs(x - xFim)) <= RAIO_MARCADOR
            e.currentTarget.style.cursor = e.altKey ? 'grab' : perto ? 'ew-resize' : 'crosshair'
          }
        }}
        onPointerUp={aoSoltar}
        onPointerCancel={aoSoltar}
        onContextMenu={(e) => e.preventDefault()}
      >
        <canvas ref={cvOnda} style={{ width: '100%', height: p.altura }} />
        {xIni > 0 && <div className="trecho-fora" style={{ left: 0, width: `${Math.min(largura, xIni)}px` }} />}
        {xFim < largura && <div className="trecho-fora" style={{ left: `${Math.max(0, xFim)}px`, right: 0 }} />}
        {xIni >= -1 && xIni <= largura + 1 && (
          <div className={`trecho-marcador inicio${ativo === 'inicio' ? ' ativo' : ''}`} style={{ left: pct(trecho.inicio) }}>
            <span>I</span>
          </div>
        )}
        {xFim >= -1 && xFim <= largura + 1 && (
          <div className={`trecho-marcador fim${ativo === 'fim' ? ' ativo' : ''}`} style={{ left: pct(trecho.fim) }}>
            <span>F</span>
          </div>
        )}
        <div ref={cabeca} className="trecho-cabeca" />
      </div>

      <div className="trecho-mapa" onPointerDown={aoMapa} onPointerMove={aoMapa} title="Arquivo inteiro: clique ou arraste para navegar">
        <canvas ref={cvMapa} style={{ width: '100%', height: 22 }} />
        <div className="trecho-mapa-sel" style={{ left: pctMapa(trecho.inicio), width: pctMapa(trecho.fim - trecho.inicio) }} />
        {!verTudo && <div className="trecho-mapa-vista" style={{ left: pctMapa(vista.ini), width: pctMapa(tamVista) }} />}
      </div>

      <div className="trecho-campos">
        <label className={ativo === 'inicio' ? 'ativo' : ''} onClick={() => setAtivo('inicio')}>
          <span>Início</span>
          <CampoTempo
            valor={trecho.inicio}
            titulo="Início do trecho (ex.: 1.25, 250ms, 1:05.3)"
            aoMudar={(s) => {
              const n = moverMarcador('inicio', Math.max(0, s))
              gravar(n.inicio, n.fim)
            }}
          />
        </label>
        <label className={ativo === 'fim' ? 'ativo' : ''} onClick={() => setAtivo('fim')}>
          <span>Fim</span>
          <CampoTempo
            valor={trecho.fim}
            titulo="Fim do trecho (ex.: 1.25, 250ms, 1:05.3)"
            aoMudar={(s) => {
              const n = moverMarcador('fim', Math.min(duracao, s))
              gravar(n.inicio, n.fim)
            }}
          />
        </label>
        <div className="trecho-duracao" title={`Arquivo: ${formatarDuracao(duracao)}`}>
          <span>Duração</span>
          <b>{formatarDuracao(trecho.fim - trecho.inicio)}</b>
        </div>
      </div>
    </div>
  )
}
