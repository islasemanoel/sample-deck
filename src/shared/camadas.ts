import type { Sample } from './tipos'

/**
 * Regras do painel "Criar": camadas de samples tocadas juntas.
 */

/**
 * Escolhe outro sample da mesma categoria para trocar uma camada.
 * Prioridade: mesmo tom e BPM a até 5% → mesmo tom → qualquer da categoria.
 * @param excluir ids que não podem ser escolhidos (camadas já presentes)
 */
export function escolherSubstituto(
  atual: Sample,
  todos: Sample[],
  excluir: string[],
  aleatorio: () => number = Math.random
): Sample | null {
  const candidatos = todos.filter(
    (s) => s.categoria === atual.categoria && s.id !== atual.id && !excluir.includes(s.id)
  )
  if (candidatos.length === 0) {
    return null
  }
  const bpmProximo = (s: Sample): boolean =>
    atual.bpm === null || (s.bpm !== null && Math.abs(s.bpm - atual.bpm) <= atual.bpm * 0.05)
  const mesmoTom = (s: Sample): boolean => atual.tom === null || s.tom === atual.tom
  const niveis = [candidatos.filter((s) => mesmoTom(s) && bpmProximo(s)), candidatos.filter(mesmoTom), candidatos]
  const escolhido = niveis.find((n) => n.length > 0) as Sample[]
  return escolhido[Math.min(escolhido.length - 1, Math.floor(aleatorio() * escolhido.length))]
}

/** BPM e tom do projeto: os primeiros disponíveis na ordem das camadas. */
export function resumoProjeto(camadas: Sample[]): { bpm: number | null; tom: string | null } {
  return {
    bpm: camadas.find((s) => s.bpm !== null)?.bpm ?? null,
    tom: camadas.find((s) => s.tom !== null)?.tom ?? null
  }
}

/** Grupos preenchidos por "Gerar ideia", em ordem; `melodico` indica se o tom importa. */
const GRUPOS_IDEIA: { categorias: string[]; melodico: boolean }[] = [
  { categorias: ['drums', 'percussion'], melodico: false },
  { categorias: ['bass'], melodico: true },
  { categorias: ['keys', 'synth', 'guitar'], melodico: true },
  { categorias: ['vocals', 'strings', 'brass'], melodico: true }
]

/**
 * Completa o projeto com uma camada por grupo de instrumentos ainda ausente.
 * Só usa loops com BPM a até 5% do projeto (nunca relaxado, para manter o sincronismo);
 * para instrumentos melódicos prefere o mesmo tom, aceitando outro se não houver.
 * Projeto vazio começa por uma bateria, que define o BPM.
 */
export function sugerirCamadas(todos: Sample[], atuais: Sample[], aleatorio: () => number = Math.random): Sample[] {
  const resultado = [...atuais]
  const loops = todos.filter((s) => s.tipo === 'loop' && s.bpm !== null)
  const sortear = (lista: Sample[]): Sample =>
    lista[Math.min(lista.length - 1, Math.floor(aleatorio() * lista.length))]
  for (const grupo of GRUPOS_IDEIA) {
    if (resultado.some((s) => grupo.categorias.includes(s.categoria))) {
      continue
    }
    const { bpm, tom } = resumoProjeto(resultado)
    const usados = new Set(resultado.map((s) => s.id))
    const candidatos = loops.filter(
      (s) =>
        grupo.categorias.includes(s.categoria) &&
        !usados.has(s.id) &&
        (bpm === null || Math.abs((s.bpm as number) - bpm) <= bpm * 0.05)
    )
    if (candidatos.length === 0) {
      continue
    }
    const mesmoTom = grupo.melodico && tom !== null ? candidatos.filter((s) => s.tom === tom) : []
    resultado.push(sortear(mesmoTom.length > 0 ? mesmoTom : candidatos))
  }
  return resultado
}

const SUBSTANTIVOS = ['Tucano', 'Farol', 'Cometa', 'Jardim', 'Trovão', 'Coral', 'Ventania', 'Lagarto', 'Neblina', 'Âncora', 'Pião', 'Vulcão']
const ADJETIVOS = ['Distraído', 'Elétrico', 'Sonolento', 'Dourado', 'Inquieto', 'Noturno', 'Gentil', 'Selvagem', 'Curioso', 'Veloz', 'Solar', 'Tímido']

/** Nome divertido para o projeto atual (substantivo + adjetivo). */
export function nomeProjetoAleatorio(aleatorio: () => number = Math.random): string {
  const s = SUBSTANTIVOS[Math.floor(aleatorio() * SUBSTANTIVOS.length)]
  const a = ADJETIVOS[Math.floor(aleatorio() * ADJETIVOS.length)]
  return `${s} ${a}`
}
