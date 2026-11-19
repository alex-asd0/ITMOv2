'use strict';

/* ==========================================================================
   Менеджер задач + геймификация.
   Контракт с бэкендом не менялся: /api/tasks, /api/user/profile,
   /api/emojis/catalog, /api/spin/pool, /api/spin, /api/tasks/:id/emojis.
   ========================================================================== */

const MAX_SPINS = 5;
const RARITY_LABELS = { common: 'Обычное', rare: 'Редкое', very_rare: 'Очень редкое' };
const RARITY_GROUP_LABELS = { very_rare: 'Очень редкие', rare: 'Редкие', common: 'Обычные' };
const RARITY_ORDER = ['very_rare', 'rare', 'common'];
const EMOJI_ERRORS = {
  emoji_locked: 'Это эмодзи ещё не открыто — его можно выиграть на колесе',
  multi_emoji_not_enabled: 'Несколько эмодзи на задаче доступны с перком «Мульти-эмодзи»',
  capacity_reached: 'На задаче уже максимум эмодзи',
  already_assigned: 'Это эмодзи уже стоит на задаче',
};
const LOCKED_SLOT_HINT = 'Ещё два места откроются с перком «Мульти-эмодзи» — его можно выиграть на колесе';

const state = {
  user: null,
  catalog: [],
  tasks: [],
  tasksLoaded: false,
  tasksError: null,
  view: 'list',
  calAnchor: null,
  pool: null,
  wheel: { rotation: 0, count: 8, per: 45, spinning: false },
  lastResult: null,
};

/* ---------- Утилиты ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const pad = (n) => String(n).padStart(2, '0');
const localKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayKey = () => localKey(new Date());
const parseKey = (key) => new Date(`${key}T00:00:00`);
const localInput = (d) => `${localKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function h(tag, attrs = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'style') node.style.cssText = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  kids.flat().forEach((kid) => {
    if (kid == null || kid === false) return;
    node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  });
  return node;
}

const ICONS = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  smile: '<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4.5 4.5 0 007 0M9 9.5h.01M15 9.5h.01"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2.5"/><path d="M8 11V8a4 4 0 018 0v3"/>',
  logout: '<path d="M9 4H6a2 2 0 00-2 2v12a2 2 0 002 2h3M16 8l4 4-4 4M20 12H9"/>',
  pencil: '<path d="M4 20l4-1 11-11a2.1 2.1 0 00-3-3L5 16l-1 4z"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  gift: '<rect x="3" y="8" width="18" height="5" rx="1.5"/><path d="M12 8v13M5 13v6a2 2 0 002 2h10a2 2 0 002-2v-6M12 8c-1-3-5-4-5-1.5S10 8 12 8zM12 8c1-3 5-4 5-1.5S14 8 12 8z"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16v4M17 18h4"/>',
  'chevron-left': '<path d="M15 6l-6 6 6 6"/>',
  'chevron-right': '<path d="M9 6l6 6-6 6"/>',
  moon: '<path d="M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
};

function svgIcon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}
function icon(name) {
  const span = h('span', { class: 'icon' });
  span.innerHTML = svgIcon(name);
  return span;
}
function hydrateIcons(root = document) {
  $$('[data-icon]', root).forEach((node) => {
    if (node.querySelector('svg')) return;
    node.insertAdjacentHTML('afterbegin', `<span class="icon">${svgIcon(node.dataset.icon)}</span>`);
  });
}

async function fetchJSON(url, options) {
  const headers = { 'Content-Type': 'application/json' };
  try {
    const name = localStorage.getItem('auth_name');
    if (name) headers['X-User-Name'] = name;
  } catch {}
  const res = await fetch(url, Object.assign({}, options || {}, { headers: Object.assign(headers, (options && options.headers) || {}) }));
  const isJSON = (res.headers.get('content-type') || '').includes('application/json');
  const data = isJSON ? await res.json() : await res.text();
  if (!res.ok) {
    const message = isJSON ? data.error || JSON.stringify(data) : String(data);
    throw new Error(message || 'Request failed');
  }
  return data;
}

function toISOWithOffset(s) {
  const d = new Date(s);
  const tz = -d.getTimezoneOffset();
  const sign = tz >= 0 ? '+' : '-';
  return `${localInput(d)}${sign}${pad(Math.floor(Math.abs(tz) / 60))}:${pad(Math.abs(tz) % 60)}`;
}

/* ---------- Тосты и конфетти ---------- */
function toast(message, { kind = 'info', duration = 3600 } = {}) {
  const root = $('#toasts');
  const node = h('div', { class: `toast is-${kind}`, text: message });
  root.append(node);
  setTimeout(() => {
    node.classList.add('is-leaving');
    setTimeout(() => node.remove(), 260);
  }, duration);
}

function confetti(origin, { count = 16, spread = 90, colors } = {}) {
  if (reducedMotion()) return;
  const layer = $('#fx-layer');
  const rect = origin.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const palette = colors || ['#ff7a3d', '#ffc233', '#2e9d6a', '#7c5cff', '#2fb59a'];
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = spread * (0.5 + Math.random());
    const piece = h('i', { class: 'confetti' });
    piece.style.left = `${cx}px`;
    piece.style.top = `${cy}px`;
    piece.style.setProperty('--c', pick(palette));
    piece.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
    piece.style.setProperty('--dy', `${Math.sin(angle) * dist - 30}px`);
    piece.style.setProperty('--rot', `${Math.random() * 720 - 360}deg`);
    layer.append(piece);
    setTimeout(() => piece.remove(), 1000);
  }
}

/* ---------- Окна: фокус, Esc, закрытие по фону ---------- */
const modalStack = [];

function openLayer(layer, { focus, onClose, closable = () => true } = {}) {
  const entry = { layer, onClose, closable, previous: document.activeElement };
  modalStack.push(entry);
  layer.hidden = false;
  document.body.style.overflow = 'hidden';
  layer.onmousedown = (ev) => { if (ev.target === layer && entry.closable()) closeLayer(layer); };
  const target = (typeof focus === 'string' ? $(focus, layer) : focus) || $('input, button:not([disabled])', layer);
  if (target) setTimeout(() => target.focus(), 30);
}

function closeLayer(layer) {
  const idx = modalStack.findIndex((m) => m.layer === layer);
  if (idx < 0) { layer.hidden = true; return; }
  const [entry] = modalStack.splice(idx, 1);
  layer.hidden = true;
  if (!modalStack.length) document.body.style.overflow = '';
  if (entry.onClose) entry.onClose();
  if (entry.previous && document.contains(entry.previous)) entry.previous.focus();
}

document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape') {
    if (picker.el) { closePicker(); return; }
    const top = modalStack[modalStack.length - 1];
    if (top && top.closable()) closeLayer(top.layer);
    return;
  }
  if (ev.key !== 'Tab') return;
  const top = modalStack[modalStack.length - 1];
  if (!top) return;
  const focusables = $$('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])', top.layer).filter((n) => n.offsetParent !== null);
  if (!focusables.length) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
  else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
});

/* ---------- Профиль, каталог, эмодзи ---------- */
const getSpins = (p) => (p ? p.spins_remaining ?? p.spinsRemaining ?? 0 : 0);
const setSpins = (p, v) => { if (p) { if ('spinsRemaining' in p && !('spins_remaining' in p)) p.spinsRemaining = v; else p.spins_remaining = v; } };
const hasPerk = () => !!(state.user && (state.user.has_multi_emoji ?? state.user.hasMultiEmoji ?? false));
const ownedEmojis = () => state.user?.emojis || state.user?.inventory?.emojis || state.user?.emoji_inventory || [];
const userHasEmoji = (code, version) => ownedEmojis().some((e) => e.code === code && (version ? e.version === version : true));

