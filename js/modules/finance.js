// Finanças: controle mensal simples dentro de um cofre criptografado.
// O conteúdo decifrado só existe em memória enquanto a área está aberta.

import * as store from '../store.js';
import { createVault, openVault, readVault, resealVault, onAutoLock } from '../crypto.js';
import { h, icon, uid, fill, debounce, toast, passwordDialog, fmtMoney, parseMoney, monthKey, addMonths, monthLabel, confirmDialog, dateKey, parseKey } from '../dom.js';

const CATEGORIES = ['Moradia', 'Alimentação', 'Transporte', 'Saúde', 'Educação', 'Lazer', 'Assinaturas', 'Contas', 'Dívidas', 'Investimentos', 'Salário', 'Renda extra', 'Outros'];
const EMPTY = () => ({ recurring: [], months: {}, goals: [], notes: '' });

let root;
let session = null; // { key, data, ct }
let month = monthKey();

export function mount(el) {
  root = el;
  store.on('finance', async (_, origin) => {
    // as próprias gravações não redesenham (atrapalharia quem está digitando)
    if (origin !== 'remote') return;
    if (!session) return render();
    const vault = store.get('finance');
    if (!vault || vault.ct === session.ct) return;
    try { session.data = await readVault(session.key, vault); session.ct = vault.ct; }
    catch { session = null; } // senha trocada em outro PC
    if (!root.contains(document.activeElement)) render();
  });
  onAutoLock(lock);
  render();
}

/** Tranca ao sair da área (chamado pela navegação) ou por inatividade. */
export function lock() {
  if (!session) return;
  saveNow();
  session = null;
  render();
}

const fin = () => session.data;

const saveSoon = debounce(() => saveNow(), 500);
async function saveNow() {
  if (!session) return;
  const s = session;
  const vault = await resealVault(s.key, store.get('finance'), s.data);
  s.ct = vault.ct;
  publishBillDates();
  store.replace('finance', vault);
}
function changed() { saveSoon(); }

/**
 * Datas de vencimento das despesas não pagas (deste mês e do próximo) ficam
 * neste PC, sem nomes nem valores, para o resumo da manhã e as notificações.
 */
function publishBillDates() {
  if (!session) return;
  const dates = [];
  for (const k of [monthKey(), addMonths(monthKey(), 1)]) {
    for (const i of session.data.months[k]?.items ?? []) if (i.type === 'expense' && !i.paid && i.due) dates.push(i.due);
  }
  store.local.set('billDates', { at: Date.now(), dates: dates.sort() });
}

