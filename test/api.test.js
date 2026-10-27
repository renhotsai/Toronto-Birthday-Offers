import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server.js';
import { SEED_OFFERS } from '../seed.js';

let server;
let base;

before(async () => {
  server = createApp({ dbPath: ':memory:' });
  await new Promise((resolve) => server.listen(0, resolve));
  base = `http://localhost:${server.address().port}`;
});
after(() => server.close());

const post = (path, body) => fetch(base + path, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const validOffer = {
  name: 'Test Café',
  category: 'drink',
  description: 'Free latte on your birthday',
  conditions: 'Show ID',
  valid_window: 'day',
  address: '1 Yonge St',
  lat: 43.6426,
  lng: -79.3755,
  url: 'https://example.com',
  submitted_by: 'tester',
};

test('lists seeded offers', async () => {
  const res = await fetch(`${base}/api/offers`);
  assert.equal(res.status, 200);
  const { offers } = await res.json();
  assert.equal(offers.length, SEED_OFFERS.length);
  assert.ok(offers.every((o) => o.is_seed));
});

test('creates an offer and finds it by search and category', async () => {
  const res = await post('/api/offers', validOffer);
  assert.equal(res.status, 201);
  const { offer } = await res.json();
  assert.equal(offer.name, 'Test Café');
  assert.equal(offer.valid_votes, 0);

  const bySearch = await (await fetch(`${base}/api/offers?q=latte`)).json();
  assert.deepEqual(bySearch.offers.map((o) => o.id), [offer.id]);

  const byCategory = await (await fetch(`${base}/api/offers?category=beauty`)).json();
  assert.ok(byCategory.offers.every((o) => o.category === 'beauty'));
});

test('search treats % and _ literally', async () => {
  const { offers } = await (await fetch(`${base}/api/offers?q=${encodeURIComponent('%')}`)).json();
  assert.equal(offers.length, 0);
});

test('rejects invalid offers', async () => {
  for (const bad of [
    { ...validOffer, name: '' },
    { ...validOffer, category: 'cars' },
    { ...validOffer, lat: 49.28, lng: -123.12 }, // Vancouver
    { ...validOffer, url: 'javascript:alert(1)' },
    { ...validOffer, valid_window: 'year' },
  ]) {
    const res = await post('/api/offers', bad);
    assert.equal(res.status, 400, JSON.stringify(bad));
  }
  const res = await fetch(`${base}/api/offers`, { method: 'POST', body: 'not json' });
  assert.equal(res.status, 400);
});

test('voting replaces the previous vote from the same voter', async () => {
  const { offers } = await (await fetch(`${base}/api/offers`)).json();
  const id = offers[0].id;

  let { offer } = await (await post(`/api/offers/${id}/vote`, { kind: 'valid' })).json();
  assert.equal(offer.valid_votes, 1);
  assert.ok(offer.last_confirmed_at);

  ({ offer } = await (await post(`/api/offers/${id}/vote`, { kind: 'expired' })).json());
  assert.equal(offer.valid_votes, 0);
  assert.equal(offer.expired_votes, 1);

  assert.equal((await post(`/api/offers/${id}/vote`, { kind: 'maybe' })).status, 400);
  assert.equal((await post('/api/offers/99999/vote', { kind: 'valid' })).status, 404);
});

test('serves the app and blocks path traversal', async () => {
  const home = await fetch(base + '/');
  assert.equal(home.status, 200);
  assert.match(await home.text(), /生日優惠地圖/);
  const sneaky = await fetch(base + '/..%2Fserver.js');
  assert.equal(sneaky.status, 404);
});
