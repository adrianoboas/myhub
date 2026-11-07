// Provedor de sincronização: Google Drive, pasta oculta do app (appDataFolder).
// Um arquivo `hub-<coleção>.json` por coleção; o carimbo t fica nas
// appProperties, então dá para comparar versões sem baixar o conteúdo.
//
// Autenticação: OAuth implícito.
//  - extensão: chrome.identity.launchWebAuthFlow (Chrome, Edge e Brave); o token
//    (1 h) fica em storage.session;
//  - versão web (tablet): a própria página vai ao Google e volta com o token no
//    #hash (consumeRedirect). Quando o token vence, a renovação é um vaivém
//    silencioso (prompt=none), feito ao abrir o app ou quando ninguém está
//    mexendo nele. O token fica no localStorage deste aparelho.

const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
// com o Google Agenda ligado, o mesmo login também pede a agenda criada pelo Hub (nada além dela)
export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.app.created';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const POLL_MS = 60000;
const PREFIX = 'hub-';
const SILENT_GAP = 3 * 60000; // no máximo um vaivém silencioso a cada 3 min

let clientId = '';
let files = {}; // nome da coleção -> { id, t, size }
let hooks = null;
let timer = null;
let onVisible = null;

const authError = msg => Object.assign(new Error(msg), { auth: true });

// ---------- Armazenamento (extensão ou página comum) ----------

const ext = typeof chrome !== 'undefined' && !!chrome.storage?.session;
export const isWeb = !ext;

const kv = {
  async get(key, area = 'session') {
    if (ext) return (await chrome.storage[area].get(key))[key];
    try { return JSON.parse(localStorage.getItem('hub-local:' + key)) ?? undefined; } catch { return undefined; }
  },
  async set(key, value, area = 'session') {
    if (ext) return chrome.storage[area].set({ [key]: value });
    try { localStorage.setItem('hub-local:' + key, JSON.stringify(value)); } catch {}
  },
  async remove(key, area = 'session') {
    if (ext) return chrome.storage[area].remove(key);
    try { localStorage.removeItem('hub-local:' + key); } catch {}
  }
};

const scopes = async () => ((await kv.get('gcalScope', 'local')) ? `${SCOPE} ${CALENDAR_SCOPE}` : SCOPE);

/** Liga ou desliga o pedido de acesso ao Google Agenda no próximo login. */
export const setCalendarScope = on => kv.set('gcalScope', !!on, 'local');

// ---------- Autenticação ----------

/** Endereço de retorno do login (cadastrado no Google Cloud). */
export const redirectUrl = () => (ext ? chrome.identity.getRedirectURL() : new URL('./', location.href).href);

const authUrl = async (prompt, state) => 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
  client_id: clientId,
  response_type: 'token',
  redirect_uri: redirectUrl(),
  scope: await scopes(),
  prompt,
  ...(state ? { state } : {})
});

async function saveToken(value, expiresIn) {
  const token = { value, exp: Date.now() + Number(expiresIn || 3600) * 1000 };
  await kv.set('driveToken', token);
  return token.value;
}

async function validToken() {
  const t = await kv.get('driveToken');
  return t && t.exp > Date.now() + 60000 ? t.value : null;
}

async function getToken({ interactive = false } = {}) {
  if (!interactive) { const t = await validToken(); if (t) return t; }
  if (!clientId) throw authError('Informe o Client ID do Google em Ajustes → Sincronização.');
  if (!ext) {
    if (interactive) return webRedirect('consent');
    throw authError('Sessão do Google expirou. Toque em Reconectar em Ajustes → Sincronização.');
  }

  const url = await authUrl(interactive ? 'consent' : 'none');
  let result;
  try {
    result = await chrome.identity.launchWebAuthFlow({ url, interactive, timeoutMsForNonInteractive: 10000 });
  } catch (err) {
    throw authError(interactive ? `Login cancelado ou recusado: ${err.message}` : 'Sessão do Google expirou. Clique em Reconectar em Ajustes.');
  }
  const params = new URLSearchParams(new URL(result).hash.slice(1));
  if (params.get('error') || !params.get('access_token')) throw authError(`Google recusou o acesso: ${params.get('error') || 'sem token'}`);
  return saveToken(params.get('access_token'), params.get('expires_in'));
}