/** Exporta o mês para o Excel (CSV com ; e vírgula decimal, como o Excel brasileiro espera). */
function exportCsv() {
  const m = fin().months[month];
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [['Tipo', 'Descrição', 'Categoria', 'Vencimento', 'Valor', 'Pago'].join(';')];
  for (const i of m.items) {
    lines.push([i.type === 'income' ? 'Receita' : 'Despesa', q(i.name), q(i.category), i.due ? parseKey(i.due).toLocaleDateString('pt-BR') : '',
      i.amount.toFixed(2).replace('.', ','), i.paid ? 'sim' : 'não'].join(';'));
  }
  const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `financas-${month}.csv` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- Acesso ----------

function render() {
  if (!session) return renderGate();
  publishBillDates();
  renderApp();
}

function renderGate() {
  const exists = !!store.get('finance');
  const open = async () => {
    if (exists) {
      await passwordDialog({
        title: 'Abrir Finanças', subtitle: 'O conteúdo é criptografado com a sua senha.',
        check: async pw => { const vault = store.get('finance'); const { key, data } = await openVault(pw, vault); session = { key, data: { ...EMPTY(), ...data }, ct: vault.ct }; }
      });
    } else {
      const pw = await passwordDialog({ title: 'Criar senha das Finanças', subtitle: 'Ela será pedida sempre que você abrir esta área.', create: true, confirm: 'Criar cofre' });
      if (!pw) return;
      const { key, vault } = await createVault(pw, EMPTY());
      store.replace('finance', vault);
      session = { key, data: EMPTY(), ct: vault.ct };
    }
    render();
  };
  fill(root, h('div', { class: 'lock-screen card' },
    h('div', { class: 'lock-badge' }, icon(exists ? 'lock' : 'wallet', 26)),
    h('h2', {}, 'Finanças'),
    h('p', { class: 'muted' }, exists ? 'Área protegida por senha. Tranca sozinha quando você sai dela.' : 'Controle mensal de receitas, despesas recorrentes, saldo e objetivos, protegido por uma senha que só você conhece.'),
    h('button', { class: 'btn btn-primary', onclick: open }, icon(exists ? 'lock-open' : 'lock', 15), exists ? 'Desbloquear' : 'Criar senha e começar')
  ));
  if (exists) setTimeout(() => { if (!session && !root.closest('[hidden]') && document.body.dataset.view === 'financas') root.querySelector('.btn-primary')?.focus(); });
}

// ---------- Mês ----------

/** Cria o mês na primeira visita: saldo inicial = saldo final do mês anterior, com os recorrentes. */
function ensureMonth(key) {
  const f = fin();
  if (f.months[key]) return f.months[key];
  const prev = f.months[addMonths(key, -1)];
  const m = { start: prev ? totals(prev).end : 0, items: [], notes: '' };
  applyRecurring(m, key);
  f.months[key] = m;
  changed();
  return m;
}

const pad = n => String(n).padStart(2, '0');
function dueIn(monthKey_, day) {
  if (!day) return null;
  const [y, mo] = monthKey_.split('-').map(Number);
  return `${monthKey_}-${pad(Math.min(day, new Date(y, mo, 0).getDate()))}`;
}

/** Situação de uma despesa não paga: { label, tone } ou null. */
function dueStatus(item) {
  if (item.paid || !item.due || item.type !== 'expense') return null;
  const diff = Math.round((parseKey(item.due) - parseKey(dateKey())) / 86400000);
  if (diff < 0) return { label: diff === -1 ? 'venceu ontem' : `vencida há ${-diff} dias`, tone: 'late' };
  if (diff === 0) return { label: 'vence hoje', tone: 'soon' };
  if (diff <= 3) return { label: diff === 1 ? 'vence amanhã' : `vence em ${diff} dias`, tone: 'soon' };
  return null;
}

function applyRecurring(m, key = month) {
  let n = 0;
  for (const r of fin().recurring) {
    if (m.items.some(i => i.recurringId === r.id)) continue;
    m.items.push({ id: uid(), name: r.name, category: r.category, type: r.type, amount: r.amount, paid: false, recurringId: r.id, due: dueIn(key, r.day) });
    n++;
  }
  return n;
}

function totals(m) {
  const sum = (type, filter = () => true) => m.items.filter(i => i.type === type && filter(i)).reduce((n, i) => n + i.amount, 0);
  const income = sum('income'), expense = sum('expense');
  return { income, expense, pending: sum('expense', i => !i.paid), net: income - expense, end: (m.start || 0) + income - expense };
}

function moneyInput(value, onChange, cls = '', focusKey = null) {
  const input = h('input', { class: `input input-sm money ${cls}`, value: fmtMoney(value), inputmode: 'decimal', dataset: focusKey ? { focusKey } : {} });
  input.addEventListener('focus', () => { input.value = value ? String(value).replace('.', ',') : ''; input.select(); });
  input.addEventListener('blur', () => { value = parseMoney(input.value); input.value = fmtMoney(value); onChange(value); });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); });
  return input;
}

