// Escala de trabalho: folgas e horário de cada dia.
// Todo dia é de trabalho no horário padrão (06:00–15:48), a menos que esteja
// marcado como folga ou tenha um horário próprio.

import * as store from '../store.js';
import { h, icon, uid, fill, dateKey, parseKey, addDays, monthKey, addMonths, monthLabel, dialog, segmented, toMin } from '../dom.js';
import { holiday } from './tasks.js';

const w = () => store.get('workdays');

/** Folga se marcada; sem marcação, feriado vira folga quando a opção está ligada. */
const holidayDefault = key => !!(w().holidaysOff && holiday(key));
export const isOff = key => (key in w().off ? !!w().off[key] : holidayDefault(key));

/** Marca ou desmarca folga guardando só o que difere do padrão do dia. */
function setOff(key, value) {
  if (value === holidayDefault(key)) delete w().off[key]; else w().off[key] = value;
  if (value) delete w().hours[key];
}

/** Horário de trabalho do dia, ou null se for folga. */
export function hoursOf(key) {
  if (isOff(key)) return null;
  return w().hours[key] ?? { start: w().start, end: w().end };
}

export const isCustom = key => !!w().hours[key] && !isOff(key);

function nextWhere(from, test) {
  for (let i = 1; i <= 366; i++) {
    const k = addDays(from, i);
    if (test(k)) return { key: k, days: i };
  }
  return null;
}

/** Situação de hoje para o Início e a Mesa. */
export function status(key = dateKey()) {
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  if (isOff(key)) {
    const back = nextWhere(key, k => !isOff(k));
    return { kind: 'off', label: 'Dia de folga', detail: back ? (back.days === 1 ? 'Volta ao trabalho amanhã' : `Volta ao trabalho em ${back.days} dias`) : '' };
  }
  const hrs = hoursOf(key);
  const next = nextWhere(key, isOff);
  const phase = mins < toMin(hrs.start) ? `começa às ${hrs.start}` : mins < toMin(hrs.end) ? `até ${hrs.end}` : `encerrado às ${hrs.end}`;
  const detail = !next ? 'Nenhuma folga marcada na escala'
    : next.days === 1 ? 'Sua próxima folga é amanhã'
      : `Faltam ${next.days} dias para a próxima folga (${parseKey(next.key).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })})`;
  return { kind: 'work', label: 'Dia de trabalho', hours: `${hrs.start}–${hrs.end}`, phase, detail, noneMarked: !next };
}

// ---------- Editor da escala do mês ----------

