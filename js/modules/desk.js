// Mesa: onde o dia é planejado e executado.
//  - barra única de entrada (tarefa, evento, nota ou hábito, interpretado do texto);
//  - Foco agora: a tarefa em que você está trabalhando + o timer de foco;
//  - Fila do dia: atrasadas, hoje e sessões de estudo; arraste para a linha do tempo;
//  - Linha do dia: compromissos hora a hora; soltar uma tarefa reserva o horário;
//  - Hábitos numa faixa compacta.

import * as store from '../store.js';
import { COLORS } from '../seeds.js';
import { eventsOn } from '../recur.js';
import { parse, describe } from '../quickadd.js';
import { h, icon, uid, fill, dateKey, addDays, parseKey, toast, toMin, fromMin, capitalize, prompt } from '../dom.js';
import * as tasks from './tasks.js';
import * as agenda from './agenda.js';
import * as brain from './brain.js';
import * as exams from './exams.js';
import * as focus from './focus.js';
import * as work from './work.js';
import * as birthdays from './birthdays.js';
import * as study from './study.js';
import * as brief from './brief.js';

const HOUR = 46;
const T_TASK = tasks.T_TASK;

let root, goTo = () => {};
let focusTaskId = null;
let parts = {};

export async function mount(el, navigate) {
  root = el;
  goTo = navigate;
  focusTaskId = (await store.local.get('focusTask')) ?? null;
  parts = {
    bar: h('section', { class: 'desk-bar' }),
    status: h('p', { class: 'desk-status' }),
    now: h('section', { class: 'card desk-focus' }),
    queue: h('section', { class: 'card desk-queue' }),
    day: h('section', { class: 'card desk-day' }),
    habits: h('section', { class: 'card desk-habits' })
  };
  root.append(
    h('div', { class: 'desk-top' }, parts.bar, parts.status),
    h('div', { class: 'desk-main' }, parts.now, parts.queue, parts.habits),
    parts.day
  );
  renderBar();
  const all = () => { renderStatus(); renderFocus(); renderQueue(); renderDay(); };
  store.on('tasks', all);
  store.on('events', () => { renderStatus(); renderFocus(); renderDay(); });
  store.on('exams', renderQueue);
  store.on('study', renderQueue);
  store.on('habits', renderHabits);
  store.on('workdays', renderStatus);
  focus.onChange(() => { renderFocus(); renderStatus(); });
  all();
  renderHabits();
  setInterval(() => { renderStatus(); renderNowLine(); }, 60000);
}

const today = () => dateKey();
const taskById = id => store.get('tasks').find(t => t.id === id);
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };

// ---------- Barra de entrada ----------

function renderBar() {
  const input = h('input', {
    class: 'desk-input', placeholder: 'O que precisa ser feito?  Ex.: “Reunião amanhã 15h”, “Pagar boleto sexta”, “> ideia”, “hábito: ler”',
    autocomplete: 'off', spellcheck: false, 'aria-label': 'Adicionar tarefa, evento, nota ou hábito'
  });
  const preview = h('span', { class: 'desk-preview' });
  const kindIcon = { task: 'circle-check', event: 'calendar', note: 'lightbulb', habit: 'flame', birthday: 'cake' };
  const update = () => {
    const p = parse(input.value);
    fill(preview, p ? [icon(kindIcon[p.kind], 13), describe(p)] : []);
    preview.dataset.kind = p?.kind ?? '';
  };
  input.addEventListener('input', update);
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') { input.value = ''; update(); return; }
    if (e.key !== 'Enter') return;
    const p = parse(input.value);
    if (!p) return;
    create(p);
    input.value = '';
    update();
  });
  const isSunday = new Date().getDay() === 0;
  fill(parts.bar, h('div', { class: 'desk-input-wrap' }, icon('plus', 18), input), h('div', { class: 'desk-bar-foot' }, preview,
    h('span', { class: 'spacer' }),
    h('button', { class: 'btn btn-xs', onclick: brief.openBrief }, icon('sun', 12), 'Resumo do dia'),
    h('button', { class: `btn btn-xs ${isSunday ? 'btn-primary' : ''}`, onclick: brief.openWeekly }, icon('chart-bar', 12), isSunday ? 'Hora da revisão semanal' : 'Revisão semanal')));
}