function normalizeEmoji(e) {
  if (!e || typeof e !== 'object') return {};
  return {
    code: e.code ?? e.id ?? e.key ?? null,
    version: e.version ?? e.ver ?? 'v1',
    rarity: e.rarity ?? e.tier ?? null,
    display_name: e.display_name ?? e.displayName ?? e.name ?? null,
    icon_ref: e.icon_ref ?? e.iconUrl ?? e.image_url ?? e.icon ?? null,
    glyph: e.glyph ?? e.char ?? e.unicode ?? null,
  };
}

const isGlyph = (s) => typeof s === 'string' && s && !(s.includes('.') || s.startsWith('/') || s.startsWith('http'));
const isImageRef = (s) => typeof s === 'string' && (s.startsWith('http') || s.startsWith('/') || s.includes('.'));

function glyphOf(raw) {
  const e = normalizeEmoji(raw);
  if (e.glyph) return e.glyph;
  if (isGlyph(e.icon_ref)) return e.icon_ref;
  const fromCatalog = state.catalog.find((c) => c.code === e.code && (!e.version || c.version === e.version));
  if (fromCatalog) {
    if (fromCatalog.glyph) return fromCatalog.glyph;
    if (isGlyph(fromCatalog.icon_ref)) return fromCatalog.icon_ref;
    return fromCatalog.display_name || fromCatalog.code || '?';
  }
  return e.display_name || e.code || '?';
}

function rarityOf(raw) {
  const e = normalizeEmoji(raw);
  if (e.rarity) return e.rarity;
  const fromCatalog = state.catalog.find((c) => c.code === e.code && c.version === e.version);
  return fromCatalog ? fromCatalog.rarity : 'common';
}

async function loadUserProfile() {
  try {
    state.user = await fetchJSON('/api/user/profile');
  } catch (e) {
    const msg = String(e?.message || '').toLowerCase();
    if (msg.includes('not_found') || msg.includes('unauthorized') || msg.includes('401') || msg.includes('403')) {
      window.location.href = '/static/login.html';
      return false;
    }
    state.user = { name: localStorage.getItem('auth_name') || 'demo', spins_remaining: MAX_SPINS, has_multi_emoji: false, reset_info: { next_midnight_utc_offset: '+00:00' }, emojis: [] };
  }
  renderHeader();
  return true;
}

async function loadEmojiCatalog() {
  try {
    const raw = await fetchJSON('/api/emojis/catalog');
    state.catalog = Array.isArray(raw) ? raw.map(normalizeEmoji) : [];
  } catch {
    state.catalog = [
      { code: 'star', version: 'v1', rarity: 'rare', display_name: 'Star', icon_ref: '⭐' },
      { code: 'fire', version: 'v1', rarity: 'common', display_name: 'Fire', icon_ref: '🔥' },
      { code: 'check', version: 'v1', rarity: 'common', display_name: 'Check', icon_ref: '✔️' },
    ].map(normalizeEmoji);
  }
  renderHeader();
}

/* ---------- Время до сброса круток ---------- */
function offsetMinutes(str) {
  const m = /^([+-])(\d{2}):(\d{2})$/.exec(str || '');
  if (!m) return 0;
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
}

function msUntilReset() {
  const offsetMs = offsetMinutes(state.user?.reset_info?.next_midnight_utc_offset) * 60000;
  const dayMs = 86400000;
  const localNow = Date.now() + offsetMs;
  return Math.floor(localNow / dayMs) * dayMs + dayMs - localNow;
}

function formatCountdown(ms, short = false) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hh = Math.floor(total / 3600);
  const mm = Math.floor((total % 3600) / 60);
  const ss = total % 60;
  if (short) return hh > 0 ? `${hh} ч ${mm} мин` : `${mm} мин`;
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
}

let resetRefreshPending = false;
function tickTimers() {
  if (!state.user) return;
  const left = msUntilReset();
  $$('.js-reset-timer').forEach((n) => { n.textContent = formatCountdown(left); });
  if (getSpins(state.user) <= 0) {
    const hint = $('#game-hint');
    if (hint) hint.textContent = `Крутки обновятся через ${formatCountdown(left, true)}`;
    if (left <= 1000 && !resetRefreshPending) {
      resetRefreshPending = true;
      setTimeout(async () => { await loadUserProfile(); resetRefreshPending = false; }, 2000);
    }
  }
}

/* ---------- Задачи: вычисления ---------- */
function taskDayKey(t) {
  if (t.all_day) return t.all_day;
  if (t.when) return localKey(new Date(t.when));
  if (t.start) return localKey(new Date(t.start));
  return null;
}

function taskStamp(t) {
  if (t.all_day) return parseKey(t.all_day).getTime();
  if (t.when) return new Date(t.when).getTime();
  if (t.start) return new Date(t.start).getTime();
  return Number.MAX_SAFE_INTEGER;
}

const byStamp = (a, b) => taskStamp(a) - taskStamp(b) || a.id - b.id;
const fmtTime = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });
const fmtDayShort = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' });

function describeTime(t, { withDate = false } = {}) {
  const dayLabel = () => {
    const key = taskDayKey(t);
    if (!key) return '';
    const today = todayKey();
    const d = parseKey(key);
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    if (key === today) return 'Сегодня';
    if (key === localKey(tomorrow)) return 'Завтра';
    return fmtDayShort.format(d).replace('.', '');
  };
  try {
    if (t.all_day) return withDate ? `${dayLabel()} · весь день` : 'Весь день';
    if (t.when) return `${withDate ? `${dayLabel()} · ` : ''}${fmtTime.format(new Date(t.when))}`;
    if (t.start && t.end) return `${withDate ? `${dayLabel()} · ` : ''}${fmtTime.format(new Date(t.start))}–${fmtTime.format(new Date(t.end))}`;
  } catch {}
  return '';
}

function todayStats() {
  const key = todayKey();
  const list = state.tasks.filter((t) => taskDayKey(t) === key);
  return { total: list.length, done: list.filter((t) => t.done).length };
}

function overdueCount() {
  const key = todayKey();
  return state.tasks.filter((t) => !t.done && taskDayKey(t) && taskDayKey(t) < key).length;
}

/* ---------- Шапка: прогресс дня и игра ---------- */
function greetingWord() {
  const hour = new Date().getHours();
  if (hour < 5) return 'Доброй ночи';
  if (hour < 12) return 'Доброе утро';
  if (hour < 18) return 'Добрый день';
  return 'Добрый вечер';
}

