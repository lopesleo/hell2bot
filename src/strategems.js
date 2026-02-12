import { fetchJSON, TTLCache } from './util.js';

const API_BASE = 'https://utm7j5pjvi.us-east-1.awsapprunner.com';
const cache = new TTLCache(60 * 60 * 1000); // 1 hora

// ── API fetchers ─────────────────────────────────────
export async function getStrategemStats(difficulty = 0, mission = 'All') {
  const key = `strat_${difficulty}_${mission}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const data = await fetchJSON(`${API_BASE}/history_strategem?difficulty=${difficulty}&mission=${mission}`);
  cache.set(key, data);
  return data;
}

export async function getWeaponStats(difficulty = 0, mission = 'All') {
  const key = `weapon_${difficulty}_${mission}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const data = await fetchJSON(`${API_BASE}/history_weapons?difficulty=${difficulty}&mission=${mission}`);
  cache.set(key, data);
  return data;
}

// ── Difficulty labels ────────────────────────────────
const DIFF_NAMES = {
  0: 'Todas',
  1: 'Trivial (1)',
  2: 'Easy (2)',
  3: 'Medium (3)',
  4: 'Challenging (4)',
  5: 'Hard (5)',
  6: 'Extreme (6)',
  7: 'Suicide Mission (7)',
  8: 'Impossible (8)',
  9: 'Helldive (9)',
  10: 'Super Helldive (10)',
};

// ── Stratagem name mapping (internal → PT-BR with emoji) ──
const STRATAGEM_NAMES = {
  // 🦅 Águia
  eagle_500kg:     '🦅 Águia 500kg',
  eagle_airstrike: '🦅 Ataque Aéreo',
  eagle_cluster:   '🦅 Águia Cluster',
  eagle_napalm:    '🦅 Águia Napalm',
  eagle_110mm:     '🦅 Águia 110mm',
  eagle_strafe:    '🦅 Águia Strafe',
  eagle_smoke:     '🦅 Águia Fumaça',

  // 💥 Orbital
  orbital_laser:      '💥 Laser Orbital',
  orbital_railcannon: '💥 Railcannon Orbital',
  orbital_precision:  '💥 Ataque Preciso Orbital',
  orbital_gas:        '💥 Gás Orbital',
  orbital_ems:        '💥 EMS Orbital',
  orbital_airburst:   '💥 Airburst Orbital',
  orbital_smoke:      '💥 Fumaça Orbital',

  // 💥 Barragem
  barrage_120:     '💥 Barragem 120mm',
  barrage_380:     '💥 Barragem 380mm',
  barrage_gatling: '💥 Barragem Gatling',
  barrage_napalm:  '💥 Barragem Napalm',
  barrage_walking: '💥 Barragem Andante',

  // 🛡️ Mochila
  backpack_shield:             '🛡️ Escudo',
  backpack_shield_directional: '🛡️ Escudo Direcional',
  backpack_supply:             '🛡️ Mochila de Suprimentos',
  backpack_jump:               '🛡️ Jetpack',
  backpack_ballistic:          '🛡️ Mochila Balística',
  backpack_hellbomb:           '🛡️ Hellbomb',
  backpack_warp:               '🛡️ Mochila Warp',
  hover_pack:                  '🛡️ Hover Pack',

  // 🔫 Arma de Suporte
  sup_autocannon:       '🔫 Autocannon',
  sup_amr:              '🔫 AMR',
  sup_railgun:          '🔫 Railgun',
  sup_recoilless_rifle: '🔫 Recoilless Rifle',
  sup_spear:            '🔫 Spear',
  sup_eat:              '🔫 EAT-17',
  sup_eat_700:          '🔫 EAT-700',
  sup_quasar_cannon:    '🔫 Quasar Cannon',
  sup_flamethrower:     '🔫 Lança-chamas',
  sup_arc_thrower:      '🔫 Arc Thrower',
  sup_laser_cannon:     '🔫 Laser Cannon',
  sup_mg:               '🔫 Metralhadora',
  sup_hmg:              '🔫 Metralhadora Pesada',
  sup_stalwart:         '🔫 Stalwart',
  sup_grenade_launcher: '🔫 Lança-granadas',
  sup_commando:         '🔫 Commando',
  sup_sterilizer:       '🔫 Sterilizer',
  sup_wasp:             '🔫 Wasp',
  sup_airburst_launcher:'🔫 Airburst Launcher',
  sup_deescalator:      '🔫 De-Escalator',
  sup_epoch:            '🔫 Epoch',
  sup_speargun:         '🔫 Speargun',
  sup_solo_silo:        '🔫 Solo Silo',

  // 🏗️ Sentinela
  sentry_gatling:     '🏗️ Sentinela Gatling',
  sentry_mg:          '🏗️ Sentinela MG',
  sentry_mortar:      '🏗️ Sentinela Morteiro',
  sentry_rocket:      '🏗️ Sentinela Foguete',
  sentry_autocannon:  '🏗️ Sentinela Autocannon',
  sentry_arc:         '🏗️ Sentinela Arc',
  sentry_ems:         '🏗️ Sentinela EMS',
  sentry_flame:       '🏗️ Sentinela Chamas',
  sentry_laser:       '🏗️ Sentinela Laser',

  // 💣 Minas
  mines_at:          '💣 Minas Antitanque',
  mines_incendiary:  '💣 Minas Incendiárias',
  mines_infantry:    '💣 Minas Antipessoal',
  mines_gas:         '💣 Minas de Gás',

  // 🐕 Guard Dog
  guard_dog:    '🐕 Guard Dog',
  guard_rover:  '🐕 Guard Dog Rover',
  guard_breath: '🐕 Guard Dog Breath',
  guard_arc:    '🐕 Guard Dog Arc',

  // 🤖 Exosuit
  exo_emancipator: '🤖 Exosuit Emancipator',
  exo_patriot:     '🤖 Exosuit Patriot',

  // Outros
  encampment_hmg:      '🏗️ Emplacement HMG',
  encampment_at:       '🏗️ Emplacement AT',
  grenade_encampment:  '🏗️ Emplacement Granada',
  shield_relay:        '🛡️ Shield Relay',
  flag:                '🚩 Flag',
  frv:                 '📡 FRV',
};

