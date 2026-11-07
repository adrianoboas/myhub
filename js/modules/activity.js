// Painel de atividade: tempo de tela por site, limites diários com bloqueio,
// comparativo com dias anteriores e relatório do mês.
//
// O service worker (js/activity-sw.js) mede o uso deste PC em storage.local
// `actLocal`. Este módulo copia esses dias para a coleção sincronizada
// `activity.days['<pc>|<dia>']` e soma todos os PCs nos painéis.

import * as store from '../store.js';
import { h, icon, uid, fill, dateKey, addDays, parseKey, dialog, toast, confirmDialog, segmented, monthKey, addMonths, monthLabel, faviconUrl, isExtension, debounce } from '../dom.js';

const KEEP_DAYS = 400;
const LIMIT_DAYS = { all: 'Todos os dias', weekdays: 'Dias úteis', weekends: 'Fins de semana' };
const act = () => store.get('activity');

let root, tab = 'hoje', month = monthKey(), pc = null;

// ---------- Dados ----------

export const fmt = sec => {
  const m = Math.round(sec / 60);
  if (sec > 0 && m === 0) return '< 1 min';
  return m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ' ' + String(m % 60).padStart(2, '0') + 'min' : ''}` : `${m} min`;
};
const matches = (host, site) => host === site || host.endsWith('.' + site);

/** Uso do dia somando todos os PCs: { sites: {host: s}, hours: [24], total }. */
export function day(key) {
  const out = { sites: {}, hours: Array(24).fill(0), total: 0 };
  for (const [k, d] of Object.entries(act().days ?? {})) {
    if (!k.endsWith('|' + key)) continue;
    for (const [hst, s] of Object.entries(d.sites ?? {})) { out.sites[hst] = (out.sites[hst] ?? 0) + s; out.total += s; }
    (d.hours ?? []).forEach((s, i) => { out.hours[i] += s; });
  }
  return out;
}

const top = (sites, n = 10) => Object.entries(sites).sort((a, b) => b[1] - a[1]).slice(0, n);
const siteUse = (sites, site) => Object.entries(sites).reduce((n, [hst, s]) => n + (matches(hst, site) ? s : 0), 0);

/** Copia os dias recentes deste PC para a coleção sincronizada. */
async function pullLocal() {
  if (!isExtension) return;
  pc ??= (await store.local.get('pcId')) ?? null;
  if (!pc) { pc = crypto.randomUUID().slice(0, 8); await store.local.set('pcId', pc); }
  const local = (await store.local.get('actLocal')) ?? {};
  const days = act().days ??= {};
  let changed = false;
  for (const k of [dateKey(), addDays(dateKey(), -1), addDays(dateKey(), -2)]) {
    if (!local[k]) continue;
    // arredonda para não gravar a cada fração de segundo
    const v = { sites: Object.fromEntries(Object.entries(local[k].sites).map(([hst, s]) => [hst, Math.round(s)])), hours: local[k].hours.map(Math.round) };
    if (JSON.stringify(days[`${pc}|${k}`]) !== JSON.stringify(v)) { days[`${pc}|${k}`] = v; changed = true; }
  }
  const limit = addDays(dateKey(), -KEEP_DAYS);
  for (const k of Object.keys(days)) if (k.split('|')[1] < limit) { delete days[k]; changed = true; }
  if (changed) store.commit('activity');
}

// ---------- Montagem ----------

export async function mount(el) {
  root = el;
  store.on('activity', () => { if (!root.closest('[hidden]')) render(); });
  await pullLocal();
  render();
  // o service worker anota a cada 30 s; o painel acompanha a cada minuto
  setInterval(async () => { await pullLocal(); if (document.body.dataset.view === 'atividade') render(); }, 60000);
}

/** Ao abrir a área: anota o momento atual e atualiza. */
export async function onShow() {
  if (isExtension) await chrome.runtime.sendMessage({ type: 'act:tick' }).catch(() => {});
  await pullLocal();
  render();
}

function render() {
  const focusKey = root.contains(document.activeElement) ? document.activeElement.dataset?.focusKey : null;
  const body = { hoje: renderToday, limites: renderLimits, comparativo: renderCompare, mes: renderMonth }[tab] ?? renderToday;
  const today = day(dateKey());
  fill(root,
    h('header', { class: 'act-head card' },
      h('span', { class: 'study-badge' }, icon('activity', 22)),
      h('div', { class: 'exam-title' },
        h('h2', {}, 'Atividade'),
        h('p', { class: 'muted small' }, act().enabled === false ? 'Medição pausada.' : isExtension ? 'Tempo em sites (o Hub não conta), somando todos os seus PCs.' : 'Tempo em sites medido nos seus PCs. O tablet não mede nem bloqueia, mas os limites criados aqui valem nos PCs.')),
      h('span', { class: 'spacer' }),
      h('div', { class: 'countdown' }, h('span', { class: 'countdown-num' }, fmt(today.total)), h('span', { class: 'muted small' }, 'de tela hoje'))),
    h('nav', { class: 'tabs' }, segmented([
      { value: 'hoje', label: 'Hoje', icon: 'sun' }, { value: 'limites', label: 'Limites', icon: 'timer' },
      { value: 'comparativo', label: 'Comparativo', icon: 'chart-bar' }, { value: 'mes', label: 'Mês', icon: 'calendar-days' }
    ], tab, v => { tab = v; render(); })),
    body()
  );
  if (focusKey) root.querySelector(`[data-focus-key="${focusKey}"]`)?.focus();
}

// ---------- Hoje ----------

function siteRows(entries, total, { limitButton = false } = {}) {
  const max = entries[0]?.[1] ?? 0;
  return h('div', { class: 'act-sites' }, entries.map(([hst, s]) => {
    const limit = (act().limits ?? []).find(l => matches(hst, l.site));
    return h('div', { class: 'act-site', 'data-tip': `${hst}: ${fmt(s)} (${Math.round((s / (total || 1)) * 100)}% do dia)` },
      h('img', { src: faviconUrl(`https://${hst}`), alt: '', width: 16, height: 16 }),
      h('span', { class: 'act-host' }, hst),
      h('span', { class: 'hbar-track' }, h('span', { class: 'hbar-fill', style: { width: `${(s / (max || 1)) * 100}%` } })),
      h('span', { class: 'act-time' }, fmt(s)),
      limitButton ? (limit
        ? h('span', { class: 'tag' }, `limite ${limit.minutes} min`)
        : h('button', { class: 'btn btn-xs', onclick: () => editLimit({ site: hst }) }, icon('timer', 12), 'Limitar')) : null);
  }));
}

