import * as store from './store.js';
import { INBOX } from './seeds.js';
import { h, icon, isTyping, uid, dateKey, toast, isExtension } from './dom.js';
import { addNotesToBrain } from './importer.js';
import * as backups from './backup.js';
import * as gcal from './sync/gcal.js';
import * as links from './modules/links.js';
import * as search from './modules/search.js';
import * as rest from './modules/rest.js';
import * as backdrop from './modules/backdrop.js';
import * as birthdays from './modules/birthdays.js';
import * as reading from './modules/reading.js';
import * as readlater from './modules/readlater.js';
import * as palette from './modules/palette.js';
import * as brief from './modules/brief.js';
import * as work from './modules/work.js';
import * as tasks from './modules/tasks.js';
import * as widgets from './modules/widgets.js';
import * as focus from './modules/focus.js';
import * as settings from './modules/settings.js';
import * as desk from './modules/desk.js';
import * as agenda from './modules/agenda.js';
import * as brain from './modules/brain.js';
import * as study from './modules/study.js';
import * as exams from './modules/exams.js';
import * as finance from './modules/finance.js';
import * as activity from './modules/activity.js';

const $ = sel => document.querySelector(sel);

const VIEWS = ['inicio', 'workspace', 'study', 'concursos', 'financas', 'atividade'];
const SUBVIEWS = ['mesa', 'agenda', 'cerebro'];
let workspaceSub = 'mesa';

/** Navega para "view" ou "workspace/sub". */
function show(route) {
  let [view, sub] = (route || '').split('/');
  if (!VIEWS.includes(view)) view = 'inicio';
  if (view === 'workspace') workspaceSub = SUBVIEWS.includes(sub) ? sub : workspaceSub;
  const prev = document.body.dataset.view;
  if (prev === 'financas' && view !== 'financas') finance.lock();
  document.body.dataset.view = view;
  document.body.dataset.sub = workspaceSub;
  document.querySelectorAll('[data-nav]').forEach(b => b.setAttribute('aria-current', b.dataset.nav === view ? 'page' : 'false'));
  document.querySelectorAll('.subnav [data-sub]').forEach(b => b.setAttribute('aria-current', b.dataset.sub === workspaceSub ? 'page' : 'false'));
  if (view === 'workspace' && workspaceSub === 'agenda') requestAnimationFrame(agenda.onShow);
  if (view === 'atividade' && prev !== 'atividade') activity.onShow();
  const hash = '#' + (view === 'workspace' ? `workspace/${workspaceSub}` : view);
  if (location.hash !== hash) history.replaceState(null, '', hash);
}

function applyVisibility() {
  const w = store.get('settings').widgets;
  $('#today').hidden = !w.today;
  const aside = $('#home-aside');
  aside.hidden = [...aside.children].every(c => c.hidden);
}

function wireNav() {
  document.querySelectorAll('[data-nav]').forEach(b => b.addEventListener('click', () => show(b.dataset.nav)));
  document.querySelectorAll('.subnav [data-sub]').forEach(b => b.addEventListener('click', () => show('workspace/' + b.dataset.sub)));
  $('#open-palette').append(icon('search', 15), h('span', {}, 'Buscar'), h('kbd', {}, 'Ctrl K'));
  $('#open-palette').addEventListener('click', () => palette.open());
  $('#open-rest').append(icon('moon', 18));
  $('#open-rest').addEventListener('click', () => rest.open({ fullscreen: true }));
  $('#open-settings').append(icon('settings', 18));
  $('#open-settings').addEventListener('click', () => settings.open());

  const syncDot = $('#sync-dot');
  const renderSync = () => {
    const i = store.syncInfo;
    syncDot.className = `sync-dot ${i.status}`;
    const where = i.provider === 'drive' ? 'Google Drive' : 'conta do navegador';
    syncDot.title = i.status === 'ok' ? `Sincronizado (${where})` : i.status === 'off' ? 'Somente neste navegador' : i.message;
  };
  store.on('sync', renderSync);
  renderSync();
  syncDot.addEventListener('click', () => settings.open('sync'));

  document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e)) return;
    const actions = {
      1: () => show('inicio'),
      2: () => show('workspace'),
      3: () => show('study'),
      4: () => show('concursos'),
      5: () => show('financas'),
      6: () => show('atividade'),
      ',': () => settings.open(),
      '/': () => { show('inicio'); search.focus(); },
      r: () => rest.open({ fullscreen: true }),
      n: () => { show('workspace/cerebro'); brain.newNote(); },
      e: () => agenda.editEvent(null, { date: dateKey() }),
      t: () => {
        if (!store.get('settings').widgets.today) show('workspace/mesa');
        else show('inicio');
        tasks.focusTodayInput();
      }
    };
    const run = actions[e.key.toLowerCase()];
    if (!run) return;
    // sem isso a tecla seria digitada no campo que acabou de receber foco
    e.preventDefault();
    run();
  });
  addEventListener('hashchange', () => show(location.hash.slice(1)));
}

