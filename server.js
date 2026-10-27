import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  openDb, listOffers, getOffer, createOffer, vote,
  CATEGORIES, VALID_WINDOWS, GTA_BOUNDS,
} from './db.js';

const PUBLIC_DIR = fileURLToPath(new URL('./public/', import.meta.url));
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};
const MAX_BODY = 16 * 1024;
const SUBMIT_LIMIT = { max: 10, windowMs: 60 * 60 * 1000 };

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function validateOffer(input) {
  const errors = [];
  const str = (key, { min = 0, max }) => {
    const v = typeof input[key] === 'string' ? input[key].trim() : '';
    if (v.length < min) errors.push(`${key} is required`);
    if (v.length > max) errors.push(`${key} must be at most ${max} characters`);
    return v;
  };
  const offer = {
    name: str('name', { min: 1, max: 80 }),
    description: str('description', { min: 1, max: 300 }),
    conditions: str('conditions', { max: 300 }),
    address: str('address', { max: 160 }),
    url: str('url', { max: 300 }),
    submitted_by: str('submitted_by', { max: 40 }),
    category: input.category,
    valid_window: input.valid_window ?? 'day',
    lat: Number(input.lat),
    lng: Number(input.lng),
  };
  if (!CATEGORIES.includes(offer.category)) errors.push('category is invalid');
  if (!VALID_WINDOWS.includes(offer.valid_window)) errors.push('valid_window is invalid');
  const { minLat, maxLat, minLng, maxLng } = GTA_BOUNDS;
  if (!(offer.lat >= minLat && offer.lat <= maxLat && offer.lng >= minLng && offer.lng <= maxLng)) {
    errors.push('location must be within the Greater Toronto Area');
  }
  if (offer.url && !/^https?:\/\//i.test(offer.url)) errors.push('url must start with http:// or https://');
  if (errors.length) throw new HttpError(400, errors.join('; '));
  return offer;
}

export function createApp({ dbPath = process.env.DB_PATH ?? 'data/offers.db', trustProxy = process.env.TRUST_PROXY === '1', salt = process.env.VOTER_SALT ?? 'birthday' } = {}) {
  const db = openDb(dbPath);
  const submissions = new Map(); // ip -> timestamps of recent submissions

  const clientIp = (req) => {
    if (trustProxy) {
      const fwd = req.headers['x-forwarded-for'];
      if (fwd) return String(fwd).split(',')[0].trim();
    }
    return req.socket.remoteAddress ?? 'unknown';
  };
  // Votes are keyed by a salted hash so raw IPs are never stored.
  const voterId = (req) => createHash('sha256').update(salt + clientIp(req)).digest('hex');

  const checkRateLimit = (ip) => {
    const now = Date.now();
    const recent = (submissions.get(ip) ?? []).filter((t) => now - t < SUBMIT_LIMIT.windowMs);
    if (recent.length >= SUBMIT_LIMIT.max) throw new HttpError(429, 'Too many submissions, please try again later');
    recent.push(now);
    submissions.set(ip, recent);
  };

  async function handleApi(req, res, url) {
    const parts = url.pathname.split('/').filter(Boolean); // ['api', 'offers', id?, 'vote'?]
    if (parts[1] !== 'offers') throw new HttpError(404, 'Not found');

    if (parts.length === 2 && req.method === 'GET') {
      const category = url.searchParams.get('category') || undefined;
      const q = url.searchParams.get('q')?.trim().slice(0, 80) || undefined;
      return sendJson(res, 200, { offers: listOffers(db, { category, q }) });
    }
    if (parts.length === 2 && req.method === 'POST') {
      const offer = validateOffer(await readJson(req));
      checkRateLimit(clientIp(req));
      return sendJson(res, 201, { offer: createOffer(db, offer) });
    }

    const id = Number(parts[2]);
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(404, 'Not found');
    if (parts.length === 3 && req.method === 'GET') {
      const offer = getOffer(db, id);
      if (!offer) throw new HttpError(404, 'Offer not found');
      return sendJson(res, 200, { offer });
    }
    if (parts.length === 4 && parts[3] === 'vote' && req.method === 'POST') {
      const { kind } = await readJson(req);
      if (kind !== 'valid' && kind !== 'expired') throw new HttpError(400, 'kind must be "valid" or "expired"');
      if (!getOffer(db, id)) throw new HttpError(404, 'Offer not found');
      return sendJson(res, 200, { offer: vote(db, id, voterId(req), kind) });
    }
    throw new HttpError(405, 'Method not allowed');
  }

  async function handleStatic(req, res, url) {
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed');
    const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).slice(1);
    const file = normalize(join(PUBLIC_DIR, rel));
    if (!file.startsWith(PUBLIC_DIR)) throw new HttpError(404, 'Not found');
    let body;
    try {
      body = await readFile(file);
    } catch {
      throw new HttpError(404, 'Not found');
    }
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(req.method === 'HEAD' ? undefined : body);
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
      else await handleStatic(req, res, url);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) console.error(err);
      sendJson(res, status, { error: status === 500 ? 'Internal server error' : err.message });
    }
  });
  server.on('close', () => db.close());
  return server;
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new HttpError(413, 'Request body too large');
    chunks.push(chunk);
  }
  try {
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    if (typeof data !== 'object' || data === null || Array.isArray(data)) throw new Error();
    return data;
  } catch {
    throw new HttpError(400, 'Invalid JSON body');
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 3000);
  createApp().listen(port, () => console.log(`🎂 Toronto Birthday Offers running at http://localhost:${port}`));
}