function renderApp() {
  const m = ensureMonth(month);
  const t = totals(m);
  const startIn = moneyInput(m.start, v => { m.start = v; changed(); renderApp(); }, 'kpi-input');

  fill(root,
    h('header', { class: 'fin-head card' },
      h('div', { class: 'agenda-nav' },
        h('button', { class: 'icon-btn', title: 'Mês anterior', onclick: () => { month = addMonths(month, -1); renderApp(); } }, icon('chevron-left', 18)),
        h('h2', { class: 'fin-month' }, monthLabel(month)),
        h('button', { class: 'icon-btn', title: 'Próximo mês', onclick: () => { month = addMonths(month, 1); renderApp(); } }, icon('chevron-right', 18)),
        month !== monthKey() ? h('button', { class: 'btn btn-sm', onclick: () => { month = monthKey(); renderApp(); } }, 'Mês atual') : null),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn btn-sm', onclick: exportCsv, title: 'Abre no Excel' }, icon('download', 14), 'Exportar mês'),
      h('button', { class: 'btn btn-sm', onclick: changePassword }, icon('key', 14), 'Trocar senha'),
      h('button', { class: 'btn btn-sm', onclick: lock }, icon('lock', 14), 'Trancar')
    ),
    h('div', { class: 'kpis fin-kpis' },
      h('div', { class: 'kpi card' }, h('span', { class: 'stat-label' }, 'Saldo inicial'), startIn, h('span', { class: 'muted small' }, 'clique para ajustar')),
      kpi('Receitas', t.income, null, 'pos'),
      kpi('Despesas', t.expense, t.pending ? `${fmtMoney(t.pending)} a pagar` : 'tudo pago', 'neg'),
      kpi('Saldo final previsto', t.end, `${t.net >= 0 ? 'sobra' : 'falta'} ${fmtMoney(Math.abs(t.net))} no mês`, t.end >= 0 ? 'pos' : 'neg')
    ),
    h('div', { class: 'fin-grid' },
      h('div', { class: 'fin-col' },
        sheet(m, 'income', 'Receitas'),
        sheet(m, 'expense', 'Despesas'),
        categoryBreakdown(m)
      ),
      h('div', { class: 'fin-col' },
        goals(),
        recurring(m),
        notesCard(m)
      )
    ),
    h('datalist', { id: 'fin-categories' }, CATEGORIES.map(c => h('option', { value: c })))
  );
}

/** Recifra tudo com uma senha nova (e um sal novo). Exige o cofre aberto. */
async function changePassword() {
  const pw = await passwordDialog({ title: 'Trocar senha das Finanças', subtitle: 'O conteúdo será criptografado de novo com a senha nova.', create: true, confirm: 'Trocar senha' });
  if (!pw || !session) return;
  const { key, vault } = await createVault(pw, session.data);
  session = { key, data: session.data, ct: vault.ct };
  store.replace('finance', vault);
  toast('Senha trocada. Use a nova senha a partir de agora, em todos os PCs.');
}

function kpi(label, value, sub, tone) {
  return h('div', { class: 'kpi card' }, h('span', { class: 'stat-label' }, label), h('span', { class: `kpi-value money-${tone}` }, fmtMoney(value)), sub ? h('span', { class: 'muted small' }, sub) : null);
}

/** Planilha editável de um tipo (receitas ou despesas). */
function sheet(m, type, title) {
  const rows = m.items.filter(i => i.type === type);
  const total = rows.reduce((n, i) => n + i.amount, 0);
  const row = item => {
    const name = h('input', { class: 'cell', value: item.name, placeholder: 'Descrição', dataset: { focusKey: 'name:' + item.id } });
    name.addEventListener('change', () => { item.name = name.value.trim(); changed(); });
    // sem redesenhar aqui: o Tab para o próximo campo se perderia
    const cat = h('input', { class: 'cell', value: item.category ?? '', placeholder: 'Categoria', list: 'fin-categories', dataset: { focusKey: 'cat:' + item.id } });
    cat.addEventListener('change', () => { item.category = cat.value.trim(); changed(); });
    const dueDay = h('input', { class: 'cell due-day', type: 'number', min: 1, max: 31, placeholder: 'dia', title: 'Dia do vencimento', value: item.due ? +item.due.slice(8) : '' });
    dueDay.addEventListener('change', () => {
      const d = Math.round(Number(dueDay.value));
      item.due = d >= 1 && d <= 31 ? dueIn(month, d) : null;
      changed(); renderApp();
    });
    const st = dueStatus(item);
    return h('tr', { class: `${item.paid ? 'paid' : ''} ${st?.tone === 'late' ? 'late' : ''}` },
      h('td', { class: 'col-check' }, h('button', { class: 'check', title: type === 'income' ? 'Recebido' : 'Pago', 'aria-pressed': String(!!item.paid), onclick: () => { item.paid = !item.paid; changed(); renderApp(); } }, icon('check', 12))),
      h('td', {}, name),
      h('td', { class: 'col-cat' }, cat),
      h('td', { class: 'col-due' }, dueDay, st ? h('span', { class: `due-badge ${st.tone}` }, st.label) : null),
      h('td', { class: 'col-amount' }, moneyInput(item.amount, v => { item.amount = v; changed(); renderApp(); }, 'cell', 'amt:' + item.id)),
      h('td', { class: 'col-tools' },
        item.recurringId ? h('span', { class: 'rec-mark', title: 'Recorrente' }, icon('repeat', 12)) : null,
        h('button', { class: 'icon-btn sm', title: 'Remover linha', onclick: () => {
          const i = m.items.indexOf(item);
          m.items.splice(i, 1); changed(); renderApp();
          toast('Linha removida.', { action: 'Desfazer', onAction: () => { m.items.splice(i, 0, item); changed(); renderApp(); } });
        } }, icon('x', 13))));
  };
  return h('section', { class: 'card fin-card' },
    h('header', { class: 'card-head' }, h('span', { class: 'eyebrow' }, title), h('strong', { class: `money-${type === 'income' ? 'pos' : 'neg'}` }, fmtMoney(total))),
    h('table', { class: 'sheet' },
      h('tbody', {}, rows.map(row)),
      h('tfoot', {}, h('tr', {}, h('td', { colspan: 6 },
        h('button', { class: 'link-add', onclick: () => {
          const item = { id: uid(), name: '', category: '', type, amount: 0, paid: false };
          m.items.push(item); changed(); renderApp();
          root.querySelector(`[data-focus-key="name:${item.id}"]`)?.focus();
        } }, icon('plus', 13), type === 'income' ? 'Adicionar receita' : 'Adicionar despesa'))))
    ));
}

