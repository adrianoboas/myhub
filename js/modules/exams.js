// Concursos: um ou mais concursos, cada um com matérias (e o edital como
// checklist), uma semana-modelo que gera o calendário de sessões, registro de
// questões e o diário de cada dia (bem-sucedido, parcial, não rendeu).

import * as store from '../store.js';
import { h, icon, uid, fill, clear, dateKey, parseKey, addDays, dialog, toast, confirmDialog, segmented, capitalize, monthKey, addMonths, monthLabel } from '../dom.js';

const KINDS = { teoria: 'Teoria', questoes: 'Questões', revisao: 'Revisão' };
const RESULTS = {
  ok: { label: 'Bem-sucedido', icon: 'circle-check' },
  partial: { label: 'Parcial', icon: 'circle-dot' },
  fail: { label: 'Não rendeu', icon: 'circle-x' }
};
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const data = () => store.get('exams');
const active = () => data().list.find(e => e.id === data().activeId) ?? data().list[0] ?? null;
const subjectName = (exam, id) => exam.subjects.find(s => s.id === id)?.name ?? 'Matéria removida';

let root;
let tab = 'painel';
let month = monthKey();

export async function mount(el) {
  root = el;
  tab = (await store.local.get('examsTab')) ?? 'painel';
  store.on('exams', render);
  render();
}

function setTab(t) { tab = t; store.local.set('examsTab', t); render(); }

// ---------- Consultas usadas pela Mesa ----------

export function todayPlan() {
  const exam = active();
  if (!exam) return null;
  const key = dateKey();
  return {
    exam,
    sessions: data().sessions.filter(s => s.examId === exam.id && s.date === key),
    subjectName: id => subjectName(exam, id),
    daysLeft: exam.date ? Math.round((parseKey(exam.date) - parseKey(key)) / 86400000) : null
  };
}

export function toggleSession(id) {
  const s = data().sessions.find(x => x.id === id);
  s.done = !s.done;
  store.commit('exams');
}

// ---------- Estrutura ----------

function render() {
  const exam = active();
  if (!exam) {
    fill(root, h('div', { class: 'exam-empty card' },
      h('span', { class: 'study-badge' }, icon('trophy', 26)),
      h('h2', {}, 'Escolha um concurso para estudar'),
      h('p', { class: 'muted' }, 'Cadastre o concurso, as matérias do edital e monte sua semana de estudos. O Hub distribui as sessões no calendário e acompanha o seu progresso.'),
      h('button', { class: 'btn btn-primary', onclick: () => editExam(null) }, icon('plus', 15), 'Cadastrar concurso')));
    return;
  }
  const days = exam.date ? Math.round((parseKey(exam.date) - parseKey(dateKey())) / 86400000) : null;
  const selector = h('select', { class: 'input input-sm exam-select', onchange: e => { if (e.target.value === '__new') { e.target.value = exam.id; editExam(null); return; } data().activeId = e.target.value; store.commit('exams'); } },
    data().list.map(x => h('option', { value: x.id, selected: x.id === exam.id }, x.name)),
    h('option', { value: '__new' }, '+ Novo concurso…'));

  const body = { painel: renderDashboard, materias: renderSubjects, plano: renderPlan, questoes: renderQuestions, erros: renderErrors, simulado: renderMock }[tab] ?? renderDashboard;
  // redesenhar não pode tirar o foco de quem está adicionando itens em sequência
  const focusKey = root.contains(document.activeElement) ? document.activeElement.dataset.focusKey : null;
  fill(root,
    h('header', { class: 'exam-head card' },
      h('span', { class: 'study-badge' }, icon('trophy', 22)),
      h('div', { class: 'exam-title' },
        h('div', { class: 'exam-name-row' }, selector,
          h('button', { class: 'icon-btn sm', title: 'Editar concurso', onclick: () => editExam(exam) }, icon('pencil', 14))),
        h('p', { class: 'muted small' }, [exam.org, exam.role, exam.banca && `Banca ${exam.banca}`].filter(Boolean).join(' · ') || 'Edite para informar órgão, cargo e banca')),
      h('span', { class: 'spacer' }),
      days != null ? h('div', { class: `countdown ${days < 0 ? 'past' : ''}` },
        h('span', { class: 'countdown-num' }, Math.abs(days)),
        h('span', { class: 'muted small' }, days < 0 ? 'dias desde a prova' : days === 1 ? 'dia para a prova' : 'dias para a prova'),
        h('span', { class: 'muted small' }, parseKey(exam.date).toLocaleDateString('pt-BR'))) : null
    ),
    h('nav', { class: 'tabs' }, segmented([
      { value: 'painel', label: 'Painel', icon: 'gauge' }, { value: 'materias', label: 'Matérias', icon: 'list-checks' },
      { value: 'plano', label: 'Plano', icon: 'calendar-days' }, { value: 'questoes', label: 'Questões', icon: 'target' },
      { value: 'erros', label: 'Caderno de erros', icon: 'circle-x' }, { value: 'simulado', label: 'Simulado', icon: 'timer' }
    ], tab, setTab)),
    body(exam)
  );
  if (focusKey) root.querySelector(`[data-focus-key="${focusKey}"]`)?.focus();
}

// ---------- Painel ----------