function limitStatus(l, sites) {
  const used = siteUse(sites, l.site);
  const allowed = l.minutes * 60;
  const pct = Math.min(100, (used / allowed) * 100);
  const state = used >= allowed ? 'over' : allowed - used <= 300 ? 'near' : 'ok';
  return { used, pct, state };
}

function renderToday() {
  const key = dateKey();
  const t = day(key), y = day(addDays(key, -1));
  const week = Array.from({ length: 7 }, (_, i) => day(addDays(key, -(i + 1))).total);
  const avg = week.reduce((a, b) => a + b, 0) / 7;
  const diff = t.total - y.total;
  const entries = top(t.sites, 12);
  const maxH = Math.max(1, ...t.hours);
  const nowH = new Date().getHours();
  const limits = (act().limits ?? []);

  return h('div', { class: 'act-grid' },
    h('div', { class: 'kpis act-kpis' },
      h('div', { class: 'kpi card' }, h('span', { class: 'stat-label' }, 'Hoje'), h('span', { class: 'kpi-value' }, fmt(t.total)), h('span', { class: 'muted small' }, `${Object.keys(t.sites).length} sites`)),
      h('div', { class: 'kpi card' }, h('span', { class: 'stat-label' }, 'Ontem'), h('span', { class: 'kpi-value' }, fmt(y.total)),
        h('span', { class: `muted small ${diff > 0 ? 'up' : 'down'}` }, y.total ? `${diff > 0 ? '+' : '−'}${fmt(Math.abs(diff))} hoje` : 'sem dados')),
      h('div', { class: 'kpi card' }, h('span', { class: 'stat-label' }, 'Média dos 7 dias'), h('span', { class: 'kpi-value' }, fmt(avg)),
        h('span', { class: 'muted small' }, avg ? `hoje: ${Math.round((t.total / avg) * 100)}% da média` : 'sem dados')),
      h('div', { class: 'kpi card' }, h('span', { class: 'stat-label' }, 'Limites'), h('span', { class: 'kpi-value' }, limits.length),
        h('span', { class: 'muted small' }, `${limits.filter(l => limitStatus(l, t.sites).state === 'over').length} bloqueado(s) hoje`))),
    h('section', { class: 'card exam-card' },
      h('header', { class: 'card-head' }, h('span', { class: 'eyebrow' }, 'Sites mais usados hoje'),
        h('button', { class: 'btn btn-xs', onclick: () => onShow() }, icon('refresh-cw', 12), 'Atualizar')),
      entries.length ? siteRows(entries, t.total, { limitButton: true }) : h('p', { class: 'muted small empty-line' }, 'Nenhum uso registrado hoje ainda. O tempo começa a contar quando você navega por sites.')),
    h('section', { class: 'card exam-card' },
      h('header', { class: 'card-head' }, h('span', { class: 'eyebrow' }, 'Uso por hora'), h('span', { class: 'muted small' }, t.total ? `pico às ${t.hours.indexOf(Math.max(...t.hours))}h` : '')),
      h('div', { class: 'hour-bars', role: 'img', 'aria-label': t.hours.map((s, i) => `${i}h: ${fmt(s)}`).join(', ') },
        t.hours.map((s, i) => h('div', { class: `hbar-v ${i === nowH ? 'now' : ''}`, 'data-tip': `${i}h: ${fmt(s)}` },
          h('span', { class: 'hbar-v-col' }, h('span', { style: { height: `${(s / maxH) * 100}%` } })),
          h('span', { class: 'hbar-v-lbl' }, i % 3 === 0 ? `${i}h` : ''))))),
    h('section', { class: 'card exam-card' },
      h('header', { class: 'card-head' }, h('span', { class: 'eyebrow' }, 'Limites de hoje'),
        h('button', { class: 'btn btn-xs', onclick: () => editLimit() }, icon('plus', 12), 'Limite')),
      limits.length ? h('div', { class: 'limit-list' }, limits.map(l => limitRow(l, t.sites))) : h('p', { class: 'muted small empty-line' }, 'Nenhum limite. Use “Limitar” num site acima, ou a aba Limites.'))
  );
}