function renderHeader() {
  const name = state.user?.name || localStorage.getItem('auth_name') || '';
  $('#user-name').textContent = name;
  $('#user-avatar').textContent = name.slice(0, 1);
  $('#today-date').textContent = new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
  $('#greeting').textContent = `${greetingWord()}${name ? `, ${name}` : ''}`;

  const { total, done } = todayStats();
  const percent = total ? Math.round((done / total) * 100) : 0;
  const complete = total > 0 && done === total;
  const card = $('#progress-card');
  card.classList.toggle('is-complete', complete);
  $('#ring-value').style.strokeDashoffset = String(263.9 * (1 - (total ? done / total : 0)));
  $('#ring-percent').textContent = `${percent}%`;
  $('#ring').setAttribute('aria-label', total ? `Сегодня выполнено ${done} из ${total}` : 'На сегодня задач нет');

  const title = $('#progress-title');
  const sub = $('#progress-sub');
  const late = overdueCount();
  if (!state.tasksLoaded) {
    title.textContent = 'Загружаем задачи…';
    sub.textContent = '';
  } else if (!total) {
    title.textContent = 'На сегодня задач нет';
    sub.textContent = 'Добавьте задачу с датой — здесь появится прогресс дня.';
  } else if (complete) {
    title.textContent = 'День закрыт!';
    sub.textContent = getSpins(state.user) > 0 ? 'Отличная работа. Самое время крутануть колесо.' : 'Отличная работа. Отдыхайте — вы это заслужили.';
  } else if (!done) {
    title.textContent = `0 из ${total} — начнём?`;
    sub.textContent = 'Выберите самую простую задачу и отметьте её первой.';
  } else {
    title.textContent = `${done} из ${total} задач сегодня`;
    sub.textContent = `Осталось ${total - done} — и день закрыт.`;
  }
  if (late > 0) {
    const strong = h('strong', { text: `Просрочено: ${late}` });
    sub.append(' ', strong);
  }

  const spins = getSpins(state.user);
  $('#spins-label').textContent = `${spins} из ${MAX_SPINS}`;
  const coins = $('#spins-coins');
  coins.setAttribute('aria-label', `Осталось круток: ${spins} из ${MAX_SPINS}`);
  coins.replaceChildren(...Array.from({ length: MAX_SPINS }, (_, i) => h('span', { class: `coin${i < spins ? '' : ' is-spent'}`, text: i < spins ? '★' : '' })));
  const play = $('#play-button');
  play.classList.toggle('is-ready', spins > 0);
  const hint = $('#game-hint');
  if (spins > 0) hint.textContent = complete ? 'Награда за день: крути колесо!' : 'Выигрывайте эмодзи для своих задач.';
  else hint.textContent = `Крутки обновятся через ${formatCountdown(msUntilReset(), true)}`;

  const owned = ownedEmojis().length;
  $('#collection-count').textContent = `${owned}/${state.catalog.length || owned}`;
}

/* ---------- Выбор времени ---------- */
function createTimePicker(root, { onChange } = {}) {
  const MODES = [['none', 'Без времени'], ['all_day', 'Весь день'], ['when', 'В момент'], ['timed', 'Интервал']];
  let mode = 'none';
  const inAll = h('input', { type: 'date', 'aria-label': 'Дата' });
  const inWhen = h('input', { type: 'datetime-local', 'aria-label': 'Дата и время' });
  const inStart = h('input', { type: 'datetime-local', 'aria-label': 'Начало' });
  const inEnd = h('input', { type: 'datetime-local', 'aria-label': 'Окончание' });
  const fields = h('div', { class: 'time-fields' });
  const buttons = MODES.map(([value, label]) =>
    h('button', { type: 'button', role: 'radio', class: 'segmented-item', 'data-mode': value, text: label, onclick: () => setMode(value) })
  );
  const seg = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': 'Когда выполнить' }, buttons);
  const labelled = (text, input) => h('label', { class: 'time-field' }, h('span', { text }), input);

  function resetDefaults() {
    const now = new Date();
    inAll.value = localKey(now);
    inWhen.value = localInput(now);
    inStart.value = localInput(now);
    inEnd.value = localInput(new Date(now.getTime() + 30 * 60000));
  }

  function setMode(next) {
    mode = next;
    buttons.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mode === mode)));
    fields.replaceChildren(
      ...(mode === 'all_day' ? [labelled('Дата', inAll)]
        : mode === 'when' ? [labelled('Дата и время', inWhen)]
        : mode === 'timed' ? [labelled('Начало', inStart), labelled('Окончание', inEnd)]
        : [h('p', { class: 'time-none', text: 'Задача появится в блоке «Без срока».' })])
    );
    if (onChange) onChange();
  }

  [inAll, inWhen, inStart, inEnd].forEach((i) => i.addEventListener('change', () => onChange && onChange()));
  root.replaceChildren(seg, fields);
  resetDefaults();
  setMode('none');

  return {
    setMode,
    reset() { resetDefaults(); setMode('none'); },
    setFromTask(task) {
      resetDefaults();
      if (task.all_day) { inAll.value = task.all_day; setMode('all_day'); }
      else if (task.when) { inWhen.value = localInput(new Date(task.when)); setMode('when'); }
      else if (task.start && task.end) { inStart.value = localInput(new Date(task.start)); inEnd.value = localInput(new Date(task.end)); setMode('timed'); }
      else setMode('none');
    },
    payload(withNulls = false) {
      const p = withNulls ? { all_day: null, when: null, start: null, end: null } : {};
      if (mode === 'all_day' && inAll.value) p.all_day = inAll.value;
      else if (mode === 'when' && inWhen.value) p.when = toISOWithOffset(inWhen.value);
      else if (mode === 'timed' && inStart.value && inEnd.value) { p.start = toISOWithOffset(inStart.value); p.end = toISOWithOffset(inEnd.value); }
      return p;
    },
    validate() {
      if (mode === 'timed' && inEnd.value <= inStart.value) return 'Окончание должно быть позже начала';
      return '';
    },
    summary() {
      if (mode === 'all_day' && inAll.value) return `Весь день · ${fmtDayShort.format(parseKey(inAll.value)).replace('.', '')}`;
      if (mode === 'when' && inWhen.value) { const d = new Date(inWhen.value); return `${fmtDayShort.format(d).replace('.', '')}, ${fmtTime.format(d)}`; }
      if (mode === 'timed' && inStart.value && inEnd.value) { const s = new Date(inStart.value); return `${fmtDayShort.format(s).replace('.', '')}, ${fmtTime.format(s)}–${fmtTime.format(new Date(inEnd.value))}`; }
      return 'Без времени';
    },
  };
}

/* ---------- Слоты и выбор эмодзи ---------- */
const picker = { el: null, anchor: null };

function closePicker() {
  if (!picker.el) return;
  picker.el.remove();
  document.removeEventListener('pointerdown', onPickerOutside, true);
  window.removeEventListener('resize', closePicker);
  if (picker.anchor) picker.anchor.setAttribute('aria-expanded', 'false');
  picker.el = null;
  picker.anchor = null;
}

function onPickerOutside(ev) {
  if (picker.el && !picker.el.contains(ev.target) && !(picker.anchor && picker.anchor.contains(ev.target))) closePicker();
}

