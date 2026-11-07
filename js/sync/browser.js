// Provedor de sincronização: storage.sync da conta do navegador.
// Limite de 8 KB por item e 100 KB no total, então cada coleção é serializada
// e fatiada em blocos (`boards.0`, `boards.1`, ...) com um item de controle
// (`boards.n` = { t, n, len }).

const ITEM_LIMIT = 8192 - 96; // folga para a chave e o JSON
const encoder = new TextEncoder();
const bytes = s => encoder.encode(JSON.stringify(s)).length;
const counts = {};
let hooks = null;
let listener = null;

function slice(str) {
  const out = [];
  let i = 0;
  while (i < str.length) {
    let lo = 1, hi = Math.min(str.length - i, ITEM_LIMIT), best = 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (bytes(str.substr(i, mid)) <= ITEM_LIMIT) { best = mid; lo = mid + 1; } else hi = mid - 1;
    }
    // não cortar um emoji (par substituto) ao meio
    const code = str.charCodeAt(i + best - 1);
    if (best > 1 && code >= 0xd800 && code <= 0xdbff) best--;
    out.push(str.substr(i, best));
    i += best;
  }
  return out;
}

function assemble(name, meta, items) {
  let str = '';
  for (let i = 0; i < meta.n; i++) {
    const part = items[`${name}.${i}`];
    if (typeof part !== 'string') return null; // blocos ainda chegando
    str += part;
  }
  if (str.length !== meta.len) return null;
  try { return { t: meta.t, data: JSON.parse(str) }; } catch { return null; }
}

export async function start(_cfg, h) {
  hooks = h;
  listener = (changes, area) => {
    if (area !== 'sync') return;
    for (const key of Object.keys(changes)) {
      if (!key.endsWith('.n') || !changes[key].newValue) continue;
      const name = key.slice(0, -2);
      const meta = changes[key].newValue;
      const keys = Array.from({ length: meta.n }, (_, i) => `${name}.${i}`);
      chrome.storage.sync.get(keys).then(items => {
        counts[name] = meta.n;
        const entry = assemble(name, meta, items);
        if (entry) hooks.onRemote(name, entry);
      });
    }
  };
  chrome.storage.onChanged.addListener(listener);
}

export function stop() {
  if (listener) chrome.storage.onChanged.removeListener(listener);
  listener = null;
}

export async function pull(stamps) {
  const all = await chrome.storage.sync.get(null);
  const meta = {}, entries = {};
  for (const key of Object.keys(all)) {
    if (!key.endsWith('.n')) continue;
    const name = key.slice(0, -2);
    meta[name] = all[key].t;
    counts[name] = all[key].n;
    if (all[key].t > (stamps[name] ?? 0)) {
      const entry = assemble(name, all[key], all);
      if (entry) entries[name] = entry;
    }
  }
  return { meta, entries };
}

export async function push(list) {
  const items = {};
  const stale = [];
  for (const { name, t, data } of list) {
    const str = JSON.stringify(data);
    const parts = slice(str);
    parts.forEach((p, i) => { items[`${name}.${i}`] = p; });
    items[name + '.n'] = { t, n: parts.length, len: str.length };
    for (let i = parts.length; i < (counts[name] ?? 0); i++) stale.push(`${name}.${i}`);
    counts[name] = parts.length;
  }
  try {
    await chrome.storage.sync.set(items);
    if (stale.length) await chrome.storage.sync.remove(stale);
  } catch (err) {
    const msg = String(err?.message || err);
    if (/QUOTA_BYTES\b/.test(msg)) {
      throw new Error('Limite de 100 KB da conta do navegador atingido. Seus dados continuam salvos neste computador. Conecte o Google Drive em Ajustes para sincronizar tudo.');
    }
    if (/WRITE_OPERATIONS/.test(msg)) throw Object.assign(new Error('Muitas gravações seguidas. A sincronização volta em instantes.'), { retry: 60000 });
    throw err;
  }
}

export async function usage() {
  return { bytes: await chrome.storage.sync.getBytesInUse(null), quota: chrome.storage.sync.QUOTA_BYTES };
}