function limitRow(l, sites) {
  const s = limitStatus(l, sites);
  return h('div', { class: `limit-row ${s.state}` },
    h('img', { src: faviconUrl(`https://${l.site}`), alt: '', width: 16, height: 16 }),
    h('span', { class: 'limit-site' }, h('strong', {}, l.site), h('span', { class: 'muted small' }, `${l.minutes} min · ${LIMIT_DAYS[l.days ?? 'all'].toLowerCase()}`)),
    h('span', { class: 'limit-bar' }, h('span', { style: { width: s.pct + '%' } })),
    h('span', { class: 'limit-used' }, s.state === 'over' ? h('span', { class: 'tag tag-warn' }, 'bloqueado') : `${fmt(s.used)} / ${l.minutes} min`),
    h('button', { class: 'icon-btn sm', title: 'Editar limite', onclick: () => editLimit(l) }, icon('pencil', 13)));
}

// ---------- Limites ----------

const normalizeSite = raw => {
  const v = raw.trim().toLowerCase();
  if (!v) return '';
  try { return new URL(v.includes('://') ? v : `https://${v}`).hostname.replace(/^www\./, ''); } catch { return ''; }
};

function editLimit(l = {}) {
  const existing = l.id ? l : null;
  const site = h('input', { class: 'input', placeholder: 'youtube.com', value: l.site ?? '', autocomplete: 'off', spellcheck: false });
  const minutes = h('input', { class: 'input', type: 'number', min: 1, max: 1440, value: l.minutes ?? 30 });
  let days = l.days ?? 'all';
  const presets = h('div', { class: 'button-row' }, [15, 30, 60, 90, 120].map(m => h('button', { type: 'button', class: 'btn btn-xs', onclick: () => { minutes.value = m; } }, m >= 60 ? `${m / 60}h` : `${m} min`)));
  const actions = [];
  if (existing) actions.push({ label: 'Remover limite', kind: 'ghost-danger', onClick: () => {
    act().limits = act().limits.filter(x => x.id !== existing.id);
    store.commit('activity');
    toast(`Limite de ${existing.site} removido.`);
  } });
  actions.push({ label: 'Cancelar' }, { label: existing ? 'Salvar' : 'Criar limite', kind: 'primary', onClick: () => {
    const s = normalizeSite(site.value);
    const m = Math.round(Number(minutes.value));
    if (!s) { site.focus(); return false; }
    if (!(m >= 1)) { minutes.focus(); return false; }
    const list = act().limits ??= [];
    const dup = list.find(x => x.site === s && x.id !== existing?.id);
    if (dup) { toast(`Já existe um limite para ${s}.`); return false; }
    if (existing) Object.assign(list.find(x => x.id === existing.id), { site: s, minutes: m, days });
    else list.push({ id: uid(), site: s, minutes: m, days });
    store.commit('activity');
    toast(`${s}: ${m} min por dia.`);
  } });
  dialog({
    title: existing ? 'Editar limite' : 'Novo limite diário',
    subtitle: 'Atingido o tempo, o site fica bloqueado até a meia-noite. Subdomínios entram junto (m.youtube.com conta como youtube.com).',
    body: h('div', { class: 'fields' },
      h('label', { class: 'field' }, h('span', {}, 'Site'), site),
      h('label', { class: 'field' }, h('span', {}, 'Minutos por dia'), minutes), presets,
      h('div', { class: 'field' }, h('span', {}, 'Vale em'), segmented(Object.entries(LIMIT_DAYS).map(([v, label]) => ({ value: v, label })), days, v => { days = v; }))),
    actions
  });
}

