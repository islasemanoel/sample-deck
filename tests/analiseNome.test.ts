import { describe, it, expect } from 'vitest'
import {
  extrairBpm,
  extrairTom,
  extrairTipo,
  extrairTags,
  categoriaDe
} from '@shared/analiseNome'

describe('extrairBpm', () => {
  it('lê número seguido de "bpm"', () => {
    expect(extrairBpm('ro 029 cinematic2 4-4 100bpm 01')).toBe(100)
    expect(extrairBpm('Kick_Loop_128 BPM')).toBe(128)
  })

  it('lê número isolado entre separadores dentro da faixa musical', () => {
    expect(extrairBpm('OS_DPS_160_drum_loop_homie')).toBe(160)
    expect(extrairBpm('PMAL_Bass_loops_126_Emin_classic')).toBe(126)
    expect(extrairBpm('DBM_TC_78_Choir_Loop_Heroes_D#min')).toBe(78)
  })

  it('mantém BPM com decimais', () => {
    expect(extrairBpm('Loop_81.5bpm_Amin')).toBe(81.5)
    expect(extrairBpm('Loop 81,5 BPM')).toBe(81.5)
    expect(extrairBpm('Soul_Loop_81.5_Amin')).toBe(81.5)
    expect(extrairBpm('Keys 92.25 BPM')).toBe(92.25)
    expect(extrairBpm('Loop.90.Amin')).toBe(90)
  })

  it('ignora números fora da faixa e numeração de arquivo', () => {
    expect(extrairBpm('Snare_01')).toBeNull()
    expect(extrairBpm('Pack 029 hit')).toBeNull()
    expect(extrairBpm('Riser_2000')).toBeNull()
  })

  it('não confunde número colado em letras com bpm', () => {
    expect(extrairBpm('808_bass_C')).toBeNull()
    expect(extrairBpm('cinematic2_hit')).toBeNull()
  })

  it('retorna null quando não há número', () => {
    expect(extrairBpm('vocal chop')).toBeNull()
  })
})

describe('extrairTom', () => {
  it('normaliza tom colado no modo', () => {
    expect(extrairTom('PMAL_Bass_loops_126_Emin_classic')).toBe('E min')
    expect(extrairTom('TC_DS_180_trumpet_loop_tandem_Amin')).toBe('A min')
    expect(extrairTom('DBM_TC_78_Choir_Loop_Heroes_D#min')).toBe('D# min')
    expect(extrairTom('Pad_Cmaj_90')).toBe('C maj')
  })

  it('aceita modo separado e por extenso', () => {
    expect(extrairTom('Guitar 85 A maj')).toBe('A maj')
    expect(extrairTom('keys_F#_minor_120')).toBe('F# min')
  })

  it('trata "m" como menor e bemol/sustenido sem modo', () => {
    expect(extrairTom('Lead_Fm_140')).toBe('F min')
    expect(extrairTom('Bass_Bb_100')).toBe('Bb')
    expect(extrairTom('sub_C♯m')).toBe('C# min')
  })

  it('não detecta letras soltas ou dentro de palavras', () => {
    expect(extrairTom('OS_DPS_160_drum_loop')).toBeNull()
    expect(extrairTom('Pack A hit')).toBeNull()
    expect(extrairTom('Ambient_texture')).toBeNull()
    expect(extrairTom('DBM_TC_78')).toBeNull()
  })
})

