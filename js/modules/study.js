// Studyspace: biblioteca de assuntos. Segmentos (Filosofia, Religião...) com
// os temas já estudados, resumos opcionais e o nível de domínio de cada tema.

import * as store from '../store.js';
import { COLORS } from '../seeds.js';
import { h, icon, uid, fill, clear, debounce, dialog, toast, confirmDialog, segmented, parseKey, dateKey, addDays } from '../dom.js';

export const LEVELS = [
  { n: 1, label: 'Iniciante', hint: 'Tive o primeiro contato' },
  { n: 2, label: 'Básico', hint: 'Entendo as ideias principais' },
  { n: 3, label: 'Intermediário', hint: 'Consigo explicar com minhas palavras' },
  { n: 4, label: 'Avançado', hint: 'Domino detalhes e relações' },
  { n: 5, label: 'Domínio', hint: 'Consigo ensinar e debater' }
];
const SUBJECT_ICONS = ['book', 'book-open', 'sparkles', 'globe', 'message-circle', 'mic', 'feather', 'scale', 'church', 'landmark', 'lightbulb', 'graduation-cap', 'library', 'brain', 'heart', 'code', 'music', 'chart-bar', 'target', 'star'];

const study = () => store.get('study');
const subjectById = id => study().subjects.find(s => s.id === id);
const topicsOf = id => study().topics.filter(t => t.subjectId === id);
// ---------- Revisão espaçada ----------
// Quanto maior o domínio, mais tempo até a próxima revisão (em dias).
const INTERVAL = { 1: 2, 2: 4, 3: 7, 4: 14, 5: 30 };
const REVIEW = '__revisar';
const lastSeen = t => t.reviewedAt ?? t.studiedAt ?? dateKey(new Date(t.createdAt ?? Date.now()));
export const nextReview = t => addDays(lastSeen(t), INTERVAL[t.mastery] ?? 7);
export const dueReviews = () => study().topics.filter(t => nextReview(t) <= dateKey()).sort((a, b) => nextReview(a).localeCompare(nextReview(b)));
export const subjectName = id => subjectById(id)?.name ?? '';

/** Marca o tema como revisado hoje (e, se informado, atualiza o domínio). */
export function markReviewed(id, mastery) {
  const t = study().topics.find(x => x.id === id);
  if (!t) return;
  t.reviewedAt = dateKey();
  if (mastery) t.mastery = mastery;
  t.updatedAt = Date.now();
  store.commit('study');
}

/** Pergunta como ficou o domínio depois de revisar. */
export function reviewDialog(t) {
  let level = t.mastery;
  const hint = h('p', { class: 'muted small' }, levelOf(level).hint);
  dialog({
    title: `Revisei: ${t.title}`,
    subtitle: 'Como está o seu domínio agora? A próxima revisão se ajusta a isso.',
    body: h('div', { class: 'fields' }, segmented(LEVELS.map(l => ({ value: l.n, label: l.label })), level, v => { level = Number(v); hint.textContent = `${levelOf(level).hint} · próxima revisão em ${INTERVAL[level]} dias`; }, 'seg-levels'), hint),
    actions: [{ label: 'Cancelar' }, { label: 'Registrar revisão', kind: 'primary', onClick: () => { markReviewed(t.id, level); toast('Revisão registrada.'); } }]
  });
}

const avg = list => list.length ? list.reduce((n, t) => n + t.mastery, 0) / list.length : 0;
const levelOf = n => LEVELS[Math.max(0, Math.round(n) - 1)];

let root, sideEl, mainEl;
let selected = null;
let filter = { level: 0, q: '', sort: 'recent' };

export async function mount(el) {
  root = el;
  selected = await store.local.get('studySubject');
  sideEl = h('aside', { class: 'study-side card' });
  mainEl = h('section', { class: 'study-main card' });
  root.append(sideEl, mainEl);
  store.on('study', render);
  render();
}

function render() {
  if (selected !== REVIEW && !subjectById(selected)) selected = study().subjects[0]?.id ?? null;
  renderSide();
  renderMain();
}

