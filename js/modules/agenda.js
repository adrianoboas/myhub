import * as store from '../store.js';
import { COLORS } from '../seeds.js';
import { REPEAT, eventsOn } from '../recur.js';
import { h, icon, uid, fill, clear, dateKey, parseKey, addDays, dialog, toast, toMin, fromMin, segmented, capitalize } from '../dom.js';
import * as tasks from './tasks.js';
import * as work from './work.js';
import * as birthdays from './birthdays.js';

const HOUR = 44; // px por hora na grade
const T_EVENT = 'application/x-hub-event';
const REMINDERS = { '': 'Sem lembrete', 0: 'Na hora', 5: '5 min antes', 10: '10 min antes', 30: '30 min antes', 60: '1 hora antes', 1440: '1 dia antes' };
const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

const events = () => store.get('events');

let root, mainEl, sideEl;
let view = 'week';
let cursor = dateKey();

export async function mount(el) {
  root = el;
  view = (await store.local.get('agendaView')) ?? 'week';
  mainEl = h('section', { class: 'agenda-main panel' });
  sideEl = h('aside', { class: 'agenda-side' });
  root.append(mainEl, sideEl);
  store.on('events', render);
  store.on('tasks', render);
  store.on('workdays', render);
  store.on('birthdays', render);
  render();
  // linha do "agora" anda sozinha
  setInterval(() => { if (!root.closest('[hidden]') && view !== 'month') renderNowLine(); }, 60000);
}

/** Abre a agenda num dia (usado pela Mesa). */
export function openDay(key) {
  cursor = key;
  setView('day');
}

// começa às 7h, ou duas horas antes de agora se já for mais tarde
const defaultScroll = () => Math.max(7, new Date().getHours() - 2) * HOUR;

/** Chamado quando a aba Agenda fica visível (antes disso a grade não tem altura). */
export function onShow() {
  const grid = mainEl?.querySelector('.time-scroll');
  if (grid && !grid.dataset.scrolled) { grid.scrollTop = defaultScroll(); grid.dataset.scrolled = '1'; }
}

function setView(v) {
  view = v;
  store.local.set('agendaView', v);
  render();
}

function step(dir) {
  if (view === 'month') {
    const d = parseKey(cursor);
    d.setDate(1);
    d.setMonth(d.getMonth() + dir);
    cursor = dateKey(d);
  } else cursor = addDays(cursor, dir * (view === 'week' ? 7 : 1));
  render();
}

const weekStart = key => addDays(key, -parseKey(key).getDay());

function title() {
  const d = parseKey(cursor);
  if (view === 'month') return capitalize(d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }));
  if (view === 'day') return capitalize(d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }));
  const a = parseKey(weekStart(cursor)), b = parseKey(addDays(weekStart(cursor), 6));
  const same = a.getMonth() === b.getMonth();
  return `${a.getDate()}${same ? '' : ' ' + a.toLocaleDateString('pt-BR', { month: 'short' })} – ${b.getDate()} ${b.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })}`;
}

function render() {
  if (!root) return;
  const scroll = mainEl.querySelector('.time-scroll')?.scrollTop;
  fill(mainEl,
    h('header', { class: 'agenda-toolbar' },
      h('div', { class: 'agenda-nav' },
        h('button', { class: 'icon-btn', title: 'Anterior', onclick: () => step(-1) }, icon('chevron-left', 18)),
        h('button', { class: 'icon-btn', title: 'Próximo', onclick: () => step(1) }, icon('chevron-right', 18)),
        h('button', { class: 'btn btn-sm', onclick: () => { cursor = dateKey(); render(); } }, 'Hoje')
      ),
      h('h2', { class: 'agenda-title' }, title()),
      h('span', { class: 'spacer' }),
      segmented([{ value: 'month', label: 'Mês' }, { value: 'week', label: 'Semana' }, { value: 'day', label: 'Dia' }], view, setView),
      h('button', { class: 'btn btn-sm', title: 'Folgas e horário de trabalho', onclick: () => work.openSchedule(cursor.slice(0, 7)) }, icon('briefcase', 14), 'Escala'),
      h('button', { class: 'btn btn-sm', title: 'Aniversários', onclick: () => birthdays.openManager() }, icon('cake', 14), 'Aniversários'),
      h('button', { class: 'btn btn-primary btn-sm', onclick: () => editEvent(null, { date: cursor }) }, icon('plus', 14), 'Evento')
    ),
    view === 'month' ? renderMonth() : renderTimeGrid(view === 'week' ? 7 : 1)
  );
  const grid = mainEl.querySelector('.time-scroll');
  if (grid) grid.scrollTop = scroll ?? defaultScroll();
  renderNowLine();
  renderSide();
}

