import { useState } from 'react'

/**
 * Capa gerada a partir de um texto (pasta ou coleção): cores e formas
 * determinísticas, para que samples do mesmo pacote tenham a mesma arte.
 */

const PALETAS = [
  ['#ff9a8b', '#ff6a88', '#2b2d42'],
  ['#a1c4fd', '#c2e9fb', '#1d3557'],
  ['#fbc2eb', '#a6c1ee', '#3a0ca3'],
  ['#f6d365', '#fda085', '#6a040f'],
  ['#84fab0', '#8fd3f4', '#1b4332'],
  ['#ffecd2', '#fcb69f', '#7f5539'],
  ['#d4fc79', '#96e6a1', '#283618'],
  ['#e0c3fc', '#8ec5fc', '#240046'],
  ['#ff758c', '#ff7eb3', '#3d0a1f'],
  ['#30cfd0', '#330867', '#f1faee'],
  ['#fddb92', '#d1fdff', '#264653'],
  ['#434343', '#000000', '#ffb703']
]

/** Hash simples e estável de uma string. */
export function hashTexto(t: string): number {
  let h = 2166136261
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

interface Props {
  semente: string
  tamanho: number
  raio?: number
}

export function Arte({ semente, tamanho, raio = 3 }: Props): JSX.Element {
  const h = hashTexto(semente)
  const [c1, c2, c3] = PALETAS[h % PALETAS.length]
  const forma = (h >> 4) % 4
  const id = `g${h.toString(36)}`
  const r = (n: number): number => ((h >> n) & 0xff) / 255
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 100 100" style={{ borderRadius: raio, flexShrink: 0, display: 'block' }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={c1} />
          <stop offset="1" stopColor={c2} />
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill={`url(#${id})`} />
      {forma === 0 && <circle cx={30 + r(8) * 40} cy={30 + r(12) * 40} r={18 + r(16) * 14} fill={c3} opacity="0.85" />}
      {forma === 1 &&
        [0, 1, 2, 3, 4].map((i) => (
          <rect key={i} x="0" y={10 + i * 18} width="100" height={4 + r(i * 3) * 6} fill={c3} opacity="0.7" />
        ))}
      {forma === 2 && (
        <path d={`M0 ${60 + r(9) * 20} Q 30 ${20 + r(13) * 30} 55 ${55} T 100 ${40 + r(17) * 30} V100 H0Z`} fill={c3} opacity="0.8" />
      )}
      {forma === 3 && (
        <g fill="none" stroke={c3} strokeWidth="5" opacity="0.8">
          <circle cx="50" cy="50" r="14" />
          <circle cx="50" cy="50" r="28" />
          <circle cx="50" cy="50" r="42" />
        </g>
      )}
    </svg>
  )
}

/**
 * Capa grande de cabeçalho, com o título desenhado em letras contornadas.
 * Com `imagem` (a capa encontrada na pasta do kit), mostra a imagem no lugar da arte gerada;
 * se ela não carregar, volta para a arte gerada.
 */
export function ArteCabecalho({
  semente,
  titulo,
  rotulo,
  imagem
}: {
  semente: string
  titulo: string
  rotulo: string
  imagem?: string | null
}): JSX.Element {
  const [falhou, setFalhou] = useState<string | null>(null)
  if (imagem && falhou !== imagem) {
    return (
      <div className="arte-cabecalho">
        <img className="arte-cabecalho-imagem" src={imagem} alt={`Capa de ${titulo}`} draggable={false} onError={() => setFalhou(imagem)} />
      </div>
    )
  }
  const palavras = titulo.toUpperCase().split(/\s+/).slice(0, 3)
  return (
    <div className="arte-cabecalho">
      <Arte semente={semente} tamanho={168} raio={2} />
      <div className="arte-cabecalho-moldura">
        <div className="arte-cabecalho-topo">{rotulo}</div>
        <div className="arte-cabecalho-titulo">
          {palavras.map((p, i) => (
            <span key={i}>{p}</span>
          ))}
        </div>
        <div className="arte-cabecalho-base">SAMPLEDECK</div>
      </div>
    </div>
  )
}