function categoryBreakdown(m) {
  const by = {};
  for (const i of m.items.filter(x => x.type === 'expense')) by[i.category || 'Sem categoria'] = (by[i.category || 'Sem categoria'] ?? 0) + i.amount;
  const rows = Object.entries(by).sort((a, b) => b[1] - a[1]);
  const max = rows[0]?.[1] ?? 0;
  const total = rows.reduce((n, r) => n + r[1], 0);
  return h('section', { class: 'card fin-card' },
    h('header', { class: 'card-head' }, h('span', { class: 'eyebrow' }, 'Despesas por categoria')),
    rows.length && max ? h('div', { class: 'hbars' }, rows.map(([c, v]) => h('div', { class: 'hbar-row', 'data-tip': `${c}: ${fmtMoney(v)} (${Math.round((v / total) * 100)}% das despesas)` },
      h('span', { class: 'hbar-label' }, c),
      h('span', { class: 'hbar-track' }, h('span', { class: 'hbar-fill', style: { width: `${(v / max) * 100}%` } })),
      h('span', { class: 'hbar-value' }, fmtMoney(v)))))
      : h('p', { class: 'muted small empty-line' }, 'Sem despesas neste mês.'));
}

function goals() {
  const list = fin().goals;
  const add = h('input', { class: 'task-input', placeholder: 'Novo objetivo (ex.: Reserva de emergência)…', dataset: { focusKey: 'goal' } });
  add.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || !add.value.trim()) return;
    list.push({ id: uid(), name: add.value.trim(), target: 0, saved: 0, due: null });
    changed(); renderApp();
  });
  return h('section', { class: 'card fin-card' },
    h('header', { class: 'card-head' }, h('span', { class: 'eyebrow' }, 'Objetivos')),
    h('div', { class: 'goal-list' }, list.map(g => {
      const p = g.target ? Math.min(100, Math.round((g.saved / g.target) * 100)) : 0;
      const due = h('input', { class: 'input input-sm', type: 'month', value: g.due ?? '', title: 'Prazo' });
      due.addEventListener('change', () => { g.due = due.value || null; changed(); });
      return h('div', { class: 'goal' },
        h('div', { class: 'goal-head' }, icon('goal', 15), h('strong', {}, g.name), h('span', { class: 'spacer' }), h('span', { class: 'muted small' }, `${p}%`),
          h('button', { class: 'icon-btn sm', title: 'Remover objetivo', onclick: () => { fin().goals = list.filter(x => x.id !== g.id); changed(); renderApp(); } }, icon('x', 12))),
        h('div', { class: 'progress' }, h('span', { style: { width: p + '%' } })),
        h('div', { class: 'goal-fields' },
          h('label', {}, h('span', { class: 'muted small' }, 'Guardado'), moneyInput(g.saved, v => { g.saved = v; changed(); renderApp(); })),
          h('label', {}, h('span', { class: 'muted small' }, 'Meta'), moneyInput(g.target, v => { g.target = v; changed(); renderApp(); })),
          h('label', {}, h('span', { class: 'muted small' }, 'Prazo'), due)));
    })),
    add);
}

