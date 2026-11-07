// Cérebro: organizador de anotações em seções > pastas > notas.
// Pastas podem ser trancadas: as notas delas passam a viver só dentro de um
// cofre criptografado (folder.vault) e são decifradas em memória ao abrir.

import * as store from '../store.js';
import { COLORS, INBOX } from '../seeds.js';
import { createVault, openVault, readVault, resealVault, onAutoLock } from '../crypto.js';
import { h, icon, uid, fill, clear, debounce, relativeTime, toast, prompt, confirmDialog, passwordDialog, dialog, dateKey } from '../dom.js';
import { render as renderMd, toggleLine, linksIn } from '../markdown.js';

const brain = () => store.get('brain');
const folderById = id => brain().folders.find(f => f.id === id);
const sectionById = id => brain().sections.find(s => s.id === id);

const unlocked = new Map(); // folderId -> { key, notes, ct }

let root, navEl, mainEl;
let mode = { kind: 'map' }; // map | folder {id} | pinned | search {q}
let view = 'edit'; // edit | read (por PC)
store.local.get('brainView').then(v => { if (v) view = v; });
let activeNoteId = null;

export function mount(el) {
  root = el;
  navEl = h('aside', { class: 'brain-nav card' });
  mainEl = h('section', { class: 'brain-main card' });
  root.append(navEl, mainEl);

  store.on('brain', async (_, origin) => {
    if (origin === 'remote') await refreshUnlocked();
    if (mode.kind === 'folder' && !folderById(mode.id)) mode = { kind: 'map' };
    renderNav();
    // não refaz o editor enquanto o usuário digita
    if (origin === 'remote' && !mainEl.contains(document.activeElement)) renderMain();
    else renderMainSoon();
  });
  onAutoLock(() => { if (unlocked.size) { unlocked.clear(); render(); } });
  render();
}

function render() { renderNav(); renderMain(); }
const renderMainSoon = debounce(() => { if (!mainEl.contains(document.activeElement)) renderMain(); else renderListOnly(); }, 250);

// ---------- Dados ----------

const titleOf = n => n.title.trim() || n.content.trim().split('\n')[0].slice(0, 60) || 'Sem título';

/** Notas de uma pasta; null se a pasta está trancada e fechada. */
function notesOf(folderId) {
  const f = folderById(folderId);
  if (!f) return [];
  if (f.locked) return unlocked.get(folderId)?.notes ?? null;
  return brain().notes.filter(n => n.folderId === folderId);
}

/** Todas as notas acessíveis agora (as trancadas só se abertas). */
function allNotes() {
  const out = brain().notes.filter(n => folderById(n.folderId) && !folderById(n.folderId).locked);
  for (const [id, u] of unlocked) if (folderById(id)) out.push(...u.notes.map(n => ({ ...n, folderId: id, _ref: n })));
  return out;
}

const sorted = list => [...list].sort((a, b) => (b.pinned - a.pinned) || (b.updatedAt - a.updatedAt));

async function refreshUnlocked() {
  for (const [id, u] of unlocked) {
    const f = folderById(id);
    if (!f?.locked) { unlocked.delete(id); continue; }
    if (f.vault.ct === u.ct) continue;
    try { u.notes = await readVault(u.key, f.vault); u.ct = f.vault.ct; }
    catch { unlocked.delete(id); } // senha trocada em outro PC: pede de novo
  }
}

const sealSoon = {};
const commitSoon = debounce(() => store.commit('brain'), 400);
function saveFolder(folderId) {
  const f = folderById(folderId);
  if (!f?.locked) { commitSoon(); return; }
  sealSoon[folderId] ??= debounce(async () => {
    const u = unlocked.get(folderId);
    const folder = folderById(folderId);
    if (!u || !folder) return;
    folder.vault = await resealVault(u.key, folder.vault, u.notes);
    u.ct = folder.vault.ct;
    store.commit('brain');
  }, 500);
  sealSoon[folderId]();
}

/** Adiciona uma nota na Caixa de entrada (usado pela Mesa e pelo HUD). */
export function capture(text, title = '') {
  const value = text.trim();
  if (!value && !title) return;
  brain().notes.push({ id: uid(), folderId: INBOX, title, content: value, pinned: false, createdAt: Date.now(), updatedAt: Date.now() });
  store.commit('brain');
}

