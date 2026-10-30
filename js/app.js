// Zufall: aus eigenen Listen ziehen, Zufallszahlen, Würfel und Münze.
// Zufall über crypto.getRandomValues; Listen und Einstellungen im localStorage des Geräts.

const KEY = 'zufall';
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const DEFAULT = {
  mode: 'liste',
  lists: [{ id: 'beispiel', name: 'Was essen?', items: ['Pizza', 'Sushi', 'Döner', 'Burger', 'Thai', 'Selbst kochen'], drawn: [] }],
  activeList: 'beispiel',
  noRepeat: false,
  num: { from: 1, to: 100, count: 1, unique: true },
  dice: { count: 2 },
};

let state = load();
const history = { liste: [], zahl: [], wuerfel: [], muenze: [] };
let rolling = false;
let editing = null; // Liste, die gerade bearbeitet wird (oder {} für neu)

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && Array.isArray(s.lists)) return { ...structuredClone(DEFAULT), ...s, num: { ...DEFAULT.num, ...s.num }, dice: { ...DEFAULT.dice, ...s.dice } };
  } catch {}
  return structuredClone(DEFAULT);
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
}

// Gleichverteilte Zufallszahl 0 … n−1 ohne Modulo-Verzerrung
function randInt(n) {
  const limit = Math.floor(0x100000000 / n) * n;
  const a = new Uint32Array(1);
  do crypto.getRandomValues(a); while (a[0] >= limit);
  return a[0] % n;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function parseInt10(v) {
  const t = String(v).trim().replace(/\s/g, '');
  if (t === '') return null;
  const n = Number(t.replace(/\.(?=\d{3}\b)/g, ''));
  return Number.isInteger(n) ? n : null;
}

const nf = new Intl.NumberFormat('de-DE');

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), 2200);
}

function activeList() {
  return state.lists.find((l) => l.id === state.activeList) || state.lists[0] || null;
}

// ---------- Ziehen ----------

function drawList() {
  const list = activeList();
  if (!list || !list.items.length) return null;
  let note = '';
  if (state.noRepeat) {
    let open = list.items.map((_, i) => i).filter((i) => !list.drawn.includes(i));
    if (!open.length) {
      list.drawn = [];
      open = list.items.map((_, i) => i);
      note = 'Alle gezogen – neue Runde';
    }
    const idx = open[randInt(open.length)];
    list.drawn.push(idx);
    save();
    const left = list.items.length - list.drawn.length;
    return { text: list.items[idx], sub: note || (left ? `noch ${left} von ${list.items.length} übrig` : 'Das war der letzte – danach beginnt eine neue Runde') };
  }
  return { text: list.items[randInt(list.items.length)], sub: '' };
}

function drawNumbers() {
  const { from, to, count, unique } = state.num;
  const size = to - from + 1;
  const out = [];
  if (unique) {
    const seen = new Set();
    while (out.length < count) {
      const v = from + randInt(size);
      if (!seen.has(v)) { seen.add(v); out.push(v); }
    }
  } else {
    for (let i = 0; i < count; i++) out.push(from + randInt(size));
  }
  return { text: out.map((v) => nf.format(v)).join(' · '), sub: count > 1 ? `${count} Zahlen von ${nf.format(from)} bis ${nf.format(to)}` : `von ${nf.format(from)} bis ${nf.format(to)}`, values: out };
}

function drawDice() {
  const vals = Array.from({ length: state.dice.count }, () => 1 + randInt(6));
  return { dice: vals, text: vals.join(' + '), sub: vals.length > 1 ? `Summe ${vals.reduce((a, b) => a + b, 0)}` : '' };
}

function drawCoin() {
  return { text: randInt(2) ? 'Kopf' : 'Zahl', sub: '' };
}

const DRAW = { liste: drawList, zahl: drawNumbers, wuerfel: drawDice, muenze: drawCoin };

// ---------- Darstellung ----------

const PIPS = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };

function diceHtml(vals) {
  return `<div class="dice-row">${vals
    .map((v) => `<span class="die" role="img" aria-label="${v}">${Array.from({ length: 9 }, (_, i) => `<i class="${PIPS[v].includes(i + 1) ? 'pip' : ''}"></i>`).join('')}</span>`)
    .join('')}</div>`;
}

function resultHtml(r) {
  if (!r) return '<p class="result-empty">Tippe unten auf den Knopf.</p>';
  const main = r.dice ? diceHtml(r.dice) : `<p class="result-text ${r.text.length > 18 ? 'long' : ''}">${esc(r.text)}</p>`;
  return `${main}${r.sub ? `<p class="result-sub">${esc(r.sub)}</p>` : ''}`;
}

