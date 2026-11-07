// Plano de leitura bíblica: card no Início com a leitura do dia.
// Coleção `reading`: { plan, start, done: { [índice do dia]: true } }.
// A "leitura de hoje" é o primeiro dia ainda não lido: atrasar não pula nada.

import * as store from '../store.js';
import { PLANS, dayReading, label, chapterUrl } from '../bible.js';
import { h, icon, fill, dateKey, parseKey, toast } from '../dom.js';

const r = () => store.get('reading');

export function nextDay() {
  const plan = PLANS[r().plan];
  if (!plan) return null;
  for (let d = 0; d < plan.days; d++) if (!r().done[d]) return d;
  return plan.days; // concluído
}

export function setPlan(id) {
  store.replace('reading', id ? { plan: id, start: dateKey(), done: {} } : { plan: null, start: null, done: {} });
}

export function mountCard(el) {
  const render = () => {
    const plan = PLANS[r().plan];
    el.hidden = !plan;
    if (!plan) return;
    const d = nextDay();
    const doneCount = Object.keys(r().done).length;
    const pct = Math.round((doneCount / plan.days) * 100);
    // dias de atraso em relação ao calendário do plano
    const expected = Math.min(plan.days, Math.floor((parseKey(dateKey()) - parseKey(r().start)) / 86400000) + 1);
    const behind = expected - doneCount;

    if (d >= plan.days) {
      fill(el,
        h('header', { class: 'card-head' }, h('span', { class: 'eyebrow' }, 'Leitura bíblica')),
        h('p', { class: 'reading-done' }, icon('party-popper', 16), `Plano concluído: ${plan.name}!`),
        h('button', { class: 'btn btn-xs', onclick: () => setPlan(r().plan) }, 'Recomeçar'));
      return;
    }
    const chs = dayReading(r().plan, d);
    fill(el,
      h('header', { class: 'card-head' },
        h('span', { class: 'eyebrow' }, 'Leitura de hoje'),
        h('span', { class: 'muted small' }, `dia ${d + 1} de ${plan.days}`)),
      h('div', { class: 'progress' }, h('span', { style: { width: pct + '%' } })),
      h('p', { class: 'reading-label' }, label(chs)),
      h('div', { class: 'reading-links' }, chs.map(c => h('a', { href: chapterUrl(c), target: '_blank', rel: 'noopener', title: `Ler ${c.book} ${c.ch} (ACF)` }, `${c.ab.toUpperCase()} ${c.ch}`))),
      h('div', { class: 'reading-foot' },
        h('span', { class: 'muted small' }, behind > 1 ? `${behind - 1} dia${behind > 2 ? 's' : ''} de atraso` : `${pct}% · ${plan.name}`),
        h('button', { class: 'btn btn-primary btn-xs', onclick: () => {
          r().done[d] = true;
          store.commit('reading');
          toast(`Leitura do dia ${d + 1} registrada.`, { action: 'Desfazer', onAction: () => { delete r().done[d]; store.commit('reading'); } });
        } }, icon('check', 12), 'Li')));
  };
  store.on('reading', render);
  render();
}
