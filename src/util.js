import https from 'https';
import http from 'http';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * HTTP GET with retry + exponential backoff. Returns parsed JSON.
 */
export async function fetchJSON(url, { retries = 3, backoffMs = 2000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const data = await _get(url);
      return JSON.parse(data);
    } catch (err) {
      lastErr = err;
      if (attempt < retries - 1) {
        await sleep(backoffMs * Math.pow(2, attempt));
      }
    }
  }
  throw lastErr;
}

function _get(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { headers: { 'User-Agent': 'Hell2Bot/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return _get(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString()));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error(`Timeout for ${url}`)); });
  });
}

/**
 * Simple in-memory cache with TTL.
 */
export class TTLCache {
  constructor(ttlMs = 300000) {
    this._map = new Map();
    this._ttl = ttlMs;
  }
  get(key) {
    const entry = this._map.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.ts > this._ttl) { this._map.delete(key); return undefined; }
    return entry.value;
  }
  set(key, value) {
    this._map.set(key, { value, ts: Date.now() });
  }
  clear() {
    this._map.clear();
  }
}

/**
 * Stable JSON hash for comparison (sorted keys).
 */
export function stableHash(obj) {
  return JSON.stringify(obj, Object.keys(obj || {}).sort());
}