// ── Weapon name mapping ──────────────────────────────
const WEAPON_NAMES = {
  // Assault Rifles
  liberator:      '🔫 Liberator',
  liberator_pen:  '🔫 Liberator Penetrator',
  liberator_conc: '🔫 Liberator Concussive',
  liberator_car:  '🔫 Liberator Carbine',
  sta_52:         '🔫 StA-52',
  tenderizer:     '🔫 Tenderizer',
  adjucator:      '🔫 Adjudicator',
  constitution:   '🔫 Constitution',

  // Marksman
  diligence:    '🎯 Diligence',
  diligence_cs: '🎯 Diligence Counter Sniper',
  accelerator:  '🎯 Accelerator',
  knight:       '🎯 Knight',
  sta_11:       '🎯 StA-11',
  reprimand:    '🎯 Reprimand',

  // SMGs
  defender:  '💨 Defender',
  pummeler:  '💨 Pummeler',
  m7s:       '💨 M-7S',
  ma5c:      '💨 MA-5C',

  // Shotguns
  punisher:      '💥 Punisher',
  slugger:       '💥 Slugger',
  halt:          '💥 Halt',
  cookout:       '💥 Cookout',
  breaker:       '💥 Breaker',
  spray_n_pray:  '💥 Spray & Pray',
  breaker_inc:   '💥 Breaker Incendiary',
  ultimatum:     '💥 Ultimatum',
  loyalist:      '💥 Loyalist',

  // Energy
  crossbow:      '⚡ Crossbow',
  eruptor:       '⚡ Eruptor',
  punisher_plas: '⚡ Punisher Plasma',
  blitzer:       '⚡ Blitzer',
  scythe:        '⚡ Scythe',
  sickle:        '⚡ Sickle',
  sickle_d:      '⚡ Sickle Deadeye',
  scorcher:      '⚡ Scorcher',
  purifier:      '⚡ Purifier',
  torcher:       '⚡ Torcher',
  dominator:     '⚡ Dominator',
  deadeye:       '⚡ Deadeye',
  amendment:     '⚡ Amendment',
  pacifier:      '⚡ Pacifier',
  variable:      '⚡ Variable',
  coyote:        '⚡ Coyote',
  m90a:          '⚡ M-90A',

  // Pistols
  peacemaker:     '🔫 Peacemaker',
  redeemer:       '🔫 Redeemer',
  verdict:        '🔫 Verdict',
  senator:        '🔫 Senator',
  talon:          '🔫 Talon',
  warrant:        '🔫 Warrant',
  sabre:          '🔫 Sabre',
  bushwacker:     '🔫 Bushwacker',
  crisper:        '🔫 Crisper',
  grenade_pistol: '🔫 Grenade Pistol',
  laser_pistol:   '🔫 Laser Pistol',
  stim_pistol:    '🔫 Stim Pistol',
  m6c:            '🔫 M-6C',

  // Melee
  shock_lance:   '⚔️ Shock Lance',
  shock_batton:  '⚔️ Shock Baton',
  axe:           '⚔️ Axe',
  machete:       '⚔️ Machete',

  // Grenades
  grenade_frag:       '💣 Granada Frag',
  grenade_he:         '💣 Granada HE',
  grenade_inc:        '💣 Granada Incendiária',
  grenade_impact:     '💣 Granada de Impacto',
  grenade_inc_impact: '💣 Granada Inc. Impacto',
  grenade_stun:       '💣 Granada Stun',
  grenade_gas:        '💣 Granada de Gás',
  grenade_drone:      '💣 Granada Drone',
  grenade_smoke:      '💣 Granada de Fumaça',
  grenade_termite:    '💣 Granada Termite',
  grenade_pyro:       '💣 Granada Pyro',
  grenade_arc:        '💣 Granada Arc',
  throwing_knife:     '🗡️ Faca de Arremesso',
  dynamite:           '💣 Dinamite',
  urchin:             '💣 Urchin',
  pineapple:          '💣 Pineapple',
};

