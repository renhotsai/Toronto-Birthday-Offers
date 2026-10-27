const CATEGORY_ICONS = {
  food: '🍔', drink: '☕', dessert: '🍦', beauty: '💄', retail: '🛍️', entertainment: '🎟️', other: '🎁',
};
const WINDOWS = ['day', 'week', 'month'];

const I18N = {
  zh: {
    title: '🎂 多倫多生日優惠地圖',
    add: '＋ 分享優惠',
    searchPlaceholder: '搜尋店名、優惠、地址…',
    all: '全部',
    cat: { food: '餐廳', drink: '飲品', dessert: '甜點', beauty: '美妝', retail: '購物', entertainment: '娛樂', other: '其他' },
    win: { day: '生日當天', week: '生日當週', month: '生日當月' },
    count: (n) => `共 ${n} 個優惠`,
    empty: '找不到符合的優惠，來分享第一個吧！',
    disclaimer: '優惠由社群分享，條款可能已變動，出發前請先向店家確認。',
    pickHint: '點一下地圖來放置優惠位置',
    cancel: '取消',
    submit: '送出',
    formTitle: '分享一個生日優惠',
    fName: '店家名稱 *',
    fCategory: '類別 *',
    fDescription: '優惠內容 *',
    fDescriptionPh: '例如：生日當天免費一杯飲料',
    fConditions: '使用條件',
    fConditionsPh: '例如：需加入會員、出示證件、需消費滿 $10',
    fWindow: '可使用期間',
    fLocation: '位置 *',
    fAddressPh: '地址或地標',
    find: '搜尋',
    pickOnMap: '📍 在地圖上點選',
    fUrl: '相關連結',
    fNickname: '你的暱稱',
    needLocation: '請先選擇位置（搜尋地址或在地圖上點選）。',
    notFound: '找不到這個地址，試試在地圖上點選。',
    stillValid: '👍 還有效',
    expired: '👎 已失效',
    conditions: '條件',
    link: '官方連結',
    example: '範例',
    by: (who) => `由 ${who} 分享`,
    confirmed: (d) => `最近確認：${d}`,
    thanks: '感謝分享！🎉',
    voteError: '投票失敗，請稍後再試。',
    loadError: '載入失敗，請重新整理頁面。',
    likelyExpired: '可能已失效',
  },
  en: {
    title: '🎂 Toronto Birthday Offers',
    add: '+ Share an offer',
    searchPlaceholder: 'Search shops, offers, addresses…',
    all: 'All',
    cat: { food: 'Food', drink: 'Drinks', dessert: 'Dessert', beauty: 'Beauty', retail: 'Shopping', entertainment: 'Fun', other: 'Other' },
    win: { day: 'Birthday only', week: 'Birthday week', month: 'Birthday month' },
    count: (n) => `${n} offer${n === 1 ? '' : 's'}`,
    empty: 'No matching offers yet. Be the first to share one!',
    disclaimer: 'Offers are shared by the community and terms change. Please check with the store before you go.',
    pickHint: 'Tap the map to place the offer',
    cancel: 'Cancel',
    submit: 'Submit',
    formTitle: 'Share a birthday offer',
    fName: 'Business name *',
    fCategory: 'Category *',
    fDescription: 'What do you get? *',
    fDescriptionPh: 'e.g. Free drink on your birthday',
    fConditions: 'Conditions',
    fConditionsPh: 'e.g. Members only, show ID, $10 minimum',
    fWindow: 'When can you use it?',
    fLocation: 'Location *',
    fAddressPh: 'Address or landmark',
    find: 'Find',
    pickOnMap: '📍 Pick on map',
    fUrl: 'Link',
    fNickname: 'Your nickname',
    needLocation: 'Please choose a location (search an address or pick on the map).',
    notFound: "Couldn't find that address. Try picking on the map.",
    stillValid: '👍 Still valid',
    expired: '👎 Expired',
    conditions: 'Conditions',
    link: 'Official link',
    example: 'Example',
    by: (who) => `Shared by ${who}`,
    confirmed: (d) => `Last confirmed: ${d}`,
    thanks: 'Thanks for sharing! 🎉',
    voteError: 'Vote failed, please try again.',
    loadError: 'Failed to load. Please refresh.',
    likelyExpired: 'May be expired',
  },
};

const state = {
  lang: loadPref('lang', 'zh'),
  category: '',
  q: '',
  offers: [],
  markers: new Map(),
  picking: false,
};
const t = () => I18N[state.lang];
const $ = (sel) => document.querySelector(sel);

// ---------- Map ----------
const map = L.map('map', { zoomControl: true }).setView([43.6532, -79.3832], 12);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);
const markerLayer = L.layerGroup().addTo(map);
let draftMarker = null;

