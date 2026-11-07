// Mesclagem item a item entre versões de uma coleção (dois PCs editando).
//
// Cada coleção é decomposta em "unidades" (uma nota, uma tarefa, um link, a
// ordem de uma lista, um valor solto). A cada gravação, `track` compara as
// unidades com as da gravação anterior e anota quando cada uma mudou (meta.u)
// ou sumiu (meta.del, a "lápide"). Para juntar duas versões, `merge` fica,
// unidade por unidade, com a edição mais recente; exclusões só valem se forem
// mais novas que a última edição do item. Sem DOM: testável no Node.

// Como cada coleção se divide:
//   list: raiz é uma lista de itens com id (nested: lista interna também por item)
//   lists: propriedades que são listas de itens com id
//   maps: propriedades que são objetos chave → valor
//   scalars: propriedades tratadas como um valor só
//   whole: a coleção inteira é uma unidade (vence a mais recente)
export const SCHEMA = {
  boards: { list: true, nested: 'links' },
  tasks: { list: true },
  events: { list: true },
  habits: { list: true },
  birthdays: { list: true },
  readLater: { list: true },
  activity: { maps: ['days'], lists: ['limits'], scalars: ['enabled'] },
  notes: { list: true },
  brain: { lists: ['sections', 'folders', 'notes'] },
  study: { lists: ['subjects', 'topics'] },
  exams: { lists: ['list', 'sessions', 'questions', 'days', 'errors', 'mocks'], scalars: ['activeId'] },
  reading: { maps: ['done'], scalars: ['plan', 'start'] },
  workdays: { maps: ['off', 'hours'], lists: ['custom'], scalars: ['start', 'end', 'holidaysOff'] },
  stats: { maps: ['focus'] },
  settings: { whole: true },
  finance: { whole: true }
};

const TOMBSTONE_DAYS = 90;
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const idOf = (item, i) => item?.id ?? (item?.examId && item?.date ? `${item.examId}@${item.date}` : `#${i}`);

/** Decompõe os dados em unidades: Map(chave → JSON do valor). */
export function units(name, data) {
  const s = SCHEMA[name] ?? { whole: true };
  const out = new Map();
  const put = (k, v) => out.set(k, JSON.stringify(v ?? null));
  const list = (prefix, arr, nested) => {
    if (!Array.isArray(arr)) return;
    put(`${prefix}#order`, arr.map(idOf));
    arr.forEach((item, i) => {
      const id = idOf(item, i);
      if (nested && Array.isArray(item?.[nested])) {
        const { [nested]: inner, ...rest } = item;
        put(`${prefix}:${id}`, rest);
        list(`${prefix}:${id}/${nested}`, inner);
      } else put(`${prefix}:${id}`, item);
    });
  };
  if (s.whole || data == null) { put('*', data); return out; }
  if (s.list) { list('i', data, s.nested); return out; }
  for (const p of s.lists ?? []) list(p, data[p]);
  for (const p of s.maps ?? []) for (const [k, v] of Object.entries(data[p] ?? {})) put(`${p}.${k}`, v);
  for (const p of s.scalars ?? []) if (data[p] !== undefined) put(p, data[p]);
  // propriedades fora do esquema seguem como valores soltos
  if (isObj(data)) for (const p of Object.keys(data)) {
    if (![...(s.lists ?? []), ...(s.maps ?? []), ...(s.scalars ?? [])].includes(p)) put(`~${p}`, data[p]);
  }
  return out;
}

/** Remonta os dados a partir das unidades. */
export function rebuild(name, u) {
  const s = SCHEMA[name] ?? { whole: true };
  const val = k => (u.has(k) ? JSON.parse(u.get(k)) : undefined);
  const list = (prefix, nested) => {
    const order = val(`${prefix}#order`) ?? [];
    const ids = [...u.keys()].filter(k => k.startsWith(prefix + ':') && !k.slice(prefix.length + 1).includes('/')).map(k => k.slice(prefix.length + 1));
    // ordem conhecida primeiro; itens que só a outra versão tinha vão para o fim
    const sorted = [...order.filter(id => ids.includes(id)), ...ids.filter(id => !order.includes(id))];
    return sorted.map(id => {
      const item = val(`${prefix}:${id}`);
      return nested && isObj(item) ? { ...item, [nested]: list(`${prefix}:${id}/${nested}`) } : item;
    });
  };
  if (s.whole) return val('*');
  if (s.list) return list('i', s.nested);
  const out = {};
  for (const p of s.lists ?? []) if (u.has(`${p}#order`) || [...u.keys()].some(k => k.startsWith(p + ':'))) out[p] = list(p);
  for (const p of s.maps ?? []) {
    out[p] = {};
    for (const k of u.keys()) if (k.startsWith(p + '.')) out[p][k.slice(p.length + 1)] = val(k);
  }
  for (const p of s.scalars ?? []) if (u.has(p)) out[p] = val(p);
  for (const k of u.keys()) if (k.startsWith('~')) out[k.slice(1)] = val(k);
  return out;
}

/**
 * Atualiza a meta depois de uma gravação local: unidades novas ou alteradas
 * ganham u = now; as que sumiram ganham lápide.
 */
export function track(prev, next, meta = {}, now = Date.now()) {
  const m = { u: { ...meta.u }, del: { ...meta.del } };
  for (const [k, v] of next) {
    if (prev.get(k) !== v) { m.u[k] = now; delete m.del[k]; }
  }
  for (const k of prev.keys()) if (!next.has(k)) { m.del[k] = now; delete m.u[k]; }
  return prune(m, now);
}

function prune(m, now) {
  const limit = now - TOMBSTONE_DAYS * 86400000;
  for (const [k, t] of Object.entries(m.del)) if (t < limit) delete m.del[k];
  return m;
}

/**
 * Junta duas versões. a e b: { data, meta }. Retorna { data, meta }.
 * Em empate de horário, `a` (a versão local) vence.
 */
export function merge(name, a, b) {
  const ua = units(name, a.data), ub = units(name, b.data);
  const ma = { u: a.meta?.u ?? {}, del: a.meta?.del ?? {} };
  const mb = { u: b.meta?.u ?? {}, del: b.meta?.del ?? {} };
  const out = new Map();
  const meta = { u: {}, del: {} };
  for (const k of new Set([...ua.keys(), ...ub.keys()])) {
    const ta = ma.u[k] ?? 0, tb = mb.u[k] ?? 0;
    if (ua.has(k) && ub.has(k)) {
      const fromA = ta >= tb;
      out.set(k, fromA ? ua.get(k) : ub.get(k));
      meta.u[k] = Math.max(ta, tb);
    } else if (ua.has(k)) {
      if ((mb.del[k] ?? -1) >= ta) meta.del[k] = mb.del[k];
      else { out.set(k, ua.get(k)); meta.u[k] = ta; }
    } else {
      if ((ma.del[k] ?? -1) >= tb) meta.del[k] = ma.del[k];
      else { out.set(k, ub.get(k)); meta.u[k] = tb; }
    }
  }
  for (const [k, t] of [...Object.entries(ma.del), ...Object.entries(mb.del)]) {
    if (!out.has(k)) meta.del[k] = Math.max(meta.del[k] ?? 0, t);
  }
  return { data: rebuild(name, out), meta: prune(meta, Date.now()) };
}
