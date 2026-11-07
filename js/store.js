// Camada de dados do Hub.
//
// storage.local é a fonte da verdade (sem limite prático, gravada a cada
// mudança). Um provedor de sincronização replica as coleções entre PCs:
//  - browser: storage.sync da conta do navegador (100 KB no total);
//  - drive: pasta oculta do app no Google Drive do usuário.
// Se este PC e a nuvem mudaram desde a última sincronização, as duas versões são
// mescladas item a item (js/merge.js): nada criado em um PC se perde por causa do outro.
// Fora da extensão (versão web, no tablet) guarda no localStorage e sincroniza
// só pelo Google Drive (o login volta para a página: drive.consumeRedirect).

import { DEFAULTS } from './seeds.js';
import * as browserSync from './sync/browser.js';
import * as driveSync from './sync/drive.js';
import { units, track, merge } from './merge.js';

const ext = typeof chrome !== 'undefined' && !!chrome.storage?.local;
const PROVIDERS = { browser: browserSync, drive: driveSync };

export const COLLECTIONS = Object.keys(DEFAULTS);

const state = {};
const stamps = {};
const metas = {};      // quando cada item mudou e lápides das exclusões (merge.js)
const prevUnits = {};  // unidades da última gravação, para descobrir o que mudou
let base = {};         // carimbo da última versão em comum com a nuvem, por coleção
const listeners = new Map();
const dirty = new Set();
let provider = null;
let flushTimer = null;
let flushDeadline = 0;

export const syncInfo = { provider: null, status: 'ok', message: '', bytes: 0, quota: 0, lastSync: 0 };
/** Versão web: resultado da volta do login do Google, se a página acabou de voltar de lá. */
export let authResult = null;
const DEFAULT_CFG = ext ? { provider: 'browser' } : { provider: 'none' };

const clone = v => JSON.parse(JSON.stringify(v));
const isPlain = v => v && typeof v === 'object' && !Array.isArray(v);

function withDefaults(name, value) {
  const d = DEFAULTS[name];
  if (value == null) return d == null ? null : clone(d);
  if (name === 'settings') {
    const base = clone(d);
    return { ...base, ...value, widgets: { ...base.widgets, ...value.widgets } };
  }
  // coleções-objeto ganham campos novos sem perder os existentes
  return isPlain(d) && isPlain(value) ? { ...clone(d), ...value } : value;
}

// ---------- API pública ----------

export const get = name => state[name];

/** Marca a coleção como alterada (depois de mutá-la) e persiste. */
export function commit(name) {
  const now = Date.now();
  const next = units(name, state[name]);
  metas[name] = track(prevUnits[name] ?? new Map(), next, metas[name], now);
  prevUnits[name] = next;
  stamps[name] = now;
  writeLocal(name);
  queueSync(name);
  emit(name, 'self');
}

export function replace(name, value) {
  state[name] = withDefaults(name, value);
  commit(name);
}

/** Inscreve em mudanças de uma coleção. Retorna a função de cancelamento. */
export function on(name, fn) {
  if (!listeners.has(name)) listeners.set(name, new Set());
  listeners.get(name).add(fn);
  return () => listeners.get(name).delete(fn);
}

function emit(name, origin) {
  listeners.get(name)?.forEach(fn => fn(state[name], origin));
}

export function exportAll() {
  return { app: 'hub', version: 2, exportedAt: new Date().toISOString(), data: Object.fromEntries(COLLECTIONS.map(n => [n, state[n]])) };
}

// Valores só deste computador (cache do clima, timer, configuração de sync).
export const local = {
  async get(key) {
    if (ext) return (await chrome.storage.local.get(key))[key];
    try { return JSON.parse(localStorage.getItem('hub-local:' + key)); } catch { return undefined; }
  },
  async set(key, value) {
    if (ext) return chrome.storage.local.set({ [key]: value });
    try { localStorage.setItem('hub-local:' + key, JSON.stringify(value)); } catch {}
  }
};

// ---------- Inicialização ----------