export const accessibleNotes = () => allNotes();
export const pinnedNotes = () => sorted(allNotes().filter(n => n.pinned));
export const recentNotes = (n = 5) => sorted(allNotes()).slice(0, n);

/** Abre uma nota específica (chamado pela Mesa). */
export function openNote(note) {
  mode = { kind: 'folder', id: note.folderId };
  activeNoteId = note.id;
  render();
}

// ---------- Navegação lateral ----------

function navItem({ ic, label, count, active, onclick, color, locked }) {
  return h('button', { class: `brain-link ${active ? 'active' : ''}`, onclick, style: color ? { '--dot': color } : null },
    icon(ic, 15), h('span', { class: 'brain-link-label' }, label),
    locked ? icon(unlockedState(locked) ? 'lock-open' : 'lock', 12) : null,
    count ? h('span', { class: 'count' }, count) : null);
}
const unlockedState = id => unlocked.has(id);

function renderNav() {
  const b = brain();
  const search = h('input', { class: 'input input-sm', placeholder: 'Buscar no cérebro…', value: mode.kind === 'search' ? mode.q : '', autocomplete: 'off' });
  search.addEventListener('input', debounce(() => {
    const q = search.value.trim();
    mode = q ? { kind: 'search', q } : { kind: 'map' };
    renderMain();
  }, 200));

  const inbox = folderById(INBOX);
  fill(navEl,
    h('header', { class: 'brain-head' },
      h('span', { class: 'brain-logo' }, icon('brain', 18)), h('h2', {}, 'Cérebro'),
      h('span', { class: 'spacer' }),
      h('button', { class: 'icon-btn sm', title: 'Nova nota (N)', onclick: () => newNote() }, icon('pen-line', 15))
    ),
    search,
    h('nav', { class: 'brain-links' },
      navItem({ ic: 'layout-grid', label: 'Mapa', active: mode.kind === 'map', onclick: () => go({ kind: 'map' }) }),
      inbox ? navItem({ ic: 'inbox', label: inbox.name, count: notesOf(INBOX).length || null, active: mode.kind === 'folder' && mode.id === INBOX, onclick: () => go({ kind: 'folder', id: INBOX }) }) : null,
      navItem({ ic: 'pin', label: 'Fixadas', count: pinnedNotes().length || null, active: mode.kind === 'pinned', onclick: () => go({ kind: 'pinned' }) })
    ),
    h('div', { class: 'brain-sections' }, b.sections.map(s => {
      const folders = b.folders.filter(f => f.sectionId === s.id);
      return h('section', { class: 'brain-section', style: { '--dot': COLORS[s.color] ?? COLORS.violet } },
        h('header', { class: 'brain-section-head' },
          h('span', { class: 'dot' }), h('span', { class: 'brain-section-name' }, s.name),
          h('span', { class: 'brain-tools' },
            h('button', { class: 'icon-btn sm', title: 'Nova pasta', onclick: () => newFolder(s.id) }, icon('folder-plus', 13)),
            h('button', { class: 'icon-btn sm', title: 'Opções da seção', onclick: () => sectionMenu(s) }, icon('ellipsis-vertical', 13)))
        ),
        folders.map(f => navItem({
          ic: f.locked ? 'folder-lock' : 'folder', label: f.name, locked: f.locked ? f.id : null,
          count: f.locked ? null : notesOf(f.id).length || null,
          active: mode.kind === 'folder' && mode.id === f.id, onclick: () => go({ kind: 'folder', id: f.id })
        })),
        folders.length ? null : h('button', { class: 'brain-empty-folder', onclick: () => newFolder(s.id) }, '+ pasta')
      );
    })),
    h('button', { class: 'brain-new-section', onclick: newSection }, icon('plus', 14), 'Nova seção')
  );
}

function go(m) {
  mode = m;
  activeNoteId = null;
  render();
}

// ---------- Área principal ----------

function renderMain() {
  if (mode.kind === 'map') return renderMap();
  if (mode.kind === 'pinned') return renderList('Fixadas', 'Notas fixadas de todas as pastas', pinnedNotes(), null);
  if (mode.kind === 'search') {
    const q = mode.q.toLowerCase();
    return renderList(`Busca: “${mode.q}”`, 'Inclui pastas trancadas que estão abertas', sorted(allNotes().filter(n => (n.title + '\n' + n.content).toLowerCase().includes(q))), null);
  }
  const f = folderById(mode.id);
  if (!f) return go({ kind: 'map' });
  if (f.locked && !unlocked.has(f.id)) return renderLocked(f);
  renderList(f.name, f.sectionId ? sectionById(f.sectionId)?.name : 'Tudo que chega pelo HUD e pela captura rápida', sorted(notesOf(f.id)), f);
}