function select(id) {
  selected = id;
  filter = { level: 0, q: '', sort: filter.sort };
  store.local.set('studySubject', id);
  render();
}

// ---------- Lista de segmentos ----------

function renderSide() {
  const all = study().topics;
  fill(sideEl,
    h('header', { class: 'study-side-head' },
      h('h2', {}, 'Biblioteca'),
      h('p', { class: 'muted small' }, `${study().subjects.length} segmentos · ${all.length} temas`)),
    (() => {
      const due = dueReviews().length;
      return h('button', { class: `review-btn ${selected === REVIEW ? 'active' : ''} ${due ? 'has' : ''}`, onclick: () => select(REVIEW) },
        icon('repeat', 15), h('span', {}, 'Revisar hoje'), h('span', { class: 'count' }, due || '✓'));
    })(),
    h('nav', { class: 'subject-list' }, study().subjects.map(s => {
      const list = topicsOf(s.id);
      const a = avg(list);
      return h('button', {
        class: `subject-item ${s.id === selected ? 'active' : ''}`, style: { '--sc': COLORS[s.color] ?? COLORS.violet },
        onclick: () => select(s.id)
      },
        h('span', { class: 'subject-icon' }, icon(s.icon, 16)),
        h('span', { class: 'subject-text' },
          h('span', { class: 'subject-name' }, s.name),
          h('span', { class: 'muted small' }, list.length ? `${list.length} tema${list.length > 1 ? 's' : ''} · ${levelOf(a).label.toLowerCase()}` : 'nenhum tema ainda')),
        h('span', { class: 'mini-meter', title: list.length ? `Domínio médio ${a.toFixed(1)} de 5` : '' }, h('span', { style: { width: `${(a / 5) * 100}%` } }))
      );
    })),
    h('button', { class: 'brain-new-section', onclick: () => editSubject(null) }, icon('plus', 14), 'Novo segmento')
  );
}

// ---------- Fila de revisão ----------

function renderReview() {
  const due = dueReviews();
  const today = dateKey();
  fill(mainEl,
    h('header', { class: 'study-head' },
      h('span', { class: 'study-badge' }, icon('repeat', 24)),
      h('div', { class: 'study-title' },
        h('h2', {}, 'Revisar hoje'),
        h('p', { class: 'muted' }, 'Temas que chegaram no momento de rever, para fixar o que você estudou. Intervalos: Iniciante 2 dias, Básico 4, Intermediário 7, Avançado 14, Domínio 30.'))),
    due.length ? h('div', { class: 'topic-list' }, due.map(t => {
      const late = Math.round((parseKey(today) - parseKey(nextReview(t))) / 86400000);
      return h('article', { class: 'topic' },
        h('button', { class: 'topic-main', onclick: () => editTopic(t.subjectId, t) },
          h('span', { class: 'topic-title' }, t.title),
          h('span', { class: 'topic-meta' },
            h('span', {}, icon('book', 11), subjectName(t.subjectId)),
            h('span', {}, icon('calendar', 11), `visto em ${parseKey(lastSeen(t)).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}`),
            late > 0 ? h('span', { class: 'late' }, `${late} dia${late > 1 ? 's' : ''} de atraso`) : null)),
        h('div', { class: 'review-actions' }, mastery(t), h('button', { class: 'btn btn-primary btn-sm', onclick: () => reviewDialog(t) }, icon('check', 13), 'Revisei')));
    })) : h('div', { class: 'empty' }, icon('circle-check', 28), h('p', {}, 'Nenhuma revisão pendente hoje.'), h('p', { class: 'muted small' }, 'Quando um tema chegar no prazo de revisão, ele aparece aqui e na Mesa.'))
  );
}

// ---------- Segmento selecionado ----------