function openEmojiPicker(anchor, { selected, onPick }) {
  closePicker();
  const owned = state.catalog.filter((c) => userHasEmoji(c.code, c.version)).length;
  const grid = h('div', { class: 'emoji-grid', role: 'group', 'aria-label': 'Эмодзи' });
  const ordered = [...state.catalog].sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity));
  ordered.forEach((item) => {
    const locked = !userHasEmoji(item.code, item.version);
    const chosen = selected.some((s) => s.code === item.code && s.version === item.version);
    const name = item.display_name || item.code;
    const tile = h('button', {
      type: 'button',
      class: `emoji-tile${locked ? ' is-locked' : ''}${chosen ? ' is-selected' : ''}`,
      'data-rarity': item.rarity,
      'aria-disabled': locked ? 'true' : null,
      title: locked ? `${name} — выпадает на колесе фортуны` : name,
      'aria-label': locked ? `${name}, закрыто` : name,
      onclick: () => {
        if (locked) { toast('Это эмодзи пока закрыто — оно выпадает на колесе фортуны', { kind: 'game' }); return; }
        if (chosen) { closePicker(); return; }
        closePicker();
        onPick(item);
      },
    }, h('span', { class: 'glyph', text: glyphOf(item) }));
    if (locked) tile.append(h('span', { class: 'lock' }, icon('lock')));
    grid.append(tile);
  });
  const el = h('div', { class: 'popover', role: 'dialog', 'aria-label': 'Выбор эмодзи' },
    h('div', { class: 'popover-head' }, h('h3', { text: 'Выберите эмодзи' }), h('span', { text: `Открыто ${owned} из ${state.catalog.length}` })),
    grid,
    h('p', { class: 'popover-foot', text: 'Закрытые эмодзи можно выиграть на колесе фортуны.' })
  );
  document.body.append(el);
  const rect = anchor.getBoundingClientRect();
  const width = el.offsetWidth;
  const height = el.offsetHeight;
  let left = Math.min(Math.max(12, rect.left), window.innerWidth - width - 12);
  let top = rect.bottom + 10;
  if (top + height > window.innerHeight - 12) top = Math.max(12, rect.top - height - 10);
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
  anchor.setAttribute('aria-expanded', 'true');
  picker.el = el;
  picker.anchor = anchor;
  document.addEventListener('pointerdown', onPickerOutside, true);
  window.addEventListener('resize', closePicker);
  const firstFree = $('.emoji-tile:not(.is-locked)', el) || $('.emoji-tile', el);
  if (firstFree) firstFree.focus();
}

function renderEmojiSlots(container, selected, { onChange }) {
  const capacity = hasPerk() ? 3 : 1;
  const nodes = [];
  for (let i = 0; i < capacity; i++) {
    const item = selected[i];
    if (item) {
      nodes.push(h('button', {
        type: 'button', class: 'slot is-filled', title: 'Нажмите, чтобы снять эмодзи', 'aria-label': `Снять эмодзи ${item.display_name || item.code || ''}`,
        onclick: () => { selected.splice(i, 1); onChange(); },
      }, glyphOf(item)));
    } else {
      const slot = h('button', {
        type: 'button', class: 'slot', title: 'Добавить эмодзи', 'aria-label': 'Добавить эмодзи', 'aria-haspopup': 'dialog', 'aria-expanded': 'false',
        onclick: () => openEmojiPicker(slot, { selected, onPick: (emoji) => { selected.push(emoji); onChange(); } }),
      }, icon('smile'));
      nodes.push(slot);
    }
  }
  if (!hasPerk()) {
    nodes.push(h('button', { type: 'button', class: 'slot is-locked', title: LOCKED_SLOT_HINT, 'aria-label': LOCKED_SLOT_HINT, onclick: () => toast(LOCKED_SLOT_HINT, { kind: 'game' }) }, icon('lock')));
  }
  container.replaceChildren(...nodes);
}

/* ---------- Карточка задачи ---------- */
function renderTask(task, { compact = false } = {}) {
  const today = todayKey();
  const key = taskDayKey(task);
  const overdue = !task.done && key && key < today;
  const li = h('li', { class: `task${compact ? ' compact' : ''}${task.done ? ' is-done' : ''}${overdue ? ' is-overdue' : ''}`, 'data-id': task.id });

  const check = h('button', {
    type: 'button', class: 'check', role: 'checkbox', 'aria-checked': String(!!task.done), 'aria-label': `Выполнено: ${task.title}`,
    onclick: (ev) => { ev.stopPropagation(); toggleTask(task, li, check); },
  }, icon('check'));

  const emojis = (task.emojis || []).slice(0, 3);
  const timeText = describeTime(task, { withDate: !compact && !!key && key !== today });
  const badge = timeText ? h('span', { class: `badge${overdue ? ' is-overdue' : key === today ? ' is-today' : ''}` }, compact ? '' : icon('clock'), timeText) : null;

  const main = h('button', { type: 'button', class: 'task-main', 'aria-label': `Изменить задачу: ${task.title}`, onclick: () => openEditModal(task) },
    emojis.length ? h('span', { class: 'task-emojis', 'aria-hidden': 'true', text: emojis.map(glyphOf).join('') }) : null,
    h('span', { class: 'task-text' },
      h('span', { class: 'task-title', text: task.title }),
      badge ? h('span', { class: 'task-meta' }, overdue ? h('span', { class: 'badge is-overdue', text: 'Просрочено' }) : null, badge) : null
    ),
    h('span', { class: 'task-edit' }, icon('pencil'))
  );
  li.append(check, main);
  return li;
}

const DONE_PHRASES = ['Отлично!', 'Так держать!', 'Ещё один шаг вперёд!', 'Готово — вы молодец!', 'Минус одна задача!'];