function renderLocked(f) {
  const tryOpen = async () => {
    await passwordDialog({
      title: `Abrir “${f.name}”`, subtitle: 'Esta pasta é criptografada.',
      check: async pw => { const { key, data } = await openVault(pw, f.vault); unlocked.set(f.id, { key, notes: data, ct: f.vault.ct }); }
    });
    render();
  };
  fill(mainEl, h('div', { class: 'lock-screen' },
    h('div', { class: 'lock-badge' }, icon('lock', 26)),
    h('h2', {}, f.name),
    h('p', { class: 'muted' }, 'Pasta trancada. O conteúdo só é decifrado com a senha.'),
    h('button', { class: 'btn btn-primary', onclick: tryOpen }, icon('lock-open', 15), 'Desbloquear')
  ));
}

let listHost = null;
function renderList(title, subtitle, notes, folder) {
  if (!notes.some(n => n.id === activeNoteId)) activeNoteId = notes[0]?.id ?? null;
  listHost = h('div', { class: 'brain-notes' });
  const tools = folder ? [
    h('button', { class: 'btn btn-primary btn-sm', onclick: () => newNote(folder.id) }, icon('plus', 14), 'Nota'),
    h('button', { class: 'btn btn-sm', title: 'Nova nota a partir de um modelo', onclick: () => pickTemplate(folder.id) }, icon('sticky-note', 14), 'Modelo'),
    folder.locked ? h('button', { class: 'icon-btn sm', title: 'Trancar agora', onclick: () => { unlocked.delete(folder.id); render(); } }, icon('lock', 15)) : null,
    folder.system ? null : h('button', { class: 'icon-btn sm', title: 'Opções da pasta', onclick: () => folderMenu(folder) }, icon('ellipsis-vertical', 15))
  ] : [];

  fill(mainEl,
    h('header', { class: 'brain-main-head' },
      h('div', {},
        h('h2', {}, folder?.locked ? icon('lock-open', 16) : null, title),
        subtitle ? h('p', { class: 'muted small' }, subtitle) : null),
      h('span', { class: 'spacer' }), ...tools
    ),
    h('div', { class: 'brain-body' }, listHost, h('div', { class: 'brain-editor' }))
  );
  renderListOnly(notes);
  renderEditor();
}

function currentListNotes() {
  if (mode.kind === 'pinned') return pinnedNotes();
  if (mode.kind === 'search') { const q = mode.q.toLowerCase(); return sorted(allNotes().filter(n => (n.title + '\n' + n.content).toLowerCase().includes(q))); }
  if (mode.kind === 'folder') return sorted(notesOf(mode.id) ?? []);
  return [];
}

function renderListOnly(notes = currentListNotes()) {
  if (!listHost?.isConnected) return;
  clear(listHost);
  if (!notes.length) { listHost.append(h('p', { class: 'muted small empty-line' }, 'Nenhuma nota aqui ainda.')); return; }
  for (const n of notes) {
    const f = folderById(n.folderId);
    const snippet = n.content.replace(/\s+/g, ' ').trim().slice(0, 90);
    listHost.append(h('button', { class: `note-card ${n.id === activeNoteId ? 'active' : ''}`, onclick: () => { activeNoteId = n.id; renderListOnly(); renderEditor(); } },
      h('span', { class: 'note-card-title' }, n.pinned ? icon('pin', 11) : null, titleOf(n)),
      snippet && n.title.trim() ? h('span', { class: 'note-card-snippet' }, snippet) : null,
      h('span', { class: 'note-card-meta' },
        mode.kind !== 'folder' && f ? h('span', { class: 'folder-tag' }, f.name) : null,
        relativeTime(n.updatedAt))
    ));
  }
}

function findNote(id) {
  const plain = brain().notes.find(n => n.id === id);
  if (plain) return plain;
  for (const [fid, u] of unlocked) {
    const n = u.notes.find(x => x.id === id);
    if (n) return Object.assign(n, { folderId: fid });
  }
  return null;
}