function renderLimits() {
  const t = day(dateKey());
  const limits = act().limits ?? [];
  return h('div', { class: 'exam-questions' },
    h('section', { class: 'card exam-card' },
      h('header', { class: 'card-head' }, h('span', { class: 'eyebrow' }, 'Limites diários'),
        h('button', { class: 'btn btn-primary btn-sm', onclick: () => editLimit() }, icon('plus', 13), 'Novo limite')),
      limits.length ? h('div', { class: 'limit-list' }, limits.map(l => limitRow(l, t.sites)))
        : h('p', { class: 'muted small empty-line' }, 'Defina quanto tempo por dia você quer passar em cada site. Faltando 5 minutos você recebe um aviso; no limite, o site é bloqueado até a meia-noite (com até 3 liberações extras de 5 minutos).')),
    h('section', { class: 'card exam-card' },
      h('header', { class: 'card-head' }, h('span', { class: 'eyebrow' }, 'Medição')),
      h('label', { class: 'toggle-row' },
        h('span', {}, h('span', {}, 'Medir o tempo nos sites'), h('span', { class: 'muted small' }, 'Conta com o navegador em primeiro plano e uso nos últimos 5 minutos, ou com áudio tocando. Os dados ficam na sua conta e são guardados por 400 dias.')),
        h('span', { class: 'switch' }, h('input', { type: 'checkbox', checked: act().enabled !== false, onchange: e => { act().enabled = e.target.checked; store.commit('activity'); } }), h('span', { class: 'switch-track' }))),
      h('button', { class: 'btn btn-sm btn-ghost-danger act-clear', onclick: async () => {
        if (!(await confirmDialog({ title: 'Apagar o histórico de atividade?', message: 'Todo o tempo registrado (de todos os PCs) será apagado. Os limites continuam.', confirm: 'Apagar histórico', danger: true }))) return;
        act().days = {};
        store.commit('activity');
        if (isExtension) await chrome.storage.local.set({ actLocal: {} });
        toast('Histórico apagado.');
      } }, icon('trash-2', 13), 'Apagar histórico'))
  );
}

// ---------- Comparativo ----------

