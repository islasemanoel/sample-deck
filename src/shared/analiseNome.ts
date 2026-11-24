import type { TipoSample } from './tipos'

/**
 * Extração de metadados musicais a partir do nome do arquivo e das pastas.
 * Bibliotecas de samples costumam codificar BPM, tom e tipo no próprio nome
 * (ex.: "PMAL_Bass_loops_126_Emin_classic.wav").
 */

/** Categorias de instrumento: chave → rótulo exibido e cor do cartão. */
export const CATEGORIAS: Record<string, { rotulo: string; cor: string }> = {
  drums: { rotulo: 'Bateria', cor: '#ff6b5e' },
  percussion: { rotulo: 'Percussão', cor: '#ff8f4d' },
  bass: { rotulo: 'Baixo', cor: '#a35cff' },
  guitar: { rotulo: 'Guitarra', cor: '#7ce04a' },
  keys: { rotulo: 'Teclas', cor: '#ffc23d' },
  synth: { rotulo: 'Synth', cor: '#2ec4b6' },
  strings: { rotulo: 'Cordas', cor: '#3a86ff' },
  brass: { rotulo: 'Sopros', cor: '#f15bb5' },
  vocals: { rotulo: 'Vocais', cor: '#ff5d8f' },
  melodic: { rotulo: 'Melódicos', cor: '#6c7bff' },
  fx: { rotulo: 'Efeitos', cor: '#8d99ae' },
  outros: { rotulo: 'Outros', cor: '#c9c9c9' }
}

/** Gêneros reconhecidos (são tags). */
export const GENEROS = [
  'house', 'deep house', 'techno', 'trap', 'hip hop', 'lofi', 'edm', 'pop', 'rnb',
  'dnb', 'dubstep', 'ambient', 'cinematic', 'afro', 'reggaeton', 'funk', 'jazz',
  'soul', 'rock', 'garage', 'drill'
]