function controlsHtml() {
  const m = state.mode;
  if (m === 'liste') {
    const list = activeList();
    return `
      <div class="chips scroll" role="radiogroup" aria-label="Liste wählen">
        ${state.lists.map((l) => `<button class="chip" role="radio" aria-checked="${l.id === list?.id}" data-list="${l.id}">${esc(l.name)}</button>`).join('')}
        <button class="chip ghost" id="newlist">＋ Neue Liste</button>
      </div>
      ${list ? `<p class="muted small">${list.items.length} ${list.items.length === 1 ? 'Eintrag' : 'Einträge'} · <button class="link small" id="editlist">Liste bearbeiten</button></p>` : ''}
      <label class="switch-row"><span>Ohne Wiederholung<br><span class="muted small">jeder Eintrag erst wieder, wenn alle dran waren</span></span>
        <input type="checkbox" role="switch" id="norepeat" ${state.noRepeat ? 'checked' : ''}></label>`;
  }
  if (m === 'zahl') {
    const n = state.num;
    return `
      <div class="grid3">
        <label class="field"><span class="label">Von</span><input id="from" inputmode="numeric" value="${n.from}"></label>
        <label class="field"><span class="label">Bis</span><input id="to" inputmode="numeric" value="${n.to}"></label>
        <label class="field"><span class="label">Anzahl</span><input id="count" inputmode="numeric" value="${n.count}"></label>
      </div>
      <label class="switch-row"><span>Keine doppelten Zahlen</span><input type="checkbox" role="switch" id="unique" ${n.unique ? 'checked' : ''}></label>
      <p class="error" id="err" hidden></p>`;
  }
  if (m === 'wuerfel') {
    return `<div class="field"><span class="label">Anzahl Würfel</span>
      <div class="chips" role="radiogroup">${[1, 2, 3, 4, 5, 6].map((c) => `<button class="chip" role="radio" aria-checked="${c === state.dice.count}" data-dice="${c}">${c}</button>`).join('')}</div></div>`;
  }
  return '';
}

const TITLES = { liste: 'Liste', zahl: 'Zufallszahl', wuerfel: 'Würfel', muenze: 'Münze' };
const BUTTON = { liste: 'Ziehen', zahl: 'Zahl ziehen', wuerfel: 'Würfeln', muenze: 'Werfen' };

function render() {
  $$('.tabbar [data-mode]').forEach((b) => b.setAttribute('aria-current', b.dataset.mode === state.mode ? 'page' : 'false'));
  if (editing) return renderEditor();
  const m = state.mode;
  const last = history[m][0] || null;
  const list = activeList();
  const disabled = m === 'liste' && (!list || !list.items.length);
  $('#view').innerHTML = `
    <header class="topbar"><h1>${TITLES[m]}</h1></header>
    <section class="result ${m === 'muenze' ? 'coin-result' : ''}" id="result" aria-live="polite">${m === 'muenze' && last ? `<div class="coin">${esc(last.text)}</div>` : resultHtml(last)}</section>
    ${history[m].length > 1 ? `<p class="history muted small">Vorher: ${history[m].slice(1, 6).map((h) => esc(h.dice ? h.dice.join('+') : h.text)).join(' · ')}</p>` : ''}
    <section class="controls">${controlsHtml()}</section>
    <button class="btn primary go" id="go" ${disabled ? 'disabled' : ''}>${disabled ? 'Liste ist leer' : BUTTON[m]}</button>`;
  bind();
}

function renderEditor() {
  const l = editing;
  $('#view').innerHTML = `
    <header class="topbar"><button class="link" id="cancel">Abbrechen</button><h1>${l.id ? 'Liste bearbeiten' : 'Neue Liste'}</h1><span class="spacer"></span></header>
    <form id="ef" class="editor" novalidate>
      <label class="field"><span class="label">Name</span><input name="name" value="${esc(l.name || '')}" placeholder="z. B. Restaurants" required></label>
      <label class="field"><span class="label">Einträge – einer pro Zeile</span>
        <textarea name="items" rows="10" placeholder="Pizza&#10;Sushi&#10;Döner">${esc((l.items || []).join('\n'))}</textarea></label>
      <p class="error" id="err" hidden></p>
      <button class="btn primary block">Speichern</button>
      ${l.id ? '<button type="button" class="btn danger block" id="del">Liste löschen</button>' : ''}
    </form>`;
  $('#cancel').onclick = () => { editing = null; render(); };
  $('#ef').onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const name = String(fd.get('name') || '').trim();
    // Zeilen, aber auch Kommas trennen Einträge; leere und doppelte entfernen
    const raw = String(fd.get('items') || '').split(/\n|,|;/).map((s) => s.trim()).filter(Boolean);
    const items = [...new Set(raw)];
    const err = $('#err');
    if (!name) { err.textContent = 'Bitte der Liste einen Namen geben.'; err.hidden = false; return; }
    if (items.length < 2) { err.textContent = 'Bitte mindestens zwei Einträge eingeben.'; err.hidden = false; return; }
    if (l.id) {
      const changed = l.items.join('\n') !== items.join('\n');
      Object.assign(l, { name, items, drawn: changed ? [] : l.drawn });
    } else {
      const nl = { id: Date.now().toString(36), name, items, drawn: [] };
      state.lists.push(nl);
      state.activeList = nl.id;
    }
    save();
    history.liste = [];
    editing = null;
    render();
    toast('Liste gespeichert');
  };
  const del = $('#del');
  if (del) del.onclick = () => {
    if (!confirm(`Liste „${l.name}“ löschen?`)) return;
    state.lists = state.lists.filter((x) => x.id !== l.id);
    state.activeList = state.lists[0]?.id || null;
    save();
    history.liste = [];
    editing = null;
    render();
    toast('Liste gelöscht');
  };
}

