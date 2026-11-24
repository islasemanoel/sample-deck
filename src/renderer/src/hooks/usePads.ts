import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CONFIG_PADRAO, normalizarConfigPad, padsACortar, type ConfigPad } from '@shared/pads'
import type { Sample } from '@shared/tipos'
import { consumirArrasto } from '../arrasto'
import { TOTAL_PADS } from '../componentes/PainelPads'
import { motor } from '../motorAudio'
import { gravarAjuste, lerAjuste } from '../preferencias'

/** Ajustes dos pads salvos da última sessão. */
function lerConfigsPads(): ConfigPad[] {
  const bruto = lerAjuste('padsConfig')
  const v: unknown[] = Array.isArray(bruto) ? bruto : []
  // O reverso sempre começa desligado ao abrir o app (como o REV do player)
  return Array.from({ length: TOTAL_PADS }, (_, i) => ({ ...normalizarConfigPad(v[i] as Partial<ConfigPad>), reverso: false }))
}

/** Pads salvos da última sessão (ids de samples). */
function lerPads(): (string | null)[] {
  const v = lerAjuste('pads')
  if (Array.isArray(v)) {
    return Array.from({ length: TOTAL_PADS }, (_, i) => (typeof v[i] === 'string' ? (v[i] as string) : null))
  }
  return Array(TOTAL_PADS).fill(null)
}

const configsPadrao = (): ConfigPad[] => Array.from({ length: TOTAL_PADS }, () => CONFIG_PADRAO)

/**
 * Os 9 pads estilo MPC: quais samples estão neles, o ajuste de cada um, disparo, arrastar e soltar.
 * @param porId samples da biblioteca por id (um pad cujo sample sumiu fica vazio)
 * @param abrirPainel mostra o painel de pads ao adicionar samples
 * @param avisar mostra um aviso na tela
 */
