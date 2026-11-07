import * as store from '../store.js';
import { ICONS } from '../icons.js';
import { h, icon, uid, clear, fill, normalizeUrl, hostname, faviconUrl, resolveIcon, dialog, prompt, toast } from '../dom.js';

const LINK_ICONS = [
  'link', 'globe', 'terminal', 'code', 'cpu', 'database', 'server', 'layers', 'layout-dashboard', 'shield', 'key', 'wifi',
  'box', 'briefcase', 'monitor', 'smartphone', 'archive', 'folder', 'file-text', 'chart-bar', 'activity', 'command',
  'zap', 'target', 'crosshair', 'camera', 'play', 'book', 'bookmark', 'music', 'mail', 'message-circle', 'shopping-cart',
  'graduation-cap', 'gamepad-2', 'film', 'newspaper', 'heart', 'star', 'wallet', 'image', 'calendar', 'settings', 'sparkles'
].filter(n => ICONS[n]);

const T_LINK = 'application/x-hub-link';
const T_BOARD = 'application/x-hub-board';

let root;
let drag = null; // { type: 'link', boardId, linkId } | { type: 'board', boardId }

const boards = () => store.get('boards');
const findBoard = id => boards().find(b => b.id === id);

export function mount(el) {
  root = el;
  store.on('boards', render);
  store.on('settings', render);
  render();
}

function render() {
  const list = boards();
  const grid = h('div', { class: 'boards-grid' });
  list.forEach(b => grid.append(renderBoard(b)));
  grid.append(h('button', { class: 'board-new', onclick: createBoard }, icon('plus'), 'Novo board'));
  wireBoardDrop(grid);

  fill(root, 
    h('div', { class: 'section-head' },
      h('span', { class: 'eyebrow' }, 'Links'),
      list.length ? h('span', { class: 'muted small' }, `${list.reduce((n, b) => n + b.links.length, 0)} links em ${list.length} boards`) : null
    ),
    list.length ? grid : renderEmpty()
  );
}

function renderEmpty() {
  return h('div', { class: 'empty card' },
    icon('layers', 28),
    h('p', {}, 'Nenhum board ainda.'),
    h('p', { class: 'muted small' }, 'Crie um board ou importe o backup do seu links.html antigo em Ajustes → Dados.'),
    h('button', { class: 'btn btn-primary', onclick: createBoard }, icon('plus', 16), 'Criar board')
  );
}

function renderBoard(board) {
  const listEl = h('div', { class: 'link-list', dataset: { board: board.id } });
  board.links.forEach(l => listEl.append(renderLink(board, l)));
  wireLinkDrop(listEl, board);

  const head = h('header', { class: 'board-head', draggable: true },
    h('span', { class: 'grip', title: 'Arraste para reordenar' }, icon('grip-vertical', 14)),
    h('span', { class: 'board-name', title: 'Duplo clique para renomear', ondblclick: () => renameBoard(board) }, board.name),
    h('span', { class: 'count' }, board.links.length || ''),
    h('span', { class: 'board-tools' },
      board.links.length > 1 ? h('button', { class: 'icon-btn sm', title: 'Abrir todos numa janela nova', onclick: () => openAll(board) }, icon('external-link', 14)) : null,
      h('button', { class: 'icon-btn sm', title: 'Renomear', onclick: () => renameBoard(board) }, icon('pencil', 14)),
      h('button', { class: 'icon-btn sm', title: 'Excluir board', onclick: () => deleteBoard(board) }, icon('trash-2', 14))
    )
  );
  head.addEventListener('dragstart', e => {
    drag = { type: 'board', boardId: board.id };
    e.dataTransfer.setData(T_BOARD, board.id);
    e.dataTransfer.effectAllowed = 'move';
    requestAnimationFrame(() => card.classList.add('dragging'));
  });
  head.addEventListener('dragend', endDrag);

  const card = h('section', { class: 'board card', dataset: { id: board.id } },
    head,
    listEl,
    h('button', { class: 'link-add', onclick: () => editLink(board.id) }, icon('plus', 14), 'Adicionar link')
  );
  return card;
}