// ── Helpers ──────────────────────────────────────────
const FACTION_ALIASES = {
  bugs: 'terminid', terminids: 'terminid', insetos: 'terminid',
  bots: 'automaton', automatons: 'automaton', 'robôs': 'automaton', robos: 'automaton',
  illu: 'illuminate', illuminate: 'illuminate', illuminates: 'illuminate', squid: 'illuminate',
};

const ALL_FACTIONS = ['terminid', 'automaton', 'illuminate'];

function parseFactionArgs(args) {
  let factions = null;
  let difficulty = 0;

  for (const arg of args) {
    const lower = arg.toLowerCase();
    const faction = FACTION_ALIASES[lower];
    if (faction) {
      factions = [faction];
    } else if (/^\d+$/.test(lower)) {
      const n = parseInt(lower, 10);
      if (n >= 1 && n <= 10) difficulty = n;
    }
  }

  // default: all factions that exist in the data
  if (!factions) factions = ALL_FACTIONS;
  return { factions, difficulty };
}

function nameOf(key, map) {
  return map[key] || key;
}

const FACTION_EMOJI = { terminid: '🪲', automaton: '🤖', illuminate: '👁️' };
const FACTION_NAME = { terminid: 'Terminids', automaton: 'Automatons', illuminate: 'Illuminate' };

function factionLabel(faction) {
  return `${FACTION_EMOJI[faction] || '❓'} *META SEMANAL — ${FACTION_NAME[faction] || faction}*`;
}

function factionLabelWeapon(faction) {
  return `${FACTION_EMOJI[faction] || '❓'} *ARMAS — ${FACTION_NAME[faction] || faction}*`;
}

/**
 * Get top N stratagems from the most recent snapshot (index 0) for a faction.
 */
function getTopItems(data, faction, nameMap, n = 10) {
  const factionData = data[faction];
  if (!factionData?.items) return [];

  const entries = [];
  for (const [key, item] of Object.entries(factionData.items)) {
    const val = item.values?.[0];
    if (!val) continue;
    entries.push({
      key,
      name: nameOf(key, nameMap),
      loadouts: val.loadouts || 0,
      games: val.games || 0,
      rank: val.rank || 999,
      avgLevel: val.avgLevel || null,
      isNew: val.isNew || false,
    });
  }

  entries.sort((a, b) => a.rank - b.rank);
  return entries.slice(0, n);
}

/**
 * Get trends: compare snapshot[0] vs snapshot[1].
 */
function getTrends(data, faction, nameMap) {
  const factionData = data[faction];
  if (!factionData?.items) return { rising: [], falling: [] };

  const diffs = [];
  for (const [key, item] of Object.entries(factionData.items)) {
    const curr = item.values?.[0];
    const prev = item.values?.[1];
    if (!curr || !prev) continue;
    const diff = (curr.loadouts || 0) - (prev.loadouts || 0);
    if (Math.abs(diff) < 0.3) continue; // noise filter
    diffs.push({
      key,
      name: nameOf(key, nameMap),
      curr: curr.loadouts || 0,
      prev: prev.loadouts || 0,
      diff,
    });
  }

  diffs.sort((a, b) => b.diff - a.diff);
  const rising = diffs.filter(d => d.diff > 0).slice(0, 5);
  const falling = diffs.filter(d => d.diff < 0).sort((a, b) => a.diff - b.diff).slice(0, 5);

  return { rising, falling };
}

// ── Command builders ─────────────────────────────────

/**
 * /meta [bugs|bots] [7-10]
 */
export async function buildMeta(args, logger) {
  const log = logger.child({ module: 'meta' });
  const { factions, difficulty } = parseFactionArgs(args);

  try {
    const data = await getStrategemStats(difficulty, 'All');
    const diffLabel = DIFF_NAMES[difficulty] || `Dificuldade ${difficulty}`;
    const lines = [];

    for (const faction of factions) {
      const top = getTopItems(data, faction, STRATAGEM_NAMES, 10);
      if (top.length === 0) continue;

      lines.push(factionLabel(faction));
      lines.push(`Dificuldade: ${diffLabel}\n`);

      for (let i = 0; i < top.length; i++) {
        const s = top[i];
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
        const newTag = s.isNew ? ' 🆕' : '';
        lines.push(`${medal} ${s.name} — ${s.loadouts.toFixed(1)}%${newTag}`);
      }
      lines.push('');
    }

    if (lines.length === 0) return '⚠️ Sem dados de stratagems disponíveis.';

    lines.push('_% = uso em loadouts | Dados: helldive.live_');
    return lines.join('\n');
  } catch (err) {
    log.error(err, 'buildMeta error');
    return '⚠️ Erro ao buscar dados de stratagems.';
  }
}