async function toggleTask(task, li, checkBtn) {
  const wasComplete = (() => { const s = todayStats(); return s.total > 0 && s.done === s.total; })();
  const next = !task.done;
  task.done = next;
  checkBtn.setAttribute('aria-checked', String(next));
  li.classList.toggle('is-done', next);
  renderHeader();
  if (next) {
    li.classList.add('just-done');
    confetti(checkBtn, { count: 14, spread: 70 });
  }
  try {
    await fetchJSON(`/api/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ done: next }) });
  } catch (e) {
    task.done = !next;
    toast(`Не удалось обновить задачу: ${e.message}`, { kind: 'error' });
    renderAll();
    return;
  }
  const stats = todayStats();
  const dayClosed = next && !wasComplete && stats.total > 0 && stats.done === stats.total;
  if (dayClosed) {
    confetti($('#ring'), { count: 40, spread: 160 });
    toast(getSpins(state.user) > 0 ? 'День закрыт! Загляните на колесо фортуны' : 'День закрыт! Отличная работа', { kind: 'success', duration: 4600 });
  } else if (next) {
    toast(pick(DONE_PHRASES), { kind: 'success', duration: 2200 });
  }
  setTimeout(renderAll, next ? 600 : 0);
}

/* ---------- Список ---------- */
function groupTasks() {
  const today = todayKey();
  const groups = { overdue: [], today: [], upcoming: [], someday: [], done: [] };
  state.tasks.forEach((t) => {
    if (t.done) { groups.done.push(t); return; }
    const key = taskDayKey(t);
    if (!key) groups.someday.push(t);
    else if (key < today) groups.overdue.push(t);
    else if (key === today) groups.today.push(t);
    else groups.upcoming.push(t);
  });
  Object.values(groups).forEach((g) => g.sort(byStamp));
  groups.done.reverse();
  return groups;
}

function renderList() {
  const root = $('#list-view');
  if (!state.tasksLoaded && !state.tasksError) {
    root.replaceChildren(h('div', { class: 'tasks' }, h('div', { class: 'skeleton' }), h('div', { class: 'skeleton' }), h('div', { class: 'skeleton' })));
    return;
  }
  const nodes = [];
  if (state.tasksError) {
    nodes.push(h('div', { class: 'error-card', role: 'alert' }, `Не удалось загрузить задачи: ${state.tasksError}`, h('button', { type: 'button', class: 'btn', text: 'Повторить', onclick: refreshTasks })));
  }
  if (!state.tasks.length && !state.tasksError) {
    nodes.push(h('div', { class: 'empty' },
      h('div', { class: 'empty-icon' }, icon('check')),
      h('h3', { text: 'Пока пусто' }),
      h('p', { text: 'Добавьте первую задачу в поле выше. Отмечайте готовое — и крутите колесо фортуны.' })
    ));
    root.replaceChildren(...nodes);
    return;
  }
  const groups = groupTasks();
  const open = groups.overdue.length + groups.today.length + groups.upcoming.length + groups.someday.length;
  if (!open && state.tasks.length) {
    nodes.push(h('div', { class: 'empty' },
      h('div', { class: 'empty-icon' }, icon('sparkle')),
      h('h3', { text: 'Все задачи выполнены' }),
      h('p', { text: 'Можно отдохнуть, а можно добавить что-нибудь новое.' })
    ));
  }
  const section = (cls, title, tasks) => {
    if (!tasks.length) return null;
    return h('section', { class: `section ${cls}` },
      h('div', { class: 'section-head' }, h('h2', { text: title }), h('span', { class: 'section-count', text: tasks.length })),
      h('ul', { class: 'tasks' }, tasks.map((t) => renderTask(t)))
    );
  };
  nodes.push(
    section('is-overdue', 'Просрочено', groups.overdue),
    section('is-today', 'Сегодня', groups.today),
    section('is-upcoming', 'Скоро', groups.upcoming),
    section('is-someday', 'Без срока', groups.someday)
  );
  if (groups.done.length) {
    const details = h('details', { class: 'section is-done' },
      h('summary', { class: 'section-head' }, h('h2', { text: 'Выполнено' }), h('span', { class: 'section-count', text: groups.done.length }), h('span', { class: 'chev icon' }, icon('chevron-right'))),
      h('ul', { class: 'tasks' }, groups.done.map((t) => renderTask(t)))
    );
    if (state.doneOpen) details.open = true;
    details.addEventListener('toggle', () => { state.doneOpen = details.open; });
    nodes.push(details);
  }
  root.replaceChildren(...nodes.filter(Boolean));
}

/* ---------- Календарь недели ---------- */
function startOfISOWeek(date) {
  const d = new Date(date);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  d.setHours(0, 0, 0, 0);
  return d;
}

function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7));
  const week1 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d - week1) / 86400000 - 3 + ((week1.getUTCDay() + 6) % 7)) / 7);
}

function renderCalendar() {
  const cal = $('#calendar');
  const start = state.calAnchor;
  const end = new Date(start); end.setDate(end.getDate() + 6);
  const sameMonth = start.getMonth() === end.getMonth();
  const monthFmt = new Intl.DateTimeFormat('ru-RU', { month: 'long' });
  const monthShort = new Intl.DateTimeFormat('ru-RU', { month: 'short' });
  const title = sameMonth
    ? `${start.getDate()}–${end.getDate()} ${monthFmt.format(end)} ${end.getFullYear()}`
    : `${start.getDate()} ${monthShort.format(start).replace('.', '')} – ${end.getDate()} ${monthShort.format(end).replace('.', '')} ${end.getFullYear()}`;
  $('#cal-title').replaceChildren(title, h('small', { text: `неделя ${isoWeek(start)}` }));

  const today = todayKey();
  const columns = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(start); date.setDate(start.getDate() + i);
    const key = localKey(date);
    const tasks = state.tasks.filter((t) => taskDayKey(t) === key).sort(byStamp);
    const done = tasks.filter((t) => t.done).length;
    const column = h('div', { class: `cal-day${key === today ? ' is-today' : ''}${key < today ? ' is-past' : ''}` },
      h('div', { class: 'cal-day-head' },
        h('span', { class: 'cal-weekday', text: date.toLocaleDateString('ru-RU', { weekday: 'short' }) }),
        h('span', { class: 'cal-daynum', text: pad(date.getDate()) })
      )
    );
    if (tasks.length) {
      const complete = done === tasks.length;
      column.append(h('div', { class: `day-progress${complete ? ' is-complete' : ''}`, role: 'img', 'aria-label': `Выполнено ${done} из ${tasks.length}` },
        h('div', { class: 'day-progress-bar' }, h('i', { style: `width:${Math.round((done / tasks.length) * 100)}%` })),
        h('span', { class: 'day-progress-text', text: complete ? `Все ${tasks.length} готово` : `${done} из ${tasks.length}` })
      ));
      column.append(h('ul', { class: 'cal-tasks' }, tasks.map((t) => renderTask(t, { compact: true }))));
    }
    columns.push(column);
  }
  cal.replaceChildren(...columns);

  const noTime = state.tasks.filter((t) => !taskDayKey(t)).sort(byStamp);
  const holder = $('#no-time-section');
  holder.replaceChildren(...(noTime.length ? [h('section', { class: 'section' },
    h('div', { class: 'section-head' }, h('h2', { text: 'Без срока' }), h('span', { class: 'section-count', text: noTime.length })),
    h('ul', { class: 'tasks no-time-grid' }, noTime.map((t) => renderTask(t, { compact: true })))
  )] : []));
}

function renderAll() {
  renderHeader();
  renderList();
  renderCalendar();
}

async function refreshTasks() {
  try {
    state.tasks = await fetchJSON('/api/tasks');
    state.tasksError = null;
  } catch (e) {
    state.tasksError = e.message;
  }
  state.tasksLoaded = true;
  renderAll();
}

/* ---------- Создание задачи ---------- */
function initComposer() {
  const form = $('#new-task-form');
  const input = $('#new-task-input');
  const toggle = $('#new-time-toggle');
  const panel = $('#new-time-panel');
  const summary = $('#new-time-summary');
  const slots = $('#new-emoji-slots');
  const selected = [];
  let times = null;
  times = createTimePicker(panel, { onChange: () => { if (times) summary.textContent = times.summary(); } });
  const drawSlots = () => renderEmojiSlots(slots, selected, { onChange: drawSlots });
  drawSlots();
  state.redrawComposerSlots = () => { selected.splice(hasPerk() ? 3 : 1); drawSlots(); };

  toggle.addEventListener('click', () => {
    const open = panel.hidden;
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  });

  input.addEventListener('input', () => input.classList.remove('has-error'));

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const title = input.value.trim();
    if (!title) {
      input.classList.add('has-error');
      input.focus();
      input.addEventListener('animationend', () => input.classList.remove('has-error'), { once: true });
      toast('Введите название задачи', { kind: 'error', duration: 2400 });
      return;
    }
    const problem = times.validate();
    if (problem) { toast(problem, { kind: 'error' }); return; }
    const payload = Object.assign({ title }, times.payload());
    const emojis = selected.slice();
    try {
      const task = await fetchJSON('/api/tasks', { method: 'POST', body: JSON.stringify(payload) });
      for (const e of emojis) {
        try {
          await fetchJSON(`/api/tasks/${task.id}/emojis`, { method: 'POST', body: JSON.stringify({ emoji: { code: e.code, version: e.version } }) });
        } catch (err) {
          toast(EMOJI_ERRORS[err.message] || 'Не удалось добавить эмодзи', { kind: 'error' });
        }
      }
      input.value = '';
      selected.splice(0, selected.length);
      times.reset();
      panel.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      drawSlots();
      toast('Задача добавлена', { kind: 'success', duration: 2000 });
      await refreshTasks();
      input.focus();
    } catch (e) {
      toast(`Не удалось добавить задачу: ${e.message}`, { kind: 'error' });
    }
  });
}

/* ---------- Редактирование задачи ---------- */
let editTimes = null;

function openEditModal(task) {
  const modal = $('#edit-modal');
  const title = $('#edit-title');
  const slots = $('#edit-emoji-slots');
  const del = $('#edit-delete');
  const form = $('#edit-form');
  if (!editTimes) editTimes = createTimePicker($('#edit-time'));
  editTimes.setFromTask(task);
  title.value = task.title || '';
  const initial = (task.emojis || []).map((e) => ({ code: e.code, version: e.version, display_name: e.display_name, icon_ref: e.icon_ref, rarity: e.rarity }));
  const selected = initial.map((e) => Object.assign({}, e));
  const draw = () => renderEmojiSlots(slots, selected, { onChange: draw });
  draw();

  let armTimer = null;
  const disarm = () => { clearTimeout(armTimer); del.classList.remove('is-armed'); del.replaceChildren(icon('trash'), ' Удалить'); };
  disarm();

  const close = () => { disarm(); closePicker(); closeLayer(modal); };
  $('#edit-close').onclick = close;
  $('#edit-cancel').onclick = close;

  del.onclick = async () => {
    if (!del.classList.contains('is-armed')) {
      del.classList.add('is-armed');
      del.replaceChildren(icon('trash'), ' Точно удалить?');
      armTimer = setTimeout(disarm, 3200);
      return;
    }
    try {
      await fetchJSON(`/api/tasks/${task.id}`, { method: 'DELETE' });
      close();
      toast('Задача удалена', { duration: 2200 });
      refreshTasks();
    } catch (e) {
      toast(`Не удалось удалить: ${e.message}`, { kind: 'error' });
    }
  };

  form.onsubmit = async (ev) => {
    ev.preventDefault();
    const name = title.value.trim();
    if (!name) { title.classList.add('has-error'); title.focus(); toast('Название не может быть пустым', { kind: 'error', duration: 2400 }); title.addEventListener('animationend', () => title.classList.remove('has-error'), { once: true }); return; }
    const problem = editTimes.validate();
    if (problem) { toast(problem, { kind: 'error' }); return; }
    const sameEmoji = (a, b) => a.code === b.code && a.version === b.version;
    const removed = initial.filter((a) => !selected.some((b) => sameEmoji(a, b)));
    const added = selected.filter((a) => !initial.some((b) => sameEmoji(a, b)));
    try {
      await fetchJSON(`/api/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify(Object.assign({ title: name }, editTimes.payload(true))) });
    } catch (e) {
      toast(`Не удалось сохранить: ${e.message}`, { kind: 'error' });
      return;
    }
    for (const e of removed) {
      try { await fetchJSON(`/api/tasks/${task.id}/emojis/${encodeURIComponent(`${e.code}:${e.version}`)}`, { method: 'DELETE' }); }
      catch (err) { toast(EMOJI_ERRORS[err.message] || 'Не удалось снять эмодзи', { kind: 'error' }); }
    }
    for (const e of added) {
      try { await fetchJSON(`/api/tasks/${task.id}/emojis`, { method: 'POST', body: JSON.stringify({ emoji: { code: e.code, version: e.version } }) }); }
      catch (err) { toast(EMOJI_ERRORS[err.message] || 'Не удалось добавить эмодзи', { kind: 'error' }); }
    }
    close();
    toast('Изменения сохранены', { kind: 'success', duration: 2000 });
    refreshTasks();
  };

  openLayer(modal, { focus: title, onClose: closePicker });
}