// ---------- Mês ----------

function chip(ev, key) {
  const c = h('button', {
    class: `ev-chip ${ev.allDay ? 'all-day' : ''}`, style: { '--ev': COLORS[ev.color] ?? COLORS.violet },
    draggable: !ev.repeat || ev.repeat === 'none',
    onclick: e => { e.stopPropagation(); editEvent(ev, { date: key }); }
  }, ev.allDay ? null : h('span', { class: 'ev-time' }, ev.start), h('span', { class: 'ev-title' }, ev.title));
  c.addEventListener('dragstart', e => { e.dataTransfer.setData(T_EVENT, ev.id); e.stopPropagation(); });
  return c;
}

function taskChip(t) {
  return h('button', {
    class: `task-chip ${t.done ? 'done' : ''}`, draggable: true,
    onclick: e => { e.stopPropagation(); tasks.toggle(t.id); }, title: t.done ? 'Reabrir' : 'Concluir'
  }, icon(t.done ? 'check' : 'circle', 11), h('span', {}, t.text));
}

function wireDrop(el, key, { atMinutes } = {}) {
  el.addEventListener('dragover', e => {
    if (!e.dataTransfer.types.includes(T_EVENT) && !e.dataTransfer.types.includes(tasks.T_TASK)) return;
    e.preventDefault();
    el.classList.add('drop-target');
  });
  el.addEventListener('dragleave', e => { if (!el.contains(e.relatedTarget)) el.classList.remove('drop-target'); });
  el.addEventListener('drop', e => {
    e.preventDefault();
    el.classList.remove('drop-target');
    const taskId = e.dataTransfer.getData(tasks.T_TASK);
    if (taskId) return tasks.setDate(taskId, key);
    const ev = events().find(x => x.id === e.dataTransfer.getData(T_EVENT));
    if (!ev) return;
    ev.date = key;
    if (atMinutes && !ev.allDay) {
      const dur = toMin(ev.end) - toMin(ev.start);
      const start = Math.min(atMinutes(e), 24 * 60 - dur);
      ev.start = fromMin(start);
      ev.end = fromMin(start + dur);
    }
    store.commit('events');
  });
}

function renderMonth() {
  const first = parseKey(cursor.slice(0, 8) + '01');
  const start = addDays(dateKey(first), -first.getDay());
  const month = cursor.slice(0, 7);
  const today = dateKey();
  const grid = h('div', { class: 'month-grid' }, WEEKDAYS.map(d => h('div', { class: 'month-dow' }, d)));
  for (let i = 0; i < 42; i++) {
    const key = addDays(start, i);
    const evs = eventsOn(events(), key);
    const tks = tasks.sortDay(store.get('tasks').filter(t => t.date === key));
    const items = [...dayChips(key), ...evs.map(ev => chip(ev, key)), ...tks.map(taskChip)];
    const fer = tasks.holiday(key);
    const cell = h('div', {
      class: `month-cell ${key.slice(0, 7) !== month ? 'other' : ''} ${key === today ? 'today' : ''} ${work.isOff(key) ? 'off' : ''}`,
      onclick: () => editEvent(null, { date: key })
    },
      h('div', { class: 'month-cell-head' },
        h('button', { class: 'day-num', title: 'Abrir o dia', onclick: e => { e.stopPropagation(); openDay(key); } }, parseKey(key).getDate()),
        fer ? h('span', { class: 'holiday', title: fer }, fer) : null,
        work.isCustom(key) ? h('span', { class: 'work-hrs', title: 'Horário de trabalho ajustado' }, `${work.hoursOf(key).start}–${work.hoursOf(key).end}`) : null
      ),
      items.slice(0, 3),
      items.length > 3 ? h('button', { class: 'more', onclick: e => { e.stopPropagation(); openDay(key); } }, `+${items.length - 3} mais`) : null
    );
    wireDrop(cell, key);
    grid.append(cell);
  }
  return grid;
}

/** Folga, expediente (opcional) e aniversários do dia, como chips de dia inteiro. */
function dayChips(key, { showWork = false } = {}) {
  const out = [];
  if (work.isOff(key)) out.push(h('span', { class: 'off-chip' }, icon('tree-palm', 11), 'Folga'));
  else if (showWork) { const hrs = work.hoursOf(key); out.push(h('span', { class: 'work-chip' }, icon('briefcase', 11), `${hrs.start}–${hrs.end}`)); }
  for (const b of birthdays.on(key)) {
    const age = birthdays.ageOn(b, key);
    out.push(h('button', { class: 'bday-chip', title: 'Editar aniversário', onclick: e => { e.stopPropagation(); birthdays.edit(b); } },
      icon('cake', 11), h('span', {}, `${b.name}${age ? ` (${age})` : ''}`)));
  }
  return out;
}