function renderCompare() {
  const key = dateKey();
  const days = Array.from({ length: 14 }, (_, i) => addDays(key, i - 13));
  const totals = days.map(k => day(k).total);
  const max = Math.max(1, ...totals);
  const t = day(key), y = day(addDays(key, -1));
  const weekSites = {};
  for (let i = 1; i <= 7; i++) for (const [hst, s] of Object.entries(day(addDays(key, -i)).sites)) weekSites[hst] = (weekSites[hst] ?? 0) + s;
  const hosts = [...new Set([...top(t.sites, 8).map(e => e[0]), ...top(weekSites, 8).map(e => e[0])])].slice(0, 10);
  const avgPrev7 = totals.slice(6, 13).reduce((a, b) => a + b, 0) / 7;
  const avgPrevWeek = totals.slice(0, 7).reduce((a, b) => a + b, 0) / 7;

  return h('div', { class: 'exam-questions' },
    h('section', { class: 'card exam-card' },
      h('header', { class: 'card-head' }, h('span', { class: 'eyebrow' }, 'Últimos 14 dias'),
        h('span', { class: 'muted small' }, avgPrevWeek ? `média desta semana ${fmt(avgPrev7)} · semana anterior ${fmt(avgPrevWeek)}` : '')),
      h('div', { class: 'day-bars', role: 'img', 'aria-label': days.map((k, i) => `${k}: ${fmt(totals[i])}`).join(', ') },
        days.map((k, i) => h('div', { class: `dbar ${k === key ? 'today' : ''}`, 'data-tip': `${parseKey(k).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })}: ${fmt(totals[i])}` },
          h('span', { class: 'dbar-val' }, totals[i] ? fmt(totals[i]).replace(' ', '') : ''),
          h('span', { class: 'dbar-col' }, h('span', { style: { height: `${(totals[i] / max) * 100}%` } })),
          h('span', { class: 'dbar-day' }, parseKey(k).toLocaleDateString('pt-BR', { weekday: 'narrow' })),
          h('span', { class: 'dbar-date' }, parseKey(k).getDate()))))),
    h('section', { class: 'card exam-card' },
      h('header', { class: 'card-head' }, h('span', { class: 'eyebrow' }, 'Por site: hoje, ontem e média da semana')),
      hosts.length ? h('table', { class: 'q-table act-table' },
        h('thead', {}, h('tr', {}, ['Site', 'Hoje', 'Ontem', 'Média 7 dias', 'Tendência'].map(x => h('th', {}, x)))),
        h('tbody', {}, hosts.map(hst => {
          const a = t.sites[hst] ?? 0, b = y.sites[hst] ?? 0, avg = (weekSites[hst] ?? 0) / 7;
          const trend = avg ? (a - avg) / avg : 0;
          return h('tr', {},
            h('td', {}, h('span', { class: 'act-host-cell' }, h('img', { src: faviconUrl(`https://${hst}`), alt: '', width: 14, height: 14 }), hst)),
            h('td', { class: 'num' }, fmt(a)), h('td', { class: 'num' }, fmt(b)), h('td', { class: 'num' }, fmt(avg)),
            h('td', { class: `num trend ${Math.abs(trend) < 0.15 ? '' : trend > 0 ? 'up' : 'down'}` },
              !avg ? 'novo' : Math.abs(trend) < 0.15 ? 'estável' : `${trend > 0 ? '▲' : '▼'} ${Math.round(Math.abs(trend) * 100)}%`));
        })))
        : h('p', { class: 'muted small empty-line' }, 'Sem dados ainda.'))
  );
}

// ---------- Mês ----------

function monthData(mk) {
  const [y, m] = mk.split('-').map(Number);
  const n = new Date(y, m, 0).getDate();
  const keys = Array.from({ length: n }, (_, i) => `${mk}-${String(i + 1).padStart(2, '0')}`);
  const days = keys.map(k => ({ k, ...day(k) }));
  const sites = {}, daysUsed = {};
  for (const d of days) for (const [hst, s] of Object.entries(d.sites)) { sites[hst] = (sites[hst] ?? 0) + s; daysUsed[hst] = (daysUsed[hst] ?? 0) + 1; }
  const total = days.reduce((a, d) => a + d.total, 0);
  const active = days.filter(d => d.total > 0);
  return { days, sites, daysUsed, total, active };
}