function stats(exam) {
  const sessions = data().sessions.filter(s => s.examId === exam.id);
  const qs = data().questions.filter(q => q.examId === exam.id);
  const topics = exam.subjects.flatMap(s => s.topics);
  const weekStart = addDays(dateKey(), -parseKey(dateKey()).getDay());
  const doneMin = sessions.filter(s => s.done).reduce((n, s) => n + s.minutes, 0);
  const weekMin = sessions.filter(s => s.done && s.date >= weekStart).reduce((n, s) => n + s.minutes, 0);
  const total = qs.reduce((n, q) => n + q.total, 0), correct = qs.reduce((n, q) => n + q.correct, 0);
  return { sessions, qs, topics, doneMin, weekMin, total, correct };
}

const hours = m => m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, '0') : ''}` : `${m} min`;
const pct = (a, b) => b ? Math.round((a / b) * 100) : 0;

function tile(label, value, sub) {
  return h('div', { class: 'kpi card' }, h('span', { class: 'stat-label' }, label), h('span', { class: 'kpi-value' }, value), sub ? h('span', { class: 'muted small' }, sub) : null);
}

/** Barras horizontais de uma série: valor em texto ao lado, dica ao passar o mouse. */
function barChart(rows, { empty }) {
  if (!rows.length) return h('p', { class: 'muted small empty-line' }, empty);
  return h('div', { class: 'hbars', role: 'table' }, rows.map(r => h('div', { class: 'hbar-row', role: 'row', 'data-tip': r.tip },
    h('span', { class: 'hbar-label', role: 'cell' }, r.label),
    h('span', { class: 'hbar-track', role: 'cell' }, h('span', { class: 'hbar-fill', style: { width: `${Math.max(r.value, r.value ? 1.5 : 0)}%` } })),
    h('span', { class: 'hbar-value', role: 'cell' }, r.text))));
}

function renderDashboard(exam) {
  const st = stats(exam);
  const today = dateKey();
  const todaySessions = st.sessions.filter(s => s.date === today);
  const dayLog = data().days.find(d => d.examId === exam.id && d.date === today);
  const topicsDone = st.topics.filter(t => t.done).length;

  const note = h('textarea', { class: 'input textarea', rows: 2, placeholder: 'Anotação do dia (opcional): o que funcionou, o que travou…' });
  note.value = dayLog?.note ?? '';
  note.addEventListener('change', () => setDay(exam.id, today, { note: note.value.trim() }));

  return h('div', { class: 'exam-dash' },
    h('div', { class: 'kpis' },
      tile('Edital estudado', `${pct(topicsDone, st.topics.length)}%`, `${topicsDone} de ${st.topics.length} tópicos`),
      tile('Horas estudadas', hours(st.doneMin), `${hours(st.weekMin)} nesta semana`),
      tile('Acertos', st.total ? `${pct(st.correct, st.total)}%` : '—', `${st.total} questões resolvidas`),
      tile('Sequência', `${streak(exam.id)} dias`, 'dias bem-sucedidos seguidos')
    ),
    h('section', { class: 'card exam-card exam-today' },
      h('header', { class: 'card-head' }, h('span', { class: 'eyebrow' }, 'Hoje'),
        h('button', { class: 'btn btn-xs', onclick: () => dayDialog(exam, today) }, icon('plus', 12), 'Sessão')),
      todaySessions.length ? h('div', { class: 'task-list' }, todaySessions.map(s => sessionRow(exam, s))) : h('p', { class: 'muted small empty-line' }, 'Nenhuma sessão planejada para hoje. Monte a semana-modelo na aba Plano.'),
      h('div', { class: 'field day-result' }, h('span', {}, 'Como foi o dia?'),
        segmented(Object.entries(RESULTS).map(([v, r]) => ({ value: v, label: r.label, icon: r.icon })), dayLog?.result ?? '', v => setDay(exam.id, today, { result: v }), 'seg-result')),
      note
    ),
    h('section', { class: 'card exam-card' },
      h('header', { class: 'card-head' }, h('span', { class: 'eyebrow' }, 'Progresso do edital por matéria')),
      barChart(exam.subjects.map(s => {
        const d = s.topics.filter(t => t.done).length;
        return { label: s.name, value: pct(d, s.topics.length), text: `${pct(d, s.topics.length)}%`, tip: `${s.name}: ${d} de ${s.topics.length} tópicos` };
      }), { empty: 'Cadastre matérias e tópicos na aba Matérias.' })
    ),
    h('section', { class: 'card exam-card' },
      h('header', { class: 'card-head' }, h('span', { class: 'eyebrow' }, 'Acertos por matéria')),
      barChart(exam.subjects.map(s => {
        const q = st.qs.filter(x => x.subjectId === s.id);
        const t = q.reduce((n, x) => n + x.total, 0), c = q.reduce((n, x) => n + x.correct, 0);
        return t ? { label: s.name, value: pct(c, t), text: `${pct(c, t)}%`, tip: `${s.name}: ${c} de ${t} questões` } : null;
      }).filter(Boolean), { empty: 'Registre questões resolvidas na aba Questões.' })
    ),
    weakSpots(exam),
    h('section', { class: 'card exam-card exam-heat' },
      h('header', { class: 'card-head' }, h('span', { class: 'eyebrow' }, 'Últimas 16 semanas')),
      heatmap(exam)
    )
  );
}

function streak(examId) {
  let n = 0;
  let k = dateKey();
  const ok = key => data().days.some(d => d.examId === examId && d.date === key && d.result === 'ok');
  if (!ok(k)) k = addDays(k, -1);
  while (ok(k)) { n++; k = addDays(k, -1); }
  return n;
}

function heatmap(exam) {
  const end = dateKey();
  const start = addDays(end, -parseKey(end).getDay() - 7 * 15);
  const grid = h('div', { class: 'heat-grid', role: 'img', 'aria-label': 'Resultado de cada dia de estudo nas últimas 16 semanas' });
  for (let k = start; k <= end; k = addDays(k, 1)) {
    const log = data().days.find(d => d.examId === exam.id && d.date === k);
    const studied = data().sessions.some(s => s.examId === exam.id && s.date === k && s.done);
    const label = log?.result ? RESULTS[log.result].label : studied ? 'Estudou (sem avaliação)' : 'Sem registro';
    grid.append(h('button', {
      class: `heat-cell ${log?.result ?? (studied ? 'studied' : '')}`,
      'data-tip': `${parseKey(k).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}: ${label}`,
      'aria-label': label, onclick: () => dayDialog(exam, k)
    }));
  }
  return h('div', {},
    grid,
    h('div', { class: 'heat-legend' },
      Object.entries(RESULTS).map(([k, r]) => h('span', {}, h('i', { class: `heat-cell ${k}` }), icon(r.icon, 12), r.label)),
      h('span', {}, h('i', { class: 'heat-cell studied' }), 'Estudou'),
      h('span', {}, h('i', { class: 'heat-cell' }), 'Sem registro')));
}

function setDay(examId, date, patch) {
  let d = data().days.find(x => x.examId === examId && x.date === date);
  if (!d) { d = { examId, date, result: null, note: '' }; data().days.push(d); }
  Object.assign(d, patch);
  store.commit('exams');
}

function sessionRow(exam, s) {
  return h('div', { class: `task ${s.done ? 'done' : ''}` },
    h('button', { class: 'check', 'aria-label': 'Concluir', onclick: () => toggleSession(s.id) }, icon('check', 12)),
    h('span', { class: 'task-text' }, subjectName(exam, s.subjectId)),
    h('span', { class: 'tag' }, KINDS[s.kind] ?? 'Teoria'),
    h('span', { class: 'muted small' }, `${s.minutes} min`),
    h('span', { class: 'task-tools' }, h('button', { class: 'icon-btn sm', title: 'Remover sessão', onclick: () => { data().sessions = data().sessions.filter(x => x.id !== s.id); store.commit('exams'); } }, icon('x', 13))));
}

// ---------- Matérias ----------

function renderSubjects(exam) {
  const add = h('input', { class: 'input', placeholder: 'Nova matéria (ex.: Direito Constitucional)…', autocomplete: 'off', dataset: { focusKey: 'add-subject' } });
  add.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || !add.value.trim()) return;
    exam.subjects.push({ id: uid(), name: add.value.trim(), weight: 1, topics: [] });
    store.commit('exams');
  });
  return h('div', { class: 'exam-subjects' },
    h('div', { class: 'card exam-card add-subject' }, icon('plus', 16), add),
    exam.subjects.length ? null : h('p', { class: 'muted small empty-line' }, 'Dica: cole os tópicos do edital de uma vez. Cada linha vira um tópico.'),
    h('div', { class: 'subject-grid' }, exam.subjects.map(s => subjectCard(exam, s)))
  );
}

function subjectCard(exam, s) {
  const done = s.topics.filter(t => t.done).length;
  const input = h('textarea', { class: 'task-input topic-input', rows: 1, placeholder: 'Adicionar tópico (cole várias linhas do edital)…', dataset: { focusKey: 'topic:' + s.id } });
  input.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    e.preventDefault();
    addTopics(s, input.value);
  });
  input.addEventListener('paste', e => {
    const text = e.clipboardData.getData('text');
    if (!text.includes('\n')) return;
    e.preventDefault();
    addTopics(s, text);
  });
  const weight = h('input', { class: 'input input-sm weight', type: 'number', min: 1, max: 10, value: s.weight ?? 1, title: 'Peso na prova' });
  weight.addEventListener('change', () => { s.weight = Math.max(1, Math.min(10, Number(weight.value) || 1)); store.commit('exams'); });

  return h('section', { class: 'card exam-card subject-card' },
    h('header', { class: 'subject-card-head' },
      h('span', { class: 'subject-card-name', title: 'Duplo clique para renomear', ondblclick: e => renameSubject(s, e.currentTarget) }, s.name),
      h('label', { class: 'weight-field' }, 'peso', weight),
      h('button', { class: 'icon-btn sm', title: 'Excluir matéria', onclick: () => removeSubject(exam, s) }, icon('trash-2', 13))),
    h('div', { class: 'subject-progress' },
      h('div', { class: 'progress' }, h('span', { style: { width: `${pct(done, s.topics.length)}%` } })),
      h('span', { class: 'muted small' }, `${done}/${s.topics.length}`)),
    h('div', { class: 'task-list' }, s.topics.map(t => h('div', { class: `task ${t.done ? 'done' : ''}` },
      h('button', { class: 'check', 'aria-label': 'Estudado', onclick: () => { t.done = !t.done; store.commit('exams'); } }, icon('check', 12)),
      h('span', { class: 'task-text' }, t.name),
      h('span', { class: 'task-tools' }, h('button', { class: 'icon-btn sm', title: 'Remover tópico', onclick: () => { s.topics = s.topics.filter(x => x.id !== t.id); store.commit('exams'); } }, icon('x', 13)))))),
    input
  );
}

function addTopics(s, text) {
  const lines = text.split('\n').map(l => l.replace(/^[\s\-•*\d.)]+/, '').trim()).filter(Boolean);
  if (!lines.length) return;
  s.topics.push(...lines.map(name => ({ id: uid(), name, done: false })));
  store.commit('exams');
  if (lines.length > 1) toast(`${lines.length} tópicos adicionados.`);
}

function renameSubject(s, el) {
  el.contentEditable = 'true';
  el.focus();
  getSelection().selectAllChildren(el);
  el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } });
  el.addEventListener('blur', () => { el.contentEditable = 'false'; const v = el.textContent.trim(); if (v && v !== s.name) { s.name = v; store.commit('exams'); } }, { once: true });
}

async function removeSubject(exam, s) {
  if (!(await confirmDialog({ title: `Excluir “${s.name}”?`, message: 'Os tópicos, as sessões planejadas e as questões registradas desta matéria também serão removidos.', confirm: 'Excluir', danger: true }))) return;
  const snapshot = JSON.parse(JSON.stringify(data()));
  exam.subjects = exam.subjects.filter(x => x.id !== s.id);
  for (const day of Object.keys(exam.schedule ?? {})) exam.schedule[day] = exam.schedule[day].filter(b => b.subjectId !== s.id);
  data().sessions = data().sessions.filter(x => x.subjectId !== s.id);
  data().questions = data().questions.filter(x => x.subjectId !== s.id);
  store.commit('exams');
  toast(`Matéria “${s.name}” excluída.`, { action: 'Desfazer', onAction: () => store.replace('exams', snapshot) });
}

// ---------- Plano ----------

function renderPlan(exam) {
  exam.schedule ??= { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  const noSubjects = !exam.subjects.length;
  const week = h('div', { class: 'week-template' }, WEEKDAYS.map((label, d) => {
    const blocks = exam.schedule[d] ?? [];
    const total = blocks.reduce((n, b) => n + b.minutes, 0);
    return h('div', { class: 'wt-day' },
      h('header', {}, h('strong', {}, label), total ? h('span', { class: 'muted small' }, hours(total)) : null),
      blocks.map(b => h('div', { class: 'wt-block' },
        h('span', { class: 'wt-subject' }, subjectName(exam, b.subjectId)),
        h('span', { class: 'muted small' }, `${b.minutes} min · ${KINDS[b.kind] ?? 'Teoria'}`),
        h('button', { class: 'icon-btn sm', title: 'Remover', onclick: () => { exam.schedule[d] = blocks.filter(x => x.id !== b.id); store.commit('exams'); } }, icon('x', 12)))),
      noSubjects ? null : h('button', { class: 'wt-add', onclick: () => blockDialog(exam, d) }, icon('plus', 12), 'bloco'));
  }));

  return h('div', { class: 'exam-plan' },
    h('section', { class: 'card exam-card' },
      h('header', { class: 'card-head' },
        h('div', {}, h('span', { class: 'eyebrow' }, 'Semana-modelo'), h('p', { class: 'muted small' }, 'Defina o que estudar em cada dia da semana. Depois aplique ao calendário.')),
        h('button', { class: 'btn btn-primary btn-sm', disabled: noSubjects, onclick: () => applyDialog(exam) }, icon('calendar-days', 14), 'Aplicar ao calendário')),
      noSubjects ? h('p', { class: 'muted small empty-line' }, 'Cadastre as matérias primeiro, na aba Matérias.') : week),
    h('section', { class: 'card exam-card' }, planMonth(exam))
  );
}

function blockDialog(exam, day) {
  const subj = h('select', { class: 'input' }, exam.subjects.map(s => h('option', { value: s.id }, s.name)));
  const minutes = h('input', { class: 'input', type: 'number', min: 10, max: 600, step: 5, value: 60 });
  const kind = h('select', { class: 'input' }, Object.entries(KINDS).map(([v, l]) => h('option', { value: v }, l)));
  dialog({
    title: `Bloco de ${WEEKDAYS[day].toLowerCase()}`,
    body: h('div', { class: 'fields' },
      h('label', { class: 'field' }, h('span', {}, 'Matéria'), subj),
      h('div', { class: 'inline-fields' }, h('label', { class: 'field' }, h('span', {}, 'Minutos'), minutes), h('label', { class: 'field' }, h('span', {}, 'Tipo'), kind))),
    actions: [{ label: 'Cancelar' }, { label: 'Adicionar', kind: 'primary', onClick: () => {
      exam.schedule[day] = [...(exam.schedule[day] ?? []), { id: uid(), subjectId: subj.value, minutes: Math.max(5, Number(minutes.value) || 60), kind: kind.value }];
      store.commit('exams');
    } }]
  });
}

function applyDialog(exam) {
  const options = { 4: 'Próximas 4 semanas', 8: 'Próximas 8 semanas' };
  if (exam.date && exam.date > dateKey()) options.exam = 'Até a data da prova';
  const sel = h('select', { class: 'input' }, Object.entries(options).map(([v, l]) => h('option', { value: v, selected: v === 'exam' }, l)));
  dialog({
    title: 'Aplicar semana-modelo',
    subtitle: 'Cria as sessões a partir de hoje. Sessões automáticas futuras ainda não concluídas são substituídas; as avulsas e as concluídas ficam.',
    body: h('label', { class: 'field' }, h('span', {}, 'Período'), sel),
    actions: [{ label: 'Cancelar' }, { label: 'Aplicar', kind: 'primary', onClick: () => {
      const start = dateKey();
      const end = sel.value === 'exam' ? exam.date : addDays(start, Number(sel.value) * 7 - 1);
      data().sessions = data().sessions.filter(s => !(s.examId === exam.id && s.auto && !s.done && s.date >= start));
      let n = 0;
      for (let k = start; k <= end; k = addDays(k, 1)) {
        for (const b of exam.schedule[parseKey(k).getDay()] ?? []) {
          data().sessions.push({ id: uid(), examId: exam.id, date: k, subjectId: b.subjectId, minutes: b.minutes, kind: b.kind, done: false, auto: true });
          n++;
        }
      }
      store.commit('exams');
      toast(`${n} sessões distribuídas no calendário.`);
    } }]
  });
}

function planMonth(exam) {
  const first = parseKey(month + '-01');
  const start = addDays(dateKey(first), -first.getDay());
  const today = dateKey();
  const grid = h('div', { class: 'month-grid plan-grid' }, WEEKDAYS.map(d => h('div', { class: 'month-dow' }, d)));
  for (let i = 0; i < 42; i++) {
    const k = addDays(start, i);
    const ss = data().sessions.filter(s => s.examId === exam.id && s.date === k);
    const log = data().days.find(d => d.examId === exam.id && d.date === k);
    const mins = ss.reduce((n, s) => n + s.minutes, 0);
    grid.append(h('button', {
      class: `month-cell plan-cell ${k.slice(0, 7) !== month ? 'other' : ''} ${k === today ? 'today' : ''} ${log?.result ? 'res-' + log.result : ''}`,
      onclick: () => dayDialog(exam, k)
    },
      h('div', { class: 'month-cell-head' }, h('span', { class: 'day-num' }, parseKey(k).getDate()),
        log?.result ? h('span', { class: `res-icon ${log.result}`, title: RESULTS[log.result].label }, icon(RESULTS[log.result].icon, 12)) : null),
      ss.slice(0, 3).map(s => h('span', { class: `plan-chip ${s.done ? 'done' : ''}` }, s.done ? icon('check', 10) : null, subjectName(exam, s.subjectId))),
      ss.length > 3 ? h('span', { class: 'more' }, `+${ss.length - 3}`) : null,
      mins ? h('span', { class: 'plan-mins' }, hours(mins)) : null));
  }
  return h('div', {},
    h('header', { class: 'card-head' },
      h('span', { class: 'eyebrow' }, 'Calendário de estudos'),
      h('div', { class: 'agenda-nav' },
        h('button', { class: 'icon-btn sm', onclick: () => { month = addMonths(month, -1); render(); } }, icon('chevron-left', 15)),
        h('strong', { class: 'month-name' }, monthLabel(month)),
        h('button', { class: 'icon-btn sm', onclick: () => { month = addMonths(month, 1); render(); } }, icon('chevron-right', 15)))),
    grid);
}

function dayDialog(exam, k) {
  const host = h('div', { class: 'fields' });
  const draw = () => {
    const ss = data().sessions.filter(s => s.examId === exam.id && s.date === k);
    const log = data().days.find(d => d.examId === exam.id && d.date === k);
    const subj = h('select', { class: 'input input-sm' }, exam.subjects.map(s => h('option', { value: s.id }, s.name)));
    const minutes = h('input', { class: 'input input-sm', type: 'number', min: 5, step: 5, value: 60, title: 'Minutos' });
    const kind = h('select', { class: 'input input-sm' }, Object.entries(KINDS).map(([v, l]) => h('option', { value: v }, l)));
    const note = h('textarea', { class: 'input textarea', rows: 2, placeholder: 'Anotação do dia (opcional)' });
    note.value = log?.note ?? '';
    note.addEventListener('change', () => setDay(exam.id, k, { note: note.value.trim() }));
    fill(host,
      ss.length ? h('div', { class: 'task-list' }, ss.map(s => sessionRow(exam, s))) : h('p', { class: 'muted small' }, 'Nenhuma sessão neste dia.'),
      exam.subjects.length ? h('div', { class: 'session-add' }, subj, minutes, kind,
        h('button', { type: 'button', class: 'btn btn-sm', onclick: () => {
          data().sessions.push({ id: uid(), examId: exam.id, date: k, subjectId: subj.value, minutes: Math.max(5, Number(minutes.value) || 60), kind: kind.value, done: false, auto: false });
          store.commit('exams');
        } }, icon('plus', 13), 'Sessão')) : null,
      h('div', { class: 'field' }, h('span', {}, 'Como foi o dia?'),
        segmented(Object.entries(RESULTS).map(([v, r]) => ({ value: v, label: r.label, icon: r.icon })), log?.result ?? '', v => setDay(exam.id, k, { result: v }), 'seg-result')),
      note);
  };
  const off = store.on('exams', draw);
  draw();
  const d = dialog({ title: capitalize(parseKey(k).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })), className: 'dialog-wide', body: host, actions: [{ label: 'Fechar', kind: 'primary' }] });
  d.el.addEventListener('close', off);
}

// ---------- Questões ----------

function renderQuestions(exam) {
  const qs = data().questions.filter(q => q.examId === exam.id).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  const date = h('input', { class: 'input input-sm', type: 'date', value: dateKey() });
  const subj = h('select', { class: 'input input-sm' }, exam.subjects.map(s => h('option', { value: s.id }, s.name)));
  const total = h('input', { class: 'input input-sm', type: 'number', min: 1, placeholder: 'Feitas', dataset: { focusKey: 'q-total' } });
  const correct = h('input', { class: 'input input-sm', type: 'number', min: 0, placeholder: 'Acertos', dataset: { focusKey: 'q-total' } });
  const add = () => {
    const t = Number(total.value), c = Number(correct.value);
    if (!t || c < 0 || c > t || !subj.value) { toast('Informe quantas questões fez e quantas acertou.'); return; }
    data().questions.push({ id: uid(), examId: exam.id, subjectId: subj.value, date: date.value || dateKey(), total: t, correct: c, createdAt: Date.now() });
    store.commit('exams');
  };
  correct.addEventListener('keydown', e => { if (e.key === 'Enter') add(); });

  const st = stats(exam);
  return h('div', { class: 'exam-questions' },
    h('section', { class: 'card exam-card' },
      h('header', { class: 'card-head' }, h('span', { class: 'eyebrow' }, 'Registrar bateria de questões')),
      exam.subjects.length ? h('div', { class: 'q-form' }, date, subj, total, correct, h('button', { class: 'btn btn-primary btn-sm', onclick: add }, icon('plus', 13), 'Registrar'))
        : h('p', { class: 'muted small' }, 'Cadastre as matérias primeiro.')),
    h('section', { class: 'card exam-card' },
      h('header', { class: 'card-head' }, h('span', { class: 'eyebrow' }, 'Taxa de acerto por matéria'), st.total ? h('span', { class: 'muted small' }, `geral ${pct(st.correct, st.total)}% em ${st.total} questões`) : null),
      barChart(exam.subjects.map(s => {
        const q = st.qs.filter(x => x.subjectId === s.id);
        const t = q.reduce((n, x) => n + x.total, 0), c = q.reduce((n, x) => n + x.correct, 0);
        return t ? { label: s.name, value: pct(c, t), text: `${pct(c, t)}% · ${t}`, tip: `${s.name}: ${c} de ${t}` } : null;
      }).filter(Boolean), { empty: 'Nenhuma questão registrada ainda.' })),
    h('section', { class: 'card exam-card' },
      h('header', { class: 'card-head' }, h('span', { class: 'eyebrow' }, 'Histórico')),
      qs.length ? h('table', { class: 'q-table' },
        h('thead', {}, h('tr', {}, ['Data', 'Matéria', 'Acertos', '%', ''].map(x => h('th', {}, x)))),
        h('tbody', {}, qs.map(q => h('tr', {},
          h('td', {}, parseKey(q.date).toLocaleDateString('pt-BR')),
          h('td', {}, subjectName(exam, q.subjectId)),
          h('td', { class: 'num' }, `${q.correct}/${q.total}`),
          h('td', { class: 'num' }, `${pct(q.correct, q.total)}%`),
          h('td', {}, h('button', { class: 'icon-btn sm', title: 'Remover', onclick: () => { data().questions = data().questions.filter(x => x.id !== q.id); store.commit('exams'); } }, icon('x', 13)))))))
        : h('p', { class: 'muted small empty-line' }, 'Sem registros.'))
  );
}

// ---------- Caderno de erros ----------

const errorsOf = exam => (data().errors ?? []).filter(e => e.examId === exam.id);
const topicName = (exam, subjectId, topicId) => exam.subjects.find(s => s.id === subjectId)?.topics.find(t => t.id === topicId)?.name;
let errorFilter = 'open';

/** Card do Painel: tópicos com mais erros pendentes (ou matérias com menor acerto). */
function weakSpots(exam) {
  const open = errorsOf(exam).filter(e => !e.resolved);
  const counts = {};
  for (const e of open) {
    const key = `${e.subjectId}|${e.topicId ?? ''}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, n]) => {
    const [sid, tid] = k.split('|');
    const name = tid ? topicName(exam, sid, tid) : null;
    return { label: name ?? subjectName(exam, sid), sub: name ? subjectName(exam, sid) : 'sem tópico definido', n };
  });
  return h('section', { class: 'card exam-card' },
    h('header', { class: 'card-head' }, h('span', { class: 'eyebrow' }, 'Pontos fracos'),
      h('button', { class: 'btn btn-xs', onclick: () => setTab('erros') }, 'Caderno de erros')),
    rows.length ? h('div', { class: 'weak-list' }, rows.map(r => h('div', { class: 'weak' },
      h('span', { class: 'weak-n' }, r.n),
      h('span', { class: 'weak-text' }, h('strong', {}, r.label), h('span', { class: 'muted small' }, r.sub)))))
      : h('p', { class: 'muted small empty-line' }, 'Registre no Caderno de erros o que você errar nas questões: os tópicos mais fracos aparecem aqui.'));
}

