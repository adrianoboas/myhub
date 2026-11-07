// Gerado por scripts/web.mjs. Guarda o Hub para abrir sem internet.
const VERSION = "3.2.0-425849376b";
const CACHE = 'hub-app-' + VERSION;
const FILES = ["./","app.webmanifest","css/hub.css","css/spaces.css","css/workspace.css","fonts/inter.woff2","icons/apple180.png","icons/icon128.png","icons/icon16.png","icons/icon192.png","icons/icon32.png","icons/icon48.png","icons/icon512.png","icons/maskable512.png","index.html","js/backdrops.js","js/backup.js","js/bgfetch.js","js/bible.js","js/crypto.js","js/dom.js","js/icons.js","js/importer.js","js/main.js","js/markdown.js","js/merge.js","js/modules/activity.js","js/modules/agenda.js","js/modules/backdrop.js","js/modules/birthdays.js","js/modules/brain.js","js/modules/brief.js","js/modules/desk.js","js/modules/exams.js","js/modules/finance.js","js/modules/focus.js","js/modules/links.js","js/modules/palette.js","js/modules/reading.js","js/modules/readlater.js","js/modules/rest.js","js/modules/search.js","js/modules/settings.js","js/modules/study.js","js/modules/tasks.js","js/modules/widgets.js","js/modules/work.js","js/psalms.js","js/quickadd.js","js/recur.js","js/seeds.js","js/store.js","js/sync/browser.js","js/sync/drive.js","js/sync/gcal.js"];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  // apaga só as versões antigas do app (as fotos de fundo ficam em 'hub-bg')
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('hub-app-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  // Google, clima, fotos: sempre pela rede
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // abrir o app (inclusive voltando do login do Google, com #token) = index.html
    const hit = req.mode === 'navigate' ? await cache.match('./') : await cache.match(req, { ignoreSearch: true });
    return hit ?? fetch(req);
  })());
});