function exportCsv(mk, data) {
  const lines = ['Data;Total (min);' + top(data.sites, 15).map(e => e[0]).join(';')];
  const hosts = top(data.sites, 15).map(e => e[0]);
  for (const d of data.days) lines.push([parseKey(d.k).toLocaleDateString('pt-BR'), Math.round(d.total / 60), ...hosts.map(hst => Math.round((d.sites[hst] ?? 0) / 60))].join(';'));
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `atividade-${mk}.csv` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function renderMonth() {
  const data = monthData(month);
  const prev = monthData(addMonths(month, -1));
  const peak = [...data.days].sort((a, b) => b.total - a.total)[0];
  const avg = data.active.length ? data.total / data.active.length : 0;
  const prevAvg = prev.active.length ? prev.total / prev.active.length : 0;
  const vs = prevAvg ? (avg - prevAvg) / prevAvg : null;
  const max = Math.max(1, ...data.days.map(d => d.total));
  const first = parseKey(month + '-01').getDay();
  const today = dateKey();
  const level = s => (!s ? 0 : Math.min(5, Math.ceil((s / max) * 5)));

  return h('div', { class: 'exam-questions' },
    h('section', { class: 'card exam-card act-month-head' },
      h('div', { class: 'agenda-nav' },
        h('button', { class: 'icon-btn sm', onclick: () => { month = addMonths(month, -1); render(); } }, icon('chevron-left', 15)),
        h('strong', { class: 'month-name' }, monthLabel(month)),
        h('button', { class: 'icon-btn sm', disabled: month >= monthKey(), onclick: () => { month = addMonths(month, 1); render(); } }, icon('chevron-right', 15))),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn btn-sm', onclick: () => exportCsv(month, data) }, icon('download', 13), 'Exportar CSV')),
    h('div', { class: 'kpis' },
      h('div', { class: 'kpi card' }, h('span', { class: 'stat-label' }, 'Total no mês'), h('span', { class: 'kpi-value' }, fmt(data.total)), h('span', { class: 'muted small' }, `${data.active.length} dias com uso`)),
      h('div', { class: 'kpi card' }, h('span', { class: 'stat-label' }, 'Média por dia'), h('span', { class: 'kpi-value' }, fmt(avg)),
        h('span', { class: `muted small ${vs > 0 ? 'up' : vs < 0 ? 'down' : ''}` }, vs == null ? 'sem mês anterior' : `${vs > 0 ? '▲' : '▼'} ${Math.round(Math.abs(vs) * 100)}% vs ${monthLabel(addMonths(month, -1)).split(' ')[0].toLowerCase()}`)),
      h('div', { class: 'kpi card' }, h('span', { class: 'stat-label' }, 'Dia de maior uso'), h('span', { class: 'kpi-value' }, peak?.total ? fmt(peak.total) : '—'),
        h('span', { class: 'muted small' }, peak?.total ? parseKey(peak.k).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' }) : '')),
      h('div', { class: 'kpi card' }, h('span', { class: 'stat-label' }, 'Site mais usado'), h('span', { class: 'kpi-value act-top' }, top(data.sites, 1)[0]?.[0] ?? '—'),
        h('span', { class: 'muted small' }, top(data.sites, 1)[0] ? `${fmt(top(data.sites, 1)[0][1])} · ${Math.round((top(data.sites, 1)[0][1] / (data.total || 1)) * 100)}% do mês` : ''))),
    h('div', { class: 'act-month-grid' },
      h('section', { class: 'card exam-card' },
        h('header', { class: 'card-head' }, h('span', { class: 'eyebrow' }, 'Calendário do mês')),
        h('div', { class: 'act-cal' },
          ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map(d => h('span', { class: 'act-cal-dow' }, d)),
          Array.from({ length: first }, () => h('span')),
          data.days.map(d => h('span', { class: `act-cal-day lv-${level(d.total)} ${d.k === today ? 'today' : ''} ${d.k > today ? 'future' : ''}`, 'data-tip': `${parseKey(d.k).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}: ${fmt(d.total)}` },
            h('span', {}, parseKey(d.k).getDate())))),
        h('div', { class: 'dist-legend' }, h('span', {}, 'menos'), [1, 2, 3, 4, 5].map(n => h('i', { class: `lv-${n}` })), h('span', {}, 'mais'))),
      h('section', { class: 'card exam-card' },
        h('header', { class: 'card-head' }, h('span', { class: 'eyebrow' }, 'Sites do mês')),
        Object.keys(data.sites).length ? h('table', { class: 'q-table act-table' },
          h('thead', {}, h('tr', {}, ['Site', 'Total', 'Dias', 'Média/dia', '% do mês'].map(x => h('th', {}, x)))),
          h('tbody', {}, top(data.sites, 12).map(([hst, s]) => h('tr', {},
            h('td', {}, h('span', { class: 'act-host-cell' }, h('img', { src: faviconUrl(`https://${hst}`), alt: '', width: 14, height: 14 }), hst)),
            h('td', { class: 'num' }, fmt(s)), h('td', { class: 'num' }, data.daysUsed[hst]),
            h('td', { class: 'num' }, fmt(s / data.daysUsed[hst])), h('td', { class: 'num' }, `${Math.round((s / (data.total || 1)) * 100)}%`)))))
          : h('p', { class: 'muted small empty-line' }, 'Sem dados neste mês.')))
  );
}
