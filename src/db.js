import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

let db;

export function init(dbPath) {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS state (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at INTEGER
    )
  `);

  return db;
}

export function getState(key) {
  const row = db.prepare('SELECT value FROM state WHERE key = ?').get(key);
  return row ? row.value : null;
}

export function setState(key, value) {
  db.prepare(
    'INSERT INTO state (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
  ).run(key, typeof value === 'string' ? value : JSON.stringify(value), Date.now());
}

export function getStateJSON(key) {
  const raw = getState(key);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function getDB() { return db; }