// ---------- Login por redirecionamento (versão web) ----------

/**
 * Sai da página rumo ao Google; a volta cai em consumeRedirect. `pending` guarda
 * o que fazer na volta (a configuração a ativar, ligar o Google Agenda). Nunca resolve.
 */
async function webRedirect(prompt, pending = null) {
  const state = crypto.randomUUID();
  await kv.set('authFlow', { state, prompt, at: Date.now(), route: location.hash, pending });
  location.assign(await authUrl(prompt, state));
  return new Promise(() => {});
}

/**
 * Chamado na abertura da página (versão web): se ela voltou do Google, guarda o
 * token e devolve { ok, silent, pending } ou { ok: false, error }. Senão, null.
 */
export async function consumeRedirect() {
  if (ext) return null;
  const params = new URLSearchParams(location.hash.slice(1));
  if (!params.has('state') || !(params.has('access_token') || params.has('error'))) return null;
  const flow = await kv.get('authFlow');
  await kv.remove('authFlow');
  // tira o token da barra de endereço antes de qualquer outra coisa
  history.replaceState(null, '', location.pathname + location.search + (flow?.route || ''));
  if (!flow || flow.state !== params.get('state')) return { ok: false, error: 'Resposta de login inesperada; tente de novo.' };
  const silent = flow.prompt === 'none';
  if (params.get('error') || !params.get('access_token')) {
    if (silent) await kv.set('authSilentFail', Date.now(), 'local');
    const error = params.get('error');
    return { ok: false, silent, error: error === 'access_denied' ? 'Login cancelado.' : `Google recusou o acesso: ${error || 'sem token'}` };
  }
  await saveToken(params.get('access_token'), params.get('expires_in'));
  await kv.remove('authSilentFail', 'local');
  return { ok: true, silent, pending: flow.pending };
}

// alguém mexendo ou com uma janela aberta: não recarrega a página por baixo
let lastInput = 0;
if (!ext && typeof document !== 'undefined') {
  for (const t of ['keydown', 'pointerdown', 'input', 'wheel']) addEventListener(t, () => { lastInput = Date.now(); }, { capture: true, passive: true });
}
const busy = () => {
  const a = document.activeElement;
  return Date.now() - lastInput < 45000 || !!document.querySelector('dialog[open]') || document.body.classList.contains('resting') ||
    !!(a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)));
};

/**
 * Versão web: token vencido → vaivém silencioso pelo Google (sem tela de login
 * quando a conta já está conectada no navegador). `force` ignora o "ocupado"
 * (abertura do app, volta para o app). Devolve true se saiu da página.
 */
export async function renewIfNeeded({ force = false } = {}) {
  if (ext || !clientId || document.hidden || await validToken()) return false;
  // o silencioso já falhou (conta saiu do navegador, acesso revogado): só com o botão Reconectar
  if (await kv.get('authSilentFail', 'local')) return false;
  const flow = await kv.get('authFlow');
  if (flow && Date.now() - flow.at < SILENT_GAP) return false; // uma ida sem volta: não insiste
  if (!force && busy()) return false;
  webRedirect('none');
  return true;
}

/** Abre a janela de login do Google. Chamado pelo botão Conectar. */
export async function connect(id, { calendar, pending } = {}) {
  if (calendar !== undefined) await setCalendarScope(calendar);
  clientId = id;
  if (!ext) return webRedirect('consent', pending ?? null);
  await getToken({ interactive: true });
}

export async function disconnect() {
  const driveToken = await kv.get('driveToken');
  await kv.remove('driveToken');
  if (driveToken) fetch(`https://oauth2.googleapis.com/revoke?token=${driveToken.value}`, { method: 'POST' }).catch(() => {});
}

/** Requisição autenticada (também usada pelo Google Agenda, em gcal.js). */
export async function api(url, init = {}, retried = false) {
  const token = await getToken();
  const res = await fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } });
  if (res.status === 401 && !retried) {
    await kv.remove('driveToken');
    return api(url, init, true);
  }
  if (res.status === 429 || res.status >= 500) throw Object.assign(new Error(`Google Drive indisponível (${res.status}). Tentando de novo em 1 min.`), { retry: 60000 });
  if (!res.ok) throw new Error(`Google Drive: erro ${res.status} ${(await res.text()).slice(0, 160)}`);
  return res;
}

