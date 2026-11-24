import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  ArrowUpDown,
  Copy,
  Download,
  FolderOpen,
  FolderPlus,
  Heart,
  Music2,
  Gauge,
  Grid3x3,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Search,
  Shuffle,
  Square,
  Trash2,
  X,
  Image as ImageIcon
} from 'lucide-react'
import { GENEROS } from '@shared/analiseNome'
import { avisoCopiaCapa } from '@shared/capa'
import { sugerirCamadas } from '@shared/camadas'
import { TONS_PROJETO, normalizarBpmProjeto } from '@shared/projeto'
import {
  contarFiltrosAtivos,
  embaralhar,
  filtrarSamples,
  filtrosVazios,
  ordenarSamples,
  tagsMaisFrequentes,
  tonsDisponiveis,
  type Direcao,
  type Filtros,
  type Ordenacao
} from '@shared/filtros'
import type { Sample } from '@shared/tipos'
import { ArteCabecalho, Arte } from './componentes/Arte'
import { BarraFiltros } from './componentes/BarraFiltros'
import { BarraLateral } from './componentes/BarraLateral'
import { BarraTitulo } from './componentes/BarraTitulo'
import { Menu, type ItemMenu } from './componentes/Menu'
import { ModalConfirmacao, ModalTexto } from './componentes/Modal'
import { esquecerCapasCompacto, ModoCompacto } from './componentes/ModoCompacto'
import { ModalCapa } from './componentes/ModalCapa'
import { ModalAnaliseTom } from './componentes/ModalAnaliseTom'
import { ModalAnaliseBpm } from './componentes/ModalAnaliseBpm'
import { ModalConfiguracoes } from './componentes/ModalConfiguracoes'
import { gravarAjuste, lerAjuste, lerAjusteNumero } from './preferencias'
import { LARGURA_PAINEL_MAX, LARGURA_PAINEL_MIN, LARGURA_PAINEL_PADRAO, PainelPads } from './componentes/PainelPads'
import { Player, VOLUME_PADRAO } from './componentes/Player'
import { projetoEfetivo, type AjustesProjeto } from './componentes/PainelProjeto'
import { TabelaSamples } from './componentes/TabelaSamples'
import { AJUSTE_ARRASTAR_COM_AJUSTES, iniciarArrastoSample } from './arrasto'
import { GradeColecoes } from './componentes/GradeColecoes'
import { ModalAjuda } from './componentes/ModalAjuda'
import { useAtalhos } from './hooks/useAtalhos'
import { useAviso } from './hooks/useAviso'
import { useBiblioteca } from './hooks/useBiblioteca'
import { useHistorico } from './hooks/useHistorico'
import { usePads } from './hooks/usePads'
import { motor } from './motorAudio'
import { geradorComSemente, nomeDaPasta, rotuloEscopoLocal, samplesDaVisao, samplesDesatualizados, type Visao } from './visao'

type CampoOrdem = Ordenacao | 'padrao' | 'aleatorio'

const ROTULOS_ORDEM: Record<CampoOrdem, string> = {
  padrao: 'Padrão',
  recentes: 'Mais recentes',
  nome: 'Nome',
  bpm: 'BPM',
  duracao: 'Duração',
  tom: 'Tom',
  pasta: 'Pasta',
  kit: 'Drum kit/pack',
  aleatorio: 'Aleatória'
}