function renderMain() {
  if (selected === REVIEW) return renderReview();
  const s = subjectById(selected);
  if (!s) {
    fill(mainEl, h('div', { class: 'empty' }, icon('library', 28), h('p', {}, 'Crie um segmento para começar.'),
      h('button', { class: 'btn btn-primary', onclick: () => editSubject(null) }, icon('plus', 15), 'Novo segmento')));
    return;
  }
  const list = topicsOf(s.id);
  const a = avg(list);
  const dist = LEVELS.map(l => list.filter(t => t.mastery === l.n).length);

  const search = h('input', { class: 'input input-sm', placeholder: 'Buscar temas…', value: filter.q, autocomplete: 'off' });
  const listHost = h('div', { class: 'topic-list' });
  search.addEventListener('input', debounce(() => { filter.q = search.value.trim().toLowerCase(); renderTopics(listHost, s); }, 150));

  fill(mainEl,
    h('header', { class: 'study-head', style: { '--sc': COLORS[s.color] ?? COLORS.violet } },
      h('span', { class: 'study-badge' }, icon(s.icon, 24)),
      h('div', { class: 'study-title' },
        h('h2', {}, s.name),
        h('p', { class: 'muted' }, s.description || 'Sem descrição. Use “Editar” para dizer o que você quer aprofundar aqui.')),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn btn-sm', onclick: () => editSubject(s) }, icon('pencil', 14), 'Editar'),
      h('button', { class: 'btn btn-primary btn-sm', onclick: () => editTopic(s.id, null) }, icon('plus', 14), 'Tema')
    ),
    h('div', { class: 'study-stats' },
      stat('Temas estudados', list.length),
      stat('Domínio médio', list.length ? levelOf(a).label : '—', list.length ? `${a.toFixed(1)} de 5` : ''),
      h('div', { class: 'stat dist' },
        h('span', { class: 'stat-label' }, 'Distribuição por nível'),
        list.length ? h('div', { class: 'dist-bar', role: 'img', 'aria-label': LEVELS.map((l, i) => `${l.label}: ${dist[i]}`).join(', ') },
          LEVELS.map((l, i) => dist[i] ? h('span', { class: `lv-${l.n}`, style: { flexGrow: dist[i] }, title: `${l.label}: ${dist[i]}` }) : null)) : h('div', { class: 'dist-bar empty-bar' }),
        h('div', { class: 'dist-legend' }, LEVELS.map((l, i) => h('span', {}, h('i', { class: `lv-${l.n}` }), `${l.label} ${dist[i]}`)))
      )
    ),
    h('div', { class: 'study-toolbar' },
      search,
      segmented([{ value: 0, label: 'Todos' }, ...LEVELS.map(l => ({ value: l.n, label: String(l.n), title: l.label }))], filter.level, v => { filter.level = Number(v); renderTopics(listHost, s); }, 'seg-sm'),
      h('select', { class: 'input input-sm sort-select', onchange: e => { filter.sort = e.target.value; renderTopics(listHost, s); } },
        [['recent', 'Mais recentes'], ['alpha', 'A–Z'], ['low', 'Menor domínio'], ['high', 'Maior domínio']].map(([v, l]) => h('option', { value: v, selected: filter.sort === v }, l)))
    ),
    listHost
  );
  renderTopics(listHost, s);
}

const stat = (label, value, sub) => h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, label), h('span', { class: 'stat-value' }, value), sub ? h('span', { class: 'muted small' }, sub) : null);