function renderEditor() {
  const host = mainEl.querySelector('.brain-editor');
  if (!host) return;
  const note = activeNoteId && findNote(activeNoteId);
  if (!note) {
    fill(host, h('div', { class: 'empty' }, icon('notebook-pen', 28), h('p', {}, 'Selecione ou crie uma nota.')));
    return;
  }
  const id = note.id;
  const live = () => findNote(id) ?? note;
  const status = h('span', { class: 'muted small' }, `Editada ${relativeTime(note.updatedAt)}`);
  const touch = () => {
    const n = live();
    n.updatedAt = Date.now();
    status.textContent = 'Salvo';
    saveFolder(n.folderId);
    renderListSoon();
  };
  const title = h('input', { class: 'note-title', placeholder: 'Título', value: note.title, autocomplete: 'off' });
  const body = h('textarea', { class: 'note-body', placeholder: 'Escreva aqui. Linhas começando com “- [ ]” viram uma lista de tarefas.' });
  body.value = note.content;
  title.addEventListener('input', () => { live().title = title.value; touch(); });
  title.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); body.focus(); } });
  body.addEventListener('input', () => { live().content = body.value; touch(); });

  const accessible = brain().folders.filter(f => !f.locked || unlocked.has(f.id));
  const move = h('select', { class: 'input input-sm move-select', title: 'Mover para outra pasta' },
    accessible.map(f => h('option', { value: f.id, selected: f.id === note.folderId }, (f.locked ? '🔒 ' : '') + f.name)));
  move.addEventListener('change', () => moveNote(live(), move.value));

  const toggleView = () => { view = view === 'read' ? 'edit' : 'read'; store.local.set('brainView', view); renderEditor(); };
  host.onkeydown = e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') { e.preventDefault(); toggleView(); } };

  const toolbar = h('div', { class: 'note-toolbar' },
    status, h('span', { class: 'spacer' }), move,
    h('button', { class: `icon-btn sm ${view === 'read' ? 'on' : ''}`, title: view === 'read' ? 'Editar (Ctrl+E)' : 'Ler formatado (Ctrl+E)', onclick: toggleView }, icon(view === 'read' ? 'pencil' : 'eye', 14)),
    h('button', { class: `icon-btn sm ${note.pinned ? 'on' : ''}`, title: note.pinned ? 'Desafixar' : 'Fixar', onclick: () => { const n = live(); n.pinned = !n.pinned; saveFolder(n.folderId); renderEditor(); renderListOnly(); } }, icon('pin', 14)),
    h('button', { class: 'icon-btn sm', title: 'Excluir nota', onclick: () => removeNote(live()) }, icon('trash-2', 14))
  );

  if (view === 'read') {
    const read = h('div', { class: 'note-read', tabindex: 0 },
      h('h1', { class: 'note-read-title' }, titleOf(note)),
      note.content.trim() ? renderMd(note.content, {
        onToggle: i => { const n = live(); n.content = toggleLine(n.content, i); touch(); renderEditor(); },
        onLink: name => followLink(name, live().folderId),
        exists: name => !!noteByTitle(name)
      }) : h('p', { class: 'muted' }, 'Nota vazia. Ctrl+E para editar.'),
      backlinks(note));
    fill(host, toolbar, read);
    return;
  }
  fill(host, toolbar, title, body,
    h('p', { class: 'note-hint muted small' }, 'Formatação: # título · **negrito** · *itálico* · - lista · - [ ] caixinha · > citação · [[Nome de outra nota]] · Ctrl+E para ler'));
}

// ---------- Links entre notas ----------

const fold = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const noteByTitle = name => allNotes().find(n => fold(titleOf(n)) === fold(name));

/** Abre a nota citada por [[nome]]; se não existir, cria na mesma pasta. */
function followLink(name, folderId) {
  const target = noteByTitle(name);
  if (target) { openNote(target); return; }
  newNote(folderId, { title: name });
  view = 'edit';
}

function backlinks(note) {
  const me = fold(titleOf(note));
  const refs = allNotes().filter(n => n.id !== note.id && linksIn(n.content).some(l => fold(l) === me));
  if (!refs.length) return null;
  return h('div', { class: 'backlinks' },
    h('span', { class: 'eyebrow' }, 'Mencionada em'),
    refs.map(n => h('button', { class: 'folder-tag', onclick: () => openNote(n) }, titleOf(n))));
}

// ---------- Modelos ----------

