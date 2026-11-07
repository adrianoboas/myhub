// Importação de dados: backup do próprio Hub ou dados das ferramentas antigas
// (links.html, planner.html, smart_notes.html) exportados por legado/tools/exportar.html.

import * as store from './store.js';
import { uid, resolveIcon, normalizeUrl, dateKey } from './dom.js';

export function download(filename, obj) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function backup() {
  download(`hub-backup-${dateKey()}.json`, store.exportAll());
}

/** Descobre o formato do arquivo. Retorna { kind, summary, apply() } ou lança erro. */
export function analyze(json) {
  if (json?.app === 'hub' && json.data) {
    const d = json.data;
    return {
      kind: 'backup',
      summary: `${count(d.boards)} boards, ${count(d.tasks)} tarefas e ${count(d.notes)} notas`,
      apply: () => { for (const name of store.COLLECTIONS) if (d[name]) store.replace(name, d[name]); }
    };
  }

  const legacy = json?.app === 'hub-legacy' ? json : Array.isArray(json) ? { linksData: json } : null;
  if (!legacy) throw new Error('Arquivo não reconhecido.');

  const boards = fromLinks(legacy.linksData);
  const tasks = fromPlanner(legacy.plannerData);
  const notes = fromSmartNotes(legacy.smartnotes);
  return {
    kind: 'legacy',
    summary: `${boards.length} boards com ${boards.reduce((n, b) => n + b.links.length, 0)} links, ${tasks.length} tarefas e ${notes.length} notas`,
    apply: () => {
      // soma ao que já existe em vez de substituir
      if (boards.length) { store.get('boards').push(...boards); store.commit('boards'); }
      if (tasks.length) { store.get('tasks').push(...tasks); store.commit('tasks'); }
      if (notes.length) { addNotesToBrain(notes, 'Importado'); store.commit('brain'); }
    }
  };
}

const count = v => (Array.isArray(v) ? v.length : 0);

function fromLinks(data) {
  if (!Array.isArray(data)) return [];
  return data.map(s => ({
    id: uid(),
    name: String(s.name ?? 'Board'),
    links: (s.links ?? []).filter(l => l?.url).map(l => ({
      id: uid(),
      name: String(l.name ?? l.url),
      url: normalizeUrl(String(l.url)),
      // o ícone escolhido no links.html antigo continua; 'link' (o padrão) vira favicon
      icon: l.emoji && l.emoji !== 'link' ? resolveIcon(l.emoji) : null
    }))
  }));
}

function fromPlanner(data) {
  if (!data || typeof data !== 'object') return [];
  const today = dateKey();
  const out = [];
  for (const [date, day] of Object.entries(data)) {
    for (const t of day?.tasks ?? []) {
      if (!t?.text || (t.completed && date < today)) continue;
      out.push({ id: uid(), text: String(t.text), date, done: !!t.completed, doneAt: t.completed ? Date.now() : null, createdAt: Date.now() });
    }
  }
  return out;
}

function fromSmartNotes(data) {
  if (!Array.isArray(data)) return [];
  const now = Date.now();
  return data.flatMap(folder => (folder.notes ?? []).map(n => ({
    id: uid(),
    title: String(n.title ?? ''),
    content: String(n.content ?? ''),
    tag: folder.name ? String(folder.name) : null,
    pinned: false,
    createdAt: now,
    updatedAt: now
  })));
}

/**
 * Coloca notas soltas (com `tag` = nome da pasta antiga) no Cérebro, criando
 * uma seção e uma pasta por etiqueta. Também usado na migração da v1.
 */
export function addNotesToBrain(notes, sectionName) {
  const brain = store.get('brain');
  let section = brain.sections.find(s => s.name === sectionName);
  if (!section) { section = { id: uid(), name: sectionName, color: 'blue' }; brain.sections.push(section); }
  const folderFor = name => {
    let f = brain.folders.find(x => x.sectionId === section.id && x.name === name);
    if (!f) { f = { id: uid(), sectionId: section.id, name }; brain.folders.push(f); }
    return f.id;
  };
  for (const n of notes) {
    brain.notes.push({ id: n.id ?? uid(), folderId: folderFor(n.tag || 'Notas'), title: n.title ?? '', content: n.content ?? '', pinned: !!n.pinned, createdAt: n.createdAt ?? Date.now(), updatedAt: n.updatedAt ?? Date.now() });
  }
}