describe('extrairTipo', () => {
  it('reconhece one-shot pelo nome ou pela pasta', () => {
    expect(extrairTipo('Kick_one_shot_01', '', null)).toBe('one-shot')
    expect(extrairTipo('Snare 03', 'Drums/One Shots', null)).toBe('one-shot')
    expect(extrairTipo('Impact_Hit', '', null)).toBe('one-shot')
  })

  it('reconhece loop pelo nome ou pela pasta', () => {
    expect(extrairTipo('OS_DPS_160_drum_loop_homie', '', 160)).toBe('loop')
    expect(extrairTipo('Groove 01', 'Drum Loops', null)).toBe('loop')
  })

  it('breaks, breakbeats e grooves são loops (pela pasta ou pelo nome)', () => {
    expect(extrairTipo('16ths', 'Breaks', null)).toBe('loop')
    expect(extrairTipo('Boombappo 1', 'Drums/Break', null)).toBe('loop')
    expect(extrairTipo('Amen_Breakbeat', '', null)).toBe('loop')
    expect(extrairTipo('Funky Groove 2', '', null)).toBe('loop')
    expect(extrairTipo('Shaker', 'Percussion Grooves', null)).toBe('loop')
  })

  it('palavras que só contêm "break" não viram loop', () => {
    expect(extrairTipo('Breakdown Riser', '', null)).toBe('one-shot')
    expect(extrairTipo('Glass_Breaking', 'FX', null)).toBe('one-shot')
  })

  it('one-shot explícito prevalece sobre pasta de breaks', () => {
    expect(extrairTipo('Kick one shot', 'Breaks', null)).toBe('one-shot')
  })

  it('sem pista explícita, usa a presença de bpm', () => {
    expect(extrairTipo('Rhodes_120_Cmaj', '', 120)).toBe('loop')
    expect(extrairTipo('Clap_Tight', '', null)).toBe('one-shot')
  })

  it('nome com one-shot prevalece sobre pasta de loops', () => {
    expect(extrairTipo('Kick oneshot', 'Loops', null)).toBe('one-shot')
  })
})

describe('extrairTags', () => {
  it('extrai instrumentos, gêneros e descritores na ordem em que aparecem', () => {
    expect(extrairTags('DHR_125_resampled_tape_vinyl_pool_Amaj', 'Deep House')).toEqual([
      'resampled',
      'tape',
      'vinyl',
      'deep house'
    ])
  })

  it('mapeia sinônimos para uma tag única, sem repetir', () => {
    expect(extrairTags('TC_DS_180_trumpet_loop_tandem_Amin', 'Brass')).toEqual([
      'brass & woodwinds'
    ])
    expect(extrairTags('Vox_Chop_vocal', '')).toEqual(['vocals', 'chops'])
  })

  it('separa números colados em palavras ("Clap21", "808BD", "kick6")', () => {
    expect(extrairTags('Clap21', '')).toEqual(['clap'])
    expect(extrairTags('808BD_T5D5_Orig', '')).toEqual(['808', 'bass', 'kick'])
    expect(extrairTags('hhd1kck06', '')).toEqual(['kick'])
  })

  it('reconhece abreviações e variações de drum kits', () => {
    expect(extrairTags('Snaredrum 195 - H&RPP2', '')).toEqual(['snare'])
    expect(extrairTags('GUY_SNR', '')).toEqual(['snare'])
    expect(extrairTags('BRP_SNRIM1', 'RimShots')).toEqual(['rim'])
    expect(extrairTags('GTD_CABASA', '')).toEqual(['shaker'])
    expect(extrairTags('WURLI_25', '')).toEqual(['keys'])
    expect(extrairTags('Thuggish Ruggish Bone (Acapella)', '')).toEqual(['vocals'])
    expect(extrairTags('NOSTRA', 'Pacote 350 Pontos De Funk')).toEqual(['vocals', 'funk'])
  })

  it('pasta mais funda vem antes das pastas de cima', () => {
    expect(extrairTags('Phrodeo 30', 'Beat Butcha - Filth Vol. 7 Drum Kit/Music Chops')).toEqual(['chops', 'drums'])
    expect(extrairTags('Loop 1', 'Bass/Song Starters')).toEqual(['melody', 'bass'])
  })

  it('reconhece bigramas e camelCase', () => {
    expect(extrairTags('HipHop_Drums', '')).toEqual(['hip hop', 'drums'])
    expect(extrairTags('hip_hop_808_bass', '')).toEqual(['hip hop', '808', 'bass'])
    expect(extrairTags('lo-fi keys', '')).toEqual(['lofi', 'keys'])
  })

  it('808 gera também a tag bass', () => {
    expect(extrairTags('Trap_808_Long', '')).toEqual(['trap', '808', 'bass'])
  })

  it('em one-shots, mantém só uma entre hi-hat, prato, sino e chimes', () => {
    // O nome decide, mesmo com outra peça na pasta
    expect(extrairTags('Div Crash 14', 'DivisionBeatz Drum Kit/Open Hat', 'one-shot')).toEqual(['cymbal', 'drums'])
    expect(extrairTags('hat_one_shot_closed', 'One Shots/Cymbals', 'one-shot')).toEqual(['hi-hat'])
    // Com duas no nome, vale a primeira
    expect(extrairTags('HIHAT_TAKE_U_FOR_A_RIDE', '', 'one-shot')).toEqual(['hi-hat'])
    // Sem nenhuma no nome, vale a pasta mais funda
    expect(extrairTags('Ride_5', 'Kit/Closed Hats', 'one-shot')).toEqual(['cymbal'])
    expect(extrairTags('HG_5', 'Cymbals/Closed Hats', 'one-shot')).toEqual(['hi-hat'])
    // Pasta mista não decide
    expect(extrairTags('Percs (17)', 'Hi Hats, Crashes, & Percs', 'one-shot')).toEqual(['percussion'])
  })

  it('em loops, hi-hat e prato podem coexistir', () => {
    expect(extrairTags('Hat & Ride Loop', 'Tops', 'loop')).toEqual(['hi-hat', 'cymbal', 'tops'])
    expect(extrairTags('Hat & Ride Loop', 'Tops')).toEqual(['hi-hat', 'cymbal', 'tops'])
  })

  it('cúpula do prato é prato; wind chimes e bell tree são chimes', () => {
    expect(extrairTags('RideBell Zion', '', 'one-shot')).toEqual(['cymbal'])
    expect(extrairTags('FPC_Ride_Bell_F_010', '')).toEqual(['cymbal'])
    expect(extrairTags('Wind Chimes 3', '')).toEqual(['chimes'])
    expect(extrairTags('Bell Tree 1', 'Hi Hats & Percs', 'one-shot')).toEqual(['chimes', 'percussion'])
    expect(categoriaDe(['chimes'])).toBe('percussion')
  })

  it('retorna lista vazia para nomes sem palavras conhecidas', () => {
    expect(extrairTags('XYZ_0001', 'Pasta Qualquer')).toEqual([])
  })
})