const TEMPLATES = [
  { icon: 'calendar', name: 'Diário', title: () => `Diário · ${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}`,
    body: '## Como estou\n\n\n## Sou grato por\n- \n- \n- \n\n## Hoje eu quero\n- [ ] \n\n## Aprendi\n' },
  { icon: 'list-todo', name: 'Ata de reunião', title: () => `Reunião · ${new Date().toLocaleDateString('pt-BR')}`,
    body: '**Participantes:** \n**Assunto:** \n\n## Pauta\n1. \n\n## Decisões\n- \n\n## Próximos passos\n- [ ] (responsável, prazo)\n' },
  { icon: 'book-open', name: 'Resumo de livro', title: () => 'Livro: ',
    body: '**Autor:** \n**Lido em:** ' + new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) + '\n\n## Ideias centrais\n- \n\n## Citações\n> \n\n## O que vou aplicar\n- [ ] \n' },
  { icon: 'graduation-cap', name: 'Estudo', title: () => 'Estudo: ',
    body: '## Conceitos\n- \n\n## Exemplos\n- \n\n## Dúvidas\n- [ ] \n\n## Relacionado\n[[ ]]\n' }
];

function pickTemplate(folderId) {
  const d = dialog({
    title: 'Nova nota a partir de um modelo',
    body: h('div', { class: 'template-grid' }, TEMPLATES.map(t => h('button', { type: 'button', class: 'template', onclick: () => {
      d.close();
      newNote(folderId, { title: t.title(), content: t.body });
    } }, icon(t.icon, 18), h('strong', {}, t.name)))),
    actions: [{ label: 'Cancelar' }]
  });
}
const renderListSoon = debounce(() => renderListOnly(), 300);

// ---------- Mapa neural ----------