function renderErrors(exam) {
  const subj = h('select', { class: 'input input-sm' }, exam.subjects.map(s => h('option', { value: s.id }, s.name)));
  const topic = h('select', { class: 'input input-sm' });
  const fillTopics = () => fill(topic, h('option', { value: '' }, 'Tópico (opcional)'),
    (exam.subjects.find(s => s.id === subj.value)?.topics ?? []).map(t => h('option', { value: t.id }, t.name)));
  subj.addEventListener('change', fillTopics);
  fillTopics();
  const text = h('textarea', { class: 'input textarea', rows: 2, placeholder: 'O que você errou e qual é a regra certa (ex.: “crase antes de horário: às 15h”)', dataset: { focusKey: 'err-text' } });
  const add = () => {
    if (!text.value.trim() || !subj.value) { text.focus(); return; }
    data().errors = [...(data().errors ?? []), { id: uid(), examId: exam.id, subjectId: subj.value, topicId: topic.value || null, text: text.value.trim(), date: dateKey(), resolved: false }];
    store.commit('exams');
  };
  text.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); add(); } });

  const all = errorsOf(exam).sort((a, b) => b.date.localeCompare(a.date));
  const list = errorFilter === 'open' ? all.filter(e => !e.resolved) : all;
  const bySubject = exam.subjects.map(s => ({ s, items: list.filter(e => e.subjectId === s.id) })).filter(g => g.items.length);

  return h('div', { class: 'exam-questions' },
    h('section', { class: 'card exam-card' },
      h('header', { class: 'card-head' }, h('span', { class: 'eyebrow' }, 'Registrar erro')),
      exam.subjects.length ? h('div', { class: 'fields' },
        h('div', { class: 'inline-fields' }, subj, topic), text,
        h('button', { class: 'btn btn-primary btn-sm err-add', onclick: add }, icon('plus', 13), 'Registrar (Ctrl+Enter)'))
        : h('p', { class: 'muted small' }, 'Cadastre as matérias primeiro.')),
    h('section', { class: 'card exam-card' },
      h('header', { class: 'card-head' },
        h('span', { class: 'eyebrow' }, `Caderno de erros · ${all.filter(e => !e.resolved).length} pendentes`),
        segmented([{ value: 'open', label: 'Pendentes' }, { value: 'all', label: 'Todos' }], errorFilter, v => { errorFilter = v; render(); }, 'seg-sm')),
      bySubject.length ? bySubject.map(g => h('div', { class: 'err-group' },
        h('strong', { class: 'err-subject' }, g.s.name),
        g.items.map(e => h('div', { class: `task err ${e.resolved ? 'done' : ''}` },
          h('button', { class: 'check', title: e.resolved ? 'Reabrir' : 'Já revisei esse erro', onclick: () => { e.resolved = !e.resolved; store.commit('exams'); } }, icon('check', 12)),
          h('span', { class: 'task-text' }, e.text,
            h('span', { class: 'err-meta' }, [topicName(exam, e.subjectId, e.topicId), parseKey(e.date).toLocaleDateString('pt-BR')].filter(Boolean).join(' · '))),
          h('span', { class: 'task-tools' }, h('button', { class: 'icon-btn sm', title: 'Excluir', onclick: () => { data().errors = data().errors.filter(x => x.id !== e.id); store.commit('exams'); } }, icon('x', 13)))))))
        : h('p', { class: 'muted small empty-line' }, errorFilter === 'open' ? 'Nenhum erro pendente.' : 'Nenhum erro registrado ainda.'))
  );
}