function validNumbers() {
  const from = parseInt10($('#from').value);
  const to = parseInt10($('#to').value);
  const count = parseInt10($('#count').value);
  const unique = $('#unique').checked;
  const err = $('#err');
  const fail = (msg) => { err.textContent = msg; err.hidden = false; return false; };
  if (from === null || to === null) return fail('Bitte ganze Zahlen für „Von“ und „Bis“ eingeben.');
  if (count === null || count < 1 || count > 100) return fail('Anzahl bitte zwischen 1 und 100.');
  const lo = Math.min(from, to), hi = Math.max(from, to);
  if (hi - lo > 1e12) return fail('Der Bereich ist zu groß.');
  if (unique && count > hi - lo + 1) return fail(`Ohne Doppelte gibt es nur ${nf.format(hi - lo + 1)} mögliche Zahlen.`);
  err.hidden = true;
  state.num = { from: lo, to: hi, count, unique };
  save();
  return true;
}

function go() {
  if (rolling) return;
  const m = state.mode;
  if (m === 'zahl' && !validNumbers()) return;
  const r = DRAW[m]();
  if (!r) return;
  rolling = true;
  const box = $('#result');
  const finish = () => {
    history[m].unshift(r);
    history[m].length = Math.min(history[m].length, 10);
    rolling = false;
    navigator.vibrate?.(30);
    render();
    $('#result').classList.add('pop');
  };
  if (reduceMotion) return finish();
  // Kurzes Durchmischen, damit das Ergebnis sichtbar „fällt“
  let ticks = 0;
  const list = activeList();
  const iv = setInterval(() => {
    ticks++;
    if (m === 'liste') box.innerHTML = resultHtml({ text: list.items[randInt(list.items.length)], sub: '' });
    else if (m === 'zahl') box.innerHTML = resultHtml({ text: drawNumbers().text, sub: '' });
    else if (m === 'wuerfel') box.innerHTML = resultHtml({ dice: Array.from({ length: state.dice.count }, () => 1 + randInt(6)) });
    else box.innerHTML = `<div class="coin flip">${ticks % 2 ? 'Kopf' : 'Zahl'}</div>`;
    if (ticks >= 9) { clearInterval(iv); finish(); }
  }, 55);
}

function bind() {
  $('#go').onclick = go;
  $$('[data-list]').forEach((b) => (b.onclick = () => { state.activeList = b.dataset.list; save(); history.liste = []; render(); }));
  const nl = $('#newlist');
  if (nl) nl.onclick = () => { editing = {}; render(); };
  const el = $('#editlist');
  if (el) el.onclick = () => { editing = activeList(); render(); };
  const nr = $('#norepeat');
  if (nr) nr.onchange = () => {
    state.noRepeat = nr.checked;
    const l = activeList();
    if (l) l.drawn = [];
    save();
    toast(nr.checked ? 'Ohne Wiederholung: neue Runde gestartet' : 'Wiederholungen erlaubt');
  };
  $$('[data-dice]').forEach((b) => (b.onclick = () => { state.dice.count = Number(b.dataset.dice); save(); render(); }));
  const un = $('#unique');
  if (un) un.onchange = () => { state.num.unique = un.checked; save(); };
  ['#from', '#to', '#count'].forEach((id) => {
    const inp = $(id);
    if (inp) inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); go(); } });
  });
}

$$('.tabbar [data-mode]').forEach((b) => (b.onclick = () => {
  if (rolling) return;
  editing = null;
  state.mode = b.dataset.mode;
  save();
  render();
}));

render();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