function renderMap() {
  const b = brain();
  const W = 1000, H = 600, cx = W / 2, cy = H / 2 + 10;
  const svg = (tag, attrs = {}, ...kids) => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    kids.flat().forEach(k => k && el.append(k));
    return el;
  };
  const text = (x, y, s, cls) => { const t = svg('text', { x, y, class: cls, 'text-anchor': 'middle' }); t.textContent = s; return t; };

  const lines = svg('g', { class: 'map-lines' });
  const pos = {}; // pasta -> {x, y}
  const nodes = svg('g', { class: 'map-nodes' });
  const secs = b.sections;
  secs.forEach((s, i) => {
    // seções numa elipse em volta do núcleo, começando pela esquerda: com duas
    // seções elas ficam lado a lado, como os hemisférios
    const a = Math.PI + (i / Math.max(secs.length, 1)) * Math.PI * 2;
    const sx = cx + Math.cos(a) * 300, sy = cy + Math.sin(a) * 190;
    const color = COLORS[s.color] ?? COLORS.violet;
    lines.append(svg('path', { d: `M${cx},${cy} Q${(cx + sx) / 2 + Math.sin(a) * 40},${(cy + sy) / 2 - Math.cos(a) * 40} ${sx},${sy}`, stroke: color, class: 'map-axon' }));
    const folders = b.folders.filter(f => f.sectionId === s.id);
    folders.forEach((f, j) => {
      const spread = Math.min(1.5, 0.55 * folders.length);
      const fa = a + (folders.length === 1 ? 0 : (j / (folders.length - 1) - 0.5) * spread);
      const fx = sx + Math.cos(fa) * 105, fy = sy + Math.sin(fa) * 80;
      lines.append(svg('line', { x1: sx, y1: sy, x2: fx, y2: fy, stroke: color, class: 'map-dendrite' }));
      const count = f.locked ? 0 : notesOf(f.id).length;
      // cada nota é uma sinapse em volta da pasta
      for (let k = 0; k < Math.min(count, 14); k++) {
        const na = fa + (k - Math.min(count, 14) / 2) * 0.42;
        nodes.append(svg('circle', { cx: fx + Math.cos(na) * 24, cy: fy + Math.sin(na) * 24, r: 2.2, fill: color, class: 'map-synapse' }));
      }
      pos[f.id] = { x: fx, y: fy };
      const g = svg('g', { class: 'map-folder', tabindex: 0, role: 'button' },
        svg('circle', { cx: fx, cy: fy, r: 13 + Math.min(count, 20) * 0.5, fill: 'var(--surface-solid)', stroke: color }),
        f.locked ? svg('text', { x: fx, y: fy + 4, class: 'map-lock', 'text-anchor': 'middle' }, '🔒') : text(fx, fy + 4, count, 'map-count'),
        text(fx, fy + 30 + Math.min(count, 20) * 0.5, f.name, 'map-label'));
      g.addEventListener('click', () => go({ kind: 'folder', id: f.id }));
      g.addEventListener('keydown', e => { if (e.key === 'Enter') go({ kind: 'folder', id: f.id }); });
      nodes.append(g);
    });
    nodes.append(svg('g', { class: 'map-section' },
      svg('circle', { cx: sx, cy: sy, r: 22, fill: color, class: 'map-section-dot' }),
      // rótulo voltado para o núcleo: as pastas crescem para fora
      text(sx - Math.cos(a) * 66, sy - Math.sin(a) * 40 + 5, s.name, 'map-section-label')));
  });
  pos[INBOX] = { x: cx, y: cy };
  // notas que citam notas de outra pasta viram conexões entre as pastas
  const seen = new Set();
  for (const n of allNotes()) {
    for (const name of linksIn(n.content)) {
      const target = noteByTitle(name);
      if (!target || target.folderId === n.folderId) continue;
      const k = [n.folderId, target.folderId].sort().join('>');
      const p1 = pos[n.folderId], p2 = pos[target.folderId];
      if (seen.has(k) || !p1 || !p2) continue;
      seen.add(k);
      lines.append(svg('path', { d: `M${p1.x},${p1.y} Q${(p1.x + p2.x) / 2},${(p1.y + p2.y) / 2 - 60} ${p2.x},${p2.y}`, class: 'map-link' }));
    }
  }
  const inboxCount = notesOf(INBOX).length;
  const core = svg('g', { class: 'map-core', tabindex: 0, role: 'button' },
    svg('circle', { cx, cy, r: 46, class: 'map-core-halo' }),
    svg('circle', { cx, cy, r: 30, class: 'map-core-dot' }),
    text(cx, cy + 5, inboxCount || '·', 'map-core-count'),
    text(cx, cy + 66, 'Caixa de entrada', 'map-label'));
  core.addEventListener('click', () => go({ kind: 'folder', id: INBOX }));
  nodes.append(core);

  const total = allNotes().length;
  const capture_ = h('input', { class: 'input', placeholder: 'Capturar uma ideia… (Enter guarda na Caixa de entrada)', autocomplete: 'off' });
  capture_.addEventListener('keydown', e => { if (e.key === 'Enter' && capture_.value.trim()) { capture(capture_.value); capture_.value = ''; toast('Guardado na Caixa de entrada.'); } });

  fill(mainEl,
    h('header', { class: 'brain-main-head' },
      h('div', {}, h('h2', {}, 'Mapa'), h('p', { class: 'muted small' }, `${total} notas em ${b.folders.length} pastas e ${b.sections.length} seções. Clique num nó para abrir.`)),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn btn-sm', onclick: newSection }, icon('plus', 14), 'Seção')
    ),
    h('div', { class: 'map-wrap' }, svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'brain-map', role: 'img', 'aria-label': 'Mapa das seções e pastas' }, lines, nodes)),
    h('div', { class: 'map-capture' }, icon('lightbulb', 16), capture_),
    h('div', { class: 'map-recent' },
      h('span', { class: 'eyebrow' }, 'Recentes'),
      h('div', { class: 'recent-grid' }, recentNotes(6).map(n => h('button', { class: 'recent-card', onclick: () => openNote(n) },
        h('span', { class: 'note-card-title' }, titleOf(n)),
        h('span', { class: 'note-card-meta' }, h('span', { class: 'folder-tag' }, folderById(n.folderId)?.name ?? ''), relativeTime(n.updatedAt)))))
    )
  );
}

// ---------- Ações ----------

export function newNote(folderId, { title = '', content = '' } = {}) {
  let target = folderId ?? (mode.kind === 'folder' ? mode.id : INBOX);
  const f = folderById(target);
  if (!f || (f.locked && !unlocked.has(f.id))) target = INBOX;
  const note = { id: uid(), folderId: target, title, content, pinned: false, createdAt: Date.now(), updatedAt: Date.now() };
  view = 'edit';
  const lockedFolder = folderById(target).locked;
  if (lockedFolder) unlocked.get(target).notes.push(note);
  else brain().notes.push(note);
  mode = { kind: 'folder', id: target };
  activeNoteId = note.id;
  saveFolder(target);
  render();
  const t = mainEl.querySelector('.note-title');
  if (t && title && !title.endsWith(': ')) mainEl.querySelector('.note-body')?.focus(); else t?.focus();
}