// ---------- Interface do provedor ----------

export async function start(cfg, h) {
  clientId = cfg.clientId || '';
  hooks = h;
  files = {};
  // versão web: com o token vencido, renova (vaivém pelo Google) em vez de sincronizar
  const tick = async force => { if (document.hidden) return; if (!(await renewIfNeeded({ force }))) hooks.requestPull(); };
  timer = setInterval(() => tick(false), POLL_MS);
  onVisible = () => tick(true);
  document.addEventListener('visibilitychange', onVisible);
  if (await renewIfNeeded({ force: true })) return new Promise(() => {});
  await getToken();
}

export function stop() {
  clearInterval(timer);
  if (onVisible) document.removeEventListener('visibilitychange', onVisible);
}

async function list() {
  const q = new URLSearchParams({ spaces: 'appDataFolder', fields: 'files(id,name,size,appProperties)', pageSize: '200' });
  const { files: found } = await (await api(`${API}/files?${q}`)).json();
  files = {};
  const dupes = [];
  for (const f of found) {
    if (!f.name.startsWith(PREFIX)) continue;
    const name = f.name.slice(PREFIX.length, -'.json'.length);
    const t = Number(f.appProperties?.t || 0);
    // dois PCs criando o arquivo ao mesmo tempo geram duplicatas: fica a mais nova.
    // O conteúdo da outra continua no PC que a enviou e volta na próxima mesclagem.
    if (!files[name] || t > files[name].t) { if (files[name]) dupes.push(files[name].id); files[name] = { id: f.id, t, size: Number(f.size || 0) }; }
    else dupes.push(f.id);
  }
  for (const id of dupes) api(`${API}/files/${id}`, { method: 'DELETE' }).catch(() => {});
}

export async function pull(stamps) {
  await list();
  const meta = {}, entries = {};
  for (const [name, f] of Object.entries(files)) {
    meta[name] = f.t;
    if (f.t > (stamps[name] ?? 0)) {
      const data = await (await api(`${API}/files/${f.id}?alt=media`)).json();
      entries[name] = { t: f.t, data };
    }
  }
  return { meta, entries };
}

function multipart(metadata, body) {
  const boundary = 'hub' + Math.random().toString(36).slice(2);
  return {
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`
  };
}

export async function push(list_) {
  for (const { name, t, data } of list_) {
    const body = JSON.stringify(data);
    const props = { appProperties: { t: String(t) } };
    const existing = files[name];
    const req = existing
      ? multipart(props, body)
      : multipart({ ...props, name: `${PREFIX}${name}.json`, parents: ['appDataFolder'] }, body);
    const url = existing
      ? `${UPLOAD}/files/${existing.id}?uploadType=multipart&fields=id,size`
      : `${UPLOAD}/files?uploadType=multipart&fields=id,size`;
    const res = await (await api(url, { method: existing ? 'PATCH' : 'POST', ...req })).json();
    files[name] = { id: res.id, t, size: Number(res.size || body.length) };
  }
}

export async function usage() {
  return { bytes: Object.values(files).reduce((n, f) => n + f.size, 0), quota: 0 };
}

// ---------- Backups (arquivos `bkp-AAAA-MM-DD.json`, fora das coleções) ----------

export async function backupList() {
  const q = new URLSearchParams({ spaces: 'appDataFolder', q: "name contains 'bkp-'", fields: 'files(id,name,size,createdTime)', pageSize: '100' });
  const { files: found } = await (await api(`${API}/files?${q}`)).json();
  return found.filter(f => f.name.startsWith('bkp-')).sort((a, b) => b.name.localeCompare(a.name))
    .map(f => ({ id: f.id, name: f.name, size: Number(f.size || 0), at: Date.parse(f.createdTime) }));
}

export async function backupPut(name, body) {
  const req = multipart({ name, parents: ['appDataFolder'] }, body);
  await api(`${UPLOAD}/files?uploadType=multipart&fields=id`, { method: 'POST', ...req });
}

export const backupGet = async id => (await api(`${API}/files/${id}?alt=media`)).json();

export const backupDelete = id => api(`${API}/files/${id}`, { method: 'DELETE' });
