import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { SEED_OFFERS } from './seed.js';

export const CATEGORIES = ['food', 'drink', 'dessert', 'beauty', 'retail', 'entertainment', 'other'];
export const VALID_WINDOWS = ['day', 'week', 'month'];

// Rough bounding box for the Greater Toronto Area.
export const GTA_BOUNDS = { minLat: 43.4, maxLat: 44.2, minLng: -80.1, maxLng: -78.8 };

export function openDb(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS offers (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT NOT NULL,
      category      TEXT NOT NULL,
      description   TEXT NOT NULL,
      conditions    TEXT NOT NULL DEFAULT '',
      valid_window  TEXT NOT NULL DEFAULT 'day',
      address       TEXT NOT NULL DEFAULT '',
      lat           REAL NOT NULL,
      lng           REAL NOT NULL,
      url           TEXT NOT NULL DEFAULT '',
      submitted_by  TEXT NOT NULL DEFAULT '',
      is_seed       INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS votes (
      offer_id   INTEGER NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
      voter      TEXT NOT NULL,
      kind       TEXT NOT NULL CHECK (kind IN ('valid', 'expired')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (offer_id, voter)
    );
  `);

  const { n } = db.prepare('SELECT COUNT(*) AS n FROM offers').get();
  if (n === 0) {
    const insert = db.prepare(`
      INSERT INTO offers (name, category, description, conditions, valid_window, address, lat, lng, url, submitted_by, is_seed)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);
    for (const o of SEED_OFFERS) {
      insert.run(o.name, o.category, o.description, o.conditions, o.valid_window, o.address, o.lat, o.lng, o.url, 'seed');
    }
  }
  return db;
}

const OFFER_COLUMNS = `
  o.id, o.name, o.category, o.description, o.conditions, o.valid_window, o.address,
  o.lat, o.lng, o.url, o.submitted_by, o.is_seed, o.created_at,
  (SELECT COUNT(*) FROM votes v WHERE v.offer_id = o.id AND v.kind = 'valid')   AS valid_votes,
  (SELECT COUNT(*) FROM votes v WHERE v.offer_id = o.id AND v.kind = 'expired') AS expired_votes,
  (SELECT MAX(v.created_at) FROM votes v WHERE v.offer_id = o.id AND v.kind = 'valid') AS last_confirmed_at
`;

export function listOffers(db, { category, q } = {}) {
  const where = [];
  const params = [];
  if (category) {
    where.push('o.category = ?');
    params.push(category);
  }
  if (q) {
    where.push("(o.name LIKE ? ESCAPE '\\' OR o.description LIKE ? ESCAPE '\\' OR o.address LIKE ? ESCAPE '\\')");
    const like = `%${q.replace(/[\\%_]/g, (c) => '\\' + c)}%`;
    params.push(like, like, like);
  }
  const sql = `SELECT ${OFFER_COLUMNS} FROM offers o
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY o.created_at DESC, o.id DESC`;
  return db.prepare(sql).all(...params).map(toOffer);
}

export function getOffer(db, id) {
  const row = db.prepare(`SELECT ${OFFER_COLUMNS} FROM offers o WHERE o.id = ?`).get(id);
  return row ? toOffer(row) : null;
}

export function createOffer(db, o) {
  const { lastInsertRowid } = db.prepare(`
    INSERT INTO offers (name, category, description, conditions, valid_window, address, lat, lng, url, submitted_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(o.name, o.category, o.description, o.conditions, o.valid_window, o.address, o.lat, o.lng, o.url, o.submitted_by);
  return getOffer(db, Number(lastInsertRowid));
}

// One vote per voter per offer; voting again replaces the previous vote.
export function vote(db, offerId, voter, kind) {
  db.prepare(`
    INSERT INTO votes (offer_id, voter, kind) VALUES (?, ?, ?)
    ON CONFLICT (offer_id, voter) DO UPDATE SET kind = excluded.kind, created_at = datetime('now')
  `).run(offerId, voter, kind);
  return getOffer(db, offerId);
}

function toOffer(row) {
  return { ...row, is_seed: Boolean(row.is_seed) };
}
