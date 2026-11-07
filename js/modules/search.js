// Barra de pesquisa do Início: pesquisa com o mecanismo padrão do navegador
// (chrome.search), abre endereços digitados e sugere os links dos boards.
// Resultados abrem em nova aba (o Hub fica aberto); Ctrl/Shift+Enter abre na mesma aba.

import * as store from '../store.js';
import { h, icon, fill, normalizeUrl, hostname, faviconUrl, isExtension } from '../dom.js';

const MAX_LINKS = 6;

// "github.com", "localhost:3000", "192.168.0.1", "https://..." viram endereço
const looksLikeUrl = s =>
  /^[a-z][a-z0-9+.-]*:\/\/\S+$/i.test(s) ||
  /^(localhost|\d{1,3}(\.\d{1,3}){3})(:\d+)?(\/\S*)?$/i.test(s) ||
  /^[^\s/]+\.[a-z]{2,}(:\d+)?(\/\S*)?$/i.test(s);

// busca sem diferenciar acentos nem maiúsculas
const fold = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

let input;

export const focus = () => { input?.focus(); input?.select(); };

export function mount(el) {
  input = h('input', {
    class: 'search-input', type: 'text', placeholder: 'Pesquisar na web ou digitar um endereço',
    autocomplete: 'off', spellcheck: false, 'aria-label': 'Pesquisar', 'aria-autocomplete': 'list', role: 'combobox', 'aria-expanded': 'false'
  });
  const list = h('ul', { class: 'search-suggest', role: 'listbox', hidden: true });
  let items = [];
  let active = 0;

  const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); };

  const render = () => {
    const q = input.value.trim();
    if (!q) { items = []; close(); return; }
    const f = fold(q);
    const links = store.get('boards')
      .flatMap(b => b.links.map(l => ({ ...l, board: b.name })))
      .filter(l => fold(l.name).includes(f) || fold(l.url).includes(f))
      .slice(0, MAX_LINKS)
      .map(l => ({ kind: 'link', url: l.url, label: l.name, sub: `${hostname(l.url)} · ${l.board}` }));
    const main = looksLikeUrl(q)
      ? { kind: 'url', url: normalizeUrl(q), label: q, sub: 'Abrir endereço' }
      : { kind: 'search', q, label: q, sub: 'Pesquisar na web' };
    items = [main, ...links];
    active = Math.min(active, items.length - 1);
    fill(list, items.map((it, i) => h('li', {
      class: `suggest ${i === active ? 'active' : ''}`, role: 'option', 'aria-selected': String(i === active),
      // mousedown em vez de click: o blur do campo fecharia a lista antes do clique
      onmousedown: e => { e.preventDefault(); go(it, !(e.ctrlKey || e.metaKey || e.shiftKey)); },
      onmousemove: () => { if (active !== i) { active = i; render(); } }
    },
      it.kind === 'search' ? h('span', { class: 'suggest-icon' }, icon('search', 16))
        : it.kind === 'url' ? h('span', { class: 'suggest-icon' }, icon('globe', 16))
          : h('span', { class: 'suggest-icon' }, h('img', { src: faviconUrl(it.url), alt: '', width: 16, height: 16 })),
      h('span', { class: 'suggest-text' }, h('span', { class: 'suggest-label' }, it.label), h('span', { class: 'suggest-sub' }, it.sub)),
      i === active ? h('kbd', {}, 'Enter ↗') : null
    )));
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  };

  input.addEventListener('input', () => { active = 0; render(); });
  input.addEventListener('focus', render);
  input.addEventListener('blur', () => setTimeout(close, 100));
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!items.length) return;
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      render();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (!input.value.trim()) return;
      render();
      go(items[active] ?? items[0], !(e.ctrlKey || e.metaKey || e.shiftKey));
    } else if (e.key === 'Escape') {
      if (input.value) { input.value = ''; close(); } else input.blur();
    }
  });

  el.append(
    h('div', { class: 'search-box' },
      h('span', { class: 'search-glyph' }, icon('search', 18)),
      input,
      h('kbd', { class: 'search-hint', title: 'Atalho para focar a pesquisa' }, '/'),
      list
    )
  );
}

function go(item, newTab) {
  if (!item) return;
  if (item.kind === 'search') {
    if (isExtension && chrome.search?.query) chrome.search.query({ text: item.q, disposition: newTab ? 'NEW_TAB' : 'CURRENT_TAB' });
    else open(`https://www.google.com/search?q=${encodeURIComponent(item.q)}`, newTab);
  } else {
    open(item.url, newTab);
  }
  if (newTab) { input.value = ''; input.dispatchEvent(new Event('input')); }
}

function open(url, newTab) {
  if (newTab) window.open(url, '_blank', 'noopener');
  else location.href = url;
}
