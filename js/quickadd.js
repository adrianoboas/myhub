// Interpreta a barra de entrada da Mesa (pt-BR):
//   "Reunião com João amanhã 15h-16h30"  -> evento
//   "Pagar boleto sexta"                 -> tarefa na sexta
//   "> ideia solta" ou "nota: ..."       -> nota na Caixa de entrada
//   "hábito: ler 20 páginas"             -> hábito
// Sem DOM: dá para testar isolado.

import { dateKey, parseKey, addDays, fromMin } from './dom.js';
import { REPEAT } from './recur.js';

// \b do JS não entende acentos: bordas de palavra feitas à mão
const L = '(?<![\\p{L}\\d])';
const R = '(?![\\p{L}\\d])';
const re = (src, flags = 'iu') => new RegExp(src, flags);

const WEEKDAYS = { domingo: 0, segunda: 1, terca: 2, 'terça': 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6, 'sábado': 6 };
const CONNECTORS = '(?:às|as|a|de|do|da|dia|no|na|em|para|pra|até|ate|das)';

export function parse(raw, today = dateKey()) {
  let s = raw.trim();
  if (!s) return null;
  if (/^(>|nota:)/i.test(s)) return { kind: 'note', text: s.replace(/^(>|nota:)\s*/i, '') };
  if (/^h[áa]bito:/i.test(s)) return { kind: 'habit', text: cap(s.replace(/^h[áa]bito:\s*/i, '').trim()) };
  // "aniversário da Ana 15/03", "niver do João 2/7/1990"
  const bday = s.match(/^(?:anivers[áa]rio|niver)\s+(?:d[aeo]s?\s+)?(.+?)\s+(?:em\s+|dia\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/i);
  if (bday) {
    const day = +bday[2], month = +bday[3];
    if (month >= 1 && month <= 12 && day >= 1 && day <= new Date(2000, month, 0).getDate()) {
      return { kind: 'birthday', name: cap(bday[1].trim()), day, month, year: bday[4] ? +bday[4] : null };
    }
  }

  let date;
  let start = null, end = null;
  let repeat = 'none';
  const take = (pattern, fn) => {
    const m = s.match(pattern);
    if (!m) return false;
    if (fn(m) === false) return false;
    s = `${s.slice(0, m.index)} ${s.slice(m.index + m[0].length)}`;
    return true;
  };

  // ---- repetição (antes das datas: "toda segunda" não é "segunda que vem") ----
  take(re(`${L}(?:todos os dias|todo dia|diariamente)${R}(?!\\s+\\d)`), () => { repeat = 'daily'; }) ||
  take(re(`${L}(?:dias úteis|dias uteis|de segunda a sexta)${R}`), () => { repeat = 'weekdays'; }) ||
  take(re(`${L}tod[ao]s?\\s+(?:as?\\s+|os?\\s+)?(domingo|segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado)s?(?:-feiras?)?${R}`), m => {
    repeat = 'weekly';
    const target = WEEKDAYS[m[1].toLowerCase()];
    date = addDays(today, (target - parseKey(today).getDay() + 7) % 7);
  }) ||
  take(re(`${L}(?:toda semana|todas as semanas|semanalmente)${R}`), () => { repeat = 'weekly'; }) ||
  take(re(`${L}todo dia\\s+(\\d{1,2})${R}`), m => {
    const d = +m[1];
    if (d < 1 || d > 31) return false;
    repeat = 'monthly';
    const t = parseKey(today);
    let k = dateKey(new Date(t.getFullYear(), t.getMonth(), d));
    if (k < today || parseKey(k).getDate() !== d) k = dateKey(new Date(t.getFullYear(), t.getMonth() + 1, d));
    date = k;
  }) ||
  take(re(`${L}(?:todo mês|todo mes|todos os meses|mensalmente)${R}`), () => { repeat = 'monthly'; }) ||
  take(re(`${L}(?:todo ano|todos os anos|anualmente)${R}`), () => { repeat = 'yearly'; });

  // ---- data ----
  if (date === undefined) take(re(`${L}(sem data|algum dia)${R}`), () => { date = null; }) ||
  take(re(`${L}depois de amanh[ãa]${R}`), () => { date = addDays(today, 2); }) ||
  take(re(`${L}amanh[ãa]${R}`), () => { date = addDays(today, 1); }) ||
  take(re(`${L}hoje${R}`), () => { date = today; }) ||
  take(re(`${L}(?:(?:na|no|nesta|neste|pr[óo]xim[ao]|esta|este)\\s+)?(domingo|segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado)(?:-feira)?${R}`), m => {
    const target = WEEKDAYS[m[1].toLowerCase()];
    const diff = (target - parseKey(today).getDay() + 7) % 7 || 7; // sempre o próximo
    date = addDays(today, diff);
  }) ||
  take(re(`${L}(?:dia\\s+)?(\\d{1,2})/(\\d{1,2})(?:/(\\d{2,4}))?${R}`), m => {
    const d = +m[1], mo = +m[2];
    if (d < 1 || d > 31 || mo < 1 || mo > 12) return false;
    const t = parseKey(today);
    let y = m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : t.getFullYear();
    // datas impossíveis (31/02) não "transbordam" para o mês seguinte
    if (new Date(2000, mo, 0).getDate() < d) return false;
    let k = dateKey(new Date(y, mo - 1, d));
    if (!m[3] && k < today) k = dateKey(new Date(y + 1, mo - 1, d));
    date = k;
  }) ||
  take(re(`${L}dia\\s+(\\d{1,2})${R}`), m => {
    const d = +m[1];
    if (d < 1 || d > 31) return false;
    const t = parseKey(today);
    let k = dateKey(new Date(t.getFullYear(), t.getMonth(), d));
    if (k < today) k = dateKey(new Date(t.getFullYear(), t.getMonth() + 1, d));
    date = k;
  });

  // ---- horário: "15h", "15h30", "15:30", "das 9h às 10h", "15h-16h30" ----
  const T = '(\\d{1,2})(?::(\\d{2})|h(\\d{2})?)';
  take(re(`${L}(?:(?:às|as|das)\\s+)?${T}(?:\\s*(?:-|–|até|ate|às|as|a)\\s*${T})?${R}`), m => {
    const toM = (hh, m1, m2) => { const hNum = +hh, mNum = +(m1 ?? m2 ?? 0); return hNum > 23 || mNum > 59 ? null : hNum * 60 + mNum; };
    const a = toM(m[1], m[2], m[3]);
    if (a == null) return false;
    const b = m[4] != null ? toM(m[4], m[5], m[6]) : null;
    start = a;
    end = b != null && b > a ? b : Math.min(a + 60, 23 * 60 + 59);
  });

  // ---- título: tira conectores que sobraram nas pontas ----
  let title = s.replace(/\s+/g, ' ').trim();
  for (let i = 0; i < 3; i++) {
    title = title.replace(re(`^${CONNECTORS}\\s+`), '').replace(re(`\\s+${CONNECTORS}$`), '').trim();
  }
  title = cap(title);
  if (!title) return null;

  if (start != null) return { kind: 'event', title, date: date ?? today, start: fromMin(start), end: fromMin(end), repeat };
  return { kind: 'task', text: title, date: date === undefined ? today : date ?? (repeat !== 'none' ? today : null), repeat };
}

const cap = t => t ? t[0].toUpperCase() + t.slice(1) : t;

const rep = p => (p.repeat && p.repeat !== 'none' ? ` · ${REPEAT[p.repeat].toLowerCase()}` : '');

/** Descrição curta para a prévia: "Evento · qui., 05/11 · 15:00–16:00". */
export function describe(p, today = dateKey()) {
  if (!p) return '';
  const day = k => k === today ? 'hoje' : k === addDays(today, 1) ? 'amanhã'
    : parseKey(k).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
  switch (p.kind) {
    case 'note': return 'Nota · vai para a Caixa de entrada do Cérebro';
    case 'habit': return 'Hábito · aparece todos os dias na Mesa';
    case 'birthday': return `Aniversário · ${p.name} · ${String(p.day).padStart(2, '0')}/${String(p.month).padStart(2, '0')}${p.year ? '/' + p.year : ''} · todo ano`;
    case 'event': return `Evento · ${day(p.date)} · ${p.start}–${p.end}${rep(p)}`;
    default: return `Tarefa · ${p.date ? day(p.date) : 'sem data'}${rep(p)}`;
  }
}