function removeFromFolder(note) {
  const f = folderById(note.folderId);
  const list = f?.locked ? unlocked.get(f.id).notes : brain().notes;
  const index = list.findIndex(n => n.id === note.id);
  list.splice(index, 1);
  return { list, index };
}

function removeNote(note) {
  const folderId = note.folderId;
  const { list, index } = removeFromFolder(note);
  activeNoteId = null;
  saveFolder(folderId);
  render();
  toast(`Nota “${titleOf(note)}” excluída.`, { action: 'Desfazer', onAction: () => { list.splice(index, 0, note); saveFolder(folderId); activeNoteId = note.id; render(); } });
}

function moveNote(note, toId) {
  const from = note.folderId;
  if (from === toId) return;
  removeFromFolder(note);
  const to = folderById(toId);
  const moved = { ...note, folderId: toId, updatedAt: Date.now() };
  delete moved._ref;
  if (to.locked) unlocked.get(toId).notes.push(moved);
  else brain().notes.push(moved);
  saveFolder(from);
  saveFolder(toId);
  mode = { kind: 'folder', id: toId };
  activeNoteId = moved.id;
  render();
}

async function newSection() {
  const name = await prompt({ title: 'Nova seção', subtitle: 'Uma grande área da vida: Trabalho, Saúde, Projetos, Família…', placeholder: 'Nome da seção', confirm: 'Criar' });
  if (!name) return;
  const keys = Object.keys(COLORS);
  brain().sections.push({ id: uid(), name, color: keys[brain().sections.length % keys.length] });
  store.commit('brain');
}

async function newFolder(sectionId) {
  const name = await prompt({ title: 'Nova pasta', subtitle: sectionById(sectionId)?.name, placeholder: 'Nome da pasta', confirm: 'Criar' });
  if (!name) return;
  const f = { id: uid(), sectionId, name };
  brain().folders.push(f);
  store.commit('brain');
  go({ kind: 'folder', id: f.id });
}

function sectionMenu(s) {
  const colorRow = h('div', { class: 'swatches' }, Object.entries(COLORS).map(([k, c]) => h('button', {
    type: 'button', class: `swatch ${s.color === k ? 'selected' : ''}`, style: { '--c': c }, 'aria-label': k,
    onclick: e => { sectionById(s.id).color = k; store.commit('brain'); e.currentTarget.parentNode.querySelectorAll('.swatch').forEach(b => b.classList.toggle('selected', b === e.currentTarget)); }
  })));
  const d = dialog({
    title: s.name, subtitle: 'Seção',
    body: h('div', { class: 'fields' }, h('div', { class: 'field' }, h('span', {}, 'Cor'), colorRow)),
    actions: [
      { label: 'Excluir seção', kind: 'ghost-danger', onClick: () => { deleteSection(s); } },
      { label: 'Renomear', onClick: async () => { d.close(); const name = await prompt({ title: 'Renomear seção', value: s.name }); if (name) { sectionById(s.id).name = name; store.commit('brain'); } } },
      { label: 'Fechar', kind: 'primary' }
    ]
  });
}

async function deleteSection(s) {
  const b = brain();
  const folders = b.folders.filter(f => f.sectionId === s.id);
  const notesCount = folders.reduce((n, f) => n + (f.locked ? 0 : notesOf(f.id).length), 0);
  if (folders.length && !(await confirmDialog({ title: `Excluir “${s.name}”?`, message: `A seção tem ${folders.length} pastas e ${notesCount} notas visíveis (mais o conteúdo de pastas trancadas). Tudo será excluído.`, confirm: 'Excluir', danger: true }))) return;
  const snapshot = JSON.parse(JSON.stringify(b));
  const ids = new Set(folders.map(f => f.id));
  b.sections = b.sections.filter(x => x.id !== s.id);
  b.folders = b.folders.filter(f => !ids.has(f.id));
  b.notes = b.notes.filter(n => !ids.has(n.folderId));
  ids.forEach(id => unlocked.delete(id));
  mode = { kind: 'map' };
  store.commit('brain');
  toast(`Seção “${s.name}” excluída.`, { action: 'Desfazer', onAction: () => store.replace('brain', snapshot) });
}

