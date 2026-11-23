import { useEffect, useState } from 'react'
import { ChevronDown, CircleCheck, EllipsisVertical, X } from 'lucide-react'
import { CATEGORIAS, GENEROS } from '@shared/analiseNome'
import type { Filtros } from '@shared/filtros'
import { Menu, type ItemMenu } from './Menu'

interface Props {
  filtros: Filtros
  aoMudar: (f: Filtros) => void
  soCurtidos: boolean
  aoAlternarCurtidos: () => void
  /** Tags mais frequentes na visão atual. */
  tags: { tag: string; quantidade: number }[]
  todasAsTags: { tag: string; quantidade: number }[]
  tons: string[]
  generosPresentes: Set<string>
  categoriasPresentes: Set<string>
  totalAtivos: number
  /** Rótulo do escopo restrito da visão ("Nesta pasta"...); null quando a visão já é a biblioteca toda. */
  escopoLocal: string | null
  /** Filtros aplicados em todas as pastas em vez de só na visão aberta. */
  emTodasAsPastas: boolean
  aoAlternarEscopo: () => void
  aoLimpar: () => void
}

type Aberto = { tipo: 'instrumento' | 'genero' | 'tom' | 'tipo' | 'tags'; rect: DOMRect } | { tipo: 'bpm'; rect: DOMRect }

/** Botões de filtro (menus suspensos) e linha de tags, como no topo da lista de samples. */
export function BarraFiltros(p: Props): JSX.Element {
  const [aberto, setAberto] = useState<Aberto | null>(null)
  const f = p.filtros
  const abrir = (tipo: Aberto['tipo']) => (e: React.MouseEvent<HTMLButtonElement>) =>
    setAberto({ tipo, rect: e.currentTarget.getBoundingClientRect() } as Aberto)

  const opcao = <T,>(rotulo: string, valor: T, atual: T, aplicar: (v: T | null) => void): ItemMenu => ({
    rotulo,
    ativo: valor === atual,
    acao: () => aplicar(valor === atual ? null : valor)
  })

  const itensDoMenu = (): ItemMenu[] => {
    if (!aberto) {
      return []
    }
    switch (aberto.tipo) {
      case 'instrumento':
        return Object.entries(CATEGORIAS)
          .filter(([k]) => p.categoriasPresentes.has(k))
          .map(([k, v]) => opcao(v.rotulo, k, f.instrumento, (x) => p.aoMudar({ ...f, instrumento: x })))
      case 'genero':
        return GENEROS.filter((g) => p.generosPresentes.has(g)).map((g) =>
          opcao(g, g, f.genero, (x) => p.aoMudar({ ...f, genero: x }))
        )
      case 'tom':
        return p.tons.map((t) => opcao(t, t, f.tom, (x) => p.aoMudar({ ...f, tom: x })))
      case 'tipo':
        return [
          opcao('Loops', 'loop' as const, f.tipo, (x) => p.aoMudar({ ...f, tipo: x })),
          opcao('One-shots', 'one-shot' as const, f.tipo, (x) => p.aoMudar({ ...f, tipo: x }))
        ]
      case 'tags':
        return p.todasAsTags.map((t) => ({
          rotulo: `${t.tag}  ·  ${t.quantidade}`,
          ativo: f.tags.includes(t.tag),
          acao: () => alternarTag(t.tag)
        }))
      default:
        return []
    }
  }

  const alternarTag = (tag: string): void => {
    p.aoMudar({ ...f, tags: f.tags.includes(tag) ? [] : [tag] })
  }

  const rotuloBpm =
    f.bpmMin !== null || f.bpmMax !== null ? `BPM ${f.bpmMin ?? '…'}–${f.bpmMax ?? '…'}` : 'BPM'
  const botao = (tipo: Aberto['tipo'], rotulo: string, ativo: boolean): JSX.Element => (
    <button className={`filtro${ativo ? ' ativo' : ''}`} onClick={abrir(tipo)}>
      {rotulo}
      <ChevronDown size={13} />
    </button>
  )

  return (
    <div className="barra-filtros">
      <div className="filtros-linha">
        <button className={`filtro${p.soCurtidos ? ' ativo' : ''}`} onClick={p.aoAlternarCurtidos}>
          <CircleCheck size={14} />
          Curtidos
        </button>
        {botao('instrumento', f.instrumento ? CATEGORIAS[f.instrumento].rotulo : 'Instrumentos', f.instrumento !== null)}
        {botao('genero', f.genero ?? 'Gêneros', f.genero !== null)}
        {botao('tom', f.tom ?? 'Tom', f.tom !== null)}
        {botao('bpm', rotuloBpm, f.bpmMin !== null || f.bpmMax !== null)}
        {botao('tipo', f.tipo === 'loop' ? 'Loops' : f.tipo === 'one-shot' ? 'One-shots' : 'Tipo', f.tipo !== null)}
        {p.escopoLocal && (
          <button
            className={`busca-escopo${p.emTodasAsPastas ? ' ativo' : ''}`}
            onClick={p.aoAlternarEscopo}
            title={p.emTodasAsPastas ? `Filtrar só ${p.escopoLocal.toLowerCase()}` : 'Aplicar busca e filtros em todas as pastas'}
          >
            {p.emTodasAsPastas ? 'Todas as pastas' : p.escopoLocal}
            {!p.emTodasAsPastas && <X size={11} className="busca-escopo-x" />}
          </button>
        )}
        {p.totalAtivos > 0 && (
          <button className="link" onClick={p.aoLimpar}>
            Limpar filtros ({p.totalAtivos})
          </button>
        )}
      </div>
      {p.tags.length > 0 && (
        <div className="tags-linha">
          <div className="tags-rolagem">
            {p.tags.map((t) => (
              <button
                key={t.tag}
                className={`tag-chip${f.tags.includes(t.tag) ? ' ativo' : ''}`}
                onClick={() => alternarTag(t.tag)}
              >
                {t.tag}
              </button>
            ))}
          </div>
          <button className="tags-mais" onClick={abrir('tags')} title="Todas as tags">
            <EllipsisVertical size={15} />
          </button>
        </div>
      )}
      {aberto && aberto.tipo !== 'bpm' && (
        <Menu ancora={aberto.rect} itens={itensDoMenu()} aoFechar={() => setAberto(null)} />
      )}
      {aberto && aberto.tipo === 'bpm' && (
        <PopoverBpm
          rect={aberto.rect}
          min={f.bpmMin}
          max={f.bpmMax}
          aoAplicar={(min, max) => p.aoMudar({ ...f, bpmMin: min, bpmMax: max })}
          aoFechar={() => setAberto(null)}
        />
      )}
    </div>
  )
}