function renderTopics(host, s) {
  let list = topicsOf(s.id);
  if (filter.level) list = list.filter(t => t.mastery === filter.level);
  if (filter.q) list = list.filter(t => (t.title + '\n' + (t.summary ?? '')).toLowerCase().includes(filter.q));
  const sorters = {
    recent: (a, b) => (b.studiedAt ?? '').localeCompare(a.studiedAt ?? '') || b.updatedAt - a.updatedAt,
    alpha: (a, b) => a.title.localeCompare(b.title, 'pt-BR'),
    low: (a, b) => a.mastery - b.mastery,
    high: (a, b) => b.mastery - a.mastery
  };
  list.sort(sorters[filter.sort]);
  clear(host);
  if (!list.length) {
    host.append(h('div', { class: 'empty' }, icon('book-open', 26),
      h('p', {}, topicsOf(s.id).length ? 'Nenhum tema com esse filtro.' : 'Nenhum tema registrado ainda.'),
      topicsOf(s.id).length ? null : h('p', { class: 'muted small' }, 'Registre o que você já estudou: um livro, um autor, um conceito. O resumo é opcional.')));
    return;
  }
  for (const t of list) {
    host.append(h('article', { class: 'topic' },
      h('button', { class: 'topic-main', onclick: () => editTopic(s.id, t) },
        h('span', { class: 'topic-title' }, t.title),
        t.summary ? h('span', { class: 'topic-summary' }, t.summary) : null,
        h('span', { class: 'topic-meta' },
          t.studiedAt ? h('span', {}, icon('calendar', 11), parseKey(t.studiedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })) : null,
          (() => { const n = nextReview(t); return h('span', { class: n <= dateKey() ? 'late' : '' }, icon('repeat', 11), n <= dateKey() ? 'revisão pendente' : `revisar em ${parseKey(n).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`); })(),
          t.sources ? h('span', {}, icon('bookmark', 11), t.sources.split('\n')[0].slice(0, 40)) : null)
      ),
      mastery(t)
    ));
  }
}

/** Medidor de 5 pontos clicável: muda o nível sem abrir o editor. */
function mastery(t) {
  return h('div', { class: 'mastery', title: `${levelOf(t.mastery).label}: ${levelOf(t.mastery).hint}` },
    h('div', { class: 'pips', role: 'radiogroup', 'aria-label': 'Nível de domínio' }, LEVELS.map(l => h('button', {
      class: `pip ${l.n <= t.mastery ? 'on' : ''}`, role: 'radio', 'aria-checked': String(l.n === t.mastery), title: l.label,
      onclick: () => { const x = study().topics.find(y => y.id === t.id); x.mastery = l.n; x.updatedAt = Date.now(); store.commit('study'); }
    }))),
    h('span', { class: 'mastery-label' }, levelOf(t.mastery).label)
  );
}

// ---------- Editores ----------

function editTopic(subjectId, topic) {
  let level = topic?.mastery ?? 1;
  const title = h('input', { class: 'input', placeholder: 'Tema (ex.: Ética a Nicômaco, Contrato social, Retórica de Aristóteles)', value: topic?.title ?? '', autocomplete: 'off' });
  const studied = h('input', { class: 'input', type: 'date', value: topic?.studiedAt ?? dateKey() });
  const summary = h('textarea', { class: 'input textarea', rows: 8, placeholder: 'Resumo opcional: ideias centrais, citações, o que ficou de dúvida…' });
  summary.value = topic?.summary ?? '';
  const sources = h('textarea', { class: 'input textarea', rows: 2, placeholder: 'Fontes: livros, aulas, vídeos (opcional)' });
  sources.value = topic?.sources ?? '';
  const hint = h('p', { class: 'muted small' }, levelOf(level).hint);
  const levelSel = segmented(LEVELS.map(l => ({ value: l.n, label: l.label })), level, v => { level = Number(v); hint.textContent = levelOf(level).hint; }, 'seg-levels');
  const subjSel = h('select', { class: 'input' }, study().subjects.map(s => h('option', { value: s.id, selected: s.id === subjectId }, s.name)));

  const actions = [];
  if (topic) actions.push({ label: 'Excluir', kind: 'ghost-danger', onClick: () => removeTopic(topic) });
  actions.push({ label: 'Cancelar' }, {
    label: topic ? 'Salvar' : 'Adicionar', kind: 'primary', onClick: () => {
      if (!title.value.trim()) { title.focus(); return false; }
      const data = { title: title.value.trim(), subjectId: subjSel.value, mastery: level, studiedAt: studied.value || null, summary: summary.value.trim(), sources: sources.value.trim(), updatedAt: Date.now() };
      if (topic) Object.assign(study().topics.find(t => t.id === topic.id), data);
      else study().topics.push({ id: uid(), createdAt: Date.now(), ...data });
      store.commit('study');
    }
  });
  dialog({
    title: topic ? 'Editar tema' : 'Novo tema', className: 'dialog-wide',
    body: h('div', { class: 'fields' },
      title,
      h('div', { class: 'inline-fields' },
        h('label', { class: 'field' }, h('span', {}, 'Segmento'), subjSel),
        h('label', { class: 'field' }, h('span', {}, 'Estudado em'), studied)),
      h('div', { class: 'field' }, h('span', {}, 'Nível de domínio'), levelSel, hint),
      h('label', { class: 'field' }, h('span', {}, 'Resumo'), summary),
      h('label', { class: 'field' }, h('span', {}, 'Fontes'), sources)
    ),
    actions
  });
}