/* ==========================================================================
   Колесо фортуны
   ========================================================================== */
const WHEEL_SIZE = 380;
const normalizeSegment = (seg) => {
  const type = String(seg.type ?? seg.kind ?? seg.prize_type ?? seg.category ?? '').toLowerCase();
  if (type === 'emoji' || type === 'emojis' || seg.emoji || seg.emj) return { type: 'emoji', emoji: normalizeEmoji(seg.emoji ?? seg.emj ?? seg.item ?? seg.value ?? {}) };
  return { type: 'odd_prize', label: seg.label ?? seg.title ?? seg.name ?? seg.text ?? 'Приз' };
};
const normalizePool = (pool) => ({ segments: (pool.segments ?? pool.prizes ?? pool.items ?? []).map(normalizeSegment) });

function normalizeResult(res) {
  const t = String(res.outcome_type ?? res.type ?? res.kind ?? '').toLowerCase();
  const spins = res.spins_remaining ?? res.spinsRemaining ?? getSpins(state.user);
  if (t === 'emoji' || res.emoji || res.emj) {
    return { outcome_type: 'emoji', emoji: normalizeEmoji(res.emoji ?? res.emj ?? res.item ?? {}), duplicate: !!(res.duplicate ?? res.isDuplicate ?? res.dup), spins_remaining: spins };
  }
  return { outcome_type: 'odd_prize', label: res.label ?? res.title ?? res.message ?? 'Приз', spins_remaining: spins };
}

function fallbackPool() {
  const e = (code, rarity, glyph) => ({ type: 'emoji', emoji: normalizeEmoji({ code, version: 'v1', rarity, display_name: code, icon_ref: glyph }) });
  return { segments: [e('star', 'rare', '⭐'), { type: 'odd_prize', label: 'Скидка на задачи' }, e('fire', 'common', '🔥'), { type: 'odd_prize', label: 'Участие в розыгрыше' }, { type: 'odd_prize', label: 'Промо-код на кофе' }, e('check', 'common', '✔️'), { type: 'odd_prize', label: 'Бессмысленный диплом' }, { type: 'odd_prize', label: 'Улыбка от тимлида' }] };
}

function ensureAtLeastOneEmoji(pool) {
  if (!pool.segments.length || pool.segments.some((s) => s.type === 'emoji')) return;
  pool.segments[0] = { type: 'emoji', emoji: normalizeEmoji({ code: 'fire', version: 'v1', rarity: 'common', display_name: 'Fire', icon_ref: '🔥' }) };
}

async function loadPool({ force = false } = {}) {
  if (state.pool && !force) return state.pool;
  try {
    state.pool = normalizePool(await fetchJSON('/api/spin/pool'));
  } catch {
    state.pool = state.pool || fallbackPool();
  }
  ensureAtLeastOneEmoji(state.pool);
  return state.pool;
}

function buildRimLights() {
  const rim = $('#wheel-rim');
  if (rim.children.length) return;
  const total = 20;
  const radius = 50; // в процентах от размера обода
  for (let i = 0; i < total; i++) {
    const a = (i / total) * Math.PI * 2;
    const bulb = h('i', { class: 'wheel-bulb' });
    bulb.style.left = `${50 + Math.sin(a) * 47.2}%`;
    bulb.style.top = `${50 - Math.cos(a) * 47.2}%`;
    rim.append(bulb);
  }
}

function segmentColor(seg, index) {
  if (seg.type === 'emoji') {
    const r = rarityOf(seg.emoji);
    return r === 'very_rare' ? '#ffc233' : r === 'rare' ? '#8f74ff' : '#3cc4a8';
  }
  return index % 2 ? '#ffe2b0' : '#fff3d9';
}

