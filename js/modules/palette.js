// Busca global (Ctrl+K): encontra links, notas, tarefas, eventos, temas de
// estudo e itens para ler depois, e executa comandos ("nova nota", "abrir
// finanças"...). Navegação pelo teclado; Enter executa.

import * as store from '../store.js';
import { eventsOn } from '../recur.js';
import { h, icon, fill, dateKey, addDays, parseKey, hostname, faviconUrl } from '../dom.js';

const fold = s => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const MAX = 40;

let overlay, input, list, items = [], active = 0;
let actions = {}; // ações injetadas pelo main.js (navegar, abrir nota...)

export function mount(hooks) {
  actions = hooks;
  input = h('input', { class: 'pal-input', placeholder: 'Buscar no Hub ou digitar um comando…', autocomplete: 'off', spellcheck: false, 'aria-label': 'Buscar' });
  list = h('div', { class: 'pal-list', role: 'listbox' });
  overlay = h('div', { class: 'pal', hidden: true, role: 'dialog', 'aria-label': 'Busca global' },
    h('div', { class: 'pal-box' },
      h('div', { class: 'pal-head' }, icon('search', 18), input, h('kbd', {}, 'Esc')),
      list,
      h('div', { class: 'pal-foot' }, h('span', {}, h('kbd', {}, '↑↓'), ' navegar'), h('span', {}, h('kbd', {}, 'Enter'), ' abrir'), h('span', {}, 'busca em links, notas, tarefas, eventos, estudos e ler depois'))));
  overlay.addEventListener('mousedown', e => { if (e.target === overlay) close(); });
  input.addEventListener('input', () => { active = 0; search(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!items.length) return;
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      paint();
    } else if (e.key === 'Enter') { e.preventDefault(); run(items[active]); }
  });
  document.body.append(overlay);
  addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); overlay.hidden ? open() : close(); }
  }, true);
}

export function open(q = '') {
  overlay.hidden = false;
  input.value = q;
  active = 0;
  search();
  input.focus();
}

function close() { overlay.hidden = true; }

function run(item) {
  if (!item) return;
  close();
  item.run();
}

// ---------- Fontes ----------

function commands() {
  const go = (label, route, ic, words = '') => ({ group: 'Ir para', label, icon: ic, words, run: () => actions.show(route) });
  return [
    go('Início', 'inicio', 'house'), go('Mesa', 'workspace/mesa', 'layout-grid', 'workspace'), go('Agenda', 'workspace/agenda', 'calendar', 'calendario'),
    go('Cérebro', 'workspace/cerebro', 'brain', 'notas'), go('Studyspace', 'study', 'library', 'estudos'), go('Concursos', 'concursos', 'trophy'),
    go('Finanças', 'financas', 'wallet', 'dinheiro contas'),
    go('Atividade', 'atividade', 'activity', 'tempo de tela limites sites bloqueio'),
    { group: 'Comandos', label: 'Nova nota', icon: 'pen-line', run: actions.newNote },
    { group: 'Comandos', label: 'Novo evento', icon: 'calendar-days', words: 'compromisso', run: actions.newEvent },
    { group: 'Comandos', label: 'Nova tarefa para hoje', icon: 'list-todo', run: actions.newTask },
    { group: 'Comandos', label: 'Resumo do dia', icon: 'sun', words: 'bom dia manha', run: actions.brief },
    { group: 'Comandos', label: 'Revisão semanal', icon: 'chart-bar', words: 'semana balanco', run: actions.weekly },
    { group: 'Comandos', label: 'Escala de trabalho', icon: 'briefcase', words: 'folga', run: actions.schedule },
    { group: 'Comandos', label: 'Aniversários', icon: 'cake', run: actions.birthdays },
    { group: 'Comandos', label: 'Ler depois', icon: 'book-open', words: 'artigos', run: actions.readLater },
    { group: 'Comandos', label: 'Modo repouso', icon: 'moon', run: actions.rest },
    { group: 'Comandos', label: 'Ajustes', icon: 'settings', words: 'configuracoes', run: actions.settings }
  ];
}