// ---------- Semana / dia ----------

/** Distribui eventos sobrepostos em colunas lado a lado. */
function layout(evs) {
  const items = evs.map(ev => ({ ev, s: toMin(ev.start), e: Math.max(toMin(ev.end), toMin(ev.start) + 20) })).sort((a, b) => a.s - b.s);
  let cluster = [], clusterEnd = -1;
  const flushCluster = () => {
    const lanes = [];
    for (const it of cluster) {
      let lane = lanes.findIndex(end => end <= it.s);
      if (lane === -1) { lane = lanes.length; lanes.push(0); }
      lanes[lane] = it.e;
      it.lane = lane;
    }
    cluster.forEach(it => { it.lanes = lanes.length; });
    cluster = [];
  };
  for (const it of items) {
    if (it.s >= clusterEnd && cluster.length) flushCluster();
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.e);
  }
  if (cluster.length) flushCluster();
  return items;
}

function renderTimeGrid(days) {
  const start = days === 7 ? weekStart(cursor) : cursor;
  const today = dateKey();
  const keys = Array.from({ length: days }, (_, i) => addDays(start, i));
  const cols = `56px repeat(${days}, minmax(0, 1fr))`;

  const head = h('div', { class: 'tg-head', style: { gridTemplateColumns: cols } }, h('div'),
    keys.map(k => {
      const d = parseKey(k);
      return h('button', { class: `tg-day ${k === today ? 'today' : ''}`, onclick: () => openDay(k) },
        h('span', { class: 'tg-dow' }, WEEKDAYS[d.getDay()]), h('span', { class: 'tg-num' }, d.getDate()));
    }));

  const allDay = h('div', { class: 'tg-allday', style: { gridTemplateColumns: cols } }, h('div', { class: 'tg-label' }, 'dia todo'),
    keys.map(k => {
      const cell = h('div', { class: 'tg-allday-cell' },
        tasks.holiday(k) ? h('span', { class: 'holiday' }, tasks.holiday(k)) : null,
        dayChips(k, { showWork: true }),
        eventsOn(events(), k).filter(ev => ev.allDay).map(ev => chip(ev, k)),
        tasks.sortDay(store.get('tasks').filter(t => t.date === k)).map(taskChip)
      );
      wireDrop(cell, k);
      return cell;
    }));

  const hours = h('div', { class: 'tg-hours' }, Array.from({ length: 24 }, (_, i) => h('div', { class: 'tg-hour' }, i ? `${String(i).padStart(2, '0')}:00` : '')));
  const columns = keys.map(k => {
    const col = h('div', { class: `tg-col ${k === today ? 'today' : ''} ${work.isOff(k) ? 'off' : ''}`, dataset: { date: k } });
    const hrs = work.hoursOf(k);
    // faixa do expediente atrás dos eventos
    if (hrs) col.append(h('div', { class: 'work-band', title: `Trabalho ${hrs.start}–${hrs.end}`, style: { top: `${(toMin(hrs.start) / 60) * HOUR}px`, height: `${((toMin(hrs.end) - toMin(hrs.start)) / 60) * HOUR}px` } }));
    const minutesAt = e => {
      const y = e.clientY - col.getBoundingClientRect().top;
      return Math.max(0, Math.min(24 * 60 - 15, Math.round((y / HOUR) * 60 / 15) * 15));
    };
    col.addEventListener('click', e => {
      if (e.target !== col) return;
      const s = Math.floor(minutesAt(e) / 30) * 30;
      editEvent(null, { date: k, start: fromMin(s), end: fromMin(Math.min(s + 60, 23 * 60 + 59)) });
    });
    wireDrop(col, k, { atMinutes: minutesAt });
    for (const it of layout(eventsOn(events(), k).filter(ev => !ev.allDay && ev.start))) {
      const ev = it.ev;
      const block = h('button', {
        class: 'ev-block', draggable: !ev.repeat || ev.repeat === 'none',
        style: {
          top: `${(it.s / 60) * HOUR}px`, height: `${Math.max(18, ((it.e - it.s) / 60) * HOUR - 2)}px`,
          left: `calc(${(it.lane / it.lanes) * 100}% + 2px)`, width: `calc(${100 / it.lanes}% - 4px)`,
          '--ev': COLORS[ev.color] ?? COLORS.violet
        },
        onclick: () => editEvent(ev, { date: k })
      },
        h('span', { class: 'ev-title' }, ev.repeat && ev.repeat !== 'none' ? icon('refresh-cw', 10) : null, ev.title),
        it.e - it.s >= 40 ? h('span', { class: 'ev-time' }, `${ev.start} – ${ev.end}`) : null
      );
      block.addEventListener('dragstart', e => e.dataTransfer.setData(T_EVENT, ev.id));
      col.append(block);
    }
    return col;
  });

  const body = h('div', { class: 'time-scroll' },
    h('div', { class: 'tg-body', style: { gridTemplateColumns: cols, height: `${24 * HOUR}px` } }, hours, columns));
  return h('div', { class: `time-grid days-${days}` }, head, allDay, body);
}