function renderWheel(pool) {
  const wheel = $('#wheel');
  buildRimLights();
  const segs = pool.segments;
  const count = Math.max(8, segs.length);
  const per = 360 / count;
  state.wheel.count = count;
  state.wheel.per = per;
  state.wheel.rotation = 0;
  wheel.style.transition = 'none';
  wheel.style.transform = 'rotate(0deg)';
  const stops = segs.map((s, i) => `${segmentColor(s, i)} ${i * per}deg ${(i + 1) * per}deg`).join(', ');
  wheel.style.background = `repeating-conic-gradient(from -0.7deg, rgba(23,10,51,0.55) 0deg 1.4deg, transparent 1.4deg ${per}deg), conic-gradient(${stops})`;
  const C = WHEEL_SIZE / 2;
  const labels = segs.map((seg, i) => {
    const angle = i * per + per / 2;
    const rad = (angle * Math.PI) / 180;
    const isEmoji = seg.type === 'emoji';
    const r = C * (isEmoji ? 0.74 : 0.6);
    const label = h('div', { class: `wheel-label ${isEmoji ? 'is-emoji' : 'is-text'}` });
    label.style.left = `${C + r * Math.sin(rad)}px`;
    label.style.top = `${C - r * Math.cos(rad)}px`;
    const rotation = isEmoji ? angle : angle - 90 + (angle > 180 ? 180 : 0);
    label.style.transform = `translate(-50%, -50%) rotate(${rotation}deg)`;
    if (isEmoji) {
      const ref = seg.emoji?.icon_ref;
      if (isImageRef(ref) && !isGlyph(ref)) {
        const img = h('img', { class: 'wheel-emoji-img', src: ref, alt: seg.emoji.display_name || 'эмодзи' });
        img.onerror = () => label.replaceChildren(glyphOf(seg.emoji));
        label.append(img);
      } else {
        label.textContent = glyphOf(seg.emoji);
      }
    } else {
      label.textContent = seg.label;
    }
    return label;
  });
  wheel.replaceChildren(...labels);
  wheel.setAttribute('aria-label', `Колесо с призами: ${segs.map((s) => (s.type === 'emoji' ? s.emoji.display_name || 'эмодзи' : s.label)).join(', ')}`);
  void wheel.offsetWidth;
  wheel.style.transition = '';
}

function updateWheelCaption() {
  const spins = getSpins(state.user);
  $('#wheel-caption').textContent = spins > 0 ? `Осталось круток: ${spins} из ${MAX_SPINS}` : 'Крутки на сегодня закончились';
  $('#wheel-spin').disabled = state.wheel.spinning || spins <= 0;
}

function showWheelStage() {
  $('#wheel-result').hidden = true;
  $('#wheel-stage').hidden = false;
  $('#wheel-title').textContent = 'Колесо фортуны';
  updateWheelCaption();
  $('#wheel-spin').focus();
}

async function openWheel() {
  if (getSpins(state.user) <= 0) { openSpinsBanner(); return; }
  await loadPool();
  renderWheel(state.pool);
  $('#wheel-close').onclick = () => closeLayer($('#wheel-overlay'));
  $('#wheel-spin').onclick = doSpin;
  $('#wheel-result').hidden = true;
  $('#wheel-stage').hidden = false;
  updateWheelCaption();
  openLayer($('#wheel-overlay'), { focus: '#wheel-spin', closable: () => !state.wheel.spinning });
}

function findSegmentIndexForResult(result) {
  const segs = state.pool?.segments || [];
  if (result.outcome_type === 'emoji' && result.emoji) {
    const { code, version } = result.emoji;
    let idx = segs.findIndex((s) => s.type === 'emoji' && s.emoji.code === code && s.emoji.version === version);
    if (idx < 0) idx = segs.findIndex((s) => s.type === 'emoji' && glyphOf(s.emoji) === glyphOf(result.emoji));
    return idx;
  }
  if (result.outcome_type === 'odd_prize') return segs.findIndex((s) => s.type === 'odd_prize' && s.label === result.label);
  return -1;
}

function ensureResultInWheel(result) {
  const segs = state.pool.segments;
  const seg = result.outcome_type === 'emoji' ? { type: 'emoji', emoji: normalizeEmoji(result.emoji) } : { type: 'odd_prize', label: result.label };
  const slot = segs.findIndex((s) => s.type === 'odd_prize');
  segs[slot >= 0 ? slot : 0] = seg;
}

function animateWheelToIndex(index, done) {
  const wheel = $('#wheel');
  const wrap = $('#wheel-wrap');
  const { per } = state.wheel;
  const jitter = (Math.random() - 0.5) * per * 0.6;
  const target = index >= 0 ? index * per + per / 2 + jitter : Math.random() * 360;
  const turns = 4 + Math.floor(Math.random() * 3);
  const delta = -target - (state.wheel.rotation % 360);
  state.wheel.rotation += turns * 360 + delta;
  const duration = reducedMotion() ? 500 : 4200;
  wheel.style.transition = `transform ${duration / 1000}s cubic-bezier(0.1, 0.65, 0.15, 1)`;
  wheel.style.transform = `rotate(${state.wheel.rotation}deg)`;
  wrap.classList.add('is-spinning');
  const pointer = $('.wheel-pointer');
  const ticker = reducedMotion() ? null : setInterval(() => {
    pointer.classList.add('tick');
    setTimeout(() => pointer.classList.remove('tick'), 70);
  }, 140);
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    clearInterval(ticker);
    pointer.classList.remove('tick');
    wrap.classList.remove('is-spinning');
    wheel.style.transition = '';
    done();
  };
  wheel.addEventListener('transitionend', finish, { once: true });
  setTimeout(finish, duration + 300);
}

async function doSpin() {
  if (state.wheel.spinning) return;
  state.wheel.spinning = true;
  $('#wheel-spin').disabled = true;
  $('#wheel-close').disabled = true;
  let result;
  let index = -1;
  try {
    result = normalizeResult(await fetchJSON('/api/spin', { method: 'POST' }));
    index = findSegmentIndexForResult(result);
    if (index < 0) {
      ensureResultInWheel(result);
      renderWheel(state.pool);
      index = findSegmentIndexForResult(result);
    }
  } catch (e) {
    const msg = String(e?.message || '').toLowerCase();
    state.wheel.spinning = false;
    $('#wheel-close').disabled = false;
    if (msg.includes('no_spins_left') || msg.includes('limit_banner')) {
      setSpins(state.user, 0);
      renderHeader();
      openSpinsBanner();
      return;
    }
    if (msg.includes('pool_invalid')) {
      await loadPool({ force: true });
      renderWheel(state.pool);
      updateWheelCaption();
      toast('Колесо обновилось — попробуйте ещё раз', { kind: 'game' });
      return;
    }
    if (/failed to fetch|networkerror|load failed/.test(msg)) {
      toast('Нет связи с сервером. Попробуйте позже.', { kind: 'error' });
      updateWheelCaption();
      return;
    }
    toast(`Ошибка спина: ${e.message}`, { kind: 'error' });
    updateWheelCaption();
    return;
  }
  animateWheelToIndex(index, async () => {
    state.wheel.spinning = false;
    $('#wheel-close').disabled = false;
    applySpinResult(result);
    showSpinResult(result);
    loadPool({ force: true }).then(() => renderWheel(state.pool));
    loadUserProfile();
  });
}

function applySpinResult(result) {
  if (!state.user) return;
  setSpins(state.user, result.spins_remaining ?? Math.max(0, getSpins(state.user) - 1));
  if (result.outcome_type === 'emoji' && result.emoji && !result.duplicate && !userHasEmoji(result.emoji.code, result.emoji.version)) {
    const list = ownedEmojis();
    list.push(Object.assign({}, result.emoji));
    if (!state.user.emojis) state.user.emojis = list;
  }
  if (result.outcome_type === 'odd_prize' && /^multi-emoji/i.test(result.label || '')) state.user.has_multi_emoji = true;
  renderHeader();
  if (state.redrawComposerSlots) state.redrawComposerSlots();
}

