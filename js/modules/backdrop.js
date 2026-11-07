// Imagem de fundo do Início: uma foto por dia da coleção em js/backdrops.js.
// O service worker (ou, na versão web, a página) baixa a miniatura em 4k (ou Full HD no modo economia) e
// guarda no Cache Storage ('hub-bg'); aqui só lemos o arquivo pronto.

import * as store from '../store.js';
import { BACKDROPS } from '../backdrops.js';
import { h, icon, fill, isExtension } from '../dom.js';
import { prepareBackdrop } from '../bgfetch.js';

const CACHE = 'hub-bg';
let layer, credit;
let currentUrl = null;

const dayNumber = () => { const d = new Date(); return Math.floor((d - d.getTimezoneOffset() * 60000) / 86400000); };
export const cacheKey = (idx, width) => `https://hub.local/bg/${idx}-${width}.jpg`;
const width = () => (store.get('settings').backdropQuality === 'hd' ? 1920 : 3840);

async function todayIndex() {
  const offset = (await store.local.get('bgOffset')) ?? 0;
  return (dayNumber() + offset) % BACKDROPS.length;
}

export function mount() {
  layer = h('div', { class: 'backdrop', 'aria-hidden': 'true' });
  credit = h('div', { class: 'backdrop-credit' });
  document.body.prepend(layer);
  document.body.append(credit);
  store.on('settings', apply);
  apply();
  // vira o dia com a aba aberta
  document.addEventListener('visibilitychange', () => { if (!document.hidden) apply(); });
}

async function apply() {
  const on = store.get('settings').backdrop && 'caches' in self && isSecureContext;
  document.body.classList.toggle('has-backdrop', !!on);
  if (!on) { layer.style.backgroundImage = ''; fill(credit); return; }
  const idx = await todayIndex();
  const photo = BACKDROPS[idx];
  let res = await caches.open(CACHE).then(c => c.match(cacheKey(idx, width())));
  if (!res) {
    // ainda não preparada: pede ao service worker e mostra assim que chegar
    // na extensão o service worker baixa; na versão web, a própria página
    const ok = isExtension
      ? (await chrome.runtime.sendMessage({ type: 'bg:prepare', idx, width: width() }).catch(() => null))?.ok
      : await prepareBackdrop(idx, width()).then(() => true, () => false);
    if (!ok) return;
    res = await caches.open(CACHE).then(c => c.match(cacheKey(idx, width())));
    if (!res) return;
  }
  const url = URL.createObjectURL(await res.blob());
  if (currentUrl) URL.revokeObjectURL(currentUrl);
  currentUrl = url;
  layer.style.backgroundImage = `url("${url}")`;
  layer.classList.add('ready');
  fill(credit,
    h('a', { href: photo.page, target: '_blank', rel: 'noopener', title: 'Ver a foto no Wikimedia Commons' },
      `${photo.title} · ${photo.author} · ${photo.license}`),
    h('button', { class: 'icon-btn sm', title: 'Outra imagem', onclick: next }, icon('refresh-cw', 13)));
}

async function next() {
  const offset = ((await store.local.get('bgOffset')) ?? 0) + 1;
  await store.local.set('bgOffset', offset);
  layer.classList.remove('ready');
  apply();
}
