# libKeyFinder (WASM)

`keyFinderProgressiveWorker.js` é o [libKeyFinder](https://github.com/mixxxdj/libkeyfinder)
(motor de detecção de tom do Mixxx) compilado em WebAssembly pelo projeto
[webKeyFinder](https://github.com/dogayuksel/webkeyfinder). O WASM vem embutido no arquivo.

- Licença: **GPL-3.0** (libKeyFinder e webKeyFinder). O SampleDeck é distribuído sob AGPL-3.0, licença
  compatível com a GPL-3.0, e o código-fonte completo está publicado no repositório.
- SHA-256: `95f4891fb71529c3bdd416630e3bef4e07af43b9e9a53d58dda80a3c04f17b48`
- Usado só pela janela "Detectar tom" (src/main/keyfinder.ts), num contexto `vm` isolado
  com acesso apenas a `fs` e `path`.