function folderMenu(f) {
  const actions = [{ label: 'Excluir pasta', kind: 'ghost-danger', onClick: () => { deleteFolder(f); } }];
  if (f.locked) actions.push({ label: 'Trocar senha', onClick: () => { changeLock(f); } }, { label: 'Remover senha', onClick: () => { removeLock(f); } });
  else actions.push({ label: 'Trancar com senha', onClick: () => { lockFolder(f); } });
  actions.push({ label: 'Renomear', onClick: async () => { const name = await prompt({ title: 'Renomear pasta', value: f.name }); if (name) { folderById(f.id).name = name; store.commit('brain'); } } });

  const sectionSel = h('select', { class: 'input' }, brain().sections.map(s => h('option', { value: s.id, selected: s.id === f.sectionId }, s.name)));
  sectionSel.addEventListener('change', () => { folderById(f.id).sectionId = sectionSel.value; store.commit('brain'); });
  dialog({
    title: f.name, subtitle: f.locked ? 'Pasta trancada' : 'Pasta',
    body: h('div', { class: 'fields' }, h('label', { class: 'field' }, h('span', {}, 'Seção'), sectionSel)),
    actions
  });
}

async function lockFolder(f) {
  const pw = await passwordDialog({ title: `Trancar “${f.name}”`, subtitle: 'As notas desta pasta serão criptografadas.', create: true, confirm: 'Trancar' });
  if (!pw) return;
  const b = brain();
  const notes = b.notes.filter(n => n.folderId === f.id);
  const { key, vault } = await createVault(pw, notes);
  b.notes = b.notes.filter(n => n.folderId !== f.id);
  Object.assign(folderById(f.id), { locked: true, vault });
  unlocked.set(f.id, { key, notes, ct: vault.ct });
  store.commit('brain');
  toast('Pasta trancada. Ela fica aberta até você trancar ou sair por 5 minutos.');
}

async function changeLock(f) {
  if (!unlocked.has(f.id)) {
    const ok = await passwordDialog({ title: `Senha atual de “${f.name}”`, check: async pw => { const { key, data } = await openVault(pw, f.vault); unlocked.set(f.id, { key, notes: data, ct: f.vault.ct }); } });
    if (!ok) return;
  }
  const pw = await passwordDialog({ title: `Nova senha de “${f.name}”`, create: true, confirm: 'Trocar senha' });
  if (!pw) return;
  const u = unlocked.get(f.id);
  const { key, vault } = await createVault(pw, u.notes);
  folderById(f.id).vault = vault;
  unlocked.set(f.id, { key, notes: u.notes, ct: vault.ct });
  store.commit('brain');
  toast('Senha da pasta trocada.');
}

async function removeLock(f) {
  if (!unlocked.has(f.id)) {
    const ok = await passwordDialog({ title: `Remover senha de “${f.name}”`, check: async pw => { const { key, data } = await openVault(pw, f.vault); unlocked.set(f.id, { key, notes: data, ct: f.vault.ct }); } });
    if (!ok) return;
  }
  const folder = folderById(f.id);
  brain().notes.push(...unlocked.get(f.id).notes.map(n => ({ ...n, folderId: f.id })));
  delete folder.vault;
  folder.locked = false;
  unlocked.delete(f.id);
  store.commit('brain');
  toast('Senha removida. As notas voltaram a ficar sem criptografia.');
}

async function deleteFolder(f) {
  const count = f.locked ? null : notesOf(f.id).length;
  const ok = await confirmDialog({
    title: `Excluir “${f.name}”?`,
    message: f.locked ? 'A pasta trancada e todo o seu conteúdo criptografado serão excluídos.' : `As ${count} notas desta pasta serão excluídas.`,
    confirm: 'Excluir', danger: true
  });
  if (!ok) return;
  const b = brain();
  const snapshot = JSON.parse(JSON.stringify(b));
  b.folders = b.folders.filter(x => x.id !== f.id);
  b.notes = b.notes.filter(n => n.folderId !== f.id);
  unlocked.delete(f.id);
  mode = { kind: 'map' };
  store.commit('brain');
  toast(`Pasta “${f.name}” excluída.`, { action: 'Desfazer', onAction: () => store.replace('brain', snapshot) });
}
