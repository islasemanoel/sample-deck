/**
 * Nota fundamental de one-shots (808, baixo, notas soltas).
 *
 * Método escolhido por comparação com 596 one-shots reais com a nota no nome, seguindo
 * sugestões de fóruns de produção: ignorar o ataque (20 ms após o pico), analisar até o som
 * cair 30 dB, medir a altura quadro a quadro (YIN) e votar por nota, exigindo consenso
 * (o que também descarta notas que deslizam, como 808 com glide).
 * A medição de cada quadro fica em src/main/detectorNota.ts (Essentia PitchYin).
 */

const NOMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const CLASSE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

/** Classe de nota (0 = C ... 11 = B) de uma frequência, ignorando a oitava. */
export function classeDeFrequencia(hz: number): number {
  const midi = Math.round(69 + 12 * Math.log2(hz / 440))
  return ((midi % 12) + 12) % 12
}

/** Nome da classe de nota, com sustenido. */
export function nomeDaClasse(classe: number): string {
  return NOMES[((classe % 12) + 12) % 12]
}

/**
 * Lê a nota de um one-shot no fim do nome ("808_C", "Bass F#1", "Sub (G)", "Keys Bb").
 * Ignora numeração final ("Pluck_Eflat_2"). Bemóis viram o sustenido equivalente.
 */
export function extrairNotaDoNome(nome: string): string | null {
  const tokens = nome
    .replace(/♯/g, '#')
    .replace(/♭/g, 'b')
    .split(/[\s_\-.()[\],]+/)
    .filter((t) => t.length > 0)
  let i = tokens.length - 1
  while (i >= 0 && /^\d+$/.test(tokens[i])) {
    i--
  }
  if (i < 0) {
    return null
  }
  const m = /^([A-G])(#|b|sharp|flat)?(-?\d)?(m|min|maj|minor|major)?$/.exec(tokens[i])
  if (!m) {
    return null
  }
  const acidente = m[2] === '#' || m[2] === 'sharp' ? 1 : m[2] === 'b' || m[2] === 'flat' ? -1 : 0
  return nomeDaClasse(CLASSE[m[1]] + acidente)
}

/**
 * Região útil do som: de 20 ms após o pico (pula o ataque) até o último ponto acima de -30 dB.
 * @returns índices de início e fim, ou null em silêncio
 */
export function regiaoDoCorpo(x: Float32Array, taxa: number): { inicio: number; fim: number } | null {
  let pico = 0
  let ip = 0
  for (let i = 0; i < x.length; i++) {
    const a = Math.abs(x[i])
    if (a > pico) {
      pico = a
      ip = i
    }
  }
  if (pico <= 1e-6) {
    return null
  }
  const limite = pico * 0.0316
  let fim = x.length - 1
  while (fim > ip && Math.abs(x[fim]) < limite) {
    fim--
  }
  const inicio = ip + Math.round(0.02 * taxa)
  return inicio < fim ? { inicio, fim } : null
}

/**
 * Vota na classe de nota mais frequente entre as alturas medidas (Hz).
 * @returns classe vencedora, consenso (fração de votos) e total; null com menos de 3 alturas válidas
 */
export function votarNota(alturasHz: number[]): { classe: number; consenso: number; total: number } | null {
  const votos = new Array<number>(12).fill(0)
  let total = 0
  for (const hz of alturasHz) {
    if (hz > 0 && Number.isFinite(hz)) {
      votos[classeDeFrequencia(hz)]++
      total++
    }
  }
  if (total < 3) {
    return null
  }
  const max = Math.max(...votos)
  return { classe: votos.indexOf(max), consenso: max / total, total }
}