function recurring(m) {
  const list = fin().recurring;
  return h('section', { class: 'card fin-card' },
    h('header', { class: 'card-head' },
      h('div', {}, h('span', { class: 'eyebrow' }, 'Recorrentes'), h('p', { class: 'muted small' }, 'Entram sozinhos em cada mês novo.')),
      h('button', { class: 'btn btn-xs', onclick: () => { const n = applyRecurring(m); changed(); renderApp(); toast(n ? `${n} itens adicionados a ${monthLabel(month)}.` : 'Todos os recorrentes já estão neste mês.'); } }, 'Aplicar neste mês')),
    h('table', { class: 'sheet' }, h('tbody', {}, list.map(r => {
      const name = h('input', { class: 'cell', value: r.name, placeholder: 'Descrição', dataset: { focusKey: 'rec:' + r.id } });
      name.addEventListener('change', () => { r.name = name.value.trim(); changed(); });
      const type = h('select', { class: 'cell' }, h('option', { value: 'expense', selected: r.type === 'expense' }, 'Despesa'), h('option', { value: 'income', selected: r.type === 'income' }, 'Receita'));
      type.addEventListener('change', () => { r.type = type.value; changed(); });
      const cat = h('input', { class: 'cell', value: r.category ?? '', placeholder: 'Categoria', list: 'fin-categories' });
      cat.addEventListener('change', () => { r.category = cat.value.trim(); changed(); });
      return h('tr', {},
        h('td', {}, name), h('td', { class: 'col-cat' }, cat), h('td', {}, type),
        h('td', { class: 'col-due' }, (() => {
          const day = h('input', { class: 'cell due-day', type: 'number', min: 1, max: 31, placeholder: 'dia', title: 'Dia do vencimento (entra assim nos meses novos)', value: r.day ?? '' });
          day.addEventListener('change', () => { const d = Math.round(Number(day.value)); r.day = d >= 1 && d <= 31 ? d : null; changed(); });
          return day;
        })()),
        h('td', { class: 'col-amount' }, moneyInput(r.amount, v => { r.amount = v; changed(); }, 'cell', 'ramt:' + r.id)),
        h('td', { class: 'col-tools' }, h('button', { class: 'icon-btn sm', title: 'Remover recorrente', onclick: async () => {
          if (!(await confirmDialog({ title: `Remover “${r.name || 'recorrente'}”?`, message: 'Os meses já criados não mudam; ele só deixa de entrar nos próximos.', confirm: 'Remover' }))) return;
          fin().recurring = list.filter(x => x.id !== r.id); changed(); renderApp();
        } }, icon('x', 13))));
    })),
    h('tfoot', {}, h('tr', {}, h('td', { colspan: 6 }, h('button', { class: 'link-add', onclick: () => {
      const r = { id: uid(), name: '', category: '', type: 'expense', amount: 0, day: null };
      list.push(r); changed(); renderApp();
      root.querySelector(`[data-focus-key="rec:${r.id}"]`)?.focus();
    } }, icon('plus', 13), 'Adicionar recorrente'))))));
}

function notesCard(m) {
  const monthNotes = h('textarea', { class: 'input textarea', rows: 4, placeholder: `Anotações de ${monthLabel(month).toLowerCase()}: imprevistos, decisões, o que ajustar no próximo mês…` });
  monthNotes.value = m.notes ?? '';
  monthNotes.addEventListener('input', () => { m.notes = monthNotes.value; changed(); });
  const general = h('textarea', { class: 'input textarea', rows: 3, placeholder: 'Anotações gerais de acompanhamento' });
  general.value = fin().notes ?? '';
  general.addEventListener('input', () => { fin().notes = general.value; changed(); });
  return h('section', { class: 'card fin-card' },
    h('header', { class: 'card-head' }, h('span', { class: 'eyebrow' }, 'Anotações')),
    h('div', { class: 'fields' }, monthNotes, general));
}
