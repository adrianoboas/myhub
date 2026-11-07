import * as store from '../store.js';
import { h, icon, uid, clear, fill, dateKey, parseKey, addDays, toast, dialog } from '../dom.js';
import { REPEAT, nextOccurrence } from '../recur.js';

const KEEP_DONE_DAYS = 30;
export const T_TASK = 'application/x-hub-task';

const tasks = () => store.get('tasks');
const today = () => dateKey();
export const fmtShort = key => parseKey(key).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

// ---------- Feriados nacionais (fixos + móveis a partir da Páscoa) ----------

const FIXED = {
  '01-01': 'Ano Novo', '04-21': 'Tiradentes', '05-01': 'Dia do Trabalho', '09-07': 'Independência',
  '10-12': 'N. Sra. Aparecida', '11-02': 'Finados', '11-15': 'Proclamação da República',
  '11-20': 'Consciência Negra', '12-25': 'Natal'
};
const holidayCache = {};

function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), hh = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - hh - k) % 7, m = Math.floor((a + 11 * hh + 22 * l) / 451);
  const month = Math.floor((hh + l - 7 * m + 114) / 31), day = ((hh + l - 7 * m + 114) % 31) + 1;
  return dateKey(new Date(y, month - 1, day));
}

export function holiday(key) {
  const y = key.slice(0, 4);
  if (!holidayCache[y]) {
    const e = easter(+y);
    holidayCache[y] = {
      [addDays(e, -48)]: 'Carnaval', [addDays(e, -47)]: 'Carnaval',
      [addDays(e, -2)]: 'Sexta-feira Santa', [addDays(e, 60)]: 'Corpus Christi'
    };
  }
  const national = FIXED[key.slice(5)] ?? holidayCache[y][key];
  if (national) return national;
  // feriados próprios: "MM-DD" (todo ano) ou "AAAA-MM-DD" (uma vez)
  const own = store.get('workdays')?.custom?.find(c => c.date === key || c.date === key.slice(5));
  return own?.name ?? null;
}

// ---------- Dados ----------

function cleanup() {
  const limit = Date.now() - KEEP_DONE_DAYS * 86400000;
  const list = tasks();
  const kept = list.filter(t => !t.done || t.doneAt > limit);
  if (kept.length !== list.length) store.replace('tasks', kept);
}

export function addTask(text, date, repeat = 'none') {
  const value = text.trim();
  if (!value) return;
  // tarefa que se repete precisa de uma data de referência
  if (repeat !== 'none' && !date) date = today();
  tasks().push({ id: uid(), text: value, date, repeat, done: false, doneAt: null, createdAt: Date.now() });
  store.commit('tasks');
}

/**
 * Concluir uma tarefa recorrente cria a próxima ocorrência (a partir de hoje,
 * pulando as que passaram). Desmarcar remove a próxima, se ainda não foi tocada.
 */
export function toggle(id) {
  const t = tasks().find(t => t.id === id);
  t.done = !t.done;
  t.doneAt = t.done ? Date.now() : null;
  if (t.repeat && t.repeat !== 'none') {
    if (t.done && !t.nextId) {
      const from = t.date && t.date > today() ? t.date : today();
      const date = nextOccurrence({ date: t.date ?? today(), repeat: t.repeat }, from);
      if (date) {
        const next = { id: uid(), text: t.text, date, repeat: t.repeat, done: false, doneAt: null, createdAt: Date.now() };
        tasks().push(next);
        t.nextId = next.id;
      }
    } else if (!t.done && t.nextId) {
      const i = tasks().findIndex(x => x.id === t.nextId && !x.done);
      if (i !== -1) tasks().splice(i, 1);
      delete t.nextId;
    }
  }
  store.commit('tasks');
}

/** Editor completo de uma tarefa: texto, data e repetição. */
export function editTask(t) {
  const text = h('input', { class: 'input', value: t.text, autocomplete: 'off' });
  const date = h('input', { class: 'input', type: 'date', value: t.date ?? '' });
  const repeat = h('select', { class: 'input' }, Object.entries(REPEAT).map(([k, v]) => h('option', { value: k, selected: k === (t.repeat ?? 'none') }, v)));
  dialog({
    title: 'Editar tarefa',
    body: h('div', { class: 'fields' },
      text,
      h('div', { class: 'inline-fields' },
        h('label', { class: 'field' }, h('span', {}, 'Data (vazia = sem data)'), date),
        h('label', { class: 'field' }, h('span', {}, 'Repetir'), repeat))),
    actions: [
      { label: 'Excluir', kind: 'ghost-danger', onClick: () => remove(t.id) },
      { label: 'Cancelar' },
      { label: 'Salvar', kind: 'primary', onClick: () => {
        if (!text.value.trim()) { text.focus(); return false; }
        const x = tasks().find(y => y.id === t.id);
        if (!x) return;
        x.text = text.value.trim();
        x.repeat = repeat.value;
        x.date = date.value || (repeat.value !== 'none' ? today() : null);
        store.commit('tasks');
      } }
    ]
  });
}