function create(p) {
  if (p.kind === 'task') {
    tasks.addTask(p.text, p.date, p.repeat);
    if (p.date !== today()) toast(`Tarefa criada para ${describe(p).split(' · ')[1]}.`);
  } else if (p.kind === 'event') {
    store.get('events').push({ id: uid(), title: p.title, date: p.date, start: p.start, end: p.end, allDay: false, color: 'violet', repeat: p.repeat ?? 'none', reminder: 10, notes: '', createdAt: Date.now() });
    store.commit('events');
    toast(`Evento “${p.title}” criado.`, { action: 'Ver na agenda', onAction: () => { goTo('workspace/agenda'); agenda.openDay(p.date); } });
  } else if (p.kind === 'note') {
    brain.capture(p.text);
    toast('Nota guardada na Caixa de entrada.', { action: 'Abrir', onAction: () => goTo('workspace/cerebro') });
  } else if (p.kind === 'birthday') {
    store.get('birthdays').push({ id: uid(), name: p.name, day: p.day, month: p.month, year: p.year });
    store.commit('birthdays');
    toast(`Aniversário de ${p.name} salvo.`, { action: 'Ver todos', onAction: () => birthdays.openManager() });
  } else if (p.kind === 'habit') {
    const keys = Object.keys(COLORS);
    store.get('habits').push({ id: uid(), name: p.text, color: keys[store.get('habits').length % keys.length], days: {}, createdAt: Date.now() });
    store.commit('habits');
  }
}

// ---------- Resumo do dia ----------

async function renderStatus() {
  const list = [...tasks.overdue(), ...tasks.onDay(today())];
  const done = list.filter(t => t.done).length;
  const mins = await focus.focusedToday();
  const next = eventsOn(store.get('events'), today()).find(e => !e.allDay && e.start && toMin(e.start) > nowMin());
  const ws = work.status();
  const bits = [
    capitalize(new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })),
    ws.kind === 'off' ? 'dia de folga' : `trabalho ${ws.hours}`,
    list.length ? `${done} de ${list.length} tarefas` : 'nenhuma tarefa para hoje',
    mins ? `${mins >= 60 ? Math.floor(mins / 60) + 'h' + String(mins % 60).padStart(2, '0') : mins + ' min'} de foco` : null,
    next ? `próximo: ${next.title} às ${next.start}` : null
  ].filter(Boolean);
  parts.status.textContent = bits.join('  ·  ');
}

// ---------- Foco agora ----------

function setFocusTask(id, { start = false } = {}) {
  focusTaskId = id;
  store.local.set('focusTask', id);
  if (start) focus.startFocus();
  renderFocus();
  renderQueue();
}

