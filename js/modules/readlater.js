// Ler depois: artigos guardados pelo HUD, com tempo estimado de leitura.
// Card no Início com os mais recentes; a lista completa abre num diálogo.

import * as store from '../store.js';
import { h, icon, fill, hostname, faviconUrl, relativeTime, dialog, toast } from '../dom.js';

const list = () => store.get('readLater');
const unread = () => list().filter(r => !r.read).sort((a, b) => b.addedAt - a.addedAt);

function markRead(id, read = true) {
  const r = list().find(x => x.id === id);
  if (!r) return;
  r.read = read;
  r.readAt = read ? Date.now() : null;
  store.commit('readLater');
}

function remove(id) {
  const i = list().findIndex(x => x.id === id);
  const [removed] = list().splice(i, 1);
  store.commit('readLater');
  toast('Removido da lista.', { action: 'Desfazer', onAction: () => { list().splice(i, 0, removed); store.commit('readLater'); } });
}

function row(r, { compact = false } = {}) {
  return h('div', { class: `rl-item ${r.read ? 'read' : ''}` },
    h('img', { class: 'rl-fav', src: faviconUrl(r.url), alt: '', width: 16, height: 16 }),
    h('a', { class: 'rl-text', href: r.url, title: r.url, onclick: () => markRead(r.id) },
      h('span', { class: 'rl-title' }, r.title || hostname(r.url)),
      h('span', { class: 'rl-meta' }, [hostname(r.url), r.minutes ? `${r.minutes} min de leitura` : null, compact ? null : relativeTime(r.addedAt)].filter(Boolean).join(' · '))),
    h('button', { class: 'icon-btn sm', title: r.read ? 'Marcar como não lido' : 'Marcar como lido', onclick: () => markRead(r.id, !r.read) }, icon('check', 13)),
    compact ? null : h('button', { class: 'icon-btn sm', title: 'Remover', onclick: () => remove(r.id) }, icon('x', 13)));
}

export function mountCard(el) {
  const render = () => {
    const items = unread();
    el.hidden = !items.length;
    if (!items.length) return;
    const total = items.reduce((n, r) => n + (r.minutes ?? 0), 0);
    fill(el,
      h('header', { class: 'card-head' },
        h('span', { class: 'eyebrow' }, `Ler depois · ${items.length}`),
        h('button', { class: 'btn btn-xs', onclick: openList }, total ? `${total} min · ver tudo` : 'Ver tudo')),
      h('div', { class: 'rl-list' }, items.slice(0, 4).map(r => row(r, { compact: true }))));
  };
  store.on('readLater', render);
  render();
}

export function openList() {
  const host = h('div', { class: 'rl-list full' });
  const draw = () => {
    const items = [...list()].sort((a, b) => (a.read - b.read) || (b.addedAt - a.addedAt));
    fill(host, items.length ? items.map(r => row(r)) : h('p', { class: 'muted small' }, 'Nada guardado. No HUD de qualquer site, use o botão “Ler depois”.'));
  };
  const off = store.on('readLater', draw);
  draw();
  const d = dialog({ title: 'Ler depois', subtitle: 'Abrir um artigo marca como lido.', className: 'dialog-wide', body: host, actions: [
    { label: 'Limpar lidos', onClick: () => { store.replace('readLater', list().filter(r => !r.read)); return false; } },
    { label: 'Fechar', kind: 'primary' }] });
  d.el.addEventListener('close', off);
}