// ---------- Migração da v1: notas soltas viram pastas do Cérebro ----------

function migrate() {
  const old = store.get('notes');
  if (!old?.length) return;
  addNotesToBrain(old, 'Geral');
  store.commit('brain');
  store.replace('notes', []);
}

// ---------- Ações vindas do HUD (enfileiradas pelo service worker) ----------
// Cada operação tem id próprio: aplicar duas vezes (duas abas) não duplica.

async function applyOps() {
  const ops = (await store.local.get('hubOps')) ?? [];
  if (!ops.length) return;
  const touched = new Set();
  for (const op of ops) {
    if (op.kind === 'link') {
      const boards = store.get('boards');
      let board = boards.find(b => b.id === op.boardId);
      if (!board) {
        board = boards.find(b => b.name === 'Salvos') ?? { id: uid(), name: 'Salvos', links: [] };
        if (!boards.includes(board)) boards.push(board);
      }
      if (!boards.some(b => b.links.some(l => l.id === op.id))) board.links.push({ id: op.id, name: op.name, url: op.url, icon: null });
      touched.add('boards');
    } else if (op.kind === 'note') {
      const b = store.get('brain');
      if (!b.notes.some(n => n.id === op.id)) b.notes.push({ id: op.id, folderId: INBOX, title: op.title ?? '', content: op.content ?? '', pinned: false, createdAt: op.at, updatedAt: op.at });
      touched.add('brain');
    } else if (op.kind === 'readLater') {
      const rl = store.get('readLater');
      if (!rl.some(r => r.id === op.id || (r.url === op.url && !r.read))) rl.push({ id: op.id, url: op.url, title: op.title, minutes: op.minutes, addedAt: op.at, read: false });
      touched.add('readLater');
    } else if (op.kind === 'session') {
      const boards = store.get('boards');
      if (!boards.some(b => b.id === op.id)) boards.push({ id: op.id, name: op.name, links: op.links.map(l => ({ ...l, icon: null })) });
      touched.add('boards');
    } else if (op.kind === 'siteRule') {
      const sites = { ...store.get('settings').hudSites };
      if (op.mode === 'show') delete sites[op.host]; else sites[op.host] = op.mode;
      store.get('settings').hudSites = sites;
      touched.add('settings');
    } else if (op.kind === 'task') {
      if (!store.get('tasks').some(t => t.id === op.id)) store.get('tasks').push({ id: op.id, text: op.text, date: dateKey(), done: false, doneAt: null, createdAt: op.at });
      touched.add('tasks');
    }
  }
  touched.forEach(n => store.commit(n));
  const applied = new Set(ops.map(o => o.id));
  const latest = (await store.local.get('hubOps')) ?? [];
  await store.local.set('hubOps', latest.filter(o => !applied.has(o.id)));
}