function iconFor(category) {
  return L.divIcon({
    className: 'emoji-marker',
    html: `<span>${CATEGORY_ICONS[category] ?? '🎁'}</span>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -16],
  });
}

// ---------- Data ----------
async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? res.statusText);
  return data;
}

async function loadOffers() {
  const params = new URLSearchParams();
  if (state.category) params.set('category', state.category);
  if (state.q) params.set('q', state.q);
  try {
    const { offers } = await api(`/api/offers?${params}`);
    state.offers = offers;
    render();
  } catch {
    $('#count').textContent = t().loadError;
  }
}

// ---------- Rendering ----------
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function safeUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : '';
  } catch {
    return '';
  }
}

function formatDate(sqlDate) {
  const d = new Date(sqlDate.replace(' ', 'T') + 'Z');
  return d.toLocaleDateString(state.lang === 'zh' ? 'zh-TW' : 'en-CA');
}

function offerHtml(o) {
  const tr = t();
  const url = safeUrl(o.url);
  const likelyExpired = o.expired_votes >= 3 && o.expired_votes > o.valid_votes;
  return `
    <div class="offer-head">
      <span class="offer-icon">${CATEGORY_ICONS[o.category] ?? '🎁'}</span>
      <div>
        <strong>${escapeHtml(o.name)}</strong>
        <div class="tags">
          <span class="tag">${tr.cat[o.category] ?? o.category}</span>
          <span class="tag">${tr.win[o.valid_window] ?? ''}</span>
          ${o.is_seed ? `<span class="tag tag-muted">${tr.example}</span>` : ''}
          ${likelyExpired ? `<span class="tag tag-warn">${tr.likelyExpired}</span>` : ''}
        </div>
      </div>
    </div>
    <p>${escapeHtml(o.description)}</p>
    ${o.conditions ? `<p class="muted"><b>${tr.conditions}：</b>${escapeHtml(o.conditions)}</p>` : ''}
    ${o.address ? `<p class="muted">📍 ${escapeHtml(o.address)}</p>` : ''}
    ${url ? `<p><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${tr.link} ↗</a></p>` : ''}
    <div class="vote-row">
      <button type="button" class="vote" data-id="${o.id}" data-kind="valid">${tr.stillValid} · ${o.valid_votes}</button>
      <button type="button" class="vote" data-id="${o.id}" data-kind="expired">${tr.expired} · ${o.expired_votes}</button>
    </div>
    <p class="meta muted">
      ${o.submitted_by && !o.is_seed ? escapeHtml(tr.by(o.submitted_by)) + ' · ' : ''}
      ${o.last_confirmed_at ? tr.confirmed(formatDate(o.last_confirmed_at)) : formatDate(o.created_at)}
    </p>`;
}

function render() {
  const tr = t();
  markerLayer.clearLayers();
  state.markers.clear();
  for (const o of state.offers) {
    const m = L.marker([o.lat, o.lng], { icon: iconFor(o.category), title: o.name })
      .bindPopup(() => `<div class="popup">${offerHtml(o)}</div>`, { maxWidth: 280 });
    m.addTo(markerLayer);
    state.markers.set(o.id, m);
  }

  $('#count').textContent = tr.count(state.offers.length);
  const list = $('#offer-list');
  list.innerHTML = state.offers.length
    ? state.offers.map((o) => `<li class="offer-card" data-id="${o.id}" tabindex="0">${offerHtml(o)}</li>`).join('')
    : `<li class="empty muted">${tr.empty}</li>`;
}

function renderChrome() {
  const tr = t();
  document.documentElement.lang = state.lang === 'zh' ? 'zh-Hant' : 'en';
  document.title = tr.title.replace(/^\S+\s/, '');
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = tr[el.dataset.i18n]; });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => { el.placeholder = tr[el.dataset.i18nPlaceholder]; });
  $('#lang-toggle').textContent = state.lang === 'zh' ? 'EN' : '中文';

  const cats = ['', ...Object.keys(CATEGORY_ICONS)];
  $('#categories').innerHTML = cats.map((c) => `
    <button type="button" class="chip" data-category="${c}" aria-pressed="${state.category === c}">
      ${c ? CATEGORY_ICONS[c] + ' ' + tr.cat[c] : tr.all}
    </button>`).join('');

  const catSelect = $('#category-select');
  const prevCat = catSelect.value;
  catSelect.innerHTML = Object.keys(CATEGORY_ICONS)
    .map((c) => `<option value="${c}">${CATEGORY_ICONS[c]} ${tr.cat[c]}</option>`).join('');
  if (prevCat) catSelect.value = prevCat;

  const winSelect = $('#window-select');
  const prevWin = winSelect.value;
  winSelect.innerHTML = WINDOWS.map((w) => `<option value="${w}">${tr.win[w]}</option>`).join('');
  if (prevWin) winSelect.value = prevWin;
}

// ---------- Interactions ----------
$('#lang-toggle').addEventListener('click', () => {
  state.lang = state.lang === 'zh' ? 'en' : 'zh';
  savePref('lang', state.lang);
  renderChrome();
  render();
});

$('#categories').addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  state.category = chip.dataset.category;
  renderChrome();
  loadOffers();
});

let searchTimer;
$('#search').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.q = e.target.value.trim();
    loadOffers();
  }, 250);
});

function focusOffer(id) {
  const m = state.markers.get(id);
  if (!m) return;
  map.setView(m.getLatLng(), Math.max(map.getZoom(), 15));
  m.openPopup();
  if (window.matchMedia('(max-width: 800px)').matches) $('#map').scrollIntoView({ behavior: 'smooth' });
}

$('#offer-list').addEventListener('click', (e) => {
  if (e.target.closest('a, button')) return;
  const card = e.target.closest('.offer-card');
  if (card) focusOffer(Number(card.dataset.id));
});
$('#offer-list').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.target.closest('a, button')) return;
  const card = e.target.closest('.offer-card');
  if (card) focusOffer(Number(card.dataset.id));
});

// Vote buttons live in both the list and map popups.
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('button.vote');
  if (!btn) return;
  btn.disabled = true;
  try {
    const { offer } = await api(`/api/offers/${btn.dataset.id}/vote`, {
      method: 'POST',
      body: JSON.stringify({ kind: btn.dataset.kind }),
    });
    const i = state.offers.findIndex((o) => o.id === offer.id);
    if (i !== -1) state.offers[i] = offer;
    const wasOpen = state.markers.get(offer.id)?.isPopupOpen();
    render();
    if (wasOpen) state.markers.get(offer.id)?.openPopup();
  } catch {
    alert(t().voteError);
    btn.disabled = false;
  }
});

// ---------- Add offer ----------
const dialog = $('#add-dialog');
const form = $('#add-form');

function setLocation(lat, lng) {
  form.lat.value = lat.toFixed(6);
  form.lng.value = lng.toFixed(6);
  $('#coords').textContent = `✅ ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  if (draftMarker) draftMarker.setLatLng([lat, lng]);
  else draftMarker = L.marker([lat, lng], { icon: iconFor(form.category.value), opacity: 0.7 }).addTo(map);
}

function resetForm() {
  form.reset();
  form.lat.value = '';
  form.lng.value = '';
  $('#coords').textContent = '';
  $('#form-error').textContent = '';
  if (draftMarker) { draftMarker.remove(); draftMarker = null; }
}

$('#add-btn').addEventListener('click', () => {
  resetForm();
  dialog.showModal();
});
$('#form-cancel').addEventListener('click', () => {
  dialog.close();
  resetForm();
});

$('#pick-btn').addEventListener('click', () => {
  state.picking = true;
  dialog.close();
  $('#pick-banner').hidden = false;
  $('#map').classList.add('picking');
  $('#map').scrollIntoView({ behavior: 'smooth' });
});

function endPicking() {
  state.picking = false;
  $('#pick-banner').hidden = true;
  $('#map').classList.remove('picking');
  dialog.showModal();
}
$('#pick-cancel').addEventListener('click', endPicking);
map.on('click', (e) => {
  if (!state.picking) return;
  setLocation(e.latlng.lat, e.latlng.lng);
  endPicking();
});

$('#geocode-btn').addEventListener('click', async () => {
  const q = form.address.value.trim();
  if (!q) return;
  $('#form-error').textContent = '';
  try {
    // Free OpenStreetMap geocoder, restricted to the GTA.
    const params = new URLSearchParams({
      q, format: 'json', limit: '1', countrycodes: 'ca', viewbox: '-80.1,44.2,-78.8,43.4', bounded: '1',
    });
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { headers: { 'Accept-Language': state.lang === 'zh' ? 'zh-TW,en' : 'en' } });
    const [hit] = await res.json();
    if (!hit) throw new Error('not found');
    const lat = Number(hit.lat);
    const lng = Number(hit.lon);
    setLocation(lat, lng);
    map.setView([lat, lng], 16);
  } catch {
    $('#form-error').textContent = t().notFound;
  }
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  if (!data.lat || !data.lng) {
    $('#form-error').textContent = t().needLocation;
    return;
  }
  const submit = form.querySelector('[type=submit]');
  submit.disabled = true;
  try {
    const { offer } = await api('/api/offers', { method: 'POST', body: JSON.stringify(data) });
    savePref('nickname', data.submitted_by);
    dialog.close();
    resetForm();
    state.category = '';
    state.q = '';
    $('#search').value = '';
    renderChrome();
    await loadOffers();
    focusOffer(offer.id);
    toast(t().thanks);
  } catch (err) {
    $('#form-error').textContent = err.message;
  } finally {
    submit.disabled = false;
  }
});
dialog.addEventListener('close', () => {
  if (!state.picking && draftMarker) { draftMarker.remove(); draftMarker = null; }
});

// ---------- Utils ----------
function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.append(el);
  setTimeout(() => el.remove(), 2500);
}

function loadPref(key, fallback) {
  try { return localStorage.getItem(`tbo:${key}`) ?? fallback; } catch { return fallback; }
}
function savePref(key, value) {
  try { localStorage.setItem(`tbo:${key}`, value ?? ''); } catch { /* storage unavailable */ }
}

renderChrome();
form.submitted_by.defaultValue = loadPref('nickname', '');
loadOffers();
