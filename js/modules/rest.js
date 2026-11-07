// Modo repouso: tela de baixa luminosidade com relógio grande, data e clima.
// Ativação manual (botão da lua, tecla R), por inatividade dentro do Hub, ou
// pelo service worker quando o PC inteiro fica ocioso (chrome.idle), que abre
// esta página com #repouso numa janela em tela cheia.

import * as store from '../store.js';
import { h, icon, fill, dateKey, capitalize } from '../dom.js';
import { fetchWeather, describe, forecastStrip } from './widgets.js';
import { holiday } from './tasks.js';

let overlay, clockEl, dateEl, weatherEl, stage;
let active = false;
let openedAt = 0;
let enteredFullscreen = false;
let lastActivity = Date.now();
let ticker, drifter;

const settings = () => store.get('settings').rest;
// lido no carregamento do módulo, antes da navegação trocar o endereço para #inicio
// movimento "consistente": pelo menos 0,6 s mexendo e 320 px percorridos, sem pausas maiores que 250 ms
const MOVE_MIN_MS = 600, MOVE_MIN_PX = 320, MOVE_GAP_MS = 250;

const openedBySystem = location.hash === '#repouso';
const touchFirst = matchMedia('(hover: none) and (pointer: coarse)').matches;
const autoWindow = () => openedBySystem;

export function mount() {
  clockEl = h('div', { class: 'rest-clock' });
  dateEl = h('div', { class: 'rest-date' });
  weatherEl = h('div', { class: 'rest-weather' });
  stage = h('div', { class: 'rest-stage' }, clockEl, dateEl, weatherEl);
  overlay = h('div', { class: 'rest', hidden: true, role: 'dialog', 'aria-label': 'Modo repouso' }, stage,
    h('p', { class: 'rest-hint' }, touchFirst ? 'Toque na tela para voltar' : 'Mova o mouse por um instante ou aperte uma tecla para voltar'));
  document.body.append(overlay);

  // Só sai do repouso com intenção: uma tecla, ou movimento contínuo do mouse
  // (o gato esbarrando gera um tranco curto, que é ignorado). Cliques e rolagem
  // soltos também não contam.
  let run = { dist: 0, start: 0, last: 0 };
  const onMove = e => {
    lastActivity = Date.now();
    if (!active || Date.now() - openedAt < 900) return;
    const now = performance.now();
    if (now - run.last > MOVE_GAP_MS) run = { dist: 0, start: now, last: now };
    run.dist += Math.hypot(e.movementX, e.movementY);
    run.last = now;
    if (run.dist >= MOVE_MIN_PX && now - run.start >= MOVE_MIN_MS) close();
  };
  const onKey = e => {
    lastActivity = Date.now();
    if (active && Date.now() - openedAt >= 900 && !['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) close();
  };
  addEventListener('mousemove', onMove, { capture: true, passive: true });
  addEventListener('keydown', onKey, { capture: true });
  for (const ev of ['mousedown', 'wheel', 'touchstart']) addEventListener(ev, () => { lastActivity = Date.now(); }, { capture: true, passive: true });
  // tela de toque (tablet): um toque é sempre intencional
  addEventListener('pointerup', e => { if (e.pointerType === 'touch' && active && Date.now() - openedAt >= 900) close(); }, { capture: true });
  // a tela do tablet não apaga enquanto o relógio estiver aberto; volta a pedir ao reabrir o app
  document.addEventListener('visibilitychange', () => { if (active && !document.hidden) keepAwake(true); });

  // inatividade dentro do próprio Hub (complementa o chrome.idle do service worker)
  setInterval(() => {
    const min = settings().idleMinutes;
    // com a detecção do sistema ligada, quem abre é o service worker (evita repouso duplo)
    if (!active && min && !settings().system && !document.hidden && Date.now() - lastActivity > min * 60000) open();
  }, 15000);

  if (autoWindow()) open();
}

let wakeLock = null;
function keepAwake(on) {
  if (!on) { wakeLock?.release().catch(() => {}); wakeLock = null; return; }
  if (wakeLock && !wakeLock.released) return;
  navigator.wakeLock?.request('screen').then(l => { wakeLock = l; }).catch(() => {});
}

export function open({ fullscreen = false } = {}) {
  if (active) return;
  active = true;
  openedAt = Date.now();
  overlay.hidden = false;
  document.body.classList.add('resting');
  if (fullscreen && !document.fullscreenElement) {
    document.documentElement.requestFullscreen?.().then(() => { enteredFullscreen = true; }).catch(() => {});
  }
  keepAwake(true);
  tick();
  renderWeather();
  ticker = setInterval(tick, 5000);
  // muda levemente de posição a cada minuto para não marcar a tela
  drifter = setInterval(drift, 60000);
}

export function close() {
  if (!active) return;
  active = false;
  lastActivity = Date.now();
  overlay.hidden = true;
  document.body.classList.remove('resting');
  clearInterval(ticker);
  clearInterval(drifter);
  keepAwake(false);
  if (enteredFullscreen && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  enteredFullscreen = false;
  // janela aberta pelo service worker: fecha e devolve o usuário ao que fazia
  if (autoWindow() && typeof chrome !== 'undefined' && chrome.windows) {
    chrome.windows.getCurrent().then(w => chrome.windows.remove(w.id)).catch(() => history.replaceState(null, '', '#inicio'));
  }
}

function tick() {
  const now = new Date();
  clockEl.textContent = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const key = dateKey(now);
  const fer = holiday(key);
  dateEl.textContent = capitalize(now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })) + (fer ? ` · ${fer}` : '');
}

function drift() {
  const x = (Math.random() - 0.5) * 8, y = (Math.random() - 0.5) * 8;
  stage.style.transform = `translate(${x}vw, ${y}vh)`;
  renderWeather();
}

async function renderWeather() {
  const city = store.get('settings').city;
  if (!city) { fill(weatherEl); return; }
  try {
    const w = await fetchWeather(city);
    const now = describe(w.code, !w.day);
    fill(weatherEl,
      h('div', { class: 'rest-now' },
        icon(now.icon, 34),
        h('span', { class: 'rest-temp' }, `${w.temp}°`),
        h('span', { class: 'rest-desc' }, now.label, h('small', {}, `Umidade ${w.humidity}% · ${w.min}° / ${w.max}° · ${city.name}`))),
      w.days?.length ? forecastStrip(w.days) : null);
  } catch {
    fill(weatherEl);
  }
}