/** Palavra (minúscula) → tags geradas. */
const DICIONARIO: Record<string, string[]> = {
  drum: ['drums'], drums: ['drums'], kick: ['kick'], kicks: ['kick'], snare: ['snare'],
  snares: ['snare'], hat: ['hi-hat'], hats: ['hi-hat'], hihat: ['hi-hat'], hihats: ['hi-hat'],
  clap: ['clap'], claps: ['clap'], cymbal: ['cymbal'], ride: ['cymbal'], crash: ['cymbal'],
  tom: ['toms'], toms: ['toms'], fill: ['fill'], fills: ['fill'], break: ['breaks'], breaks: ['breaks'],
  perc: ['percussion'], percs: ['percussion'], percussion: ['percussion'], shaker: ['shaker'],
  conga: ['percussion'], bongo: ['percussion'], tambourine: ['percussion'],
  bass: ['bass'], sub: ['bass'], '808': ['808', 'bass'],
  synth: ['synth'], synths: ['synth'], pad: ['pad'], pads: ['pad'], lead: ['lead'], leads: ['lead'],
  pluck: ['pluck'], plucks: ['pluck'], arp: ['arp'], arps: ['arp'],
  keys: ['keys'], piano: ['keys'], rhodes: ['keys'], organ: ['keys'], epiano: ['keys'],
  guitar: ['guitar'], guitars: ['guitar'], gtr: ['guitar'],
  vocal: ['vocals'], vocals: ['vocals'], vox: ['vocals'], choir: ['vocals'], voice: ['vocals'],
  strings: ['strings'], string: ['strings'], violin: ['strings'], cello: ['strings'], viola: ['strings'],
  brass: ['brass & woodwinds'], trumpet: ['brass & woodwinds'], horn: ['brass & woodwinds'],
  horns: ['brass & woodwinds'], sax: ['brass & woodwinds'], flute: ['brass & woodwinds'],
  trombone: ['brass & woodwinds'],
  fx: ['fx'], sfx: ['fx'], riser: ['fx'], risers: ['fx'], impact: ['fx'], sweep: ['fx'], downlifter: ['fx'],
  house: ['house'], techno: ['techno'], trap: ['trap'], hiphop: ['hip hop'], lofi: ['lofi'],
  edm: ['edm'], pop: ['pop'], rnb: ['rnb'], dnb: ['dnb'], dubstep: ['dubstep'], ambient: ['ambient'],
  cinematic: ['cinematic'], afro: ['afro'], reggaeton: ['reggaeton'], funk: ['funk'], jazz: ['jazz'],
  soul: ['soul'], rock: ['rock'], garage: ['garage'], drill: ['drill'],
  dry: ['dry'], wet: ['wet'], layered: ['layered'], vinyl: ['vinyl'], tape: ['tape'],
  resampled: ['resampled'], melody: ['melody'], melodic: ['melody'], chord: ['chords'],
  chords: ['chords'], groove: ['grooves'], grooves: ['grooves'], top: ['tops'], tops: ['tops'],
  bell: ['bell'], bells: ['bell'], texture: ['texture'], atmosphere: ['texture'],
  // Abreviações e variações comuns em drum kits (levantadas em ~150 mil arquivos de kits reais)
  kik: ['kick'], kiks: ['kick'], kck: ['kick'], kickdrum: ['kick'], kickdrums: ['kick'],
  bassdrum: ['kick'], bassdrums: ['kick'], bd: ['kick'],
  snr: ['snare'], snrs: ['snare'], sn: ['snare'], sd: ['snare'], snaredrum: ['snare'], snaredrums: ['snare'],
  snarez: ['snare'], clapz: ['clap'], snap: ['clap'], snaps: ['clap'], snapz: ['clap'],
  hh: ['hi-hat'], hihatz: ['hi-hat'], hatz: ['hi-hat'],
  cymbals: ['cymbal'], cym: ['cymbal'], crashes: ['cymbal'], rides: ['cymbal'],
  rim: ['rim'], rims: ['rim'], rimshot: ['rim'], rimshots: ['rim'],
  shakers: ['shaker'], cabasa: ['shaker'],
  tamb: ['percussion'], tambourines: ['percussion'], cowbell: ['percussion'], cowbells: ['percussion'],
  triangle: ['percussion'], clave: ['percussion'], claves: ['percussion'], woodblock: ['percussion'],
  guiro: ['percussion'], atabaque: ['percussion'], timbale: ['percussion'], timbales: ['percussion'],
  congas: ['percussion'], bongos: ['percussion'], djembe: ['percussion'], agogo: ['percussion'],
  tabla: ['percussion'], cajon: ['percussion'],
  bassline: ['bass'], basslines: ['bass'], subbass: ['bass'], reese: ['bass'],
  syn: ['synth'], synthesizer: ['synth'], supersaw: ['synth'],
  keyboard: ['keys'], keyboards: ['keys'], pianos: ['keys'], organs: ['keys'],
  wurli: ['keys'], wurlitzer: ['keys'], clav: ['keys'], clavinet: ['keys'], harpsichord: ['keys'],
  glock: ['keys'], glockenspiel: ['keys'], marimba: ['keys'], vibraphone: ['keys'], xylophone: ['keys'],
  kalimba: ['keys'], celesta: ['keys'],
  banjo: ['guitar'], sitar: ['guitar'], ukulele: ['guitar'], mandolin: ['guitar'],
  violins: ['strings'], cellos: ['strings'], harp: ['strings'], harps: ['strings'],
  pizzicato: ['strings'], pizz: ['strings'],
  orchestra: ['orchestral'], orchestral: ['orchestral'], orch: ['orchestral'],
  trumpets: ['brass & woodwinds'], trombones: ['brass & woodwinds'], saxophone: ['brass & woodwinds'],
  flutes: ['brass & woodwinds'], tuba: ['brass & woodwinds'], clarinet: ['brass & woodwinds'],
  oboe: ['brass & woodwinds'], woodwind: ['brass & woodwinds'], woodwinds: ['brass & woodwinds'],
  acapella: ['vocals'], acapellas: ['vocals'], acappella: ['vocals'], acapela: ['vocals'],
  voxs: ['vocals'], voices: ['vocals'], chant: ['vocals'], chants: ['vocals'], shout: ['vocals'],
  shouts: ['vocals'], adlib: ['vocals'], adlibs: ['vocals'], phrase: ['vocals'], phrases: ['vocals'],
  tag: ['vocals'], tags: ['vocals'], voz: ['vocals'], vozes: ['vocals'],
  // "Pontos" de funk: frases e gritos curtos usados no funk carioca
  ponto: ['vocals'], pontos: ['vocals'],
  effects: ['fx'], effect: ['fx'], efx: ['fx'], scratch: ['fx'], scratches: ['fx'], noise: ['fx'],
  noises: ['fx'], whoosh: ['fx'], uplifter: ['fx'], transition: ['fx'], transitions: ['fx'],
  siren: ['fx'], sirens: ['fx'], laser: ['fx'], swell: ['fx'], foley: ['fx'],
  melodies: ['melody'], melodics: ['melody'], chop: ['chops'], chops: ['chops'],
  songstarter: ['melody'], songstarters: ['melody'], composition: ['melody'], compositions: ['melody'],
  chime: ['chimes'], chimes: ['chimes']
}