function sources(q) {
  const out = [];
  for (const b of store.get('boards')) for (const l of b.links) {
    out.push({ group: 'Links', label: l.name, sub: `${hostname(l.url)} · ${b.name}`, favicon: l.url, words: l.url, run: () => { location.href = l.url; } });
  }
  for (const n of actions.notes()) {
    out.push({ group: 'Notas', label: n.title.trim() || n.content.split('\n')[0].slice(0, 60) || 'Sem título', sub: n.content.replace(/\s+/g, ' ').slice(0, 80), icon: 'notebook-pen', words: n.content, run: () => actions.openNote(n) });
  }
  for (const t of store.get('tasks').filter(t => !t.done)) {
    out.push({ group: 'Tarefas', label: t.text, sub: t.date ? parseKey(t.date).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }) : 'sem data', icon: 'circle-check', run: () => actions.editTask(t) });
  }
  const today = dateKey();
  for (let i = 0; i < 60; i++) {
    const k = addDays(today, i);
    for (const ev of eventsOn(store.get('events'), k)) {
      if (i > 0 && ev.repeat && ev.repeat !== 'none') continue; // repetidos: só a próxima
      out.push({ group: 'Eventos', label: ev.title, sub: `${parseKey(k).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}${ev.start ? ' · ' + ev.start : ''}`, icon: 'calendar', words: ev.notes, run: () => actions.openDay(k) });
    }
  }
  for (const t of store.get('study').topics) {
    out.push({ group: 'Estudos', label: t.title, sub: store.get('study').subjects.find(s => s.id === t.subjectId)?.name, icon: 'book-open', words: t.summary, run: () => actions.show('study') });
  }
  for (const r of store.get('readLater').filter(r => !r.read)) {
    out.push({ group: 'Ler depois', label: r.title, sub: `${hostname(r.url)}${r.minutes ? ` · ${r.minutes} min` : ''}`, favicon: r.url, words: r.url, run: () => { location.href = r.url; } });
  }
  // todas as palavras da busca precisam aparecer no item
  const terms = fold(q).split(/\s+/).filter(Boolean);
  const match = it => { const hay = fold(`${it.label} ${it.sub ?? ''} ${it.words ?? ''} ${it.group}`); return terms.every(t => hay.includes(t)); };
  const cmds = commands().filter(match);
  const found = out.filter(match).sort((a, b) => (fold(b.label).startsWith(terms[0]) - fold(a.label).startsWith(terms[0])));
  return [...cmds, ...found].slice(0, MAX);
}

function search() {
  const q = input.value.trim();
  items = q ? sources(q) : commands();
  paint();
}

function paint() {
  let lastGroup = null;
  fill(list, items.length ? items.flatMap((it, i) => {
    const row = h('button', {
      class: `pal-item ${i === active ? 'active' : ''}`, role: 'option', 'aria-selected': String(i === active),
      onmousemove: () => { if (active !== i) { active = i; paint(); } },
      onclick: () => run(it)
    },
      h('span', { class: 'pal-icon' }, it.favicon ? h('img', { src: faviconUrl(it.favicon), alt: '', width: 16, height: 16 }) : icon(it.icon ?? 'arrow-right', 15)),
      h('span', { class: 'pal-text' }, h('span', { class: 'pal-label' }, it.label), it.sub ? h('span', { class: 'pal-sub' }, it.sub) : null));
    const head = it.group !== lastGroup ? h('div', { class: 'pal-group' }, it.group) : null;
    lastGroup = it.group;
    return [head, row];
  }) : h('p', { class: 'pal-empty' }, 'Nada encontrado.'));
  list.querySelector('.pal-item.active')?.scrollIntoView({ block: 'nearest' });
}