function removeTopic(topic) {
  const list = study().topics;
  const index = list.findIndex(t => t.id === topic.id);
  const [removed] = list.splice(index, 1);
  store.commit('study');
  toast(`Tema “${removed.title}” excluído.`, { action: 'Desfazer', onAction: () => { study().topics.splice(index, 0, removed); store.commit('study'); } });
}

function editSubject(subject) {
  let ic = subject?.icon ?? 'book';
  let color = subject?.color ?? Object.keys(COLORS)[study().subjects.length % Object.keys(COLORS).length];
  const name = h('input', { class: 'input', placeholder: 'Nome do segmento', value: subject?.name ?? '', autocomplete: 'off' });
  const desc = h('textarea', { class: 'input textarea', rows: 3, placeholder: 'O que você quer aprofundar neste segmento? (opcional)' });
  desc.value = subject?.description ?? '';
  const icons = h('div', { class: 'icon-grid' }, SUBJECT_ICONS.map(n => h('button', {
    type: 'button', class: `icon-opt ${n === ic ? 'selected' : ''}`, title: n,
    onclick: e => { ic = n; e.currentTarget.parentNode.querySelectorAll('.icon-opt').forEach(b => b.classList.toggle('selected', b === e.currentTarget)); }
  }, icon(n, 18))));
  const swatches = h('div', { class: 'swatches sm' }, Object.entries(COLORS).map(([k, c]) => h('button', {
    type: 'button', class: `swatch ${k === color ? 'selected' : ''}`, style: { '--c': c }, 'aria-label': k,
    onclick: e => { color = k; e.currentTarget.parentNode.querySelectorAll('.swatch').forEach(b => b.classList.toggle('selected', b === e.currentTarget)); }
  })));
  const actions = [];
  if (subject) actions.push({ label: 'Excluir', kind: 'ghost-danger', onClick: () => { removeSubject(subject); } });
  actions.push({ label: 'Cancelar' }, {
    label: subject ? 'Salvar' : 'Criar', kind: 'primary', onClick: () => {
      if (!name.value.trim()) { name.focus(); return false; }
      const data = { name: name.value.trim(), icon: ic, color, description: desc.value.trim() };
      if (subject) Object.assign(subjectById(subject.id), data);
      else { const id = uid(); study().subjects.push({ id, ...data }); selected = id; store.local.set('studySubject', id); }
      store.commit('study');
    }
  });
  dialog({
    title: subject ? 'Editar segmento' : 'Novo segmento', className: 'dialog-wide',
    body: h('div', { class: 'fields' },
      h('label', { class: 'field' }, h('span', {}, 'Nome'), name),
      h('label', { class: 'field' }, h('span', {}, 'Descrição'), desc),
      h('div', { class: 'field' }, h('span', {}, 'Cor'), swatches),
      h('div', { class: 'field' }, h('span', {}, 'Ícone'), icons)),
    actions
  });
}

async function removeSubject(subject) {
  const count = topicsOf(subject.id).length;
  if (count && !(await confirmDialog({ title: `Excluir “${subject.name}”?`, message: `Os ${count} temas deste segmento também serão excluídos.`, confirm: 'Excluir', danger: true }))) return;
  const snapshot = JSON.parse(JSON.stringify(study()));
  const s = study();
  s.subjects = s.subjects.filter(x => x.id !== subject.id);
  s.topics = s.topics.filter(t => t.subjectId !== subject.id);
  store.commit('study');
  toast(`Segmento “${subject.name}” excluído.`, { action: 'Desfazer', onAction: () => store.replace('study', snapshot) });
}
