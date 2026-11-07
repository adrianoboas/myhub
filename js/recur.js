// Recorrência de eventos da agenda. Sem DOM: também é usado pelo service
// worker para agendar lembretes.

const pad = n => String(n).padStart(2, '0');
export const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };

export const REPEAT = {
  none: 'Não repete',
  daily: 'Todos os dias',
  weekdays: 'Dias úteis (seg a sex)',
  weekly: 'Toda semana',
  monthly: 'Todo mês',
  yearly: 'Todo ano'
};

/** O evento acontece no dia `key` (YYYY-MM-DD)? */
export function occursOn(ev, key) {
  if (key < ev.date) return false;
  if (ev.until && key > ev.until) return false;
  if (ev.skip?.includes(key)) return false;
  const a = parse(ev.date), b = parse(key);
  switch (ev.repeat ?? 'none') {
    case 'none': return key === ev.date;
    case 'daily': return true;
    case 'weekdays': return b.getDay() > 0 && b.getDay() < 6;
    case 'weekly': return a.getDay() === b.getDay();
    case 'monthly': return a.getDate() === b.getDate();
    case 'yearly': return a.getDate() === b.getDate() && a.getMonth() === b.getMonth();
    default: return false;
  }
}

/** Eventos do dia, dia inteiro primeiro e depois por horário. */
export function eventsOn(events, key) {
  return events.filter(ev => occursOn(ev, key)).sort((x, y) =>
    (x.allDay ? 0 : 1) - (y.allDay ? 0 : 1) || (x.start ?? '').localeCompare(y.start ?? ''));
}

/** Próximas ocorrências com horário dentro da janela [from, to) em ms. */
export function upcoming(events, from, to) {
  const out = [];
  const day = new Date(from);
  day.setHours(0, 0, 0, 0);
  for (; day.getTime() < to; day.setDate(day.getDate() + 1)) {
    const key = keyOf(day);
    for (const ev of events) {
      if (!occursOn(ev, key)) continue;
      const [hh, mm] = ev.allDay || !ev.start ? [9, 0] : ev.start.split(':').map(Number);
      const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hh, mm).getTime();
      if (at >= from && at < to) out.push({ ev, key, at });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

/** Próxima data (depois de `after`) em que uma regra com âncora `date` acontece. */
export function nextOccurrence(rule, after) {
  const d = new Date(+after.slice(0, 4), +after.slice(5, 7) - 1, +after.slice(8, 10));
  for (let i = 0; i < 800; i++) {
    d.setDate(d.getDate() + 1);
    const k = keyOf(d);
    if (occursOn(rule, k)) return k;
  }
  return null;
}
