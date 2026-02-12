import { fetchJSON, sleep, TTLCache } from './util.js';

const cache = new TTLCache(5 * 60 * 1000);

const API_PRIMARY = () => process.env.API_PRIMARY;
const API_FALLBACK = () => process.env.API_FALLBACK;
const RATE_SLEEP = () => parseInt(process.env.RATE_SLEEP_MS || '5000', 10);

async function apiFetch(pathStr) {
  const cacheKey = pathStr;
  const cached = cache.get(cacheKey);
  if (cached !== undefined) return cached;

  try {
    const data = await fetchJSON(`${API_PRIMARY()}${pathStr}`);
    cache.set(cacheKey, data);
    return data;
  } catch (err) {
    const fb = API_FALLBACK();
    if (fb) {
      const data = await fetchJSON(`${fb}${pathStr}`);
      cache.set(cacheKey, data);
      return data;
    }
    throw err;
  }
}

export async function getMajorOrders() {
  return apiFetch('/war/major-orders');
}

export async function getNews(fromTs = 0) {
  return apiFetch(`/war/news?from=${fromTs}`);
}

export async function getWarStatus() {
  return apiFetch('/war/status');
}

export async function getPlanets() {
  return apiFetch('/planets');
}

export async function getPlanetHistory(planetIndex) {
  return apiFetch(`/war/history/${planetIndex}?timeframe=day`);
}

// ── Known enemy IDs ─────────────────────────────────
export const ENEMY_NAMES = {
  2651633799: 'Chargers',
  1046000873: 'Impalers',
  2514244534: 'Bile Titans',
  4106381389: 'Brood Commanders',
  2281720629: 'Stalkers',
  3618572993: 'Hunters',
  922543337:  'Shriekers',
  3751042098: 'Hulks',
  3471945498: 'Devastators',
  1656588421: 'Berserkers',
  501271428:  'Scout Striders',
  1464964377: 'Tanks',
  3832498375: 'Gunships',
};

// ── Owner/race mapping ──────────────────────────────
export const OWNER_NAMES = {
  0: 'Desconhecido',
  1: 'Super Earth',
  2: 'Terminids',
  3: 'Automaton',
  4: 'Illuminate',
};

// ── Planet index extraction ─────────────────────────
export function extractPlanetIndices(majorOrders) {
  const indices = new Set();
  if (!Array.isArray(majorOrders)) return [];

  for (const order of majorOrders) {
    if (!order.setting || !Array.isArray(order.setting.tasks)) continue;
    for (const task of order.setting.tasks) {
      if (!Array.isArray(task.values) || !Array.isArray(task.valueTypes)) continue;
      for (let i = 0; i < task.valueTypes.length; i++) {
        if (task.valueTypes[i] === 12 && task.values[i] !== undefined) {
          const v = task.values[i];
          if (v > 0) indices.add(v);
        }
      }
    }
  }
  return [...indices];
}

// ── Planet progress from war status ─────────────────
export function getPlanetProgress(warStatus, planetIndices, planetNames) {
  const result = new Map();
  if (!warStatus || !warStatus.planetStatus) return result;

  const campaignMap = new Map();
  if (Array.isArray(warStatus.campaigns)) {
    for (const c of warStatus.campaigns) campaignMap.set(c.planetIndex, c);
  }

  for (const ps of warStatus.planetStatus) {
    if (!planetIndices.includes(ps.index)) continue;

    const name = planetNames[ps.index] || `Planet #${ps.index}`;
    const players = ps.players || 0;
    const health = ps.health || 0;
    const campaign = campaignMap.get(ps.index);

    let progress = 0;
    if (ps.owner === 1) {
      progress = 100;
    } else if (campaign) {
      const estimatedMax = Math.max(health, 1000000);
      progress = Math.round(((1 - health / estimatedMax) * 100) * 100) / 100;
      if (progress < 0) progress = 0;
    }

    result.set(ps.index, {
      index: ps.index,
      name,
      health,
      players,
      progress,
      hasCampaign: !!campaign,
      owner: ps.owner,
    });
  }
  return result;
}

// ── All active campaigns ────────────────────────────
export function getAllCampaigns(warStatus, planetNames) {
  const result = [];
  if (!warStatus?.campaigns || !warStatus?.planetStatus) return result;

  const statusMap = new Map();
  for (const ps of warStatus.planetStatus) statusMap.set(ps.index, ps);

  for (const c of warStatus.campaigns) {
    const ps = statusMap.get(c.planetIndex);
    if (!ps) continue;
    result.push({
      index: c.planetIndex,
      name: planetNames[c.planetIndex] || `Planet #${c.planetIndex}`,
      players: ps.players || 0,
      owner: ps.owner,
      health: ps.health || 0,
      race: c.race,
    });
  }

  return result.sort((a, b) => b.players - a.players);
}

export async function rateSleep() {
  await sleep(RATE_SLEEP());
}

export { cache };
