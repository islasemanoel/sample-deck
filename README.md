# SampleDeck

Biblioteca de samples local para Windows (Electron + React + TypeScript).

- Indexa pastas de áudio (WAV, MP3, AIFF, FLAC, OGG, M4A) sem alterar nada no disco.
- Lê **BPM**, **tom** e **tipo** (loop/one-shot) pelo nome do arquivo e cria **tags** a partir do nome e das subpastas.
- Pré-escuta instantânea com forma de onda; ↑/↓ navega e toca.
- **Projeto** (botão ao lado do knob de tom): escolha o tom e o BPM da sua música. O knob se ajusta sozinho em cada sample para levá-lo ao tom do projeto (pelo tom do nome do arquivo; tons relativos não mudam) e os loops tocam no BPM do projeto sem mudar o tom (considerando meio tempo/tempo dobrado). **REV** toca de trás para frente. Com a opção **Arrastar para a DAW com os ajustes**, arrastar um sample da lista leva um WAV já com tom, BPM e reverso aplicados (samples de até 60 s; os mais longos vão como o arquivo original).
- Filtros por instrumento, gênero, tom, faixa de BPM, tipo e tags; busca; ordenação.
- Curtidos e coleções; exportar cópias dos arquivos.
- Arraste uma linha para a DAW ou para o Explorer.
- **Capa da pasta**: usa a imagem que vier no kit (Cover.jpg, Artwork/...) ou uma escolhida em **Capa** — buscada nas lojas The Drum Broker, Prime Loops, Kingsway Music Library, Boom Bap Labs, Touch Loops e Cymatics, ou escolhida do computador. Ao adicionar (ou reescanear) uma pasta sem capa, o app busca sozinho e grava a capa quando o produto da loja é claramente o mesmo kit (mesmo nome, autor e volume); na dúvida, não escolhe nada. As capas escolhidas ficam em `%APPDATA%\sampledeck\capas`, sem alterar a pasta do kit — a não ser que a opção **Configurações → Salvar capas encontradas na web também como cover.jpg na pasta do kit** esteja ligada (só grava com espaço em disco e nunca substitui um cover existente).
- Painel **Pads**: 9 pads estilo MPC; arraste samples da lista (ou aperte Enter) e toque com as teclas 1–9 do teclado numérico.

## Comandos

```powershell
npm install        # dependências
npm run dev        # desenvolvimento com recarga automática
npm run build      # gera out/
npm start          # roda o build
npm test           # testes (Vitest)
npm run typecheck  # verificação de tipos
```

Dados ficam em `%APPDATA%\sampledeck\biblioteca.json`.

### Instalador

A cada push na `main`, o GitHub Actions roda os testes e gera o instalador para Windows, publicado na
release [latest](../../releases/tag/latest) (link fixo: `releases/download/latest/SampleDeck-Setup.exe`).
O instalador não é assinado, então o Windows pode mostrar o aviso do SmartScreen.

Para gerar localmente: `npm run dist` (instalador em `dist/`) ou `npm run dist:dir` (pasta executável, sem instalar).

### Demonstração

```powershell
npm run demo -- C:\temp\demo-samples C:\temp\demo-dados
$env:SAMPLEDECK_DADOS="C:\temp\demo-dados"; npm start
```

Variáveis úteis: `SAMPLEDECK_DADOS` (pasta de dados alternativa), `SAMPLEDECK_DEMO=1` (abre com pads preenchidos e toca o primeiro sample),
`SAMPLEDECK_CAPTURA=arquivo.png` (salva uma captura da janela e fecha).

## Estrutura

```
src/shared/     lógica pura e testada (análise de nomes, filtros, coleções, WAV, camadas)
src/main/       processo principal: janela, varredura, persistência, protocolo sample://
src/preload/    ponte segura window.api
src/renderer/   interface React
tests/          testes Vitest
```

## Licença

SampleDeck é software livre, distribuído sob a **GNU AGPL-3.0 ou posterior** (arquivo [LICENSE](LICENSE)):
você pode usar, estudar, modificar e redistribuir, desde que mantenha a mesma licença e o código-fonte aberto.

O app embute, entre outros:

- [essentia.js](https://github.com/MTG/essentia.js) (AGPL-3.0): detecção de BPM, tom e nota.
- [libKeyFinder](https://github.com/mixxxdj/libkeyfinder) via [webKeyFinder](https://github.com/dogayuksel/webkeyfinder) (GPL-3.0): detecção de tom, em `resources/keyfinder`.
- [React](https://react.dev), [Lucide](https://lucide.dev), [music-metadata](https://github.com/Borewit/music-metadata) (MIT/ISC) e a fonte [Inter](https://rsms.me/inter) (OFL).