const fmt = ms => { const s = Math.ceil(ms / 1000); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
let focusTicker;

function pendingToday() {
  return tasks.sortDay([...tasks.overdue(), ...tasks.onDay(today())]).filter(t => !t.done);
}

function renderFocus() {
  clearInterval(focusTicker);
  const st = focus.getState();
  let task = focusTaskId ? taskById(focusTaskId) : null;
  if (focusTaskId && (!task || task.done)) { task = null; focusTaskId = null; store.local.set('focusTask', null); }

  const current = eventsOn(store.get('events'), today()).find(e => !e.allDay && e.start && toMin(e.start) <= nowMin() && toMin(e.end) > nowMin());
  const banner = current ? h('div', { class: 'desk-happening', style: { '--ev': COLORS[current.color] ?? COLORS.violet } },
    h('span', { class: 'now-badge' }, 'Acontecendo agora'), h('strong', {}, current.title), h('span', { class: 'muted small' }, `até ${current.end}`)) : null;

  const timer = h('span', { class: 'focus-big' }, st ? fmt(focus.remainingMs()) : '--:--');
  if (st?.running) focusTicker = setInterval(() => { timer.textContent = fmt(focus.remainingMs()); }, 1000);
  const mode = st?.mode === 'break' ? 'Pausa' : 'Foco';
  const controls = h('div', { class: 'focus-controls' },
    h('button', { class: 'btn btn-primary', onclick: () => focus.toggle() }, icon(st?.running ? 'pause' : 'play', 15), st?.running ? 'Pausar' : st && st.left !== st.full ? 'Continuar' : `Iniciar ${mode.toLowerCase()}`),
    st && (st.running || st.left !== st.full) ? h('button', { class: 'icon-btn', title: 'Reiniciar timer', onclick: () => focus.reset() }, icon('rotate-ccw', 16)) : null
  );

  if (task) {
    fill(parts.now, banner,
      h('header', { class: 'card-head' }, h('span', { class: 'eyebrow' }, 'Foco agora'), h('span', { class: `mode-tag ${st?.mode ?? 'focus'}` }, mode)),
      h('div', { class: 'focus-task' },
        h('button', { class: 'check big', title: 'Concluir tarefa', onclick: () => completeFocus(task) }, icon('check', 16)),
        h('div', {}, h('h2', {}, task.text), task.date && task.date < today() ? h('span', { class: 'tag tag-warn' }, 'atrasada') : null)),
      h('div', { class: 'focus-row' }, timer, controls),
      h('div', { class: 'focus-actions' },
        h('button', { class: 'btn btn-sm', onclick: () => completeFocus(task) }, icon('check', 14), 'Concluir e seguir'),
        h('button', { class: 'btn btn-sm', onclick: () => setFocusTask(null) }, 'Trocar tarefa'))
    );
    return;
  }

  const suggestions = pendingToday().slice(0, 3);
  fill(parts.now, banner,
    h('header', { class: 'card-head' }, h('span', { class: 'eyebrow' }, 'Foco agora'), st?.running ? h('span', { class: `mode-tag ${st.mode}` }, mode) : null),
    h('h2', { class: 'focus-ask' }, suggestions.length ? 'No que você vai trabalhar agora?' : 'Nada pendente para hoje.'),
    suggestions.length ? h('div', { class: 'focus-pick' }, suggestions.map(t => h('button', { class: 'pick', onclick: () => setFocusTask(t.id, { start: !focus.getState()?.running }) },
      icon('play', 13), h('span', {}, t.text)))) : h('p', { class: 'muted small' }, 'Use a barra acima para planejar algo, ou inicie um foco livre.'),
    h('div', { class: 'focus-row' }, timer, controls)
  );
}

function completeFocus(task) {
  tasks.toggle(task.id);
  const next = pendingToday()[0];
  focusTaskId = null;
  store.local.set('focusTask', null);
  toast(`“${task.text}” concluída.`, next ? { action: `Focar em “${next.text.slice(0, 24)}”`, onAction: () => setFocusTask(next.id) } : {});
}

// ---------- Fila do dia ----------

function queueRow(t) {
  const row = tasks.taskRow(t, { showDate: true });
  if (!t.done) {
    const play = h('button', { class: 'icon-btn sm queue-play', title: 'Focar nesta tarefa', onclick: () => setFocusTask(t.id, { start: !focus.getState()?.running }) }, icon('play', 13));
    row.querySelector('.task-tools')?.prepend(play);
  }
  if (t.id === focusTaskId) row.classList.add('focused');
  return row;
}

function renderQueue() {
  const late = tasks.overdue();
  const todays = tasks.onDay(today());
  const pending = [...late, ...todays.filter(t => !t.done)];
  const done = todays.filter(t => t.done);
  const plan = exams.todayPlan();
  const tomorrow = store.get('tasks').filter(t => t.date === addDays(today(), 1) && !t.done);

  fill(parts.queue,
    h('header', { class: 'card-head' }, h('span', { class: 'eyebrow' }, 'Fila do dia'),
      h('span', { class: 'muted small' }, pending.length ? 'arraste para a linha do tempo para reservar um horário' : '')),
    pending.length ? h('div', { class: 'task-list' }, pending.map(queueRow)) : h('p', { class: 'muted small empty-line' }, 'Fila vazia. Adicione pela barra acima.'),
    late.length > 1 ? h('button', { class: 'btn btn-xs queue-late', onclick: () => { late.forEach(t => { t.date = today(); }); store.commit('tasks'); } }, `Trazer ${late.length} atrasadas para hoje`) : null,
    plan?.sessions.length ? h('div', { class: 'queue-group' },
      h('span', { class: 'eyebrow' }, `Estudo · ${plan.exam.name}`),
      h('div', { class: 'task-list' }, plan.sessions.map(s => h('div', { class: `task ${s.done ? 'done' : ''}` },
        h('button', { class: 'check', 'aria-label': 'Concluir sessão', onclick: () => exams.toggleSession(s.id) }, icon('check', 12)),
        h('span', { class: 'task-text' }, plan.subjectName(s.subjectId)),
        h('span', { class: 'tag' }, `${s.minutes} min`))))) : null,
    (() => {
      const due = study.dueReviews();
      if (!due.length) return null;
      return h('div', { class: 'queue-group' },
        h('span', { class: 'eyebrow' }, `Revisões de estudo · ${due.length}`),
        h('div', { class: 'task-list' }, due.slice(0, 5).map(t => h('div', { class: 'task' },
          h('button', { class: 'check', 'aria-label': 'Revisei', title: 'Revisei', onclick: () => study.reviewDialog(t) }, icon('check', 12)),
          h('span', { class: 'task-text' }, t.title),
          h('span', { class: 'tag' }, study.subjectName(t.subjectId))))),
        due.length > 5 ? h('button', { class: 'btn btn-xs queue-late', onclick: () => goTo('study') }, `Ver todas as ${due.length}`) : null);
    })(),
    done.length ? h('details', { class: 'queue-done' }, h('summary', {}, `Concluídas hoje (${done.length})`), h('div', { class: 'task-list' }, done.map(queueRow))) : null,
    tomorrow.length ? h('p', { class: 'muted small queue-tomorrow' }, `Amanhã: ${tomorrow.slice(0, 3).map(t => t.text).join(', ')}${tomorrow.length > 3 ? ` e mais ${tomorrow.length - 3}` : ''}`) : null
  );
}

// ---------- Linha do dia ----------

let dayScroll;
function renderDay() {
  const key = today();
  const startH = 6, endH = 24;
  const evs = eventsOn(store.get('events'), key);
  const allDay = evs.filter(e => e.allDay || !e.start);
  const timed = evs.filter(e => !e.allDay && e.start);

  const col = h('div', { class: 'dl-col', style: { height: `${(endH - startH) * HOUR}px` } });
  for (let hr = startH; hr < endH; hr++) {
    col.append(h('div', { class: 'dl-hour', style: { top: `${(hr - startH) * HOUR}px` } }, h('span', {}, `${String(hr).padStart(2, '0')}:00`)));
  }
  const minutesAt = e => {
    const y = e.clientY - col.getBoundingClientRect().top;
    return Math.max(startH * 60, Math.min(23 * 60 + 30, startH * 60 + Math.round((y / HOUR) * 60 / 15) * 15));
  };
  for (const ev of timed) {
    const s = Math.max(toMin(ev.start), startH * 60), en = Math.max(toMin(ev.end), s + 20);
    const past = toMin(ev.end) <= nowMin();
    col.append(h('button', {
      class: `dl-event ${past ? 'past' : ''} ${ev.taskId ? 'block' : ''}`,
      style: { top: `${((s - startH * 60) / 60) * HOUR}px`, height: `${Math.max(20, ((en - s) / 60) * HOUR - 2)}px`, '--ev': COLORS[ev.color] ?? COLORS.violet },
      onclick: e => { e.stopPropagation(); agenda.editEvent(ev, { date: key }); }
    }, h('strong', {}, ev.title), h('span', {}, `${ev.start}–${ev.end}`)));
  }
  col.addEventListener('click', e => {
    if (e.target !== col && !e.target.classList.contains('dl-hour')) return;
    const s = Math.floor(minutesAt(e) / 30) * 30;
    agenda.editEvent(null, { date: key, start: fromMin(s), end: fromMin(Math.min(s + 60, 23 * 60 + 59)) });
  });
  // soltar uma tarefa da fila reserva um bloco de 1 h para ela
  col.addEventListener('dragover', e => { if (e.dataTransfer.types.includes(T_TASK)) { e.preventDefault(); col.classList.add('drop-target'); } });
  col.addEventListener('dragleave', e => { if (!col.contains(e.relatedTarget)) col.classList.remove('drop-target'); });
  col.addEventListener('drop', e => {
    e.preventDefault();
    col.classList.remove('drop-target');
    const t = taskById(e.dataTransfer.getData(T_TASK));
    if (!t) return;
    const s = Math.floor(minutesAt(e) / 15) * 15;
    store.get('events').push({ id: uid(), title: t.text, date: key, start: fromMin(s), end: fromMin(Math.min(s + 60, 23 * 60 + 59)), allDay: false, color: 'violet', repeat: 'none', reminder: 5, notes: '', taskId: t.id, createdAt: Date.now() });
    if (t.date !== key) { t.date = key; store.commit('tasks'); }
    store.commit('events');
    toast(`Horário reservado para “${t.text}” às ${fromMin(s)}.`);
  });

  const scroller = h('div', { class: 'dl-scroll' }, col);
  fill(parts.day,
    h('header', { class: 'card-head' }, h('span', { class: 'eyebrow' }, 'Linha do dia'),
      h('button', { class: 'btn btn-xs', onclick: () => { goTo('workspace/agenda'); agenda.openDay(key); } }, 'Agenda')),
    allDay.length ? h('div', { class: 'dl-allday' }, allDay.map(e => h('span', { class: 'week-ev', style: { '--ev': COLORS[e.color] ?? COLORS.violet } }, e.title))) : null,
    scroller);
  renderNowLine();
  // abre perto de agora (ou mantém a posição ao redesenhar)
  requestAnimationFrame(() => { scroller.scrollTop = dayScroll ?? Math.max(0, ((nowMin() - startH * 60) / 60 - 1.5) * HOUR); });
  scroller.addEventListener('scroll', () => { dayScroll = scroller.scrollTop; }, { passive: true });
}

function renderNowLine() {
  const col = parts.day?.querySelector('.dl-col');
  if (!col) return;
  col.querySelector('.now-line')?.remove();
  const m = nowMin();
  if (m < 6 * 60) return;
  col.append(h('div', { class: 'now-line', style: { top: `${((m - 6 * 60) / 60) * HOUR}px` } }));
}

// ---------- Hábitos ----------

const habits = () => store.get('habits');

function streak(hb) {
  let n = 0;
  let k = today();
  if (!hb.days[k]) k = addDays(k, -1); // hoje ainda não marcado não quebra a sequência
  while (hb.days[k]) { n++; k = addDays(k, -1); }
  return n;
}

function renderHabits() {
  const k = today();
  const list = habits();
  const doneCount = list.filter(hb => hb.days[k]).length;
  fill(parts.habits,
    h('header', { class: 'card-head' }, h('span', { class: 'eyebrow' }, 'Hábitos de hoje'),
      list.length ? h('span', { class: 'muted small' }, `${doneCount} de ${list.length}`) : null),
    h('div', { class: 'habit-chips' },
      list.map(hb => {
        const s = streak(hb);
        return h('div', { class: `habit-chip ${hb.days[k] ? 'on' : ''}`, style: { '--hb': COLORS[hb.color] ?? COLORS.violet } },
          h('button', {
            class: 'habit-toggle', 'aria-pressed': String(!!hb.days[k]), title: hb.days[k] ? 'Desmarcar hoje' : 'Feito hoje',
            onclick: () => { const x = habits().find(y => y.id === hb.id); if (x.days[k]) delete x.days[k]; else x.days[k] = true; store.commit('habits'); }
          }, h('span', { class: 'habit-box' }, hb.days[k] ? icon('check', 11) : null), hb.name,
            s > 1 ? h('span', { class: 'habit-streak', title: `${s} dias seguidos` }, icon('flame', 11), s) : null),
          h('button', { class: 'habit-del', title: 'Excluir hábito', onclick: () => removeHabit(hb) }, icon('x', 11)));
      }),
      h('button', { class: 'habit-add', onclick: addHabit }, icon('plus', 12), list.length ? 'Hábito' : 'Criar um hábito diário'))
  );
}

async function addHabit() {
  const name = await prompt({ title: 'Novo hábito', subtitle: 'Algo que você quer fazer todos os dias.', placeholder: 'Ex.: Ler 20 páginas', confirm: 'Criar' });
  if (name) create({ kind: 'habit', text: name });
}

function removeHabit(hb) {
  const list = habits();
  const index = list.findIndex(x => x.id === hb.id);
  const [removed] = list.splice(index, 1);
  store.commit('habits');
  toast(`Hábito “${removed.name}” excluído.`, { action: 'Desfazer', onAction: () => { habits().splice(index, 0, removed); store.commit('habits'); } });
}