/** Raiz da interface: estado da biblioteca, navegação, reprodução e painel Criar. */
export function App(): JSX.Element {
  const { aviso, avisar, executar } = useAviso()
  const { bib, setBib, aplicar, progresso } = useBiblioteca()
  const { hist, visao, ir, voltar, avancar } = useHistorico()
  const [filtros, setFiltros] = useState<Filtros>(filtrosVazios())
  const [soCurtidos, setSoCurtidos] = useState(false)
  const [ordem, setOrdem] = useState<{ campo: CampoOrdem; direcao: Direcao }>({ campo: 'padrao', direcao: 'desc' })
  const [semente, setSemente] = useState(() => Date.now() % 100000)
  const [buscaLocalAberta, setBuscaLocalAberta] = useState(false)
  // Numa visão restrita (pasta, coleção...), a busca pode olhar só ela ou a biblioteca inteira
  const [buscaEmTudo, setBuscaEmTudo] = useState(false)
  const [cursorId, setCursorId] = useState<string | null>(null)
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const ultimoClicado = useRef<string | null>(null)
  const [tocandoId, setTocandoId] = useState<string | null>(null)
  const [carregandoId, setCarregandoId] = useState<string | null>(null)
  const [painelAberto, setPainelAberto] = useState(() => lerAjuste('painelAberto') !== false)
  const [larguraPainel, setLarguraPainel] = useState(() =>
    Math.min(LARGURA_PAINEL_MAX, Math.max(LARGURA_PAINEL_MIN, lerAjusteNumero('larguraPainel', LARGURA_PAINEL_PADRAO)))
  )
  const [larguraLateral, setLarguraLateral] = useState(() =>
    Math.min(480, Math.max(160, lerAjusteNumero('larguraLateral', 212)))
  )
  const [modal, setModal] = useState<ReactNode>(null)
  const [menu, setMenu] = useState<{ ancora: DOMRect; itens: ItemMenu[]; alinhar?: 'direita' } | null>(null)
  const [volume, setVolume] = useState(() => lerAjusteNumero('volume', VOLUME_PADRAO))
  // Espelho do tom do motor (que pode mudá-lo sozinho ao ajustar cada sample ao tom do projeto)
  const [tom, setTom] = useState(0)
  const [repetir, setRepetir] = useState(() => lerAjusteNumero('repetir', 0) === 1)
  const [reverso, setReverso] = useState(false)
  // Tom e BPM do projeto: a pré-escuta transpõe os samples e ajusta o andamento dos loops
  // (cada um tem uma chave liga/desliga; desligado, o valor fica guardado)
  const [projeto, setProjeto] = useState<AjustesProjeto>(() => {
    const t = lerAjuste('tomProjeto')
    return {
      tom: typeof t === 'string' && TONS_PROJETO.includes(t) ? t : null,
      bpm: normalizarBpmProjeto(lerAjuste('bpmProjeto')),
      tomLigado: lerAjuste('tomProjetoLigado') !== false,
      bpmLigado: lerAjuste('bpmProjetoLigado') !== false
    }
  })
  const [arrastarAjustado, setArrastarAjustado] = useState(() => lerAjuste(AJUSTE_ARRASTAR_COM_AJUSTES) === true)
  // Modo compacto: janela estreita com a lista de pastas, para usar ao lado da DAW
  const [compacto, setCompacto] = useState(() => lerAjuste('compacto') === true)
  const rolagem = useRef<HTMLDivElement>(null)

  // ---------- carregamento e eventos globais ----------

  useEffect(
    () =>
      motor.observar(() => {
        setTocandoId(motor.sampleAtual()?.id ?? null)
        setTom(motor.tomAtual())
      }),
    []
  )

  useEffect(() => {
    motor.definirVolume(volume)
    gravarAjuste('volume', volume)
  }, [volume])

  const mudarTom = useCallback((semitons: number) => {
    motor.definirTom(semitons)
    setTom(motor.tomAtual())
  }, [])

  useEffect(() => {
    const efetivo = projetoEfetivo(projeto)
    motor.definirProjeto(efetivo.tom, efetivo.bpm)
    gravarAjuste('tomProjeto', projeto.tom ?? undefined)
    gravarAjuste('bpmProjeto', projeto.bpm ?? undefined)
    gravarAjuste('tomProjetoLigado', projeto.tomLigado)
    gravarAjuste('bpmProjetoLigado', projeto.bpmLigado)
  }, [projeto])

  useEffect(() => {
    motor.definirReverso(reverso)
  }, [reverso])

  useEffect(() => {
    motor.definirRepetir(repetir)
    gravarAjuste('repetir', repetir ? 1 : 0)
  }, [repetir])

  // Capa da pasta aberta (Cover.jpg, Artwork/...); procura de novo ao reescanear
  const [capa, setCapa] = useState<{ pasta: string; url: string | null; escolhida: boolean } | null>(null)
  const [versaoCapa, setVersaoCapa] = useState(0)
  const pastaAberta = visao.tipo === 'pasta' ? visao.caminho : null
  const samplesDaBib = bib?.samples
  useEffect(() => {
    if (!pastaAberta) {
      return
    }
    let ativo = true
    void window.api.capaDaPasta(pastaAberta).then((c) => {
      if (ativo) {
        setCapa({ pasta: pastaAberta, url: c?.url ?? null, escolhida: c?.escolhida ?? false })
      }
    })
    return () => {
      ativo = false
    }
  }, [pastaAberta, samplesDaBib, versaoCapa])
  useEffect(
    () =>
      window.api.aoCapaAutomatica((c) => {
        setVersaoCapa((v) => v + 1)
        avisar(`Capa encontrada: ${c.titulo} (${c.loja})${avisoCopiaCapa(c.copia)}`)
      }),
    [avisar]
  )

  const porId = useMemo(() => new Map((bib?.samples ?? []).map((s) => [s.id, s])), [bib?.samples])
  const favoritos = useMemo(() => new Set(bib?.favoritos ?? []), [bib?.favoritos])

  // ---------- lista visível ----------

  const escopoLocal = rotuloEscopoLocal(visao)
  // Com "Todas as pastas" ligado, busca e filtros olham a biblioteca inteira; sem nenhum critério
  // ativo a lista continua mostrando só a visão aberta.
  const escopoTudo = buscaEmTudo && escopoLocal !== null
  const temCriterio = filtros.busca.trim() !== '' || contarFiltrosAtivos(filtros) > 0 || soCurtidos
  const buscandoEmTudo = escopoTudo && temCriterio
  const daVisao = useMemo(
    () => (bib ? samplesDaVisao(bib, buscandoEmTudo ? { tipo: 'todos' } : visao, semente) : []),
    [bib, visao, semente, buscandoEmTudo]
  )
  const base = useMemo(() => (soCurtidos ? daVisao.filter((s) => favoritos.has(s.id)) : daVisao), [daVisao, soCurtidos, favoritos])
  // Opções dos filtros (tags, tons, instrumentos...): da biblioteca toda quando o escopo é "Todas as pastas"
  const baseOpcoes = useMemo(() => {
    if (!escopoTudo || !bib || buscandoEmTudo) {
      return base
    }
    return soCurtidos ? bib.samples.filter((s) => favoritos.has(s.id)) : bib.samples
  }, [escopoTudo, buscandoEmTudo, bib, base, soCurtidos, favoritos])
  const visiveis = useMemo(() => {
    const filtrados = filtrarSamples(base, filtros)
    if (ordem.campo === 'padrao') {
      return filtrados
    }
    if (ordem.campo === 'aleatorio') {
      return embaralhar(filtrados, geradorComSemente(semente))
    }
    return ordenarSamples(filtrados, ordem.campo, ordem.direcao)
  }, [base, filtros, ordem, semente])

  const tagsTopo = useMemo(() => tagsMaisFrequentes(baseOpcoes, 14), [baseOpcoes])
  const todasAsTags = useMemo(() => tagsMaisFrequentes(baseOpcoes, 300), [baseOpcoes])
  const tons = useMemo(() => tonsDisponiveis(baseOpcoes), [baseOpcoes])
  const generosPresentes = useMemo(() => new Set(todasAsTags.map((t) => t.tag).filter((t) => GENEROS.includes(t))), [todasAsTags])
  const categoriasPresentes = useMemo(() => new Set(baseOpcoes.map((s) => s.categoria)), [baseOpcoes])

  // ---------- navegação ----------

  // Ao trocar de visão, volta ao topo e zera filtros e seleção
  // (exceto ao ir de uma pasta para "Todas as pastas" pelo botão de escopo, que leva os filtros junto)
  const manterFiltros = useRef(false)
  useEffect(() => {
    if (manterFiltros.current) {
      manterFiltros.current = false
    } else {
      setFiltros((f) => ({ ...filtrosVazios(), busca: f.busca }))
      setSoCurtidos(false)
    }
    setSelecionados(new Set())
    setOrdem({ campo: 'padrao', direcao: 'desc' })
    setBuscaLocalAberta(false)
    setBuscaEmTudo(false)
    if (visao.tipo === 'explorar') {
      setSemente(Date.now() % 100000)
    }
    rolagem.current?.scrollTo({ top: 0 })
  }, [hist.i, hist.pilha])

  // Filtro, busca, ordem ou "Curtidos" mudaram: a lista é outra, então a posição antiga não
  // significa nada. Se estava rolado para dentro da lista, volta ao começo dos resultados
  // (com a barra de filtros logo acima); se estava acima disso, não mexe.
  const barraResultados = useRef<HTMLDivElement>(null)
  const primeiraLista = useRef(true)
  useLayoutEffect(() => {
    if (primeiraLista.current) {
      primeiraLista.current = false
      return
    }
    const c = rolagem.current
    const r = barraResultados.current
    if (!c || !r) {
      return
    }
    const inicio = r.getBoundingClientRect().top - c.getBoundingClientRect().top + c.scrollTop - 12
    if (c.scrollTop > inicio) {
      c.scrollTop = Math.max(0, inicio)
    }
  }, [filtros, soCurtidos, ordem, semente, buscandoEmTudo])

  /** Alterna entre o modo completo e o compacto (o processo principal redimensiona a janela). */
  const alternarCompacto = (): void => {
    const novo = !compacto
    if (novo) {
      esquecerCapasCompacto()
    }
    setMenu(null)
    setCompacto(novo)
    void window.api.definirCompacto(novo).then((final) => setCompacto(final))
  }

  /**
   * Botão "Nesta pasta / Todas as pastas": numa pasta, abre a visão "Todas as pastas" mantendo
   * busca e filtros; nas demais visões restritas (coleção, Curtidos...), alterna o escopo ali mesmo.
   */
  const alternarEscopo = (): void => {
    if (visao.tipo === 'pasta') {
      manterFiltros.current = true
      ir({ tipo: 'todasPastas' })
    } else {
      setBuscaEmTudo((v) => !v)
    }
  }

  const buscarGlobal = (t: string): void => {
    setFiltros((f) => ({ ...f, busca: t }))
    if (visao.tipo === 'colecoes') {
      ir({ tipo: 'todos' })
    }
  }

  // ---------- reprodução ----------

  /** Toca o sample do início, sinalizando "carregando" até começar. */
  const iniciar = useCallback(
    (s: Sample) => {
      setCursorId(s.id)
      setCarregandoId(s.id)
      void executar(() => motor.tocar(s)).finally(() => setCarregandoId((c) => (c === s.id ? null : c)))
    },
    [executar]
  )

  const tocar = useCallback(
    (s: Sample) => {
      if (motor.sampleAtual()?.id === s.id) {
        setCursorId(s.id)
        motor.pararPreview()
        return
      }
      iniciar(s)
    },
    [iniciar]
  )

  const moverCursor = useCallback(
    (passo: number) => {
      if (visiveis.length === 0) {
        return
      }
      const i = visiveis.findIndex((s) => s.id === cursorId)
      const novo = i < 0 ? 0 : Math.max(0, Math.min(visiveis.length - 1, i + passo))
      iniciar(visiveis[novo])
    },
    [visiveis, cursorId, iniciar]
  )

  const sampleEmFoco = (tocandoId && porId.get(tocandoId)) || (cursorId && porId.get(cursorId)) || null

  /** Toca do início o sample em foco (o que está tocando ou, sem reprodução, o selecionado). */
  const tocarDoInicio = (): void => {
    const s = sampleEmFoco ?? visiveis[0]
    if (s) {
      iniciar(s)
    }
  }

  const tocarParar = (): void => {
    if (tocandoId) {
      motor.pararPreview()
    } else if (sampleEmFoco) {
      tocar(sampleEmFoco)
    } else if (visiveis[0]) {
      tocar(visiveis[0])
    }
  }

  // ---------- biblioteca ----------

  const adicionarPasta = async (): Promise<void> => {
    const nova = await executar(() => window.api.adicionarPasta())
    if (nova) {
      setBib(nova)
      avisar(`${nova.samples.length} samples na biblioteca`)
    }
  }

  const reescanear = async (pasta?: string): Promise<void> => {
    const nova = await executar(() => window.api.reescanear(pasta))
    if (nova) {
      setBib(nova)
      avisar(pasta ? `${nomeDaPasta(pasta)} atualizada` : 'Biblioteca atualizada')
    }
  }

  const confirmarRemoverPasta = (pasta: string): void => {
    setModal(
      <ModalConfirmacao
        titulo="Remover pasta da biblioteca?"
        mensagem={`Os samples de "${nomeDaPasta(pasta)}" saem da biblioteca, das coleções e dos curtidos. Os arquivos no disco não são apagados.`}
        rotuloConfirmar="Remover"
        aoFechar={() => setModal(null)}
        aoConfirmar={async () => {
          const nova = await executar(() => window.api.removerPasta(pasta))
          if (nova) {
            setBib(nova)
            if (visao.tipo === 'pasta' && visao.caminho === pasta) {
              ir({ tipo: 'todos' })
            }
          }
        }}
      />
    )
  }

  /** Ids afetados por uma ação na linha: a seleção inteira se a linha fizer parte dela. */
  const alvos = (s: Sample): string[] => (selecionados.has(s.id) && selecionados.size > 1 ? [...selecionados] : [s.id])

  const favoritar = async (ids: string[], valor?: boolean): Promise<void> => {
    const marcar = valor ?? !ids.every((id) => favoritos.has(id))
    const r = await executar(() => window.api.favoritar(ids, marcar))
    if (r) {
      aplicar(r)
    }
  }

  const novaColecao = (ids: string[] = []): void => {
    setModal(
      <ModalTexto
        titulo="Nova coleção"
        rotuloConfirmar="Criar"
        aoFechar={() => setModal(null)}
        aoConfirmar={async (nome) => {
          const r = await executar(() => window.api.criarColecao(nome, ids))
          if (r) {
            aplicar(r.alteracao)
            if (ids.length > 0) {
              avisar(`${ids.length} sample(s) adicionados a "${nome}"`)
            } else {
              ir({ tipo: 'colecao', id: r.id })
            }
          }
        }}
      />
    )
  }

  const adicionarAColecao = async (colecaoId: string, ids: string[]): Promise<void> => {
    const r = await executar(() => window.api.adicionarAColecao(colecaoId, ids))
    if (r) {
      aplicar(r)
      const nome = r.colecoes?.find((c) => c.id === colecaoId)?.nome
      avisar(`${ids.length} sample(s) adicionados a "${nome}"`)
    }
  }

  const removerDaColecao = async (colecaoId: string, ids: string[]): Promise<void> => {
    const r = await executar(() => window.api.removerDaColecao(colecaoId, ids))
    if (r) {
      aplicar(r)
      setSelecionados(new Set())
    }
  }

  const editarColecao = (id: string): void => {
    const c = bib?.colecoes.find((x) => x.id === id)
    if (!c) {
      return
    }
    setModal(
      <ModalTexto
        titulo="Editar coleção"
        rotuloConfirmar="Salvar"
        nomeInicial={c.nome}
        descricaoInicial={c.descricao}
        comDescricao
        aoFechar={() => setModal(null)}
        aoConfirmar={async (nome, descricao) => {
          const r = await executar(() => window.api.renomearColecao(id, nome, descricao))
          if (r) {
            aplicar(r)
          }
        }}
      />
    )
  }

  const editarCapa = (pasta: string): void => {
    setModal(
      <ModalCapa
        pasta={pasta}
        nome={nomeDaPasta(pasta)}
        temCapaEscolhida={capa?.pasta === pasta && capa.escolhida}
        aoAlterar={(mensagem) => {
          setVersaoCapa((v) => v + 1)
          avisar(mensagem)
        }}
        aoErro={avisar}
        aoFechar={() => setModal(null)}
      />
    )
  }

  const excluirColecao = (id: string): void => {
    const c = bib?.colecoes.find((x) => x.id === id)
    setModal(
      <ModalConfirmacao
        titulo="Excluir coleção?"
        mensagem={`A coleção "${c?.nome}" será excluída. Os samples continuam na biblioteca.`}
        rotuloConfirmar="Excluir"
        aoFechar={() => setModal(null)}
        aoConfirmar={async () => {
          const r = await executar(() => window.api.excluirColecao(id))
          if (r) {
            aplicar(r)
            ir({ tipo: 'colecoes' })
          }
        }}
      />
    )
  }

  const exportarCopias = async (ids: string[], titulo: string): Promise<void> => {
    const caminhos = ids.map((id) => porId.get(id)?.caminho).filter((c): c is string => !!c)
    const destino = await executar(() => window.api.exportarArquivos(caminhos, titulo))
    if (destino) {
      avisar(`${caminhos.length} arquivo(s) copiados para ${nomeDaPasta(destino)}`)
    }
  }

  // ---------- pads ----------

  const pd = usePads(porId, () => setPainelAberto(true), avisar)

  useEffect(() => {
    gravarAjuste('painelAberto', painelAberto)
  }, [painelAberto])

  const adicionarSelecionadoAosPads = (): void => {
    const ids = selecionados.size > 0 ? [...selecionados] : cursorId ? [cursorId] : []
    if (ids.length === 0) {
      avisar('Selecione um sample na lista primeiro')
      return
    }
    pd.adicionar(ids)
  }

  const arrastarSample = (s: Sample, e: React.DragEvent): void =>
    iniciarArrastoSample(
      e,
      s,
      alvos(s).map((id) => porId.get(id)?.caminho).filter((c): c is string => !!c)
    )

  // ---------- modo demonstração (capturas de tela) ----------

  const demoAplicada = useRef(false)
  useEffect(() => {
    if (!bib || demoAplicada.current || bib.samples.length === 0) {
      return
    }
    demoAplicada.current = true
    void window.api.config().then((c) => {
      if (!c.demo) {
        return
      }
      const r = sugerirCamadas(bib.samples, [], geradorComSemente(7))
      pd.definirIds(r.map((x) => x.id))
      const col = bib.colecoes[0]
      if (col) {
        ir({ tipo: 'colecao', id: col.id })
        // Toca o primeiro sample para a captura mostrar a reprodução em andamento
        const primeiro = bib.samples.find((s) => s.id === col.sampleIds[0])
        if (primeiro) {
          setCursorId(primeiro.id)
          void executar(() => motor.tocar(primeiro))
        }
      }
    })
  }, [bib, ir, executar, pd])

  // ---------- teclado ----------

  useAtalhos({
    bloqueado: !!modal || !!menu,
    dispararPad: pd.disparar,
    soltarPad: pd.soltar,
    voltar,
    avancar,
    tocarDoInicio,
    tocarParar,
    moverCursor,
    curtirEmFoco: () => sampleEmFoco && void favoritar([sampleEmFoco.id]),
    adicionarSelecionadoAosPads,
    limparSelecao: () => setSelecionados(new Set())
  })

  // ---------- menus ----------

  const itensDoSample = (s: Sample): ItemMenu[] => {
    const ids = alvos(s)
    const varios = ids.length > 1
    const todosFav = ids.every((id) => favoritos.has(id))
    const itens: ItemMenu[] = [
      {
        rotulo: tocandoId === s.id ? 'Parar' : 'Tocar',
        icone: tocandoId === s.id ? <Square size={14} /> : <Play size={14} />,
        acao: () => tocar(s)
      },
      { rotulo: varios ? `Adicionar ${ids.length} aos pads` : 'Adicionar a um pad', icone: <Grid3x3 size={14} />, acao: () => pd.adicionar(ids) },
      { rotulo: todosFav ? 'Descurtir' : 'Curtir', icone: <Heart size={14} />, acao: () => void favoritar(ids, !todosFav) },
      {
        rotulo: 'Adicionar à coleção',
        icone: <Plus size={14} />,
        filhos: [
          ...(bib?.colecoes ?? []).map((c) => ({ rotulo: c.nome, acao: () => void adicionarAColecao(c.id, ids) })),
          { rotulo: 'Nova coleção…', icone: <Plus size={14} />, separadorAntes: (bib?.colecoes.length ?? 0) > 0, acao: () => novaColecao(ids) }
        ]
      }
    ]
    if (visao.tipo === 'colecao') {
      const colId = visao.id
      itens.push({ rotulo: 'Remover desta coleção', icone: <X size={14} />, perigo: true, acao: () => void removerDaColecao(colId, ids) })
    }
    itens.push(
      {
        // analisa só o sample clicado, mesmo com vários selecionados
        rotulo: 'Detectar tom…',
        icone: <Music2 size={14} />,
        separadorAntes: true,
        acao: () => setModal(<ModalAnaliseTom sample={s} aoFechar={() => setModal(null)} />)
      },
      {
        rotulo: 'Detectar BPM…',
        icone: <Gauge size={14} />,
        acao: () => setModal(<ModalAnaliseBpm sample={s} aoFechar={() => setModal(null)} />)
      },
      { rotulo: 'Mostrar na pasta', icone: <FolderOpen size={14} />, separadorAntes: true, acao: () => window.api.mostrarNaPasta(s.caminho) },
      { rotulo: 'Copiar caminho', icone: <Copy size={14} />, acao: () => void navigator.clipboard.writeText(s.caminho).then(() => avisar('Caminho copiado')) },
      { rotulo: varios ? `Exportar ${ids.length} cópias…` : 'Exportar cópia…', icone: <Download size={14} />, acao: () => void exportarCopias(ids, 'Copiar para a pasta') }
    )
    return itens
  }

  const abrirOrdenacao = (e: React.MouseEvent<HTMLButtonElement>): void => {
    const campos: CampoOrdem[] = ['padrao', 'recentes', 'pasta', 'kit', 'nome', 'bpm', 'duracao', 'tom']
    setMenu({
      ancora: e.currentTarget.getBoundingClientRect(),
      alinhar: 'direita',
      itens: campos.map((c) => ({
        rotulo: c === 'padrao' ? rotuloOrdemPadrao(visao) : ROTULOS_ORDEM[c],
        ativo: ordem.campo === c,
        acao: () => setOrdem({ campo: c, direcao: crescentePorPadrao(c) ? 'asc' : 'desc' })
      }))
    })
  }

  const ordenarPorColuna = (campo: Ordenacao): void => {
    setOrdem((o) =>
      o.campo === campo ? { campo, direcao: o.direcao === 'asc' ? 'desc' : 'asc' } : { campo, direcao: crescentePorPadrao(campo) ? 'asc' : 'desc' }
    )
  }

  const selecionar = (s: Sample, intervalo: boolean): void => {
    setSelecionados((atual) => {
      const novo = new Set(atual)
      if (intervalo && ultimoClicado.current) {
        const a = visiveis.findIndex((x) => x.id === ultimoClicado.current)
        const b = visiveis.findIndex((x) => x.id === s.id)
        if (a >= 0 && b >= 0) {
          for (let i = Math.min(a, b); i <= Math.max(a, b); i++) {
            novo.add(visiveis[i].id)
          }
          return novo
        }
      }
      if (novo.has(s.id)) {
        novo.delete(s.id)
      } else {
        novo.add(s.id)
      }
      return novo
    })
    ultimoClicado.current = s.id
  }

  const mostrarAjuda = (): void => setModal(<ModalAjuda aoFechar={() => setModal(null)} />)

  // ---------- cabeçalho da visão ----------

  const cabecalho = (): {
    titulo: string
    rotulo: string
    semente: string
    sub: string
    descricao?: string
    imagem?: string | null
    acoes: ReactNode
  } | null => {
    if (!bib) {
      return null
    }
    const total = daVisao.length
    const sub = (extra?: string): string => [extra, `${total} samples`].filter(Boolean).join(' • ')
    const btnAdicionar = (
      <button className="botao primario" onClick={() => void adicionarPasta()}>
        <Plus size={16} /> Adicionar pasta
      </button>
    )
    switch (visao.tipo) {
      case 'explorar':
        return {
          titulo: 'Explorar',
          rotulo: 'DESCOBRIR',
          semente: 'explorar',
          sub: sub(`${bib.pastas.length} pastas`),
          descricao: 'Sua biblioteca inteira em ordem aleatória, para achar sons esquecidos. Embaralhe de novo quantas vezes quiser.',
          acoes: (
            <button className="botao primario" onClick={() => setSemente(Date.now() % 100000)}>
              <Shuffle size={15} /> Embaralhar de novo
            </button>
          )
        }
      case 'todos':
        return {
          titulo: 'Sons',
          rotulo: 'SUA BIBLIOTECA',
          semente: 'sons',
          sub: sub(`${bib.pastas.length} pastas • ${bib.favoritos.length} curtidos`),
          descricao: 'Todos os samples das pastas cadastradas, do mais novo para o mais antigo.',
          acoes: (
            <>
              {btnAdicionar}
              <button className="botao secundario" onClick={() => void reescanear()} disabled={!!progresso}>
                Reescanear
              </button>
            </>
          )
        }
      case 'todasPastas':
        return {
          titulo: 'Todas as pastas',
          rotulo: 'PASTAS',
          semente: 'todas-as-pastas',
          sub: sub(`${bib.pastas.length} pastas`),
          descricao: 'Os samples de todas as pastas cadastradas, agrupados por pasta. A busca e os filtros valem para todas elas.',
          acoes: (
            <>
              {btnAdicionar}
              <button className="botao secundario" onClick={() => void reescanear()} disabled={!!progresso}>
                <RefreshCw size={15} /> Reescanear tudo
              </button>
            </>
          )
        }
      case 'recentes':
        return {
          titulo: 'Recentes',
          rotulo: 'SUA BIBLIOTECA',
          semente: 'recentes',
          sub: sub(),
          descricao: 'Os 200 arquivos modificados mais recentemente.',
          acoes: btnAdicionar
        }
      case 'favoritos':
        return {
          titulo: 'Curtidos',
          rotulo: 'COLEÇÃO',
          semente: 'curtidos',
          sub: sub(),
          descricao: 'Samples que você curtiu (L ou ♥), do último para o primeiro.',
          acoes: (
            <button className="botao primario" onClick={() => void exportarCopias(daVisao.map((s) => s.id), 'Exportar curtidos para a pasta')} disabled={total === 0}>
              <Download size={15} /> Exportar curtidos
            </button>
          )
        }
      case 'colecao': {
        const c = bib.colecoes.find((x) => x.id === visao.id)
        if (!c) {
          return null
        }
        const colId = c.id
        return {
          titulo: c.nome,
          rotulo: 'COLEÇÃO',
          semente: c.id,
          sub: sub(`Criada em ${new Date(c.criadaEm).toLocaleDateString('pt-BR')}`),
          descricao: c.descricao || 'Sem descrição. Use “Editar” para descrever a coleção.',
          acoes: (
            <>
              <button
                className="botao primario"
                onClick={() => void exportarCopias(c.sampleIds, `Exportar "${c.nome}" para a pasta`)}
                disabled={c.sampleIds.length === 0}
              >
                <Download size={15} /> Exportar coleção
              </button>
              <button className="botao secundario" onClick={() => editarColecao(colId)}>
                <Pencil size={14} /> Editar
              </button>
              <button className="botao quadrado" onClick={() => excluirColecao(colId)} title="Excluir coleção">
                <Trash2 size={16} />
              </button>
            </>
          )
        }
      }
      case 'pasta': {
        const pasta = visao.caminho
        return {
          titulo: nomeDaPasta(pasta),
          rotulo: 'PASTA',
          semente: pasta,
          imagem: capa && capa.pasta === pasta ? capa.url : null,
          sub: sub(),
          descricao: pasta,
          acoes: (
            <>
              <button className="botao primario" onClick={() => void reescanear(pasta)} disabled={!!progresso}>
                <RefreshCw size={15} /> Reescanear
              </button>
              <button className="botao secundario" onClick={() => editarCapa(pasta)}>
                <ImageIcon size={14} /> Capa
              </button>
              <button className="botao secundario" onClick={() => confirmarRemoverPasta(pasta)}>
                Remover da biblioteca
              </button>
            </>
          )
        }
      }
      case 'colecoes':
        return null
    }
  }

  // ---------- renderização ----------

  if (!bib) {
    return <div className="carregando-app">Carregando biblioteca…</div>
  }

  const cab = cabecalho()
  const totalFiltros = contarFiltrosAtivos(filtros) + (soCurtidos ? 1 : 0)
  const bibliotecaVazia = bib.pastas.length === 0
  const desatualizados = samplesDesatualizados(bib)

  if (compacto) {
    return (
      <>
        <ModoCompacto
          biblioteca={bib}
          visao={visao}
          samples={visiveis}
          busca={filtros.busca}
          aoBuscar={(t) => setFiltros((f) => ({ ...f, busca: t }))}
          aoIr={(v) => {
            setFiltros((f) => ({ ...f, busca: '' }))
            ir(v)
          }}
          aoVoltarLista={() => {
            setFiltros((f) => ({ ...f, busca: '' }))
            ir({ tipo: 'todos' })
          }}
          aoExpandir={alternarCompacto}
          favoritos={favoritos}
          tocandoId={tocandoId}
          carregandoId={carregandoId}
          cursorId={cursorId}
          sampleEmFoco={sampleEmFoco}
          aoTocar={tocar}
          aoTocarParar={tocarParar}
          aoAnterior={() => moverCursor(-1)}
          aoProximo={() => moverCursor(1)}
          aoFavoritar={(s) => void favoritar([s.id])}
          aoArrastar={arrastarSample}
          aoMenu={(s, rect) => setMenu({ ancora: rect, itens: itensDoSample(s), alinhar: rect.width > 0 ? 'direita' : undefined })}
          volume={volume}
          aoVolume={setVolume}
          tom={tom}
          projeto={projeto}
          aoProjeto={setProjeto}
          arrastarComAjustes={arrastarAjustado}
          aoArrastarComAjustes={(v) => {
            setArrastarAjustado(v)
            gravarAjuste(AJUSTE_ARRASTAR_COM_AJUSTES, v)
          }}
        />
        {menu && <Menu ancora={menu.ancora} itens={menu.itens} alinhar={menu.alinhar} aoFechar={() => setMenu(null)} />}
        {modal}
        {aviso && <div className="aviso compacto">{aviso}</div>}
      </>
    )
  }

  return (
    <div
      className={`app${painelAberto ? '' : ' sem-painel'}`}
      style={{ ['--largura-lateral' as string]: `${larguraLateral}px`, ['--largura-painel' as string]: `${larguraPainel}px` }}
    >
      <BarraTitulo
        podeVoltar={hist.i > 0}
        podeAvancar={hist.i < hist.pilha.length - 1}
        aoVoltar={voltar}
        aoAvancar={avancar}
        busca={filtros.busca}
        aoBuscar={buscarGlobal}
        escopoLocal={escopoLocal}
        buscaEmTudo={buscaEmTudo}
        aoAlternarEscopo={alternarEscopo}
        painelAberto={painelAberto}
        aoAlternarPainel={() => setPainelAberto((a) => !a)}
        aoAjuda={mostrarAjuda}
        aoConfiguracoes={() => setModal(<ModalConfiguracoes aoFechar={() => setModal(null)} />)}
        aoReescanear={() => void reescanear()}
        varrendo={!!progresso}
        aoCompactar={alternarCompacto}
      />
      <BarraLateral
        biblioteca={bib}
        visao={visao}
        aoIr={ir}
        aoNovaColecao={() => novaColecao()}
        aoAdicionarPasta={() => void adicionarPasta()}
        aoRemoverPasta={confirmarRemoverPasta}
        aoReescanearPasta={(p) => void reescanear(p)}
        aoAbrirPasta={(p) => window.api.abrirPastaNoExplorer(p)}
        progresso={progresso}
        aoPararVarredura={() => window.api.pararVarredura()}
        largura={larguraLateral}
        aoRedimensionar={setLarguraLateral}
        aoFinalizarRedimensionar={(l) => gravarAjuste('larguraLateral', l)}
      />

      <main className="conteudo" ref={rolagem}>
        {bibliotecaVazia ? (
          <div className="estado-vazio">
            <Arte semente="vazio" tamanho={120} raio={8} />
            <h2>Sua biblioteca está vazia</h2>
            <p>Escolha uma pasta com samples (WAV, MP3, AIFF, FLAC, OGG). Subpastas também são incluídas e nada é alterado no disco.</p>
            <button className="botao primario" onClick={() => void adicionarPasta()}>
              <FolderPlus size={16} /> Adicionar pasta de samples
            </button>
          </div>
        ) : visao.tipo === 'colecoes' ? (
          <GradeColecoes biblioteca={bib} aoAbrir={(id) => ir({ tipo: 'colecao', id })} aoNova={() => novaColecao()} aoCurtidos={() => ir({ tipo: 'favoritos' })} />
        ) : (
          <>
            {desatualizados > 0 && !progresso && (
              <div className="aviso-reanalise">
                <span>
                  {desatualizados.toLocaleString('pt-BR')} samples foram indexados antes da estimativa de BPM pelo áudio.
                  Reescaneie para estimar o BPM dos loops que não trazem o andamento no nome.
                </span>
                <button className="botao primario pequeno" onClick={() => void reescanear()}>
                  Reescanear agora
                </button>
              </div>
            )}
            {cab && (
              <section className="cabecalho">
                <ArteCabecalho semente={cab.semente} titulo={cab.titulo} rotulo={cab.rotulo} imagem={cab.imagem} />
                <div className="cabecalho-info">
                  <div className="cabecalho-rotulo">{cab.rotulo === 'PASTA' ? 'Pasta' : cab.rotulo === 'COLEÇÃO' ? 'Coleção' : 'SampleDeck'}</div>
                  <h1>{cab.titulo}</h1>
                  <div className="cabecalho-sub">{cab.sub}</div>
                  <div className="cabecalho-acoes">{cab.acoes}</div>
                </div>
              </section>
            )}
            {cab?.descricao && <p className="descricao">{cab.descricao}</p>}

            <section className="secao-samples">
              <h3>Samples</h3>
              <BarraFiltros
                filtros={filtros}
                aoMudar={setFiltros}
                soCurtidos={soCurtidos}
                aoAlternarCurtidos={() => setSoCurtidos((v) => !v)}
                tags={tagsTopo}
                todasAsTags={todasAsTags}
                tons={tons}
                generosPresentes={generosPresentes}
                categoriasPresentes={categoriasPresentes}
                totalAtivos={totalFiltros}
                escopoLocal={escopoLocal}
                emTodasAsPastas={buscaEmTudo}
                aoAlternarEscopo={alternarEscopo}
                aoLimpar={() => {
                  setFiltros((f) => ({ ...filtrosVazios(), busca: f.busca }))
                  setSoCurtidos(false)
                }}
              />

              <div className="resultados" ref={barraResultados}>
                {selecionados.size > 0 ? (
                  <div className="barra-selecao">
                    <b>{selecionados.size} selecionado(s)</b>
                    <button className="link" onClick={() => pd.adicionar([...selecionados])}>
                      Adicionar aos pads
                    </button>
                    <button className="link" onClick={() => void favoritar([...selecionados])}>
                      Curtir/descurtir
                    </button>
                    <button
                      className="link"
                      onClick={(e) =>
                        setMenu({
                          ancora: e.currentTarget.getBoundingClientRect(),
                          itens: [
                            ...bib.colecoes.map((c) => ({ rotulo: c.nome, acao: () => void adicionarAColecao(c.id, [...selecionados]) })),
                            { rotulo: 'Nova coleção…', separadorAntes: bib.colecoes.length > 0, acao: () => novaColecao([...selecionados]) }
                          ]
                        })
                      }
                    >
                      Adicionar à coleção
                    </button>
                    {visao.tipo === 'colecao' && (
                      <button className="link perigo" onClick={() => void removerDaColecao(visao.id, [...selecionados])}>
                        Remover da coleção
                      </button>
                    )}
                    <button className="link" onClick={() => void exportarCopias([...selecionados], 'Copiar para a pasta')}>
                      Exportar
                    </button>
                    <button className="link suave" onClick={() => setSelecionados(new Set())}>
                      Limpar
                    </button>
                  </div>
                ) : (
                  <span className="resultados-total">
                    {visiveis.length} resultados{buscandoEmTudo && ' em todas as pastas'}
                  </span>
                )}
                <div className="resultados-acoes">
                  {buscaLocalAberta ? (
                    <div className="busca-local">
                      <Search size={13} />
                      <input
                        autoFocus
                        placeholder="Filtrar nesta lista"
                        value={filtros.busca}
                        onChange={(e) => setFiltros((f) => ({ ...f, busca: e.target.value }))}
                        onBlur={() => !filtros.busca && setBuscaLocalAberta(false)}
                      />
                    </div>
                  ) : (
                    <button className="botao quadrado pequeno" onClick={() => setBuscaLocalAberta(true)} title="Buscar nesta lista">
                      <Search size={14} />
                    </button>
                  )}
                  <button
                    className={`botao quadrado pequeno${ordem.campo === 'aleatorio' ? ' ativo' : ''}`}
                    onClick={() => {
                      setSemente(Date.now() % 100000)
                      setOrdem({ campo: 'aleatorio', direcao: 'asc' })
                    }}
                    title="Ordem aleatória"
                  >
                    <Shuffle size={14} />
                  </button>
                  <button className="botao secundario pequeno" onClick={abrirOrdenacao}>
                    {ordem.campo === 'padrao' ? rotuloOrdemPadrao(visao) : ROTULOS_ORDEM[ordem.campo]} <ArrowUpDown size={12} />
                  </button>
                </div>
              </div>

              {visiveis.length > 0 ? (
                <TabelaSamples
                  samples={visiveis}
                  rolagem={rolagem}
                  favoritos={favoritos}
                  tocandoId={tocandoId}
                  carregandoId={carregandoId}
                  cursorId={cursorId}
                  selecionados={selecionados}
                  ordem={ordem}
                  aoOrdenar={ordenarPorColuna}
                  aoClicar={tocar}
                  aoSelecionar={selecionar}
                  aoSelecionarTodos={(m) => setSelecionados(m ? new Set(visiveis.map((s) => s.id)) : new Set())}
                  aoFavoritar={(s) => void favoritar([s.id])}
                  aoMenu={(s, rect) => setMenu({ ancora: rect, itens: itensDoSample(s), alinhar: rect.width > 0 ? 'direita' : undefined })}
                  aoClicarTag={(t) => setFiltros((f) => (f.tags.includes(t) ? f : { ...f, tags: [t] }))}
                  aoArrastar={arrastarSample}
                />
              ) : (
                <div className="lista-vazia">
                  {daVisao.length === 0
                    ? visao.tipo === 'colecao'
                      ? 'Coleção vazia. Use o menu ⋮ de um sample para adicioná-lo aqui.'
                      : visao.tipo === 'favoritos'
                        ? 'Nenhum sample curtido ainda. Clique no ♥ de um sample ou aperte L.'
                        : 'Nenhum sample nesta lista.'
                    : 'Nenhum sample combina com a busca e os filtros.'}
                  {escopoLocal && !buscandoEmTudo && temCriterio && (
                    <button className="link" onClick={alternarEscopo}>
                      {filtros.busca.trim() ? `Buscar “${filtros.busca.trim()}” em todas as pastas` : 'Aplicar os filtros em todas as pastas'}
                    </button>
                  )}
                  {totalFiltros + (filtros.busca ? 1 : 0) > 0 && (
                    <button
                      className="link"
                      onClick={() => {
                        setFiltros(filtrosVazios())
                        setSoCurtidos(false)
                      }}
                    >
                      Limpar busca e filtros
                    </button>
                  )}
                </div>
              )}
            </section>
          </>
        )}
      </main>

      {painelAberto && (
        <PainelPads
          pads={pd.pads}
          configs={pd.configs}
          selecionado={pd.selecionado}
          acesos={pd.acesos}
          tocando={pd.tocando}
          aoSelecionar={pd.setSelecionado}
          aoDisparar={pd.disparar}
          aoSoltarTecla={pd.soltar}
          aoMudarConfig={pd.mudarConfig}
          aoPararTudo={() => motor.pararPads()}
          aoResetarTodos={pd.resetarTodos}
          aoRemover={pd.remover}
          aoSoltar={pd.soltarNoPad}
          aoLimpar={pd.limpar}
          aoFechar={() => setPainelAberto(false)}
          largura={larguraPainel}
          aoRedimensionar={setLarguraPainel}
          aoFinalizarRedimensionar={(l) => gravarAjuste('larguraPainel', l)}
        />
      )}

      <Player
        sample={sampleEmFoco}
        tocando={!!tocandoId}
        favorito={!!sampleEmFoco && favoritos.has(sampleEmFoco.id)}
        volume={volume}
        tom={tom}
        repetir={repetir}
        aoTocarParar={tocarParar}
        aoAnterior={() => moverCursor(-1)}
        aoProximo={() => moverCursor(1)}
        aoVolume={setVolume}
        aoTom={mudarTom}
        aoRepetir={() => setRepetir((r) => !r)}
        reverso={reverso}
        projeto={projeto}
        arrastarComAjustes={arrastarAjustado}
        aoReverso={() => setReverso((r) => !r)}
        aoProjeto={setProjeto}
        aoArrastarComAjustes={(v) => {
          setArrastarAjustado(v)
          gravarAjuste(AJUSTE_ARRASTAR_COM_AJUSTES, v)
        }}
        aoFavoritar={() => sampleEmFoco && void favoritar([sampleEmFoco.id])}
      />

      {menu && <Menu ancora={menu.ancora} itens={menu.itens} alinhar={menu.alinhar} aoFechar={() => setMenu(null)} />}
      {modal}
      {aviso && <div className="aviso">{aviso}</div>}
    </div>
  )
}

/** Campos de texto começam em ordem crescente (A→Z); números e datas, decrescente. */
function crescentePorPadrao(c: CampoOrdem): boolean {
  return c === 'nome' || c === 'tom' || c === 'pasta' || c === 'kit'
}

/** Rótulo da ordem padrão conforme a visão. */
function rotuloOrdemPadrao(v: Visao): string {
  switch (v.tipo) {
    case 'colecao':
      return 'Ordem da coleção'
    case 'favoritos':
      return 'Curtidos por último'
    case 'explorar':
      return 'Embaralhado'
    case 'todasPastas':
      return 'Por pasta'
    default:
      return 'Mais recentes'
  }
}