/** Pares de palavras → tag. */
const BIGRAMAS: Record<string, string> = {
  'deep house': 'deep house', 'hip hop': 'hip hop', 'lo fi': 'lofi',
  'drum and': 'dnb', 'r b': 'rnb', 'hi hat': 'hi-hat', 'e piano': 'keys',
  'song starter': 'melody', 'song starters': 'melody', 'music loop': 'melody', 'music loops': 'melody',
  'open hat': 'hi-hat', 'closed hat': 'hi-hat',
  // Cúpula do prato ("ride bell") é prato, não sino
  'ride bell': 'cymbal', 'bell ride': 'cymbal', 'cymbal bell': 'cymbal', 'cym bell': 'cymbal',
  'wind chimes': 'chimes', 'wind chime': 'chimes', 'bell tree': 'chimes', 'mark tree': 'chimes'
}

/** Ordem de tags → categoria (a primeira tag que casar define a categoria). */
const TAG_PARA_CATEGORIA: Record<string, string> = {
  drums: 'drums', kick: 'drums', snare: 'drums', 'hi-hat': 'drums', clap: 'drums', rim: 'drums',
  cymbal: 'drums', toms: 'drums', fill: 'drums', breaks: 'drums', tops: 'drums',
  percussion: 'percussion', shaker: 'percussion', chimes: 'percussion',
  bass: 'bass', '808': 'bass',
  guitar: 'guitar',
  keys: 'keys',
  synth: 'synth', pad: 'synth', lead: 'synth', pluck: 'synth', arp: 'synth', bell: 'synth',
  strings: 'strings', orchestral: 'strings',
  'brass & woodwinds': 'brass',
  vocals: 'vocals',
  // Sem instrumento definido no nome: chops de discos, acordes, melodias, song starters
  melody: 'melodic', chords: 'melodic', chops: 'melodic',
  fx: 'fx', texture: 'fx'
}

/**
 * Tags que se excluem num one-shot: um único golpe é hi-hat, prato, sino ou chimes, nunca dois.
 * (Em loops podem coexistir: hi-hat e ride tocando juntos.)
 */
const EXCLUSIVAS_ONE_SHOT = new Set(['hi-hat', 'cymbal', 'bell', 'chimes'])

/** Tags de peças de bateria, que prevalecem sobre "808" na categoria. */
const PECAS_DE_BATERIA = new Set(['kick', 'snare', 'hi-hat', 'clap', 'rim', 'cymbal', 'toms'])