export async function init() {
  authResult = ext ? null : await driveSync.consumeRedirect();
  if (authResult?.ok && authResult.pending?.cfg) {
    // conectou agora: outro provedor, nada em comum ainda; a primeira troca mescla tudo
    await local.set('syncConfig', authResult.pending.cfg);
    await local.set('syncBase', {});
  }
  const saved = await readAllLocal();
  for (const name of COLLECTIONS) {
    state[name] = withDefaults(name, saved[name]?.data);
    stamps[name] = saved[name]?.t ?? 0;
    metas[name] = saved[name]?.meta ?? { u: {}, del: {} };
    prevUnits[name] = units(name, state[name]);
  }
  base = (await local.get('syncBase')) ?? {};
  if (!ext) {
    window.addEventListener('storage', e => {
      const name = e.key?.startsWith('hub:') && e.key.slice(4);
      if (name && COLLECTIONS.includes(name) && e.newValue) adopt(name, JSON.parse(e.newValue), false);
      if (e.key === 'hub-local:syncBase' && e.newValue) base = JSON.parse(e.newValue);
    });
  } else {
  // outras abas (e o service worker) gravam no storage.local
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.syncBase?.newValue) base = changes.syncBase.newValue;
    for (const name of COLLECTIONS) {
      const v = changes['c:' + name]?.newValue;
      if (v && v.t > stamps[name]) {
        adopt(name, v, false);
        // gravações do service worker não passam por nenhuma aba: alguém precisa subir
        if (v.src === 'bg') queueSync(name);
      }
    }
  });
  }
  addEventListener('pagehide', flush);
  // no tablet o app vai para o fundo e pode ser encerrado sem pagehide: envia já
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });

  const cfg = (await local.get('syncConfig')) ?? DEFAULT_CFG;
  await startProvider(cfg);
}

async function startProvider(cfg) {
  provider?.stop?.();
  provider = PROVIDERS[cfg.provider] ?? (ext ? browserSync : null);
  syncInfo.provider = provider ? cfg.provider : 'none';
  if (!provider) return;
  try {
    await provider.start(cfg, {
      onRemote: (name, entry) => { if (entry.t > (base[name] ?? 0)) receive(name, entry); },
      requestPull: () => pull().catch(() => {})
    });
    await pull();
  } catch (err) {
    setSyncError(err);
  }
}

/** Busca o que mudou na nuvem e agenda o envio do que está mais novo aqui. */
export async function pull() {
  if (!provider) return;
  let result;
  // baixa o que mudou na nuvem desde a última versão em comum
  try { result = await provider.pull({ ...base }); }
  catch (err) { setSyncError(err); throw err; }
  const { meta, entries } = result;
  for (const name of COLLECTIONS) {
    const r = entries[name];
    if (r && r.t > (base[name] ?? 0)) receive(name, r);
    else if (stamps[name] > (meta[name] ?? 0)) queueSync(name);
  }
  syncOk();
}

// pacote enviado à nuvem: dados + meta da mesclagem (versões antigas mandavam só os dados)
const wrap = name => ({ __hub: 2, data: state[name], meta: metas[name] });
const unwrap = d => (d && d.__hub === 2 ? { data: d.data, meta: d.meta } : { data: d, meta: null });

/**
 * Chegou uma versão da nuvem mais nova que a última em comum. Sempre mescla
 * (a menos que este PC nunca tenha gravado nada): se dois PCs enviaram ao mesmo
 * tempo, a versão que chega pode não conter o que este PC fez. Mesclar de novo
 * algo que já contém tudo devolve a própria versão da nuvem.
 */
function receive(name, entry, { push = true } = {}) {
  const remote = unwrap(entry.data);
  if (!stamps[name]) {
    adopt(name, { t: entry.t, data: remote.data, meta: remote.meta }, true);
  } else {
    const merged = merge(name, { data: state[name], meta: metas[name] }, remote);
    const same = sameUnits(units(name, merged.data), units(name, remote.data));
    state[name] = withDefaults(name, merged.data);
    metas[name] = merged.meta;
    prevUnits[name] = units(name, state[name]);
    // igual à nuvem: só adota o carimbo dela; diferente: há algo daqui a enviar
    stamps[name] = same ? entry.t : Math.max(Date.now(), entry.t + 1);
    writeLocal(name);
    emit(name, 'remote');
    if (!same && push) queueSync(name);
  }
  setBase(name, entry.t);
}

