// Google Agenda: o Hub mantém uma agenda própria chamada "Hub" na conta do
// usuário com eventos, folgas e aniversários, para aparecerem no celular com as
// notificações do Google. Só um sentido (Hub → Google): o Hub é a fonte.
//
// Cada evento leva extendedProperties.private { hub: '1', hubKey, hubHash }.
// A sincronização compara o que deveria existir com o que existe: cria,
// atualiza (hash mudou) e apaga. Dois PCs sincronizando chegam ao mesmo
// resultado, sem duplicar. Permissão: calendar.app.created (só a agenda do Hub).

import * as store from '../store.js';
import { api } from './drive.js';
import { eventsOn } from '../recur.js';
import { dateKey, addDays, parseKey, debounce } from '../dom.js';
import * as work from '../modules/work.js';

const API = 'https://www.googleapis.com/calendar/v3';
const OFF_DAYS_AHEAD = 180;
const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export const status = { state: 'off', message: '', lastSync: 0, count: 0 };
const listeners = new Set();
export const onStatus = fn => { listeners.add(fn); return () => listeners.delete(fn); };
const setStatus = patch => { Object.assign(status, patch); listeners.forEach(fn => fn(status)); };

const enabled = () => !!store.get('settings').gcal?.enabled;

// ---------- O que deveria estar na agenda ----------

const compact = k => k.replace(/-/g, '');
const RRULE = { daily: 'FREQ=DAILY', weekdays: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', weekly: 'FREQ=WEEKLY', monthly: 'FREQ=MONTHLY', yearly: 'FREQ=YEARLY' };

function eventBody(ev) {
  const body = { summary: ev.title, description: ev.notes || undefined };
  if (ev.allDay || !ev.start) {
    body.start = { date: ev.date };
    body.end = { date: addDays(ev.date, 1) };
  } else {
    body.start = { dateTime: `${ev.date}T${ev.start}:00`, timeZone: tz() };
    body.end = { dateTime: `${ev.date}T${ev.end > ev.start ? ev.end : ev.start}:00`, timeZone: tz() };
  }
  if (ev.repeat && ev.repeat !== 'none' && RRULE[ev.repeat]) {
    body.recurrence = [`RRULE:${RRULE[ev.repeat]}${ev.until ? `;UNTIL=${compact(ev.until)}` : ''}`];
    for (const skip of ev.skip ?? []) {
      body.recurrence.push(ev.allDay || !ev.start ? `EXDATE;VALUE=DATE:${compact(skip)}` : `EXDATE;TZID=${tz()}:${compact(skip)}T${ev.start.replace(':', '')}00`);
    }
  }
  body.reminders = { useDefault: false, overrides: ev.reminder != null ? [{ method: 'popup', minutes: ev.reminder }] : [] };
  return body;
}

/** Folgas dos próximos meses, juntando dias seguidos num evento só. */
function offRanges() {
  const out = [];
  const today = dateKey();
  let run = null;
  for (let i = 0; i <= OFF_DAYS_AHEAD; i++) {
    const k = addDays(today, i);
    if (work.isOff(k)) { if (run && addDays(run.end, 1) === k) run.end = k; else { run = { start: k, end: k }; out.push(run); } }
  }
  return out;
}

function birthdayBody(b) {
  const pad = n => String(n).padStart(2, '0');
  const y = +dateKey().slice(0, 4);
  // começa no ano de nascimento (se conhecido) para o Google mostrar todos os anos
  const first = `${b.year ?? y}-${pad(b.month)}-${pad(b.day)}`;
  return {
    summary: `🎂 ${b.name}`, description: b.year ? `Nasceu em ${b.year}.` : undefined,
    start: { date: first }, end: { date: addDays(first, 1) },
    recurrence: ['RRULE:FREQ=YEARLY'], transparency: 'transparent',
    reminders: { useDefault: false, overrides: [] }
  };
}

function desired() {
  const out = new Map();
  for (const ev of store.get('events')) out.set(`ev:${ev.id}`, eventBody(ev));
  for (const r of offRanges()) {
    out.set(`off:${r.start}`, {
      summary: '🌴 Folga', start: { date: r.start }, end: { date: addDays(r.end, 1) },
      transparency: 'transparent', reminders: { useDefault: false, overrides: [] }
    });
  }
  for (const b of store.get('birthdays')) out.set(`bday:${b.id}`, birthdayBody(b));
  return out;
}

const hash = obj => {
  const s = JSON.stringify(obj);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};

// ---------- Sincronização ----------

async function calendarId() {
  const s = store.get('settings');
  if (s.gcal?.calendarId) return s.gcal.calendarId;
  const res = await (await api(`${API}/calendars`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ summary: 'Hub', description: 'Eventos, folgas e aniversários do Hub. Atualizada automaticamente: edite pelo Hub.', timeZone: tz() })
  })).json();
  s.gcal = { ...s.gcal, calendarId: res.id };
  store.commit('settings');
  return res.id;
}

async function existing(cal) {
  const out = new Map();
  let pageToken;
  do {
    const q = new URLSearchParams({ privateExtendedProperty: 'hub=1', maxResults: '2500', showDeleted: 'false', ...(pageToken ? { pageToken } : {}) });
    const res = await (await api(`${API}/calendars/${encodeURIComponent(cal)}/events?${q}`)).json();
    for (const e of res.items ?? []) out.set(e.extendedProperties?.private?.hubKey, e);
    pageToken = res.nextPageToken;
  } while (pageToken);
  return out;
}

let running = null;
export function sync() {
  running ??= run().finally(() => { running = null; });
  return running;
}

async function run(retried = false) {
  if (!enabled()) { setStatus({ state: 'off', message: '' }); return; }
  setStatus({ state: 'syncing', message: '' });
  try {
    const cal = await calendarId();
    const want = desired();
    const have = await existing(cal);
    const base = `${API}/calendars/${encodeURIComponent(cal)}/events`;
    const json = { 'Content-Type': 'application/json' };
    for (const [key, body] of want) {
      const h = hash(body);
      const full = { ...body, extendedProperties: { private: { hub: '1', hubKey: key, hubHash: h } } };
      const cur = have.get(key);
      if (!cur) await api(base, { method: 'POST', headers: json, body: JSON.stringify(full) });
      else if (cur.extendedProperties?.private?.hubHash !== h) await api(`${base}/${cur.id}`, { method: 'PUT', headers: json, body: JSON.stringify(full) });
    }
    for (const [key, cur] of have) if (!want.has(key)) await api(`${base}/${cur.id}`, { method: 'DELETE' });
    setStatus({ state: 'ok', message: '', lastSync: Date.now(), count: want.size });
  } catch (err) {
    const msg = String(err?.message || err);
    // agenda apagada pelo usuário no Google: cria de novo
    if (!retried && /\b404\b/.test(msg)) {
      store.get('settings').gcal = { ...store.get('settings').gcal, calendarId: null };
      store.commit('settings');
      return run(true);
    }
    setStatus({ state: 'error', message: /\b403\b/.test(msg)
      ? 'Sem permissão para o Google Agenda: ative a Google Calendar API no projeto do Google Cloud e clique em Conectar de novo.'
      : msg });
  }
}

// mudanças nos dados viram uma sincronização alguns segundos depois
const soon = debounce(() => { if (enabled()) sync(); }, 15000);
export function start() {
  for (const c of ['events', 'workdays', 'birthdays']) store.on(c, (_, origin) => { if (origin === 'self') soon(); });
  setTimeout(() => { if (enabled()) sync(); }, 12000);
}