export function setDate(id, date) {
  const t = tasks().find(t => t.id === id);
  if (!t || t.date === date) return;
  t.date = date;
  store.commit('tasks');
}

function rename(id, text) {
  const t = tasks().find(t => t.id === id);
  if (!t || !text.trim() || t.text === text.trim()) return;
  t.text = text.trim();
  store.commit('tasks');
}

export function remove(id) {
  const list = tasks();
  const index = list.findIndex(t => t.id === id);
  const [removed] = list.splice(index, 1);
  store.commit('tasks');
  toast('Tarefa excluída.', { action: 'Desfazer', onAction: () => { tasks().splice(index, 0, removed); store.commit('tasks'); } });
}

export const overdue = () => tasks().filter(t => !t.done && t.date && t.date < today());
export const onDay = key => tasks().filter(t => t.date === key && (key >= today() || t.done));

// ---------- Componentes ----------

export function taskRow(t, { showDate = false, draggable = true } = {}) {
  const text = h('span', { class: 'task-text', title: 'Duplo clique para editar' }, t.text);
  text.addEventListener('dblclick', () => {
    text.contentEditable = 'true';
    text.focus();
    getSelection().selectAllChildren(text);
  });
  text.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); text.blur(); }
    if (e.key === 'Escape') { text.textContent = t.text; text.blur(); }
  });
  text.addEventListener('blur', () => { text.contentEditable = 'false'; rename(t.id, text.textContent); });

  const row = h('div', { class: `task ${t.done ? 'done' : ''}`, draggable, dataset: { id: t.id } },
    h('button', { class: 'check', role: 'checkbox', 'aria-checked': String(t.done), 'aria-label': 'Concluir', onclick: () => toggle(t.id) }, icon('check', 12)),
    text,
    showDate && t.date && !t.done && t.date !== today() ? h('span', { class: `tag ${t.date < today() ? 'tag-warn' : ''}` }, fmtShort(t.date)) : null,
    t.repeat && t.repeat !== 'none' ? h('span', { class: 'repeat-mark', title: REPEAT[t.repeat] }, icon('repeat', 12)) : null,
    h('span', { class: 'task-tools' },
      h('button', { class: 'icon-btn sm', title: 'Editar (data, repetição)', onclick: () => editTask(t) }, icon('pencil', 13)),
      !t.done && t.date !== addDays(today(), 1)
        ? h('button', { class: 'icon-btn sm', title: 'Adiar para amanhã', onclick: () => setDate(t.id, addDays(today(), 1)) }, icon('arrow-right', 14))
        : null,
      h('button', { class: 'icon-btn sm', title: 'Excluir', onclick: () => remove(t.id) }, icon('x', 14))
    )
  );
  if (draggable) {
    row.addEventListener('dragstart', e => {
      e.dataTransfer.setData(T_TASK, t.id);
      e.dataTransfer.effectAllowed = 'move';
      requestAnimationFrame(() => row.classList.add('dragging'));
    });
    row.addEventListener('dragend', () => row.classList.remove('dragging'));
  }
  return row;
}

export function addInput(date, placeholder) {
  const input = h('input', { class: 'task-input', placeholder, autocomplete: 'off', 'aria-label': placeholder, dataset: { focusKey: 'task:' + date } });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && input.value.trim()) { addTask(input.value, date); input.value = ''; }
  });
  return input;
}

// ---------- Widget "Hoje" (Início e Mesa) ----------

const todayEls = [];
export function mountToday(el, { title = 'Hoje' } = {}) {
  if (!todayEls.length) { cleanup(); store.on('tasks', () => todayEls.forEach(renderToday)); }
  el.dataset.title = title;
  todayEls.push(el);
  renderToday(el);
}

export const focusTodayInput = () => todayEls[0]?.querySelector('.task-input')?.focus();

function renderToday(el) {
  const late = overdue();
  const list = onDay(today());
  const done = list.filter(t => t.done).length;
  const total = list.length + late.length;
  const pending = [...late, ...list.filter(t => !t.done)];

  fill(el,
    h('header', { class: 'card-head' },
      h('span', { class: 'eyebrow' }, el.dataset.title),
      total ? h('span', { class: 'muted small' }, `${done} de ${total}`) : null
    ),
    total ? h('div', { class: 'progress' }, h('span', { style: { width: `${(done / total) * 100}%` } })) : null,
    h('div', { class: 'task-list' },
      pending.map(t => taskRow(t, { showDate: true, draggable: false })),
      list.filter(t => t.done).map(t => taskRow(t, { draggable: false }))
    ),
    !total ? h('p', { class: 'muted small empty-line' }, 'Nada planejado para hoje.') : null,
    addInput(today(), 'Adicionar tarefa para hoje…')
  );
}

// pendentes primeiro, concluídas no fim
export const sortDay = list => [...list.filter(t => !t.done), ...list.filter(t => t.done)];