/** Caixa para digitar a faixa de BPM. */
function PopoverBpm(p: {
  rect: DOMRect
  min: number | null
  max: number | null
  aoAplicar: (min: number | null, max: number | null) => void
  aoFechar: () => void
}): JSX.Element {
  const [min, setMin] = useState(p.min?.toString() ?? '')
  const [max, setMax] = useState(p.max?.toString() ?? '')
  const num = (t: string): number | null => (t.trim() === '' || isNaN(Number(t)) ? null : Number(t))
  const aplicar = (): void => {
    p.aoAplicar(num(min), num(max))
    p.aoFechar()
  }
  return (
    <div className="menu popover-bpm" style={{ left: p.rect.left, top: p.rect.bottom + 4 }} onKeyDown={(e) => e.key === 'Enter' && aplicar()}>
      <FecharFora aoFechar={p.aoFechar} />
      <div className="popover-bpm-campos">
        <input autoFocus placeholder="Mín." value={min} onChange={(e) => setMin(e.target.value)} inputMode="numeric" />
        <span>–</span>
        <input placeholder="Máx." value={max} onChange={(e) => setMax(e.target.value)} inputMode="numeric" />
      </div>
      <div className="popover-bpm-atalhos">
        {[
          [70, 90],
          [90, 110],
          [120, 130],
          [140, 160],
          [160, 180]
        ].map(([a, b]) => (
          <button key={a} className="tag-chip" onClick={() => { setMin(String(a)); setMax(String(b)) }}>
            {a}–{b}
          </button>
        ))}
      </div>
      <div className="popover-bpm-acoes">
        <button className="link" onClick={() => { p.aoAplicar(null, null); p.aoFechar() }}>
          Limpar
        </button>
        <button className="botao primario pequeno" onClick={aplicar}>
          Aplicar
        </button>
      </div>
    </div>
  )
}

/** Fecha o popover ao clicar fora dele ou apertar Esc. */
function FecharFora({ aoFechar }: { aoFechar: () => void }): null {
  useFecharFora(aoFechar)
  return null
}

function useFecharFora(aoFechar: () => void): void {
  useEffect(() => {
    const fora = (e: MouseEvent): void => {
      if (!(e.target as HTMLElement).closest('.popover-bpm')) {
        aoFechar()
      }
    }
    const tecla = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        aoFechar()
      }
    }
    window.addEventListener('mousedown', fora)
    window.addEventListener('keydown', tecla)
    return () => {
      window.removeEventListener('mousedown', fora)
      window.removeEventListener('keydown', tecla)
    }
  }, [aoFechar])
}