// ---------- Simulado ----------

let mockTicker;
const mocksOf = exam => (data().mocks ?? []).filter(m => m.examId === exam.id).sort((a, b) => b.date.localeCompare(a.date) || b.at - a.at);
const fmtClock = ms => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };

function renderMock(exam) {
  clearInterval(mockTicker);
  const host = h('div', { class: 'exam-questions' });
  (async () => {
    const run = await store.local.get('mockRun');
    const running = run && run.examId === exam.id ? run : null;
    const history = mocksOf(exam);
    let top;
    if (running) {
      const left = h('span', { class: 'mock-clock' }, fmtClock(running.endAt - Date.now()));
      const elapsed = h('span', { class: 'muted small' });
      const tick = () => {
        const ms = running.endAt - Date.now();
        left.textContent = ms > 0 ? fmtClock(ms) : 'Tempo esgotado';
        left.classList.toggle('over', ms <= 0);
        elapsed.textContent = `${fmtClock(Date.now() - running.startAt)} decorridos de ${running.minutes} min`;
      };
      tick();
      mockTicker = setInterval(() => { if (!host.isConnected) return clearInterval(mockTicker); tick(); }, 1000);
      top = h('section', { class: 'card exam-card mock-running' },
        h('span', { class: 'eyebrow' }, 'Simulado em andamento'), left, elapsed,
        h('div', { class: 'button-row' },
          h('button', { class: 'btn btn-primary', onclick: () => finishMock(exam, running) }, icon('check', 14), 'Encerrar e registrar'),
          h('button', { class: 'btn', onclick: async () => { if (await confirmDialog({ title: 'Cancelar o simulado?', message: 'O tempo é descartado e nada é registrado.', confirm: 'Cancelar simulado', danger: true })) { await store.local.set('mockRun', null); render(); } } }, 'Cancelar')));
    } else {
      const minutes = h('input', { class: 'input input-sm', type: 'number', min: 10, max: 600, step: 10, value: 240 });
      top = h('section', { class: 'card exam-card' },
        h('header', { class: 'card-head' }, h('span', { class: 'eyebrow' }, 'Novo simulado')),
        h('p', { class: 'muted small' }, 'Simule a prova com o tempo real. O cronômetro continua mesmo se você fechar a aba.'),
        h('div', { class: 'q-form mock-form' }, h('label', { class: 'field' }, h('span', {}, 'Duração (minutos)'), minutes),
          h('button', { class: 'btn btn-primary btn-sm', onclick: async () => {
            const m = Math.max(10, Number(minutes.value) || 240);
            await store.local.set('mockRun', { examId: exam.id, startAt: Date.now(), endAt: Date.now() + m * 60000, minutes: m });
            render();
          } }, icon('play', 13), 'Iniciar simulado')));
    }
    const best = history.length ? Math.max(...history.map(m => pct(m.correct, m.total))) : null;
    fill(host, top,
      h('section', { class: 'card exam-card' },
        h('header', { class: 'card-head' }, h('span', { class: 'eyebrow' }, 'Histórico de simulados'), best != null ? h('span', { class: 'muted small' }, `melhor resultado: ${best}%`) : null),
        history.length ? barChart([...history].reverse().map(m => ({
          label: parseKey(m.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }),
          value: pct(m.correct, m.total), text: `${pct(m.correct, m.total)}%`,
          tip: `${m.correct} de ${m.total} em ${m.usedMinutes ?? m.minutes} min${m.note ? ' · ' + m.note : ''}`
        })), { empty: '' }) : h('p', { class: 'muted small empty-line' }, 'Nenhum simulado feito ainda.')));
  })();
  return host;
}

