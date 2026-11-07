// Download da imagem de fundo do dia, compartilhado entre o service worker da
// extensão (background.js) e a versão web (js/modules/backdrop.js).
// Pede ao Wikimedia Commons a miniatura no tamanho certo (4k ≈ 2 MB, Full HD
// ≈ 400 KB, no modo economia) e guarda no Cache Storage. Se a miniatura
// falhar, baixa o original e reduz aqui mesmo.

import { BACKDROPS } from './backdrops.js';

export const BG_CACHE = 'hub-bg';
export const bgKey = (idx, width) => `https://hub.local/bg/${idx}-${width}.jpg`;
export const bgDay = () => { const d = new Date(); return Math.floor((d - d.getTimezoneOffset() * 60000) / 86400000); };

async function thumbUrl(photo, width) {
  const title = decodeURIComponent(photo.page.split('/wiki/')[1]);
  const q = new URLSearchParams({ action: 'query', titles: title, prop: 'imageinfo', iiprop: 'url', iiurlwidth: width, format: 'json', formatversion: '2', origin: '*' });
  const j = await (await fetch(`https://commons.wikimedia.org/w/api.php?${q}`)).json();
  return j.query.pages[0].imageinfo[0].thumburl;
}

async function downscaledOriginal(url, width) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status}`);
  const bitmap = await createImageBitmap(await res.blob());
  const scale = Math.min(1, width / bitmap.width);
  const w = Math.round(bitmap.width * scale), hgt = Math.round(bitmap.height * scale);
  const canvas = new OffscreenCanvas(w, hgt);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, w, hgt);
  bitmap.close();
  return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.86 });
}

/** Garante a foto `idx` no cache, na largura pedida. */
export async function prepareBackdrop(idx, width) {
  idx = ((idx % BACKDROPS.length) + BACKDROPS.length) % BACKDROPS.length;
  const cache = await caches.open(BG_CACHE);
  if (await cache.match(bgKey(idx, width))) return true;
  const photo = BACKDROPS[idx];
  let blob;
  try {
    const res = await fetch(await thumbUrl(photo, width));
    if (!res.ok) throw new Error(`miniatura ${res.status}`);
    blob = await res.blob();
  } catch {
    blob = await downscaledOriginal(photo.url, width);
  }
  await cache.put(bgKey(idx, width), new Response(blob, { headers: { 'Content-Type': 'image/jpeg' } }));
  // guarda só as mais recentes
  const keys = await cache.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - 4))) await cache.delete(k);
  return true;
}