function renderNowLine() {
  mainEl?.querySelectorAll('.now-line').forEach(n => n.remove());
  const col = mainEl?.querySelector(`.tg-col[data-date="${dateKey()}"]`);
  if (!col) return;
  const d = new Date();
  col.append(h('div', { class: 'now-line', style: { top: `${((d.getHours() * 60 + d.getMinutes()) / 60) * HOUR}px` } }));
}

// ---------- Lateral: tarefas do dia ----------

function renderSide() {
  const today = dateKey();
  const isToday = cursor === today;
  const d = parseKey(cursor);
  const dayTasks = tasks.sortDay(store.get('tasks').filter(t => t.date === cursor));
  const late = isToday ? tasks.overdue() : [];
  const someday = store.get('tasks').filter(t => !t.date && !t.done);

  const group = (label, list, date, extra) => {
    const g = h('section', { class: 'side-group' },
      h('header', { class: 'card-head' }, h('span', { class: 'eyebrow' }, label), extra ?? null),
      h('div', { class: 'task-list' }, list.map(t => tasks.taskRow(t, { showDate: date === 'late' }))),
      date === 'late' ? null : tasks.addInput(date, date ? 'Adicionar tarefa…' : 'Ideia, pendência sem prazo…')
    );
    if (date !== 'late') wireDrop(g, date);
    return g;
  };

  fill(sideEl,
    h('div', { class: 'card side-card' },
      h('h3', { class: 'side-title' }, isToday ? 'Tarefas de hoje' : `Tarefas · ${d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}`),
      late.length ? group('Atrasadas', late, 'late',
        h('button', { class: 'btn btn-xs', onclick: () => { late.forEach(t => { t.date = today; }); store.commit('tasks'); } }, 'Mover para hoje')) : null,
      group(isToday ? 'Hoje' : 'Neste dia', dayTasks, cursor),
      group('Sem data', someday, null)
    ),
    h('p', { class: 'muted small side-hint' }, 'Arraste tarefas e eventos para outro dia ou horário. Clique num espaço vazio da grade para criar um evento.')
  );
}

// ---------- Editor de evento ----------