/** Quebra um texto em palavras minúsculas, separando camelCase e números colados. */
export function tokenizar(texto: string): string[] {
  return texto
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([a-zA-Z])(\d)/g, '$1 $2')
    .replace(/(\d)([a-zA-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[\s_\-.()[\]&,+/\\]+/)
    .filter((t) => t.length > 0)
}

/**
 * Extrai o BPM do nome. Aceita "100bpm"/"100 BPM" (40–300) ou um número
 * isolado entre separadores na faixa 55–200, inclusive com decimais
 * ("81.5bpm", "81,5 BPM", "Loop_81.5_Amin" → 81.5).
 */
export function extrairBpm(nome: string): number | null {
  const explicito = /(?<![\d.,])(\d{2,3}(?:[.,]\d{1,2})?)\s*bpm/i.exec(nome)
  if (explicito) {
    const v = Number(explicito[1].replace(',', '.'))
    if (v >= 40 && v <= 300) {
      return v
    }
  }
  // O ponto só separa palavras quando não está entre dígitos ("81.5" fica inteiro)
  const partes = nome.split(/[\s_\-()[\]]+|(?<!\d)\.|\.(?!\d)/)
  for (const p of partes) {
    if (/^\d{2,3}(?:[.,]\d{1,2})?$/.test(p) && !p.startsWith('0')) {
      const v = Number(p.replace(',', '.'))
      if (v >= 55 && v <= 200) {
        return v
      }
    }
  }
  return null
}

/**
 * Extrai o tom musical. A nota precisa ser maiúscula e estar entre separadores;
 * nota sem modo só é aceita com acidente (ex.: "Bb", "F#").
 * Retorno normalizado: "A min", "C# maj", "Bb".
 */
export function extrairTom(nome: string): string | null {
  const texto = nome.replace(/♯/g, '#').replace(/♭/g, 'b')
  const re =
    /(?:^|[\s_\-.([])([A-G])(#|b|sharp|flat)?(?:(maj(?:or)?|min(?:or)?|m)|[\s_-](maj(?:or)?|min(?:or)?))?(?=$|[\s_\-.)\]])/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(texto)) !== null) {
    const nota = m[1]
    if (nota !== nota.toUpperCase()) {
      continue
    }
    const acidenteBruto = m[2] ?? ''
    const acidente =
      acidenteBruto.toLowerCase() === 'sharp' || acidenteBruto === '#'
        ? '#'
        : acidenteBruto.toLowerCase() === 'flat' || acidenteBruto === 'b'
          ? 'b'
          : ''
    // "B" seguido de "b" maiúsculo/minúsculo: só é bemol se a letra for minúscula
    if (acidenteBruto === 'B') {
      continue
    }
    const modoBruto = (m[3] ?? m[4] ?? '').toLowerCase()
    if (!modoBruto && !acidente) {
      continue
    }
    // "M" maiúsculo isolado não é modo confiável
    if (m[3] === 'M') {
      continue
    }
    const modo = modoBruto.startsWith('maj') ? 'maj' : modoBruto ? 'min' : ''
    return modo ? `${nota}${acidente} ${modo}` : `${nota}${acidente}`
  }
  return null
}

/**
 * Define se o sample é loop ou one-shot: pistas no nome têm prioridade,
 * depois pistas nas pastas e, por fim, a presença de BPM.
 */
export function extrairTipo(nome: string, pastaRelativa: string, bpm: number | null): TipoSample {
  const oneShot = /one[\s_-]?shots?|(^|[\s_\-.])(hit|hits|shot|shots)($|[\s_\-.])/i
  // Breaks e grooves são loops de bateria, mesmo sem a palavra "loop"
  const loop = /loop|(^|[\s_\-./])(breaks?|breakbeats?|grooves?)($|[\s_\-./])/i
  if (oneShot.test(nome)) {
    return 'one-shot'
  }
  if (loop.test(nome)) {
    return 'loop'
  }
  if (oneShot.test(pastaRelativa)) {
    return 'one-shot'
  }
  if (loop.test(pastaRelativa)) {
    return 'loop'
  }
  return bpm !== null ? 'loop' : 'one-shot'
}

/** Tags de um texto (nome ou uma pasta), na ordem de aparição. */
function tagsDoTexto(texto: string): string[] {
  const tags: string[] = []
  const tokens = tokenizar(texto)
  for (let i = 0; i < tokens.length; i++) {
    const par = i + 1 < tokens.length ? `${tokens[i]} ${tokens[i + 1]}` : ''
    if (par && BIGRAMAS[par]) {
      tags.push(BIGRAMAS[par])
      i++
      continue
    }
    tags.push(...(DICIONARIO[tokens[i]] ?? []))
  }
  return tags
}

/**
 * Escolhe a única tag exclusiva (hi-hat/prato/sino/chimes) de um one-shot: a primeira do nome;
 * sem nenhuma no nome, a da pasta mais funda que tenha só uma. Pastas mistas
 * ("Hats & Cymbals") não decidem. @returns null se nenhuma fonte decidir
 */
function exclusivaDoOneShot(fontes: string[][]): string | null {
  for (let i = 0; i < fontes.length; i++) {
    const ex = fontes[i].filter((t) => EXCLUSIVAS_ONE_SHOT.has(t))
    if (ex.length === 1 || (i === 0 && ex.length > 1)) {
      return ex[0]
    }
  }
  return null
}

/**
 * Extrai tags do nome e das pastas, na ordem de aparição e sem repetição.
 * @param tipo em one-shots, mantém só uma entre hi-hat, prato, sino e chimes
 */
export function extrairTags(nome: string, pastaRelativa: string, tipo?: TipoSample): string[] {
  // Nome primeiro; depois as pastas da mais funda para a raiz, pois a pasta mais próxima do
  // arquivo descreve melhor o conteúdo ("Filth Vol. 4 - Drum Kit/Music Chops" → chops, não drums)
  const fontes = [nome, ...pastaRelativa.split('/').reverse()].map(tagsDoTexto)
  const exclusiva = tipo === 'one-shot' ? exclusivaDoOneShot(fontes) : undefined
  const tags: string[] = []
  for (const t of fontes.flat()) {
    if (exclusiva !== undefined && EXCLUSIVAS_ONE_SHOT.has(t) && t !== exclusiva) {
      continue
    }
    if (!tags.includes(t)) {
      tags.push(t)
    }
  }
  return tags
}

/** Categoria de instrumento: a primeira tag que pertence a uma categoria. */
export function categoriaDe(tags: string[]): string {
  // "808" também é a bateria eletrônica (TR-808): "808 Snare", "808BD", "808 Clap" são bateria
  const bateria808 = tags.includes('808') && tags.some((t) => PECAS_DE_BATERIA.has(t))
  for (const t of tags) {
    if (bateria808 && (t === '808' || t === 'bass')) {
      continue
    }
    const c = TAG_PARA_CATEGORIA[t]
    if (c) {
      return c
    }
  }
  return 'outros'
}

/**
 * Tag principal que uma palavra (minúscula) gera no dicionário: "snares", "snr" e "sd" → "snare";
 * "808" → "808" (não "bass"). @returns null se a palavra não for do dicionário
 */
export function tagDaPalavra(palavra: string): string | null {
  return DICIONARIO[palavra]?.[0] ?? null
}

/**
 * Indica se a palavra (minúscula) nomeia um instrumento ou peça de bateria
 * (ex.: "kicks", "808", "vox"); gêneros e descritores ("trap", "dry") não contam.
 */
export function ehPalavraDeInstrumento(palavra: string): boolean {
  return (DICIONARIO[palavra] ?? []).some((t) => TAG_PARA_CATEGORIA[t] !== undefined)
}