/**
 * /tendencia
 */
export async function buildTendencia(logger) {
  const log = logger.child({ module: 'tendencia' });

  try {
    const data = await getStrategemStats(0, 'All');
    const lines = ['📈 *TENDÊNCIAS DA SEMANA*\n'];

    for (const faction of ALL_FACTIONS) {
      const fLabel = `${FACTION_EMOJI[faction] || '❓'} ${FACTION_NAME[faction] || faction}`;
      const { rising, falling } = getTrends(data, faction, STRATAGEM_NAMES);

      if (rising.length === 0 && falling.length === 0) continue;

      lines.push(`*${fLabel}*`);

      if (rising.length > 0) {
        lines.push('🔥 Em alta:');
        for (const r of rising) {
          lines.push(`  • ${r.name}: ${r.prev.toFixed(1)}% → ${r.curr.toFixed(1)}% (+${r.diff.toFixed(1)}%)`);
        }
      }

      if (falling.length > 0) {
        lines.push('❄️ Em queda:');
        for (const f of falling) {
          lines.push(`  • ${f.name}: ${f.prev.toFixed(1)}% → ${f.curr.toFixed(1)}% (${f.diff.toFixed(1)}%)`);
        }
      }
      lines.push('');
    }

    lines.push('_Dados: helldive.live_');
    return lines.join('\n');
  } catch (err) {
    log.error(err, 'buildTendencia error');
    return '⚠️ Erro ao buscar tendências.';
  }
}

/**
 * /armas [bugs|bots] [7-10]
 */
export async function buildArmas(args, logger) {
  const log = logger.child({ module: 'armas' });
  const { factions, difficulty } = parseFactionArgs(args);

  try {
    const data = await getWeaponStats(difficulty, 'All');
    const diffLabel = DIFF_NAMES[difficulty] || `Dificuldade ${difficulty}`;
    const lines = [];

    for (const faction of factions) {
      const top = getTopItems(data, faction, WEAPON_NAMES, 10);
      if (top.length === 0) continue;

      lines.push(factionLabelWeapon(faction));
      lines.push(`Dificuldade: ${diffLabel}\n`);

      for (let i = 0; i < top.length; i++) {
        const s = top[i];
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
        const newTag = s.isNew ? ' 🆕' : '';
        lines.push(`${medal} ${s.name} — ${s.loadouts.toFixed(1)}%${newTag}`);
      }
      lines.push('');
    }

    if (lines.length === 0) return '⚠️ Sem dados de armas disponíveis.';

    lines.push('_% = uso em loadouts | Dados: helldive.live_');
    return lines.join('\n');
  } catch (err) {
    log.error(err, 'buildArmas error');
    return '⚠️ Erro ao buscar dados de armas.';
  }
}

/**
 * Weekly summary for cron (Top 5 each faction + trends)
 */
export async function buildWeeklySummary(logger) {
  const log = logger.child({ module: 'weekly' });

  try {
    const data = await getStrategemStats(0, 'All');
    const lines = ['📊 *RESUMO SEMANAL — Meta de Stratagems*\n'];

    for (const faction of ALL_FACTIONS) {
      const fLabel = `${FACTION_EMOJI[faction] || '❓'} ${FACTION_NAME[faction] || faction}`;
      const top = getTopItems(data, faction, STRATAGEM_NAMES, 5);
      const { rising, falling } = getTrends(data, faction, STRATAGEM_NAMES);

      lines.push(`*${fLabel} — Top 5:*`);
      for (let i = 0; i < top.length; i++) {
        const s = top[i];
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
        lines.push(`${medal} ${s.name} — ${s.loadouts.toFixed(1)}%`);
      }

      if (rising.length > 0) {
        const r = rising[0];
        lines.push(`📈 Subiu mais: ${r.name} (+${r.diff.toFixed(1)}%)`);
      }
      if (falling.length > 0) {
        const f = falling[0];
        lines.push(`📉 Caiu mais: ${f.name} (${f.diff.toFixed(1)}%)`);
      }
      lines.push('');
    }

    lines.push('_Use /meta para ver Top 10 | /tendencia para detalhes_');
    return lines.join('\n');
  } catch (err) {
    log.error(err, 'buildWeeklySummary error');
    return '⚠️ Erro ao gerar resumo semanal de stratagems.';
  }
}