function showSpinResult(result) {
  const box = $('#wheel-result');
  const spins = getSpins(state.user);
  let eyebrow; let glyph; let name; let text; let rarity = null; let isNew = false; let accent = null;
  if (result.outcome_type === 'emoji') {
    rarity = rarityOf(result.emoji);
    name = result.emoji.display_name || result.emoji.code;
    glyph = h('div', { class: 'result-glyph', text: glyphOf(result.emoji) });
    accent = `var(--rarity-${rarity})`;
    if (result.duplicate) {
      eyebrow = 'Уже в коллекции';
      text = 'Этот эмодзи у вас уже есть — повтор не считается. Но колесо щедрое, попробуйте ещё.';
    } else {
      eyebrow = 'Новое эмодзи!';
      text = 'Теперь его можно ставить на задачи — откройте любую задачу и выберите эмодзи.';
      isNew = true;
    }
  } else if (/^multi-emoji/i.test(result.label || '')) {
    eyebrow = 'Перк открыт!';
    name = 'Мульти-эмодзи';
    text = 'Теперь на одной задаче может быть до трёх эмодзи.';
    glyph = h('div', { class: 'result-glyph' }, icon('sparkle'));
    accent = 'var(--gold)';
    isNew = true;
  } else {
    eyebrow = 'Шуточный приз';
    name = result.label;
    text = 'Весело, но без последствий. Эмодзи ждут в следующих попытках.';
    glyph = h('div', { class: 'result-glyph' }, icon('gift'));
  }
  if (accent) glyph.style.setProperty('--rarity', accent);
  const actions = h('div', { class: 'result-actions' },
    spins > 0
      ? h('button', { type: 'button', class: 'btn btn-gold', text: `Крутить ещё · ${spins}`, onclick: showWheelStage })
      : h('button', { type: 'button', class: 'btn btn-gold', text: 'Дальше', onclick: () => openSpinsBanner() }),
    h('button', { type: 'button', class: 'btn', text: 'К задачам', onclick: () => closeLayer($('#wheel-overlay')) })
  );
  box.replaceChildren(...[
    h('span', { class: 'result-eyebrow', text: eyebrow }),
    glyph,
    h('h3', { text: name }),
    rarity ? h('span', { class: 'rarity-chip', 'data-rarity': rarity, style: `--rarity:var(--rarity-${rarity})`, text: RARITY_LABELS[rarity] || rarity }) : null,
    h('p', { text }),
    spins <= 0 ? h('p', { class: 'result-note', text: 'Это была последняя крутка на сегодня.' }) : null,
    actions
  ].filter(Boolean));
  $('#wheel-stage').hidden = true;
  box.hidden = false;
  $('#wheel-title').textContent = 'Результат';
  const primary = $('.btn-gold', box);
  if (primary) primary.focus();
  if (isNew) confetti(glyph, { count: rarity === 'very_rare' ? 60 : 36, spread: 200, colors: ['#ffc233', '#ff7a3d', '#7c5cff', '#2fb59a', '#ffffff'] });
}

function openSpinsBanner() {
  const wheelOverlay = $('#wheel-overlay');
  if (!wheelOverlay.hidden) closeLayer(wheelOverlay);
  const banner = $('#spins-banner');
  tickTimers();
  $('#spins-banner-close').onclick = () => closeLayer(banner);
  openLayer(banner, { focus: '#spins-banner-close' });
}

/* ---------- Коллекция ---------- */
function openCollection() {
  const modal = $('#collection-modal');
  const body = $('#collection-body');
  const total = state.catalog.length;
  const owned = state.catalog.filter((c) => userHasEmoji(c.code, c.version)).length;
  const perk = hasPerk();
  const groups = RARITY_ORDER.map((rarity) => {
    const items = state.catalog.filter((c) => c.rarity === rarity);
    if (!items.length) return null;
    return h('section', { class: 'collection-group', style: `--rarity:var(--rarity-${rarity})` },
      h('h3', {}, h('i', { class: 'dot' }), `${RARITY_GROUP_LABELS[rarity]} · ${items.filter((c) => userHasEmoji(c.code, c.version)).length}/${items.length}`),
      h('div', { class: 'collection-grid' }, items.map((item) => {
        const has = userHasEmoji(item.code, item.version);
        return h('div', { class: `collection-item${has ? '' : ' is-locked'}`, title: has ? item.display_name : 'Выпадает на колесе фортуны' },
          h('span', { class: 'glyph', 'aria-hidden': 'true', text: glyphOf(item) }),
          h('span', { text: has ? item.display_name || item.code : 'Закрыто' }),
          h('span', { class: 'sr-only', text: has ? 'Открыто' : 'Закрыто' })
        );
      }))
    );
  });
  body.replaceChildren(
    h('div', { class: 'collection-summary' },
      h('div', { class: 'count' }, String(owned), h('small', { text: ` / ${total}` })),
      h('div', { class: 'meter', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': String(owned), 'aria-label': 'Собрано эмодзи' }, h('i', { style: `width:${total ? Math.round((owned / total) * 100) : 0}%` }))
    ),
    h('div', { class: `perk-row${perk ? ' is-on' : ''}` },
      h('span', { class: 'perk-icon' }, icon(perk ? 'sparkle' : 'lock')),
      h('div', {}, h('strong', { text: perk ? 'Мульти-эмодзи открыт' : 'Перк «Мульти-эмодзи» закрыт' }), h('small', { text: perk ? 'До трёх эмодзи на одной задаче.' : 'Выпадает на колесе. Даёт до трёх эмодзи на задачу.' }))
    ),
    ...groups.filter(Boolean)
  );
  $('#collection-close').onclick = () => closeLayer(modal);
  openLayer(modal, { focus: '#collection-close' });
}

/* ---------- Вкладки и запуск ---------- */
function setView(view) {
  state.view = view;
  const isList = view === 'list';
  $('#list-view').hidden = !isList;
  $('#calendar-view').hidden = isList;
  $('#tab-list').setAttribute('aria-selected', String(isList));
  $('#tab-calendar').setAttribute('aria-selected', String(!isList));
}

document.addEventListener('DOMContentLoaded', async () => {
  let authName = null;
  try { authName = localStorage.getItem('auth_name'); } catch {}
  if (!authName) { window.location.href = '/static/login.html'; return; }

  state.calAnchor = startOfISOWeek(new Date());
  hydrateIcons();
  initComposer();
  renderAll();

  $('#tab-list').addEventListener('click', () => setView('list'));
  $('#tab-calendar').addEventListener('click', () => setView('calendar'));
  $('#cal-prev').addEventListener('click', () => { state.calAnchor.setDate(state.calAnchor.getDate() - 7); renderCalendar(); });
  $('#cal-next').addEventListener('click', () => { state.calAnchor.setDate(state.calAnchor.getDate() + 7); renderCalendar(); });
  $('#cal-today').addEventListener('click', () => { state.calAnchor = startOfISOWeek(new Date()); renderCalendar(); });
  $('#play-button').addEventListener('click', openWheel);
  $('#open-collection').addEventListener('click', openCollection);
  $('#logout').addEventListener('click', () => {
    try { localStorage.removeItem('auth_name'); } catch {}
    window.location.href = '/static/login.html';
  });

  const ok = await loadUserProfile();
  if (!ok) return;
  await Promise.all([loadEmojiCatalog(), refreshTasks()]);
  tickTimers();
  setInterval(tickTimers, 1000);
});
