/**
 * Análise de BPM sob demanda (menu "Detectar BPM"). Só exibe o resultado: nada é gravado.
 * A medição (Essentia LoopBpmEstimator) está em src/main/detectorTom.ts.
 */

/** Resultado da análise de BPM de um sample. */
export interface ResultadoBpm {
  /** BPM estimado (com uma casa decimal); null se não houve estimativa. */
  bpm: number | null
  /** Confiança do Essentia (LoopBpmConfidence, 0–1). */
  confianca: number
  /** Passou no limiar padrão do LoopBpmEstimator (0,95), o mesmo usado na varredura. */
  confiavel: boolean
  /** Por que não houve estimativa. */
  motivo: string | null
  /** Segundos de áudio analisados. */
  segundos: number
  /** BPM sugerido por outro método (RhythmExtractor2013), só para conferir; null se não houver. */
  alternativa: number | null
}

/** Limiar de confiança padrão do LoopBpmEstimator. */
export const CONFIANCA_LOOP = 0.95

const BPM_MIN = 40
const BPM_MAX = 300

/** O BPM, a metade e o dobro (a confusão mais comum), dentro de 40–300. */
export function candidatosBpm(bpm: number): Array<{ fator: 0.5 | 1 | 2; bpm: number }> {
  return ([0.5, 1, 2] as const)
    .map((fator) => ({ fator, bpm: Math.round(bpm * fator * 10) / 10 }))
    .filter((c) => c.bpm >= BPM_MIN && c.bpm <= BPM_MAX)
}

/** Erro máximo (s) entre a duração do arquivo e um número inteiro de compassos. */
const TOLERANCIA_ENCAIXE = 0.03

/**
 * Quantos compassos de 4 tempos um loop de `duracao` segundos teria em `bpm`, e se a duração
 * fecha num número inteiro deles (loops costumam ser cortados em compassos exatos).
 * @returns compassos (arredondado), BPM que fecharia exatamente esses compassos e se encaixa
 */
export function encaixeNaDuracao(
  bpm: number,
  duracao: number
): { compassos: number; bpmExato: number; encaixa: boolean } | null {
  if (!(bpm > 0) || !(duracao > 0)) {
    return null
  }
  const compassos = Math.round((duracao * bpm) / 240)
  if (compassos < 1) {
    return null
  }
  const bpmExato = (compassos * 240) / duracao
  const erro = Math.abs(duracao - (compassos * 240) / bpm)
  return { compassos, bpmExato, encaixa: erro <= TOLERANCIA_ENCAIXE }
}

/** Confiança mínima do RhythmExtractor2013 (multifeature, 0–5,32) para usar o valor dele: "boa" a partir de 1,5. */
export const CONFIANCA_RITMO = 1.5
/** Diferença máxima (BPM) entre o RhythmExtractor2013 (na oitava certa) e o LoopBpmEstimator para combiná-los. */
const CONCORDANCIA_MAX = 1.25
/** Distância máxima até um BPM inteiro ou ".5" para arredondar para ele. */
const ENCAIXE_REDONDO = 0.2

/**
 * Segunda opinião para a janela "Detectar BPM": o RhythmExtractor2013 dá decimais, mas nos loops
 * com BPM conhecido trocar a estimativa por ele mais errou que acertou (76 → 76.5, 120 → 120.3).
 * Por isso ele só é mostrado como alternativa, para conferir de ouvido: quando tem confiança boa,
 * concorda com o LoopBpmEstimator na mesma oitava (até 1,25 BPM) e difere dele em pelo menos
 * 0,25 BPM. Arredonda para inteiro ou ".5" se estiver perto (81.92 → 82).
 * @returns BPM alternativo na oitava do LoopBpmEstimator, ou null
 */
export function alternativaBpm(loop: number, ritmo: { bpm: number; confianca: number } | null): number | null {
  if (!ritmo || !(ritmo.bpm > 0) || ritmo.confianca < CONFIANCA_RITMO) {
    return null
  }
  for (const fator of [1, 0.5, 2]) {
    const c = ritmo.bpm * fator
    if (Math.abs(c - loop) <= CONCORDANCIA_MAX) {
      const redondo = Math.round(c * 2) / 2
      const v = Math.abs(c - redondo) <= ENCAIXE_REDONDO ? redondo : Math.round(c * 10) / 10
      return Math.abs(v - loop) >= 0.25 ? v : null
    }
  }
  return null
}

/** Diferença máxima entre a estimativa (que o Essentia dá em inteiros) e o BPM refinado. */
const REFINO_MAX = 0.6

/**
 * Refina pela duração o BPM estimado pelo Essentia, que só dá números inteiros: se a duração
 * do arquivo fecha um número inteiro de compassos num BPM "redondo" (múltiplo de 0,5) a até
 * 0,6 BPM da estimativa, e a estimativa em si não fecha, usa esse BPM (ex.: 81 → 81.5 num loop
 * de 209,08 s = 71 compassos). Senão devolve a estimativa.
 */
export function refinarBpmPelaDuracao(bpm: number, duracao: number | null): { bpm: number; compassos: number | null } {
  const e = duracao ? encaixeNaDuracao(bpm, duracao) : null
  if (!e || e.encaixa || Math.abs(e.bpmExato - bpm) > REFINO_MAX) {
    return { bpm, compassos: e?.encaixa ? e.compassos : null }
  }
  const meio = Math.round(e.bpmExato * 2) / 2
  if (Math.abs(e.bpmExato - meio) > 0.05) {
    return { bpm, compassos: null }
  }
  return { bpm: meio, compassos: e.compassos }
}

/** Texto do BPM: inteiro quando for (quase) inteiro, senão com uma casa ("92", "91.4"). */
export function formatarBpm(bpm: number): string {
  return Math.abs(bpm - Math.round(bpm)) < 0.05 ? String(Math.round(bpm)) : bpm.toFixed(1)
}
