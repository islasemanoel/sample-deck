import { promises as fs, readFileSync } from 'fs'
import { dirname } from 'path'
import { normalizarBiblioteca } from '@shared/biblioteca'
import type { Biblioteca } from '@shared/tipos'

/** Espera padrão antes de gravar uma alteração agendada (várias alterações seguidas viram uma gravação). */
const ATRASO_PADRAO_MS = 1000

/**
 * Persistência da biblioteca em um arquivo JSON.
 * A gravação é atômica (arquivo temporário + rename) e serializada,
 * para não corromper o arquivo se o app fechar no meio.
 *
 * `agendar` junta alterações próximas (curtir vários samples, lotes da varredura) numa só
 * gravação; `esvaziar` grava na hora o que estiver pendente e espera terminar (chamar ao sair).
 */
export class ArmazenamentoBiblioteca {
  private fila: Promise<void> = Promise.resolve()
  private pendente: Biblioteca | null = null
  private temporizador: ReturnType<typeof setTimeout> | undefined

  /**
   * @param arquivo caminho do JSON (normalmente em userData)
   * @param atrasoMs espera de `agendar` antes de gravar
   * @param aoFalhar chamado quando uma gravação agendada falha (disco cheio, sem permissão...)
   */
  constructor(
    private readonly arquivo: string,
    private readonly atrasoMs = ATRASO_PADRAO_MS,
    private readonly aoFalhar: (erro: unknown) => void = () => undefined
  ) {}

  /** Lê a biblioteca; arquivo ausente ou inválido gera biblioteca vazia. */
  carregar(): Biblioteca {
    try {
      return normalizarBiblioteca(JSON.parse(readFileSync(this.arquivo, 'utf8')))
    } catch {
      return normalizarBiblioteca(null)
    }
  }

  /** Grava agora; gravações são feitas em ordem. */
  salvar(b: Biblioteca): Promise<void> {
    const conteudo = JSON.stringify(b)
    this.fila = this.fila
      .catch(() => undefined)
      .then(async () => {
        await fs.mkdir(dirname(this.arquivo), { recursive: true })
        const tmp = `${this.arquivo}.tmp`
        await fs.writeFile(tmp, conteudo, 'utf8')
        await fs.rename(tmp, this.arquivo)
      })
    return this.fila
  }

  /** Guarda o estado para gravar em breve; só o mais recente é gravado. */
  agendar(b: Biblioteca): void {
    this.pendente = b
    if (this.temporizador === undefined) {
      this.temporizador = setTimeout(() => {
        this.esvaziar().catch(this.aoFalhar)
      }, this.atrasoMs)
    }
  }

  /** Grava já o que estiver agendado e espera a fila de gravações terminar. */
  async esvaziar(): Promise<void> {
    clearTimeout(this.temporizador)
    this.temporizador = undefined
    const b = this.pendente
    this.pendente = null
    if (b) {
      await this.salvar(b)
    } else {
      await this.fila
    }
  }
}