export function editEvent(ev, { date, start = '09:00', end = '10:00' } = {}) {
  const isNew = !ev;
  const data = ev ? { ...ev } : { title: '', date, allDay: false, start, end, color: 'violet', repeat: 'none', reminder: 10, notes: '' };

  const titleIn = h('input', { class: 'input', placeholder: 'Título do evento', value: data.title, autocomplete: 'off' });
  const dateIn = h('input', { class: 'input', type: 'date', value: ev ? ev.date : date });
  const allDayIn = h('input', { type: 'checkbox', checked: data.allDay });
  const startIn = h('input', { class: 'input', type: 'time', value: data.start ?? '09:00', step: 300 });
  const endIn = h('input', { class: 'input', type: 'time', value: data.end ?? '10:00', step: 300 });
  const times = h('div', { class: 'inline-fields' },
    h('label', { class: 'field' }, h('span', {}, 'Início'), startIn), h('label', { class: 'field' }, h('span', {}, 'Fim'), endIn));
  const syncAllDay = () => { times.hidden = allDayIn.checked; };
  allDayIn.addEventListener('change', syncAllDay);
  syncAllDay();
  startIn.addEventListener('change', () => {
    // mantém a duração ao mudar o início
    const dur = toMin(data.end ?? '10:00') - toMin(data.start ?? '09:00');
    if (startIn.value) endIn.value = fromMin(Math.min(toMin(startIn.value) + Math.max(dur, 15), 23 * 60 + 59));
    data.start = startIn.value; data.end = endIn.value;
  });

  let color = data.color;
  const swatches = h('div', { class: 'swatches sm' }, Object.entries(COLORS).map(([k, c]) => h('button', {
    type: 'button', class: `swatch ${k === color ? 'selected' : ''}`, style: { '--c': c }, 'aria-label': k,
    onclick: e => { color = k; e.currentTarget.parentNode.querySelectorAll('.swatch').forEach(b => b.classList.toggle('selected', b === e.currentTarget)); }
  })));
  const repeatIn = h('select', { class: 'input' }, Object.entries(REPEAT).map(([k, v]) => h('option', { value: k, selected: k === (data.repeat ?? 'none') }, v)));
  const reminderIn = h('select', { class: 'input' }, Object.entries(REMINDERS).map(([k, v]) => h('option', { value: k, selected: String(data.reminder ?? '') === k }, v)));
  const notesIn = h('textarea', { class: 'input textarea', placeholder: 'Local, link da reunião, observações…', rows: 3 });
  notesIn.value = data.notes ?? '';

  const recurring = ev && ev.repeat && ev.repeat !== 'none';
  const actions = [];
  if (ev) {
    actions.push({ label: recurring ? 'Excluir série' : 'Excluir', kind: 'ghost-danger', onClick: () => removeEvent(ev) });
    if (recurring) actions.push({ label: 'Excluir só este dia', kind: 'ghost-danger', onClick: () => { ev.skip = [...(ev.skip ?? []), date]; store.commit('events'); } });
  }
  const readForm = () => {
    if (!allDayIn.checked && startIn.value && endIn.value && endIn.value <= startIn.value) endIn.value = fromMin(Math.min(toMin(startIn.value) + 30, 23 * 60 + 59));
    return {
      title: titleIn.value.trim(), date: dateIn.value || date, allDay: allDayIn.checked,
      start: allDayIn.checked ? null : startIn.value || '09:00', end: allDayIn.checked ? null : endIn.value || '10:00',
      color, repeat: repeatIn.value, reminder: reminderIn.value === '' ? null : Number(reminderIn.value), notes: notesIn.value.trim()
    };
  };
  actions.push({ label: 'Cancelar' });
  if (recurring) {
    // vira um evento avulso naquele dia, e o dia sai da série
    actions.push({ label: 'Salvar só neste dia', onClick: () => {
      if (!titleIn.value.trim()) { titleIn.focus(); return false; }
      const form = readForm();
      const day = dateIn.value && dateIn.value !== ev.date ? dateIn.value : date;
      events().push({ id: uid(), createdAt: Date.now(), ...form, date: day, repeat: 'none' });
      const series = events().find(x => x.id === ev.id);
      series.skip = [...new Set([...(series.skip ?? []), date])];
      store.commit('events');
    } });
  }
  actions.push({
    label: isNew ? 'Criar' : recurring ? 'Salvar série' : 'Salvar', kind: 'primary', onClick: () => {
      if (!titleIn.value.trim()) { titleIn.focus(); return false; }
      const next = readForm();
      if (isNew) events().push({ id: uid(), createdAt: Date.now(), ...next });
      else Object.assign(events().find(x => x.id === ev.id), next);
      store.commit('events');
    }
  });

  dialog({
    title: isNew ? 'Novo evento' : 'Editar evento', className: 'dialog-wide',
    body: h('div', { class: 'fields' },
      titleIn,
      recurring ? h('p', { class: 'muted small' }, `Evento que se repete. “Salvar série” muda todas as ocorrências; “Salvar só neste dia” muda apenas ${parseKey(date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}.`) : null,
      h('div', { class: 'inline-fields' },
        h('label', { class: 'field' }, h('span', {}, 'Data'), dateIn),
        h('label', { class: 'field check-field' }, h('span', {}, 'Dia inteiro'), h('span', { class: 'switch' }, allDayIn, h('span', { class: 'switch-track' })))
      ),
      times,
      h('div', { class: 'inline-fields' },
        h('label', { class: 'field' }, h('span', {}, 'Repetir'), repeatIn),
        h('label', { class: 'field' }, h('span', {}, 'Lembrete'), reminderIn)
      ),
      h('div', { class: 'field' }, h('span', {}, 'Cor'), swatches),
      h('label', { class: 'field' }, h('span', {}, 'Notas'), notesIn)
    ),
    actions
  });
}

function removeEvent(ev) {
  const list = events();
  const index = list.findIndex(x => x.id === ev.id);
  const [removed] = list.splice(index, 1);
  store.commit('events');
  toast(`Evento “${removed.title}” excluído.`, { action: 'Desfazer', onAction: () => { events().splice(index, 0, removed); store.commit('events'); } });
}
