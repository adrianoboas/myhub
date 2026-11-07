// Utilitários de interface. Todo texto do usuário entra como textContent,
// nunca como HTML, então nomes com < ou " não quebram a página.

import { ICONS, ALIASES } from './icons.js';

export const isExtension = typeof chrome !== 'undefined' && !!chrome.runtime?.id;

/** Cria um elemento: h('div', { class: 'x', onclick: fn }, 'texto', filho) */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'style') for (const [p, val] of Object.entries(v)) el.style.setProperty(p.replace(/[A-Z]/g, c => '-' + c.toLowerCase()), val);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k in el && !k.includes('-') && k !== 'list') el[k] = v; // list é só leitura
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const resolveIcon = name => (ICONS[name] ? name : ICONS[ALIASES[name]] ? ALIASES[name] : null);

export function icon(name, size = 18) {
  const span = document.createElement('span');
  span.className = 'icon';
  // conteúdo vem do módulo de ícones embutido, nunca do usuário
  span.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[resolveIcon(name) ?? 'link']}</svg>`;
  return span;
}

export const uid = () => crypto.randomUUID();

export function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export function clear(el) { el.replaceChildren(); return el; }

/** Substitui o conteúdo de el, ignorando filhos null/false (append os viraria texto). */
export function fill(el, ...children) {
  // campos marcados com data-focus-key recuperam o foco depois do redesenho
  const key = el.contains(document.activeElement) ? document.activeElement.dataset?.focusKey : null;
  el.replaceChildren(...children.flat().filter(c => c != null && c !== false));
  if (key) el.querySelector(`[data-focus-key="${key}"]`)?.focus();
  return el;
}

// ---------- URLs ----------

export function normalizeUrl(raw) {
  const s = raw.trim();
  if (!s) return '';
  return /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : 'https://' + s;
}

export function hostname(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

export function faviconUrl(url, size = 32) {
  if (isExtension) return `/_favicon/?pageUrl=${encodeURIComponent(url)}&size=${size}`;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname(url))}&sz=${size}`;
}

// ---------- Datas (sempre no fuso local) ----------

