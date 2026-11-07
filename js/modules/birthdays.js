// Aniversários: nome + dia/mês (ano opcional, para mostrar a idade).
// Aparecem na agenda todo ano e no Início quando caem nesta semana ou na próxima.

import * as store from '../store.js';
import { h, icon, uid, fill, dateKey, parseKey, addDays, dialog, toast } from '../dom.js';

const list = () => store.get('birthdays');
const pad = n => String(n).padStart(2, '0');

/** Aniversários que caem no dia `key`. */
export const on = key => list().filter(b => `${pad(b.month)}-${pad(b.day)}` === key.slice(5)
  // 29/02 em ano não bissexto: comemora em 28/02
  || (b.month === 2 && b.day === 29 && key.slice(5) === '02-28' && parseKey(addDays(key, 1)).getDate() === 1));

/** Idade que a pessoa completa na data, se o ano de nascimento for conhecido. */
export const ageOn = (b, key) => (b.year ? +key.slice(0, 4) - b.year : null);

/** Desta semana (domingo a sábado) até o fim da próxima, a partir de hoje. */
export function upcoming(today = dateKey()) {
  const weekStart = addDays(today, -parseKey(today).getDay());
  const end = addDays(weekStart, 13);
  const out = [];
  for (let k = weekStart; k <= end; k = addDays(k, 1)) {
    for (const b of on(k)) out.push({ b, key: k, diff: Math.round((parseKey(k) - parseKey(today)) / 86400000) });
  }
  return out;
}

export function whenLabel(diff, key) {
  if (diff === 0) return 'hoje';
  if (diff === 1) return 'amanhã';
  if (diff === -1) return 'ontem';
  const d = parseKey(key).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });
  return diff < 0 ? `foi ${d}` : d;
}

// ---------- Card do Início ----------

export function mountCard(el) {
  const render = () => {
    const items = upcoming();
    el.hidden = !items.length;
    if (!items.length) return;
    fill(el,
      h('header', { class: 'card-head' }, h('span', { class: 'eyebrow' }, 'Aniversários'),
        h('button', { class: 'icon-btn sm', title: 'Gerenciar aniversários', onclick: () => openManager() }, icon('pencil', 13))),
      h('div', { class: 'bday-list' }, items.map(({ b, key, diff }) => {
        const age = ageOn(b, key);
        return h('div', { class: `bday ${diff === 0 ? 'today' : ''} ${diff < 0 ? 'past' : ''}` },
          h('span', { class: 'bday-icon' }, icon(diff === 0 ? 'party-popper' : 'cake', 15)),
          h('span', { class: 'bday-text' },
            h('strong', {}, b.name, age ? h('span', { class: 'muted small' }, ` · ${age} anos`) : null),
            h('span', { class: 'muted small' }, whenLabel(diff, key))));
      })));
  };
  store.on('birthdays', render);
  render();
  // vira o dia com a aba aberta
  document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
}

// ---------- Cadastro ----------

export function edit(b = null, onDone) {
  const name = h('input', { class: 'input', placeholder: 'Nome', value: b?.name ?? '', autocomplete: 'off' });
  const day = h('input', { class: 'input', type: 'number', min: 1, max: 31, placeholder: 'Dia', value: b?.day ?? '' });
  const month = h('select', { class: 'input' }, Array.from({ length: 12 }, (_, i) =>
    h('option', { value: i + 1, selected: (b?.month ?? new Date().getMonth() + 1) === i + 1 }, new Date(2000, i, 1).toLocaleDateString('pt-BR', { month: 'long' }))));
  const year = h('input', { class: 'input', type: 'number', min: 1900, max: new Date().getFullYear(), placeholder: 'Ano (opcional)', value: b?.year ?? '' });
  const err = h('p', { class: 'field-error', hidden: true }, 'Confira o nome e a data.');
  const actions = [];
  if (b) actions.push({ label: 'Excluir', kind: 'ghost-danger', onClick: () => remove(b) });
  actions.push({ label: 'Cancelar' }, { label: b ? 'Salvar' : 'Adicionar', kind: 'primary', onClick: () => {
    const d = +day.value, m = +month.value, y = year.value ? +year.value : null;
    const maxDay = new Date(2000, m, 0).getDate(); // 2000 é bissexto: aceita 29/02
    if (!name.value.trim() || !d || d < 1 || d > maxDay) { err.hidden = false; return false; }
    const data = { name: name.value.trim(), day: d, month: m, year: y };
    if (b) Object.assign(list().find(x => x.id === b.id), data);
    else list().push({ id: uid(), ...data });
    store.commit('birthdays');
    onDone?.();
  } });
  dialog({
    title: b ? 'Editar aniversário' : 'Novo aniversário',
    body: h('div', { class: 'fields' },
      name,
      h('div', { class: 'bday-date' }, day, month, year),
      err),
    actions
  });
}

function remove(b) {
  const index = list().findIndex(x => x.id === b.id);
  const [removed] = list().splice(index, 1);
  store.commit('birthdays');
  toast(`Aniversário de ${removed.name} excluído.`, { action: 'Desfazer', onAction: () => { list().splice(index, 0, removed); store.commit('birthdays'); } });
}

/** Lista completa, ordenada pelo próximo aniversário. */
export function openManager() {
  const host = h('div', { class: 'bday-manager' });
  const draw = () => {
    const today = dateKey();
    const next = b => {
      const y = +today.slice(0, 4);
      let k = `${y}-${pad(b.month)}-${pad(b.day)}`;
      if (k < today) k = `${y + 1}-${pad(b.month)}-${pad(b.day)}`;
      return k;
    };
    const items = [...list()].sort((a, b) => next(a).localeCompare(next(b)));
    fill(host,
      h('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: () => edit() }, icon('plus', 14), 'Adicionar aniversário'),
      items.length ? h('div', { class: 'bday-list' }, items.map(b => {
        const k = next(b);
        const diff = Math.round((parseKey(k) - parseKey(today)) / 86400000);
        return h('button', { type: 'button', class: 'bday row', onclick: () => edit(b) },
          h('span', { class: 'bday-icon' }, icon('cake', 15)),
          h('span', { class: 'bday-text' },
            h('strong', {}, b.name),
            h('span', { class: 'muted small' }, `${pad(b.day)}/${pad(b.month)}${b.year ? `/${b.year}` : ''}`)),
          h('span', { class: 'muted small' }, diff === 0 ? 'hoje' : diff === 1 ? 'amanhã' : `em ${diff} dias`));
      })) : h('p', { class: 'muted small' }, 'Nenhum aniversário cadastrado. Dica: na Mesa, escreva “aniversário da Ana 15/03”.'));
  };
  const off = store.on('birthdays', draw);
  draw();
  const d = dialog({ title: 'Aniversários', className: 'dialog-wide', body: host, actions: [{ label: 'Fechar', kind: 'primary' }] });
  d.el.addEventListener('close', off);
}