describe('categoriaDe', () => {
  it('usa a primeira tag que pertence a uma categoria', () => {
    expect(categoriaDe(['deep house', 'bass', 'drums'])).toBe('bass')
    expect(categoriaDe(['trap', 'kick'])).toBe('drums')
    expect(categoriaDe(['brass & woodwinds'])).toBe('brass')
    expect(categoriaDe(['strings'])).toBe('strings')
    expect(categoriaDe(['pad'])).toBe('synth')
    expect(categoriaDe(['shaker'])).toBe('percussion')
  })

  it('chops, acordes e melodias sem instrumento ficam em "melodic"', () => {
    expect(categoriaDe(['chops', 'drums'])).toBe('melodic')
    expect(categoriaDe(['chords'])).toBe('melodic')
    expect(categoriaDe(['melody', 'lofi'])).toBe('melodic')
    expect(categoriaDe(['keys', 'chords'])).toBe('keys')
  })

  it('peças de bateria 808 são bateria, não baixo', () => {
    expect(categoriaDe(extrairTags('808 Snare (2)', ''))).toBe('drums')
    expect(categoriaDe(extrairTags('808BD_T3D1_TapeSat', 'BassDrum'))).toBe('drums')
    expect(categoriaDe(extrairTags('808 010 (F#)', '808s'))).toBe('bass')
  })

  it('retorna "outros" quando nenhuma tag tem categoria', () => {
    expect(categoriaDe(['vinyl', 'house'])).toBe('outros')
    expect(categoriaDe([])).toBe('outros')
  })
})