export function dateKey(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key, n) {
  const d = parseKey(key);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

export function relativeTime(ts) {
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return 'agora';
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`;
  if (diff < 86400 * 7) return `há ${Math.floor(diff / 86400)} d`;
  return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

// ---------- Toast com desfazer ----------

export function toast(message, { action, onAction, duration = 6000 } = {}) {
  const host = document.getElementById('toasts');
  const el = h('div', { class: 'toast', role: 'status' }, h('span', {}, message));
  let timer;
  const close = () => { clearTimeout(timer); el.classList.add('leaving'); setTimeout(() => el.remove(), 200); };
  if (action) el.append(h('button', { class: 'toast-action', onclick: () => { onAction(); close(); } }, action));
  host.append(el);
  timer = setTimeout(close, duration);
  return close;
}

// ---------- Diálogos ----------

/**
 * Abre um <dialog> modal. `body` é um nó; `actions` uma lista de
 * { label, kind, onClick } onde onClick retorna false para manter aberto.
 * Enter envia a ação principal; Esc fecha (nativo do <dialog>).
 */
export function dialog({ title, subtitle, body, actions = [], className = '' }) {
  const form = h('form', { method: 'dialog', class: 'dialog-form' });
  const dlg = h('dialog', { class: `dialog ${className}` }, form);
  const close = () => { dlg.close(); };
  dlg.addEventListener('close', () => setTimeout(() => dlg.remove(), 200));
  dlg.addEventListener('click', e => { if (e.target === dlg) close(); });

  const primary = actions.find(a => a.kind === 'primary');
  form.addEventListener('submit', e => {
    e.preventDefault();
    if (primary && primary.onClick?.() !== false) close();
  });

  fill(form,
    h('header', { class: 'dialog-head' },
      h('div', {}, h('h2', {}, title), subtitle && h('p', { class: 'muted' }, subtitle)),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Fechar', onclick: close }, icon('x'))
    ),
    body,
    actions.length ? h('footer', { class: 'dialog-actions' }, actions.map(a =>
      h('button', {
        type: a.kind === 'primary' ? 'submit' : 'button',
        class: `btn ${a.kind ? 'btn-' + a.kind : ''}`,
        onclick: a.kind === 'primary' ? null : () => { if (a.onClick?.() !== false) close(); }
      }, a.label)
    )) : null
  );
  document.body.append(dlg);
  dlg.showModal();
  dlg.querySelector('input, textarea, select')?.focus();
  return { el: dlg, close };
}

export function prompt({ title, subtitle, value = '', placeholder = '', confirm = 'Salvar' }) {
  return new Promise(resolve => {
    const input = h('input', { class: 'input', value, placeholder, autocomplete: 'off' });
    let done = false;
    const d = dialog({
      title, subtitle, body: input,
      actions: [
        { label: 'Cancelar' },
        { label: confirm, kind: 'primary', onClick: () => {
          if (!input.value.trim()) { input.focus(); return false; }
          done = true; resolve(input.value.trim());
        } }
      ]
    });
    d.el.addEventListener('close', () => { if (!done) resolve(null); });
    input.select();
  });
}

export function confirmDialog({ title, message, confirm = 'Confirmar', danger = false }) {
  return new Promise(resolve => {
    let done = false;
    const d = dialog({
      title, body: h('p', { class: 'muted' }, message),
      actions: [
        { label: 'Cancelar' },
        { label: confirm, kind: danger ? 'danger' : 'primary', onClick: () => { done = true; resolve(true); } }
      ]
    });
    // botão de perigo não é submit: garante o Enter
    if (danger) d.el.querySelector('form').addEventListener('submit', () => { done = true; resolve(true); d.close(); });
    d.el.addEventListener('close', () => { if (!done) resolve(false); });
  });
}

/** Verdadeiro quando o usuário está digitando (atalhos de teclado devem ignorar). */
export const isTyping = e => e.target.closest('input, textarea, select, [contenteditable="true"]') || document.querySelector('dialog[open]');

// ---------- Senhas ----------

/**
 * Pede uma senha. Com `create`, pede duas vezes e avisa que não há recuperação.
 * `check(password)` pode validar antes de fechar (lança erro com a mensagem).
 */
export function passwordDialog({ title, subtitle, create = false, confirm = 'Desbloquear', check }) {
  return new Promise(resolve => {
    const pass = h('input', { class: 'input', type: 'password', placeholder: 'Senha', autocomplete: create ? 'new-password' : 'current-password' });
    const again = create ? h('input', { class: 'input', type: 'password', placeholder: 'Repita a senha', autocomplete: 'new-password' }) : null;
    const error = h('p', { class: 'field-error', hidden: true });
    const fail = msg => { error.textContent = msg; error.hidden = false; };
    let done = false;
    const d = dialog({
      title, subtitle,
      body: h('div', { class: 'fields' },
        pass, again, error,
        create ? h('p', { class: 'notice' }, icon('circle-alert', 16), h('span', {}, 'O conteúdo é criptografado com esta senha. Se você esquecê-la, ninguém consegue recuperar, nem você. Guarde-a num lugar seguro.')) : null
      ),
      actions: [
        { label: 'Cancelar' },
        { label: confirm, kind: 'primary', onClick: () => {
          const v = pass.value;
          if (create && v.length < 4) { fail('Use pelo menos 4 caracteres.'); return false; }
          if (create && v !== again.value) { fail('As senhas não conferem.'); return false; }
          if (!v) { pass.focus(); return false; }
          if (check) {
            const btn = d.el.querySelector('.btn-primary');
            btn.disabled = true;
            Promise.resolve(check(v)).then(() => { done = true; resolve(v); d.close(); })
              .catch(err => { fail(err.message); pass.select(); })
              .finally(() => { btn.disabled = false; });
            return false;
          }
          done = true;
          resolve(v);
        } }
      ]
    });
    d.el.addEventListener('close', () => { if (!done) resolve(null); });
  });
}

// ---------- Números e datas ----------

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const fmtMoney = n => BRL.format(n || 0);

/** Aceita "1.234,56", "1234.56", "R$ 50" ... */
export function parseMoney(raw) {
  let s = String(raw).replace(/[^\d,.-]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

export const monthKey = (d = new Date()) => dateKey(d).slice(0, 7);

export function addMonths(key, n) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return monthKey(d);
}

export function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  const s = new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return s[0].toUpperCase() + s.slice(1);
}

export const capitalize = s => s ? s[0].toUpperCase() + s.slice(1) : s;

/** Minutos desde 00:00 a partir de "HH:MM". */
export const toMin = hm => { const [a, b] = hm.split(':').map(Number); return a * 60 + b; };
export const fromMin = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Botões de opção única: [{ value, label }] */
export function segmented(options, value, onChange, cls = '') {
  const wrap = h('div', { class: `segmented ${cls}`, role: 'radiogroup' });
  const sync = v => wrap.querySelectorAll('button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.value === String(v))));
  options.forEach(o => wrap.append(h('button', {
    type: 'button', role: 'radio', dataset: { value: o.value }, title: o.title ?? null,
    onclick: () => { sync(o.value); onChange(o.value); }
  }, o.icon ? icon(o.icon, 14) : null, o.label)));
  sync(value);
  return wrap;
}