async function boot() {
  await store.init();
  settings.applyAccent();
  rest.mount();
  backdrop.mount();
  migrate();

  wireNav();
  widgets.mountHero($('#hero'));
  search.mount($('#search'));
  widgets.mountWeather($('#weather'), settings.open);
  widgets.mountTopSites($('#top-sites'));
  tasks.mountToday($('#today'));
  birthdays.mountCard($('#birthdays'));
  reading.mountCard($('#reading'));
  readlater.mountCard($('#readlater'));
  links.mount($('#links'));
  await agenda.mount($('#agenda'));
  brain.mount($('#cerebro'));
  await focus.mount($('#focus'));
  await desk.mount($('#mesa'), show);
  await study.mount($('#studyspace'));
  await exams.mount($('#concursos'));
  finance.mount($('#financas'));
  await activity.mount($('#atividade'));
  // depois dos widgets, para que já tenham atualizado a própria visibilidade
  store.on('settings', () => { settings.applyAccent(); applyVisibility(); });
  store.on('birthdays', applyVisibility);
  store.on('reading', applyVisibility);
  store.on('readLater', applyVisibility);
  // regras do HUD por site: os Ajustes (sincronizados) são a fonte; o HUD lê a cópia local
  const mirrorSites = () => store.local.set('hudSites', store.get('settings').hudSites ?? {});
  store.on('settings', mirrorSites);
  mirrorSites();

  await applyOps();
  if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((c, area) => { if (area === 'local' && c.hubOps?.newValue?.length) applyOps(); });
  }

  applyVisibility();
  show(location.hash.slice(1));
  afterLogin();
  gcal.start();
  brief.setNavigator(show);
  palette.mount({
    show,
    newNote: () => { show('workspace/cerebro'); brain.newNote(); },
    newEvent: () => agenda.editEvent(null, { date: dateKey() }),
    newTask: () => { show(store.get('settings').widgets.today ? 'inicio' : 'workspace/mesa'); tasks.focusTodayInput(); },
    brief: brief.openBrief,
    weekly: brief.openWeekly,
    schedule: () => work.openSchedule(),
    birthdays: () => import('./modules/birthdays.js').then(b => b.openManager()),
    readLater: readlater.openList,
    rest: () => rest.open({ fullscreen: true }),
    settings: () => settings.open(),
    notes: brain.accessibleNotes,
    openNote: n => { show('workspace/cerebro'); brain.openNote(n); },
    editTask: tasks.editTask,
    openDay: k => { show('workspace/agenda'); agenda.openDay(k); }
  });
  // resumo do dia na primeira aba aberta do dia (depois que a sincronização trouxe o mais novo)
  setTimeout(() => brief.maybeShow(), 1500);
  // backup semanal, depois que a sincronização teve tempo de trazer o mais novo
  setTimeout(() => backups.auto().catch(() => {}), 8000);
  document.body.classList.add('ready');
  registerWebApp();
}

/** Versão web: a página acabou de voltar do login do Google. */
function afterLogin() {
  const r = store.authResult;
  if (!r) return;
  if (r.ok && r.pending?.gcal) {
    const s = store.get('settings');
    s.gcal = { ...s.gcal, enabled: true };
    store.commit('settings');
  }
  if (r.ok && !r.silent) toast(r.pending?.gcal ? 'Google Agenda ligado.' : 'Google Drive conectado. Seus dados estão sincronizando.');
  else if (!r.ok && !r.silent) toast(r.error);
}

/** Versão web publicada (index.html com manifesto): instala o modo app/offline. */
function registerWebApp() {
  if (isExtension || !('serviceWorker' in navigator) || !document.querySelector('link[rel="manifest"]')) return;
  // já havia uma versão instalada: a nova assumiu; recarregar troca tudo de uma vez
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) toast('O Hub foi atualizado.', { action: 'Recarregar', onAction: () => location.reload(), duration: 15000 });
  });
  navigator.serviceWorker.register('sw.js').catch(err => console.warn('service worker', err));
}

boot().catch(err => {
  console.error(err);
  document.body.append(h('pre', { class: 'fatal' }, 'O Hub não conseguiu iniciar:\n' + (err?.stack || err)));
  document.body.classList.add('ready');
});