function renderLink(board, link) {
  const ic = resolveIcon(link.icon);
  const glyph = ic
    ? h('span', { class: 'link-glyph' }, icon(ic, 16))
    : h('span', { class: 'link-glyph' }, h('img', { src: faviconUrl(link.url), alt: '', loading: 'lazy', width: 16, height: 16, draggable: false }));

  const newTab = store.get('settings').openIn === 'new';
  const a = h('a', {
    class: 'link', href: link.url, draggable: true, title: link.url,
    target: newTab ? '_blank' : null, rel: newTab ? 'noopener' : null
  },
    glyph,
    h('span', { class: 'link-text' }, h('span', { class: 'link-name' }, link.name), h('span', { class: 'link-host' }, hostname(link.url))),
    h('button', {
      class: 'icon-btn sm link-edit', title: 'Editar',
      onclick: e => { e.preventDefault(); e.stopPropagation(); editLink(board.id, link); }
    }, icon('pencil', 14))
  );
  a.addEventListener('dragstart', e => {
    e.stopPropagation();
    drag = { type: 'link', boardId: board.id, linkId: link.id };
    e.dataTransfer.setData(T_LINK, link.id);
    e.dataTransfer.setData('text/uri-list', link.url);
    e.dataTransfer.effectAllowed = 'move';
    requestAnimationFrame(() => a.classList.add('dragging'));
  });
  a.addEventListener('dragend', endDrag);
  return a;
}

// ---------- Arrastar e soltar ----------

function endDrag() {
  drag = null;
  root.querySelectorAll('.dragging, .drop-target').forEach(el => el.classList.remove('dragging', 'drop-target'));
  root.querySelectorAll('.drop-line').forEach(el => el.remove());
}

function indexAt(container, y, selector) {
  const items = [...container.querySelectorAll(selector)].filter(el => !el.classList.contains('dragging'));
  const i = items.findIndex(el => { const r = el.getBoundingClientRect(); return y < r.top + r.height / 2; });
  return { index: i === -1 ? items.length : i, before: items[i] ?? null };
}