function finishMock(exam, run) {
  const total = h('input', { class: 'input', type: 'number', min: 1, placeholder: 'Questões' });
  const correct = h('input', { class: 'input', type: 'number', min: 0, placeholder: 'Acertos' });
  const note = h('input', { class: 'input', placeholder: 'Observação (opcional): banca, prova de referência…' });
  dialog({
    title: 'Resultado do simulado',
    body: h('div', { class: 'fields' }, h('div', { class: 'inline-fields' }, total, correct), note),
    actions: [{ label: 'Voltar' }, { label: 'Registrar', kind: 'primary', onClick: () => {
      const t = Number(total.value), c = Number(correct.value);
      if (!t || c < 0 || c > t) { total.focus(); return false; }
      data().mocks = [...(data().mocks ?? []), { id: uid(), examId: exam.id, date: dateKey(), at: Date.now(), minutes: run.minutes, usedMinutes: Math.round((Date.now() - run.startAt) / 60000), total: t, correct: c, note: note.value.trim() }];
      store.commit('exams');
      store.local.set('mockRun', null).then(render);
      toast(`Simulado registrado: ${pct(c, t)}% de acerto.`);
    } }]
  });
}

// ---------- Cadastro do concurso ----------

function editExam(exam) {
  const f = (label, value, placeholder, type = 'text') => {
    const input = h('input', { class: 'input', type, value: value ?? '', placeholder, autocomplete: 'off' });
    return { input, field: h('label', { class: 'field' }, h('span', {}, label), input) };
  };
  const name = f('Concurso', exam?.name, 'Ex.: TRF 3ª Região 2026');
  const org = f('Órgão', exam?.org, 'Ex.: Tribunal Regional Federal');
  const role = f('Cargo', exam?.role, 'Ex.: Analista Judiciário');
  const banca = f('Banca', exam?.banca, 'Ex.: FCC, Cebraspe, FGV');
  const date = f('Data da prova', exam?.date, '', 'date');
  const actions = [];
  if (exam) actions.push({ label: 'Excluir concurso', kind: 'ghost-danger', onClick: () => { removeExam(exam); } });
  actions.push({ label: 'Cancelar' }, { label: exam ? 'Salvar' : 'Cadastrar', kind: 'primary', onClick: () => {
    if (!name.input.value.trim()) { name.input.focus(); return false; }
    const patch = { name: name.input.value.trim(), org: org.input.value.trim(), role: role.input.value.trim(), banca: banca.input.value.trim(), date: date.input.value || null };
    if (exam) Object.assign(data().list.find(x => x.id === exam.id), patch);
    else {
      const id = uid();
      data().list.push({ id, ...patch, subjects: [], schedule: { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] }, createdAt: Date.now() });
      data().activeId = id;
      tab = 'materias';
    }
    store.commit('exams');
  } });
  dialog({
    title: exam ? 'Editar concurso' : 'Novo concurso', className: 'dialog-wide',
    body: h('div', { class: 'fields' }, name.field, h('div', { class: 'inline-fields' }, org.field, role.field), h('div', { class: 'inline-fields' }, banca.field, date.field)),
    actions
  });
}

async function removeExam(exam) {
  if (!(await confirmDialog({ title: `Excluir “${exam.name}”?`, message: 'Matérias, plano, sessões, questões e diário deste concurso serão excluídos.', confirm: 'Excluir', danger: true }))) return;
  const snapshot = JSON.parse(JSON.stringify(data()));
  const d = data();
  d.list = d.list.filter(x => x.id !== exam.id);
  d.sessions = d.sessions.filter(x => x.examId !== exam.id);
  d.questions = d.questions.filter(x => x.examId !== exam.id);
  d.days = d.days.filter(x => x.examId !== exam.id);
  d.errors = (d.errors ?? []).filter(x => x.examId !== exam.id);
  d.mocks = (d.mocks ?? []).filter(x => x.examId !== exam.id);
  if (d.activeId === exam.id) d.activeId = d.list[0]?.id ?? null;
  store.commit('exams');
  toast(`Concurso “${exam.name}” excluído.`, { action: 'Desfazer', onAction: () => store.replace('exams', snapshot) });
}
