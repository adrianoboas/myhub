// Timer de foco. O estado fica no storage local (só deste computador) com o
// horário de término, então todas as abas abertas mostram o mesmo relógio.
// Na extensão, um alarme no service worker notifica mesmo sem abas abertas.

import * as store from '../store.js';
import { h, icon, clear, fill, isExtension } from '../dom.js';

const BASE_TITLE = document.title; // 'Nova guia' na extensão, 'Hub' na versão web

let el, state, ticker;
const listeners = new Set();

/** Estado atual, para a Mesa: { mode, running, endAt, left, full } */
export const getState = () => state;
export const remainingMs = () => remaining();
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export { toggle, reset };

/** Começa um ciclo de foco do zero (usado ao escolher uma tarefa na Mesa). */
export function startFocus() {
  state = { ...idle('focus'), running: true, endAt: Date.now() + minutes('focus') * 60000 };
  save();
  render();
}

/** Minutos de foco concluídos hoje, somando todos os PCs. */
export async function focusedToday() {
  return store.get('stats').focus[new Date().toLocaleDateString('sv')] ?? 0;
}

/** Histórico de foco (data → minutos), para a revisão semanal. */
export const focusLog = () => store.get('stats').focus;

const minutes = mode => store.get('settings')[mode === 'focus' ? 'focusMinutes' : 'breakMinutes'];
const idle = mode => ({ mode, running: false, endAt: null, left: minutes(mode) * 60000, full: minutes(mode) * 60000 });
const remaining = () => (state.running ? Math.max(0, state.endAt - Date.now()) : state.left);

export async function mount(host) {
  el = host;
  state = (await store.local.get('focus')) ?? idle('focus');
  // histórico antigo, que ficava só neste PC, passa para a coleção sincronizada
  const old = await store.local.get('focusLog');
  if (old && Object.keys(old).length) {
    const log = store.get('stats').focus;
    for (const [day, min] of Object.entries(old)) log[day] = Math.max(log[day] ?? 0, min);
    store.commit('stats');
    store.local.set('focusLog', null);
  }
  if (isExtension) {
    chrome.storage.onChanged.addListener((c, area) => {
      if (area === 'local' && c.focus?.newValue) { state = c.focus.newValue; render(); }
    });
  }
  // nova duração nos ajustes só vale para um timer que ainda não começou
  store.on('settings', () => { if (!state.running && state.left === state.full) state = idle(state.mode); render(); });
  render();
}

function save({ alarm = true } = {}) {
  store.local.set('focus', state);
  // ao terminar não mexe no alarme: ele ainda precisa disparar a notificação
  if (!isExtension || !alarm) return;
  // só os alarmes do foco: os da agenda e dos temporizadores continuam
  const running = state.running && state;
  Promise.all(['focus:focus', 'focus:break'].map(n => chrome.alarms.clear(n)))
    .then(() => { if (running) chrome.alarms.create('focus:' + running.mode, { when: running.endAt }); });
}

function toggle() {
  if (state.running) state = { ...state, running: false, left: remaining(), endAt: null };
  else state = { ...state, running: true, endAt: Date.now() + state.left };
  save();
  render();
}

function reset() {
  state = idle('focus');
  save();
  render();
}

async function finish() {
  // com várias abas abertas, só a primeira a chegar aqui avança o ciclo
  const saved = await store.local.get('focus');
  if (saved && saved.endAt !== state.endAt) { state = saved; render(); return; }
  const next = state.mode === 'focus' ? 'break' : 'focus';
  if (state.mode === 'focus') {
    const log = store.get('stats').focus;
    const today = new Date().toLocaleDateString('sv');
    log[today] = (log[today] ?? 0) + Math.round(state.full / 60000);
    store.commit('stats');
  }
  state = idle(next);
  save({ alarm: false });
  if (!document.hidden) chime();
  render();
}

function chime() {
  // na extensão quem avisa é a notificação; aqui só um toque discreto
  try {
    const ctx = new AudioContext();
    [660, 880].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + i * 0.18 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.5);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.18);
      o.stop(ctx.currentTime + i * 0.18 + 0.5);
    });
  } catch {}
}

const fmt = ms => {
  const s = Math.ceil(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

function render() {
  clearInterval(ticker);
  listeners.forEach(fn => fn(state));
  el.hidden = !store.get('settings').widgets.focus;
  if (el.hidden) return;

  const label = state.mode === 'focus' ? 'Foco' : 'Pausa';
  const time = h('span', { class: 'focus-time' }, fmt(remaining()));
  const dirty = state.running || state.left !== state.full;

  fill(el, 
    h('button', {
      class: `focus-chip ${state.running ? 'running' : ''} ${state.mode}`,
      title: state.running ? 'Pausar' : `Iniciar ${label.toLowerCase()}`,
      onclick: toggle
    }, icon(state.running ? 'pause' : state.mode === 'focus' ? 'timer' : 'play', 15), h('span', { class: 'focus-label' }, label), time),
    dirty ? h('button', { class: 'icon-btn sm', title: 'Reiniciar timer', onclick: reset }, icon('rotate-ccw', 14)) : null
  );

  if (state.running) {
    ticker = setInterval(() => {
      const left = remaining();
      time.textContent = fmt(left);
      document.title = `${fmt(left)} · ${label}`;
      if (left <= 0) { document.title = BASE_TITLE; finish(); }
    }, 1000);
  } else {
    document.title = BASE_TITLE;
  }
}