// mesmo conteúdo, independentemente da ordem das chaves dos objetos
function sameUnits(x, y) {
  if (x.size !== y.size) return false;
  for (const [k, v] of x) if (y.get(k) !== v) return false;
  return true;
}

function setBase(name, t) {
  base = { ...base, [name]: t };
  local.set('syncBase', base);
}

/** Troca o provedor (chamado pelos Ajustes). Envia o que for mais novo aqui. */
export async function setProvider(cfg) {
  await local.set('syncConfig', cfg);
  // outro provedor: nada em comum ainda; a primeira troca mescla tudo
  base = {};
  await local.set('syncBase', base);
  await startProvider(cfg);
  emit('sync', 'self');
}

export const syncConfig = () => local.get('syncConfig').then(c => c ?? DEFAULT_CFG);

/** Aceita uma versão vinda de fora se for mais nova que a nossa. */
function adopt(name, { t, data, meta }, persistLocal) {
  if (t <= stamps[name]) return;
  state[name] = withDefaults(name, data);
  stamps[name] = t;
  metas[name] = meta ?? { u: {}, del: {} };
  prevUnits[name] = units(name, state[name]);
  if (persistLocal) writeLocal(name);
  emit(name, 'remote');
}

// ---------- Local ----------

async function readAllLocal() {
  if (ext) {
    const all = await chrome.storage.local.get(COLLECTIONS.map(n => 'c:' + n));
    return Object.fromEntries(COLLECTIONS.map(n => [n, all['c:' + n]]));
  }
  return Object.fromEntries(COLLECTIONS.map(n => {
    try { return [n, JSON.parse(localStorage.getItem('hub:' + n))]; } catch { return [n, null]; }
  }));
}

function writeLocal(name) {
  const value = { t: stamps[name], data: state[name], meta: metas[name] };
  if (ext) chrome.storage.local.set({ ['c:' + name]: value });
  else try { localStorage.setItem('hub:' + name, JSON.stringify(value)); } catch {}
}

// ---------- Envio ----------

function queueSync(name) {
  if (!provider) return;
  dirty.add(name);
  // agrupa gravações: espera 2 s de calma, mas nunca mais que 10 s
  const now = Date.now();
  if (!flushTimer) flushDeadline = now + 10000;
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, Math.max(0, Math.min(2000, flushDeadline - now)));
}

export async function flush() {
  if (!provider || !dirty.size) return;
  clearTimeout(flushTimer);
  flushTimer = null;
  const names = [...dirty];
  dirty.clear();
  try {
    // confere a nuvem antes de enviar: se outro PC gravou depois da última
    // versão em comum, mescla primeiro para não apagar o que ele fez
    // (Infinity: as coleções que não vão ser enviadas agora nem são baixadas)
    const { entries } = await provider.pull(Object.fromEntries(COLLECTIONS.map(n => [n, names.includes(n) ? base[n] ?? 0 : Infinity])));
    for (const name of names) {
      const r = entries[name];
      if (r && r.t > (base[name] ?? 0)) receive(name, r, { push: false });
    }
    const sent = names.map(name => ({ name, t: stamps[name], data: wrap(name) }));
    await provider.push(sent);
    // o que foi enviado passa a ser a versão em comum
    base = { ...base, ...Object.fromEntries(sent.map(e => [e.name, e.t])) };
    local.set('syncBase', base);
    syncOk();
  } catch (err) {
    names.forEach(n => dirty.add(n)); // tenta de novo na próxima mudança
    setSyncError(err);
    if (err?.retry) setTimeout(flush, err.retry);
  }
}

function syncOk() {
  syncInfo.status = 'ok';
  syncInfo.message = '';
  syncInfo.lastSync = Date.now();
  refreshUsage();
}

function setSyncError(err) {
  syncInfo.status = err?.auth ? 'auth' : 'error';
  syncInfo.message = String(err?.message || err);
  emit('sync', 'self');
}

async function refreshUsage() {
  const u = await provider?.usage?.().catch(() => null);
  if (u) Object.assign(syncInfo, u);
  emit('sync', 'self');
}
