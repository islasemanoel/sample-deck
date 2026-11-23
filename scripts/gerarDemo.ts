/**
 * Gera uma biblioteca de demonstração: samples sintéticos (áudio de verdade, com nomes
 * no padrão das bibliotecas comerciais) e um biblioteca.json com coleções.
 *
 * Uso: npm run demo -- <pasta-de-samples> <pasta-de-dados>
 * Depois: SAMPLEDECK_DADOS=<pasta-de-dados> npm start
 */
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { codificarWav } from '../src/shared/audio'
import { adicionarAColecao, criarColecao, definirFavoritos, mesclarVarredura, renomearColecao } from '../src/shared/biblioteca'
import { bibliotecaVazia } from '../src/shared/tipos'
import { varrerPasta } from '../src/main/varredura'

const TAXA = 22050
const NOTAS: Record<string, number> = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 }

/** Frequência da nota (oitava 3) a partir do tom no nome, ex.: "Amin" → Lá. */
function raiz(nome: string): { f: number; menor: boolean } {
  const m = /_([A-G]#?)(maj|min)?(?:_|$)/.exec(nome)
  const semitom = m ? NOTAS[m[1]] : 0
  return { f: 130.81 * Math.pow(2, semitom / 12), menor: m?.[2] === 'min' }
}

/** Sintetiza um som simples conforme o tipo indicado pelo nome. */
function sintetizar(nome: string): Float32Array {
  const bpm = Number(/_(\d{2,3})_/.exec(nome)?.[1] ?? 0)
  const n = nome.toLowerCase()
  const oneShot = /one_shot|hit|riser|_808_one/.test(n)
  const seg = oneShot ? (n.includes('riser') ? 4 : 1.2) : bpm ? (60 / bpm) * 8 : 4
  const len = Math.floor(seg * TAXA)
  const out = new Float32Array(len)
  const { f, menor } = raiz(nome)
  const batida = bpm ? 60 / bpm : 0.5
  const acorde = [1, Math.pow(2, (menor ? 3 : 4) / 12), Math.pow(2, 7 / 12)]
  let ruido = 12345
  const rnd = (): number => ((ruido = (ruido * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1
  for (let i = 0; i < len; i++) {
    const t = i / TAXA
    const tb = t % batida
    let v = 0
    if (/drum|kick|tops|percussion|shaker|clap|snare|hat/.test(n)) {
      if (/kick|drum/.test(n)) {
        v += Math.sin(2 * Math.PI * (50 + 120 * Math.exp(-tb * 30)) * tb) * Math.exp(-tb * 9)
      }
      const meia = t % (batida / 2)
      v += rnd() * 0.25 * Math.exp(-meia * 60)
      if (/snare|clap|drum/.test(n) && Math.floor(t / batida) % 2 === 1) {
        v += rnd() * 0.5 * Math.exp(-tb * 18)
      }
    } else if (/bass|808/.test(n)) {
      const nota = f / 2
      v = Math.sin(2 * Math.PI * nota * t) * (0.6 + 0.4 * Math.exp(-tb * 4)) * 0.8
    } else if (/rhodes|piano|keys|chords|stab|bell|guitar/.test(n)) {
      const env = Math.exp(-((t % (batida * 2)) * 2.5))
      for (const k of acorde) {
        v += Math.sin(2 * Math.PI * f * 2 * k * t) * 0.25 * env
      }
    } else if (/pad|strings|violin|choir|brass/.test(n)) {
      const vib = 1 + 0.004 * Math.sin(2 * Math.PI * 5 * t)
      for (const k of acorde) {
        v += Math.sin(2 * Math.PI * f * 2 * k * vib * t) * 0.18 + Math.sin(4 * Math.PI * f * k * t) * 0.06
      }
      v *= Math.min(1, t * 3)
    } else if (/vocal|hook/.test(n)) {
      const vib = 1 + 0.01 * Math.sin(2 * Math.PI * 5.5 * t)
      v = Math.sin(2 * Math.PI * f * 4 * vib * t) * 0.3 * Math.abs(Math.sin(Math.PI * t / batida))
    } else if (/riser/.test(n)) {
      v = rnd() * (t / seg) * 0.5
    } else {
      v = (rnd() * 0.6 + Math.sin(2 * Math.PI * 55 * t)) * Math.exp(-t * 3)
    }
    out[i] = Math.max(-1, Math.min(1, v * 0.8))
  }
  // fade nas pontas para evitar estalos
  for (let i = 0; i < 200 && i < len; i++) {
    out[i] *= i / 200
    out[len - 1 - i] *= i / 200
  }
  return out
}

const PACOTES: Record<string, string[]> = {
  'Lo-Fi Sessions/Drums': ['LFS_90_drum_loop_dusty_vinyl', 'LFS_90_drum_loop_lazy_sunday_tape'],
  'Lo-Fi Sessions/Music': ['LFS_90_bass_loop_warm_Amin', 'LFS_90_rhodes_chords_Amin', 'LFS_90_piano_melody_Cmaj', 'LFS_90_vocal_chop_hum_Amin'],
  'Deep House Tools/Loops': [
    'DHT_124_drum_loop_groove_tops',
    'DHT_124_deep_house_bass_loop_Fmin',
    'DHT_124_synth_pad_layered_Fmin',
    'DHT_124_keys_stab_chords_Fmin',
    'DHT_124_resampled_vocal_hook_Fmin'
  ],
  'Deep House Tools/One Shots': ['DHT_Kick_one_shot_punchy', 'DHT_Clap_one_shot_tight', 'DHT_Hat_one_shot_open'],
  'Trap Nights': [
    'TN_140_trap_drum_loop_bounce',
    'TN_140_808_bass_loop_Cmin',
    'TN_140_bell_melody_Cmin',
    'TN_140_vocal_hook_dark_Cmin',
    'TN_808_one_shot_long_C',
    'TN_Snare_one_shot_crispy'
  ],
  'Cinematic Strings': [
    'CS_100_strings_loop_epic_Dmin',
    'CS_100_violin_melody_rythmic_Dmin',
    'CS_100_brass_loop_heroes_Dmin',
    'CS_100_choir_loop_ethereal_Dmin',
    'CS_100_sub_bass_loop_pulse_Dmin',
    'CS_100_piano_ostinato_Dmin',
    'CS_100_cinematic_drum_loop_war',
    'CS_Impact_hit_deep',
    'CS_Riser_fx_tension'
  ],
  'Guitar Grooves': [
    'GG_85_guitar_loop_bouncing_gravity_Amaj',
    'GG_85_guitar_chords_funk_Emin',
    'GG_85_percussion_loop_shaker',
    'GG_85_bass_loop_funk_Emin',
    'GG_85_drum_loop_live_dry'
  ]
}

async function principal(): Promise<void> {
  const [pastaSamples, pastaDados] = process.argv.slice(2)
  if (!pastaSamples || !pastaDados) {
    throw new Error('Uso: npm run demo -- <pasta-de-samples> <pasta-de-dados>')
  }
  for (const [sub, nomes] of Object.entries(PACOTES)) {
    const dir = join(pastaSamples, sub)
    mkdirSync(dir, { recursive: true })
    for (const nome of nomes) {
      writeFileSync(join(dir, `${nome}.wav`), codificarWav([sintetizar(nome)], TAXA))
    }
  }
  const samples = await varrerPasta(pastaSamples, new Map(), () => undefined)
  let b = mesclarVarredura(bibliotecaVazia(), pastaSamples, samples)
  const ids = (re: RegExp): string[] => samples.filter((s) => re.test(s.nome)).map((s) => s.id)
  b = criarColecao(b, 'Começo Rápido', 'demo-1', Date.now())
  b = renomearColecao(
    b,
    'demo-1',
    'Começo Rápido',
    'Uma seleção de loops harmônica e ritmicamente compatíveis para começar uma ideia em segundos. Toque, empilhe no Criar e exporte.'
  )
  b = adicionarAColecao(b, 'demo-1', ids(/_(90|124|140|100|85)_/))
  b = criarColecao(b, 'Graves', 'demo-2', Date.now())
  b = adicionarAColecao(b, 'demo-2', ids(/bass|808/i))
  b = definirFavoritos(b, ids(/vocal|guitar_loop/), true)
  mkdirSync(pastaDados, { recursive: true })
  writeFileSync(join(pastaDados, 'biblioteca.json'), JSON.stringify(b))
  console.log(`${samples.length} samples gerados em ${pastaSamples}`)
}

principal().catch((e) => {
  console.error(e)
  process.exit(1)
})