export function usePads(porId: Map<string, Sample>, abrirPainel: () => void, avisar: (texto: string) => void) {
  const [padIds, setPadIds] = useState<(string | null)[]>(lerPads)
  const [configs, setConfigs] = useState<ConfigPad[]>(lerConfigsPads)
  const [selecionado, setSelecionado] = useState(0)
  const [acesos, setAcesos] = useState<Set<number>>(new Set())
  const [tocando, setTocando] = useState<Set<number>>(new Set())

  const pads = useMemo(() => padIds.map((id) => (id ? (porId.get(id) ?? null) : null)), [padIds, porId])
  const padsRef = useRef(pads)
  padsRef.current = pads
  const configsRef = useRef(configs)
  configsRef.current = configs

  useEffect(() => motor.observar(() => setTocando(new Set(Array.from({ length: TOTAL_PADS }, (_, i) => i).filter((i) => motor.padTocando(i))))), [])
  useEffect(() => gravarAjuste('pads', padIds), [padIds])
  useEffect(() => gravarAjuste('padsConfig', configs), [configs])
  // Mantém os buffers dos pads decodificados para disparo imediato
  useEffect(() => {
    pads.forEach((s, i) => void motor.prepararPad(i, s).catch(() => undefined))
  }, [pads])

  const disparar = useCallback((i: number): void => {
    const s = padsRef.current[i]
    setSelecionado(i)
    if (!s) {
      return
    }
    const cfg = configsRef.current[i]
    // Loop alterna: segundo toque para o pad
    if (cfg.modo === 'loop' && motor.padTocando(i)) {
      motor.pararPad(i)
      return
    }
    // Grupo de corte: os outros pads do mesmo grupo param (fade curtíssimo, sem estalo)
    const cortar = (): void => padsACortar(configsRef.current, i).forEach((j) => motor.pararPad(j, 0.008))
    if (motor.dispararPad(i, cfg)) {
      cortar()
    } else {
      void motor.prepararPad(i, s).then(() => {
        if (motor.dispararPad(i, configsRef.current[i])) {
          cortar()
        }
      })
    }
    setAcesos((a) => new Set(a).add(i))
    window.setTimeout(
      () =>
        setAcesos((a) => {
          const n = new Set(a)
          n.delete(i)
          return n
        }),
      140
    )
  }, [])

  /** Soltar a tecla/mouse: só o modo gate para o som. */
  const soltar = useCallback((i: number): void => {
    if (configsRef.current[i].modo === 'gate') {
      motor.pararPad(i)
    }
  }, [])

  const mudarConfig = (i: number, parcial: Partial<ConfigPad>): void => {
    const nova = normalizarConfigPad({ ...configs[i], ...parcial })
    setConfigs((l) => l.map((c, k) => (k === i ? nova : c)))
    motor.atualizarPad(i, nova)
  }

  /** Coloca o sample num pad, substituindo o que houver. */
  const colocar = (i: number, id: string): void => {
    if (padIds[i] !== id) {
      // Outro áudio: o trecho marcado não vale mais
      setConfigs((l) => l.map((c, k) => (k === i ? { ...c, inicio: 0, fim: null } : c)))
    }
    setPadIds((l) => l.map((x, k) => (k === i ? id : x)))
  }

  const mover = (de: number, para: number): void => {
    const trocar = <T,>(l: T[]): T[] => {
      const n = [...l]
      ;[n[de], n[para]] = [n[para], n[de]]
      return n
    }
    setPadIds(trocar)
    setConfigs(trocar)
    motor.pararPad(de)
    motor.pararPad(para)
  }

  /** Cada sample vai para o próximo pad livre. */
  const adicionar = (ids: string[]): void => {
    abrirPainel()
    const atual = [...padIds]
    const preenchidos = new Set<number>()
    let semEspaco = false
    let repetidos = 0
    for (const id of ids) {
      if (atual.includes(id)) {
        repetidos++
        continue
      }
      const livre = atual.indexOf(null)
      if (livre < 0) {
        semEspaco = true
        break
      }
      atual[livre] = id
      preenchidos.add(livre)
    }
    setPadIds(atual)
    if (preenchidos.size > 0) {
      setConfigs((l) => l.map((c, k) => (preenchidos.has(k) ? { ...c, inicio: 0, fim: null } : c)))
    }
    if (semEspaco) {
      avisar('Todos os pads estão ocupados — arraste o sample sobre um pad para substituir')
    } else if (repetidos > 0 && repetidos === ids.length) {
      avisar('Esse sample já está num pad')
    }
  }

  /** Solta num pad o que está sendo arrastado (da lista ou de outro pad). */
  const soltarNoPad = (i: number): void => {
    const a = consumirArrasto()
    if (!a) {
      return
    }
    if (a.origemPad !== undefined) {
      if (a.origemPad !== i) {
        mover(a.origemPad, i)
      }
    } else {
      colocar(i, a.sample.id)
    }
  }

  const remover = (i: number): void => {
    setPadIds((l) => l.map((x, k) => (k === i ? null : x)))
    setConfigs((l) => l.map((c, k) => (k === i ? { ...c, inicio: 0, fim: null } : c)))
  }

  const resetarTodos = (): void => {
    setConfigs(configsPadrao())
    for (let i = 0; i < TOTAL_PADS; i++) {
      motor.atualizarPad(i, CONFIG_PADRAO)
    }
  }

  const limpar = (): void => {
    motor.pararPads()
    setPadIds(Array(TOTAL_PADS).fill(null))
    setConfigs(configsPadrao())
  }

  /** Preenche os pads de uma vez (modo demonstração). */
  const definirIds = (ids: (string | null)[]): void => setPadIds(Array.from({ length: TOTAL_PADS }, (_, k) => ids[k] ?? null))

  return {
    pads,
    configs,
    selecionado,
    setSelecionado,
    acesos,
    tocando,
    disparar,
    soltar,
    mudarConfig,
    adicionar,
    soltarNoPad,
    remover,
    resetarTodos,
    limpar,
    definirIds
  }
}