function wireLinkDrop(listEl, board) {
  const external = e => !drag && e.dataTransfer.types.includes('text/uri-list');
  listEl.addEventListener('dragover', e => {
    if (drag?.type !== 'link' && !external(e)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = drag ? 'move' : 'copy';
    const { before } = indexAt(listEl, e.clientY, '.link');
    let line = listEl.querySelector('.drop-line');
    if (!line) line = h('div', { class: 'drop-line' });
    if (line.nextSibling !== before || line.parentNode !== listEl) listEl.insertBefore(line, before);
    listEl.closest('.board').classList.add('drop-target');
  });
  listEl.addEventListener('dragleave', e => {
    if (listEl.contains(e.relatedTarget)) return;
    listEl.querySelector('.drop-line')?.remove();
    listEl.closest('.board').classList.remove('drop-target');
  });
  listEl.addEventListener('drop', e => {
    e.preventDefault();
    e.stopPropagation();
    const { index } = indexAt(listEl, e.clientY, '.link');
    if (drag?.type === 'link') {
      moveLink(drag.boardId, drag.linkId, board.id, index);
    } else if (external(e)) {
      const url = e.dataTransfer.getData('text/uri-list').split('\n').find(s => s && !s.startsWith('#'));
      if (url) editLink(board.id, null, { url, name: e.dataTransfer.getData('text/plain') !== url ? e.dataTransfer.getData('text/plain') : '' });
    }
    endDrag();
  });
}

function wireBoardDrop(grid) {
  grid.addEventListener('dragover', e => {
    if (drag?.type !== 'board') return;
    e.preventDefault();
    const over = e.target.closest('.board');
    grid.querySelectorAll('.drop-target').forEach(el => el !== over && el.classList.remove('drop-target'));
    if (over && over.dataset.id !== drag.boardId) over.classList.add('drop-target');
  });
  grid.addEventListener('drop', e => {
    if (drag?.type !== 'board') return;
    e.preventDefault();
    const over = e.target.closest('.board');
    if (over && over.dataset.id !== drag.boardId) {
      const r = over.getBoundingClientRect();
      const after = e.clientX > r.left + r.width / 2;
      const list = boards();
      const from = list.findIndex(b => b.id === drag.boardId);
      const [moved] = list.splice(from, 1);
      const to = list.findIndex(b => b.id === over.dataset.id) + (after ? 1 : 0);
      list.splice(to, 0, moved);
      store.commit('boards');
    }
    endDrag();
  });
}

function moveLink(fromBoardId, linkId, toBoardId, index) {
  const from = findBoard(fromBoardId);
  const to = findBoard(toBoardId);
  const i = from.links.findIndex(l => l.id === linkId);
  if (i === -1 || !to) return;
  const [link] = from.links.splice(i, 1);
  // o índice foi calculado sem o item arrastado, então já está correto
  to.links.splice(Math.min(index, to.links.length), 0, link);
  store.commit('boards');
}

// ---------- Ações ----------

/** Reabre todos os links de um board (útil para sessões salvas pelo HUD). */
function openAll(board) {
  const urls = board.links.map(l => l.url);
  if (typeof chrome !== 'undefined' && chrome.windows) chrome.windows.create({ url: urls, focused: true });
  else urls.forEach(u => window.open(u, '_blank', 'noopener'));
}

async function createBoard() {
  const name = await prompt({ title: 'Novo board', subtitle: 'Um contexto para agrupar links: Trabalho, Estudos, Lazer...', placeholder: 'Nome do board', confirm: 'Criar' });
  if (!name) return;
  boards().push({ id: uid(), name, links: [] });
  store.commit('boards');
}

async function renameBoard(board) {
  const name = await prompt({ title: 'Renomear board', value: board.name });
  if (!name) return;
  findBoard(board.id).name = name;
  store.commit('boards');
}

function deleteBoard(board) {
  const list = boards();
  const index = list.findIndex(b => b.id === board.id);
  const [removed] = list.splice(index, 1);
  store.commit('boards');
  toast(`Board “${removed.name}” excluído${removed.links.length ? ` com ${removed.links.length} links` : ''}.`, {
    action: 'Desfazer', onAction: () => { boards().splice(index, 0, removed); store.commit('boards'); }
  });
}

/** Cria (link = null) ou edita um link. `prefill` vem de uma URL solta no board. */
function editLink(boardId, link = null, prefill = {}) {
  let chosenIcon = link?.icon ?? null;
  const urlIn = h('input', { class: 'input', type: 'text', placeholder: 'https://', value: link?.url ?? prefill.url ?? '', autocomplete: 'off', spellcheck: false });
  const nameIn = h('input', { class: 'input', type: 'text', placeholder: 'Nome (opcional: usa o domínio)', value: link?.name ?? prefill.name ?? '', autocomplete: 'off' });
  const boardSel = h('select', { class: 'input' }, boards().map(b => h('option', { value: b.id, selected: b.id === boardId }, b.name)));
  const preview = h('img', { class: 'favicon-preview', alt: '', width: 20, height: 20 });
  const updatePreview = () => { const u = normalizeUrl(urlIn.value); preview.src = u ? faviconUrl(u) : ''; };
  urlIn.addEventListener('input', updatePreview);
  updatePreview();

  const iconGrid = h('div', { class: 'icon-grid' });
  const options = [h('button', { type: 'button', class: 'icon-opt', title: 'Favicon do site', dataset: { icon: '' } }, preview)];
  LINK_ICONS.forEach(n => options.push(h('button', { type: 'button', class: 'icon-opt', title: n, dataset: { icon: n } }, icon(n, 18))));
  const sync = () => options.forEach(o => o.classList.toggle('selected', (o.dataset.icon || null) === chosenIcon));
  options.forEach(o => o.addEventListener('click', () => { chosenIcon = o.dataset.icon || null; sync(); }));
  iconGrid.append(...options);
  sync();

  const error = h('p', { class: 'field-error', hidden: true }, 'Informe um endereço válido.');

  const actions = [];
  if (link) actions.push({ label: 'Excluir', kind: 'ghost-danger', onClick: () => deleteLink(boardId, link.id) });
  actions.push({ label: 'Cancelar' }, {
    label: link ? 'Salvar' : 'Adicionar', kind: 'primary', onClick: () => {
      const url = normalizeUrl(urlIn.value);
      try { new URL(url); } catch { error.hidden = false; urlIn.focus(); return false; }
      const data = { name: nameIn.value.trim() || hostname(url), url, icon: chosenIcon };
      const target = findBoard(boardSel.value);
      if (link) {
        const src = findBoard(boardId);
        const i = src.links.findIndex(l => l.id === link.id);
        if (src === target) Object.assign(src.links[i], data);
        else { src.links.splice(i, 1); target.links.push({ ...link, ...data }); }
      } else {
        target.links.push({ id: uid(), ...data });
      }
      store.commit('boards');
    }
  });

  dialog({
    title: link ? 'Editar link' : 'Novo link',
    className: 'dialog-wide',
    body: h('div', { class: 'fields' },
      h('label', { class: 'field' }, h('span', {}, 'Endereço'), urlIn),
      error,
      h('label', { class: 'field' }, h('span', {}, 'Nome'), nameIn),
      h('label', { class: 'field' }, h('span', {}, 'Board'), boardSel),
      h('div', { class: 'field' }, h('span', {}, 'Ícone'), iconGrid)
    ),
    actions
  });
}

function deleteLink(boardId, linkId) {
  const board = findBoard(boardId);
  const index = board.links.findIndex(l => l.id === linkId);
  const [removed] = board.links.splice(index, 1);
  store.commit('boards');
  toast(`“${removed.name}” removido.`, {
    action: 'Desfazer', onAction: () => { findBoard(boardId)?.links.splice(index, 0, removed); store.commit('boards'); }
  });
}
