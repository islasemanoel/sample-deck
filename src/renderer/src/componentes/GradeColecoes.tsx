import { Heart, Plus } from 'lucide-react'
import type { Biblioteca } from '@shared/tipos'
import { ArteCabecalho } from './Arte'

/** Grade com todas as coleções. */
export function GradeColecoes(p: {
  biblioteca: Biblioteca
  aoAbrir: (id: string) => void
  aoNova: () => void
  aoCurtidos: () => void
}): JSX.Element {
  return (
    <section className="grade-colecoes">
      <h1>Coleções</h1>
      <div className="grade">
        <button className="cartao-colecao" onClick={p.aoCurtidos}>
          <div className="cartao-colecao-arte curtidos">
            <Heart size={42} fill="currentColor" />
          </div>
          <div className="cartao-colecao-nome">Curtidos</div>
          <div className="cartao-colecao-sub">{p.biblioteca.favoritos.length} samples</div>
        </button>
        {p.biblioteca.colecoes.map((c) => (
          <button key={c.id} className="cartao-colecao" onClick={() => p.aoAbrir(c.id)}>
            <div className="cartao-colecao-arte">
              <ArteCabecalho semente={c.id} titulo={c.nome} rotulo="COLEÇÃO" />
            </div>
            <div className="cartao-colecao-nome">{c.nome}</div>
            <div className="cartao-colecao-sub">{c.sampleIds.length} samples</div>
          </button>
        ))}
        <button className="cartao-colecao nova" onClick={p.aoNova}>
          <div className="cartao-colecao-arte">
            <Plus size={36} />
          </div>
          <div className="cartao-colecao-nome">Nova coleção</div>
        </button>
      </div>
    </section>
  )
}