export function openSchedule(startMonth = monthKey()) {
  let month = startMonth;
  let mode = 'off';
  let selected = null;
  const host = h('div', { class: 'schedule' });

  const defStart = h('input', { class: 'input input-sm', type: 'time', value: w().start });
  const defEnd = h('input', { class: 'input input-sm', type: 'time', value: w().end });
  const saveDefault = () => {
    if (!defStart.value || !defEnd.value || defEnd.value <= defStart.value) return;
    w().start = defStart.value; w().end = defEnd.value; store.commit('workdays'); draw();
  };
  defStart.addEventListener('change', saveDefault);
  defEnd.addEventListener('change', saveDefault);

  const toggleOff = k => { setOff(k, !isOff(k)); store.commit('workdays'); };

  const draw = () => {
    const first = parseKey(month + '-01');
    const start = addDays(dateKey(first), -first.getDay());
    const today = dateKey();
    const days = [];
    for (let i = 0; i < 42; i++) days.push(addDays(start, i));
    const inMonth = days.filter(k => k.startsWith(month));
    const offCount = inMonth.filter(isOff).length;

    const grid = h('div', { class: 'sch-grid' }, ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'].map(d => h('span', { class: 'sch-dow' }, d)),
      days.map(k => {
        const other = !k.startsWith(month);
        const off = isOff(k);
        const hrs = hoursOf(k);
        return h('button', {
          type: 'button', disabled: other,
          class: `sch-day ${off ? 'off' : 'work'} ${other ? 'other' : ''} ${k === today ? 'today' : ''} ${isCustom(k) ? 'custom' : ''} ${k === selected ? 'selected' : ''}`,
          title: holiday(k) ?? '',
          onclick: () => {
            if (mode === 'off') toggleOff(k);
            else if (!off) { selected = k; draw(); }
          }
        },
          h('span', { class: 'sch-num' }, parseKey(k).getDate()),
          off ? h('span', { class: 'sch-label' }, icon('tree-palm', 12), 'Folga') : h('span', { class: 'sch-label' }, `${hrs.start}–${hrs.end}`),
          holiday(k) ? h('span', { class: 'sch-holiday' }, '•') : null);
      }));

    let editor = null;
    if (mode === 'hours') {
      if (selected && !isOff(selected)) {
        const hrs = hoursOf(selected);
        const s = h('input', { class: 'input input-sm', type: 'time', value: hrs.start });
        const e = h('input', { class: 'input input-sm', type: 'time', value: hrs.end });
        const apply = () => {
          if (!s.value || !e.value || e.value <= s.value) return;
          if (s.value === w().start && e.value === w().end) delete w().hours[selected];
          else w().hours[selected] = { start: s.value, end: e.value };
          store.commit('workdays');
        };
        s.addEventListener('change', apply);
        e.addEventListener('change', apply);
        editor = h('div', { class: 'sch-editor' },
          h('strong', {}, parseKey(selected).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })),
          s, h('span', { class: 'muted' }, 'às'), e,
          isCustom(selected) ? h('button', { type: 'button', class: 'btn btn-sm', onclick: () => { delete w().hours[selected]; store.commit('workdays'); } }, 'Usar padrão') : null);
      } else {
        editor = h('p', { class: 'muted small' }, 'Clique num dia de trabalho para ajustar o horário dele.');
      }
    }

    fill(host,
      h('div', { class: 'sch-top' },
        h('div', { class: 'agenda-nav' },
          h('button', { type: 'button', class: 'icon-btn sm', onclick: () => { month = addMonths(month, -1); selected = null; draw(); } }, icon('chevron-left', 15)),
          h('strong', { class: 'month-name' }, monthLabel(month)),
          h('button', { type: 'button', class: 'icon-btn sm', onclick: () => { month = addMonths(month, 1); selected = null; draw(); } }, icon('chevron-right', 15))),
        segmented([{ value: 'off', label: 'Marcar folgas', icon: 'tree-palm' }, { value: 'hours', label: 'Ajustar horários', icon: 'clock' }], mode, v => { mode = v; draw(); })),
      h('p', { class: 'muted small' }, mode === 'off'
        ? 'Clique nos dias para marcar ou desmarcar folga. Os demais são dias de trabalho.'
        : 'Escolha um dia para definir um horário diferente do padrão.'),
      grid,
      editor,
      h('div', { class: 'sch-footer' },
        h('span', { class: 'muted small' }, `${offCount} folga${offCount === 1 ? '' : 's'} · ${inMonth.length - offCount} dias de trabalho em ${monthLabel(month).toLowerCase()}`),
        h('span', { class: 'spacer' }),
        h('button', { type: 'button', class: 'btn btn-xs', onclick: () => {
          const weekend = inMonth.filter(k => [0, 6].includes(parseKey(k).getDay()));
          const allOff = weekend.every(isOff);
          weekend.forEach(k => setOff(k, !allOff));
          store.commit('workdays');
        } }, 'Fins de semana'),
        h('button', { type: 'button', class: 'btn btn-xs', onclick: () => { inMonth.forEach(k => { delete w().off[k]; delete w().hours[k]; }); store.commit('workdays'); } }, 'Limpar mês')),
      h('div', { class: 'sch-default' },
        h('span', {}, 'Horário padrão dos dias de trabalho'), defStart, h('span', { class: 'muted' }, 'às'), defEnd),
      holidaysBlock()
    );
  };

  // ---- feriados ----
  const holidaysBlock = () => {
    const custom = w().custom ?? [];
    const name = h('input', { class: 'input input-sm', placeholder: 'Feriado (ex.: Aniversário da cidade)', autocomplete: 'off' });
    const date = h('input', { class: 'input input-sm', type: 'date' });
    const yearly = h('input', { type: 'checkbox', checked: true });
    const add = () => {
      if (!name.value.trim() || !date.value) { name.focus(); return; }
      w().custom = [...custom, { id: uid(), name: name.value.trim(), date: yearly.checked ? date.value.slice(5) : date.value }];
      store.commit('workdays');
    };
    const fmt = c => c.date.length === 5 ? `${c.date.slice(3)}/${c.date.slice(0, 2)} · todo ano` : parseKey(c.date).toLocaleDateString('pt-BR');
    return h('div', { class: 'sch-holidays' },
      h('label', { class: 'toggle-row' },
        h('span', {}, h('span', {}, 'Feriados contam como folga'), h('span', { class: 'muted small' }, 'Nacionais e os seus. Para trabalhar num feriado, desmarque o dia.')),
        h('span', { class: 'switch' }, h('input', { type: 'checkbox', checked: !!w().holidaysOff, onchange: e => { w().holidaysOff = e.target.checked; store.commit('workdays'); } }), h('span', { class: 'switch-track' }))),
      custom.length ? h('div', { class: 'sch-custom' }, custom.map(c => h('span', { class: 'tag' }, `${c.name} · ${fmt(c)}`,
        h('button', { type: 'button', class: 'tag-x', title: 'Remover', onclick: () => { w().custom = custom.filter(x => x.id !== c.id); store.commit('workdays'); } }, icon('x', 10))))) : null,
      h('div', { class: 'sch-add-holiday' }, name, date, h('label', { class: 'check-inline' }, yearly, 'todo ano'),
        h('button', { type: 'button', class: 'btn btn-sm', onclick: add }, icon('plus', 13), 'Feriado')));
  };

  const off = store.on('workdays', draw);
  draw();
  const d = dialog({ title: 'Escala de trabalho', className: 'dialog-wide dialog-schedule', body: host, actions: [{ label: 'Pronto', kind: 'primary' }] });
  d.el.addEventListener('close', off);
}
