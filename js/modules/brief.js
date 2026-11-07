// Resumo da manhã (na primeira abertura do dia) e revisão semanal.

import * as store from '../store.js';
import { COLORS } from '../seeds.js';
import { eventsOn } from '../recur.js';
import { h, icon, fill, dateKey, addDays, parseKey, dialog, toast, capitalize, uid } from '../dom.js';
import { INBOX } from '../seeds.js';
import * as work from './work.js';
import * as tasks from './tasks.js';
import * as birthdays from './birthdays.js';
import * as study from './study.js';
import { fetchWeather, describe } from './widgets.js';
import { PLANS, dayReading, label } from '../bible.js';
import { nextDay } from './reading.js';

let goTo = () => {};
export function setNavigator(fn) { goTo = fn; }

const section = (ic, title, ...body) => h('section', { class: 'brief-sec' }, h('header', {}, icon(ic, 15), h('strong', {}, title)), ...body);

// ---------- Resumo da manhã ----------

/** Mostra uma vez por dia, a partir das 5h, na primeira aba aberta. */
export async function maybeShow() {
  if (location.hash === '#repouso' || new Date().getHours() < 5) return;
  const today = dateKey();
  if ((await store.local.get('briefSeen')) === today) return;
  await store.local.set('briefSeen', today);
  openBrief();
}

export async function openBrief() {
  const today = dateKey();
  const st = work.status();
  const evs = eventsOn(store.get('events'), today);
  const pending = [...tasks.overdue(), ...tasks.onDay(today).filter(t => !t.done)];
  const bdays = birthdays.upcoming().filter(x => x.diff >= 0 && x.diff <= 1);
  const bills = ((await store.local.get('billDates'))?.dates ?? []).filter(d => d <= addDays(today, 2));
  const reviews = study.dueReviews();
  const rd = store.get('reading').plan && PLANS[store.get('reading').plan] ? nextDay() : null;

  let weather = null;
  if (store.get('settings').city) {
    try {
      const w = await fetchWeather(store.get('settings').city);
      const x = describe(w.code, !w.day);
      weather = section(x.icon, `${w.temp}° · ${x.label}`,
        h('p', {}, `Mínima ${w.min}°, máxima ${w.max}°, umidade ${w.humidity}%.`,
          w.rain != null && w.rain >= 60 ? h('strong', { class: 'brief-warn' }, ` Chuva ${w.rain}%: leve guarda-chuva.`) : w.rain != null ? ` Chuva ${w.rain}%.` : ''));
    } catch { /* sem clima offline */ }
  }

  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const name = store.get('settings').name.trim();

  dialog({
    title: `${hello}${name ? ', ' + name : ''}!`,
    subtitle: capitalize(new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })),
    className: 'dialog-wide dialog-brief',
    body: h('div', { class: 'brief' },
      section(st.kind === 'off' ? 'tree-palm' : 'briefcase', st.label, h('p', {}, st.hours ? `${st.hours}. ${st.detail}` : st.detail)),
      weather,
      bdays.length ? section('cake', 'Aniversários', bdays.map(({ b, key, diff }) => h('p', {}, `${b.name}${birthdays.ageOn(b, key) ? ` faz ${birthdays.ageOn(b, key)} anos` : ''} ${diff === 0 ? 'hoje' : 'amanhã'}.`))) : null,
      section('calendar', evs.length ? `${evs.length} compromisso${evs.length > 1 ? 's' : ''}` : 'Agenda livre',
        evs.length ? h('ul', { class: 'brief-list' }, evs.map(e => h('li', { style: { '--ev': COLORS[e.color] ?? COLORS.violet } }, h('span', { class: 'brief-time' }, e.allDay ? 'dia todo' : e.start), e.title))) : h('p', { class: 'muted' }, 'Nenhum compromisso marcado para hoje.')),
      section('circle-check', pending.length ? `${pending.length} tarefa${pending.length > 1 ? 's' : ''} para hoje` : 'Nenhuma tarefa pendente',
        pending.length ? h('ul', { class: 'brief-list' }, pending.slice(0, 5).map(t => h('li', {}, t.text, t.date < today ? h('span', { class: 'tag tag-warn' }, 'atrasada') : null))) : null),
      bills.length ? section('wallet', 'Contas', h('p', {}, `${bills.length} conta${bills.length > 1 ? 's' : ''} vencendo até depois de amanhã (ou atrasada${bills.length > 1 ? 's' : ''}). Veja em Finanças.`)) : null,
      reviews.length ? section('repeat', 'Revisões de estudo', h('p', {}, `${reviews.length} tema${reviews.length > 1 ? 's' : ''} para revisar: ${reviews.slice(0, 3).map(t => t.title).join(', ')}${reviews.length > 3 ? '…' : ''}`)) : null,
      rd != null && rd < PLANS[store.get('reading').plan].days ? section('book-open', 'Leitura de hoje', h('p', {}, label(dayReading(store.get('reading').plan, rd)))) : null
    ),
    actions: [
      { label: 'Fechar' },
      { label: 'Começar o dia', kind: 'primary', onClick: () => goTo('workspace/mesa') }
    ]
  });
}

// ---------- Revisão semanal ----------

export function openWeekly() {
  const today = dateKey();
  const from = addDays(today, -6);
  const inWeek = ts => ts && dateKey(new Date(ts)) >= from;
  const doneTasks = store.get('tasks').filter(t => t.done && inWeek(t.doneAt));
  const focusLog = store.get('stats').focus;
  const focusMin = Array.from({ length: 7 }, (_, i) => focusLog[addDays(from, i)] ?? 0);
  const totalFocus = focusMin.reduce((a, b) => a + b, 0);
  const habits = store.get('habits').map(hb => ({ hb, n: Array.from({ length: 7 }, (_, i) => hb.days[addDays(from, i)]).filter(Boolean).length }));
  const ex = store.get('exams');
  const studyMin = ex.sessions.filter(s => s.done && s.date >= from && s.date <= today).reduce((n, s) => n + s.minutes, 0);
  const qs = ex.questions.filter(q => q.date >= from);
  const qTotal = qs.reduce((n, q) => n + q.total, 0), qOk = qs.reduce((n, q) => n + q.correct, 0);
  const reviewed = store.get('study').topics.filter(t => t.reviewedAt && t.reviewedAt >= from).length;
  const fmtH = m => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, '0') : ''}` : `${m} min`);
  const max = Math.max(1, ...focusMin);

  // planejar: tarefas atrasadas ou sem data vão para um dia da próxima semana
  const nextMonday = addDays(today, ((8 - parseKey(today).getDay()) % 7) || 7);
  const days = Array.from({ length: 7 }, (_, i) => addDays(nextMonday, i));
  const planHost = h('div', { class: 'plan-list' });
  const drawPlan = () => {
    const open = store.get('tasks').filter(t => !t.done && (!t.date || t.date < today));
    fill(planHost, open.length ? open.slice(0, 12).map(t => h('div', { class: 'plan-row' },
      h('span', { class: 'plan-task' }, t.text, t.date ? h('span', { class: 'tag tag-warn' }, 'atrasada') : null),
      h('div', { class: 'plan-days' }, days.map(k => h('button', { type: 'button', class: 'plan-day', title: parseKey(k).toLocaleDateString('pt-BR'), onclick: () => tasks.setDate(t.id, k) },
        parseKey(k).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')))))) : h('p', { class: 'muted small' }, 'Nada atrasado nem sem data. Semana limpa.'));
  };
  const offTasks = store.on('tasks', drawPlan);
  drawPlan();

  const reflection = h('textarea', { class: 'input textarea', rows: 3, placeholder: 'O que funcionou? O que travou? Qual é o foco da próxima semana?' });

  const d = dialog({
    title: 'Revisão semanal',
    subtitle: `${parseKey(from).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} a ${parseKey(today).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}`,
    className: 'dialog-wide dialog-weekly',
    body: h('div', { class: 'weekly' },
      h('div', { class: 'weekly-kpis' },
        h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Tarefas concluídas'), h('span', { class: 'stat-value' }, doneTasks.length)),
        h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Foco'), h('span', { class: 'stat-value' }, fmtH(totalFocus))),
        h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Estudo (concurso)'), h('span', { class: 'stat-value' }, fmtH(studyMin)), qTotal ? h('span', { class: 'muted small' }, `${qTotal} questões · ${Math.round((qOk / qTotal) * 100)}%`) : null),
        h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Temas revisados'), h('span', { class: 'stat-value' }, reviewed))),
      h('section', { class: 'brief-sec' }, h('header', {}, icon('timer', 15), h('strong', {}, 'Minutos de foco por dia')),
        h('div', { class: 'focus-bars', role: 'img', 'aria-label': focusMin.map((m, i) => `${parseKey(addDays(from, i)).toLocaleDateString('pt-BR', { weekday: 'short' })}: ${m} min`).join(', ') },
          focusMin.map((m, i) => h('div', { class: 'fbar', 'data-tip': `${m} min` },
            h('span', { class: 'fbar-val' }, m || ''),
            h('span', { class: 'fbar-col' }, h('span', { style: { height: `${(m / max) * 100}%` } })),
            h('span', { class: 'fbar-day' }, parseKey(addDays(from, i)).toLocaleDateString('pt-BR', { weekday: 'narrow' })))))),
      habits.length ? h('section', { class: 'brief-sec' }, h('header', {}, icon('flame', 15), h('strong', {}, 'Hábitos')),
        h('div', { class: 'hbars' }, habits.map(({ hb, n }) => h('div', { class: 'hbar-row' },
          h('span', { class: 'hbar-label' }, hb.name),
          h('span', { class: 'hbar-track' }, h('span', { class: 'hbar-fill', style: { width: `${(n / 7) * 100}%` } })),
          h('span', { class: 'hbar-value' }, `${n}/7`))))) : null,
      h('section', { class: 'brief-sec' }, h('header', {}, icon('calendar-days', 15), h('strong', {}, 'Planejar a próxima semana')),
        h('p', { class: 'muted small' }, 'Tarefas atrasadas ou sem data: escolha o dia de cada uma.'), planHost),
      h('section', { class: 'brief-sec' }, h('header', {}, icon('pen-line', 15), h('strong', {}, 'Reflexão')), reflection)
    ),
    actions: [
      { label: 'Fechar' },
      { label: 'Salvar reflexão no Cérebro', kind: 'primary', onClick: () => {
        if (!reflection.value.trim()) return;
        const b = store.get('brain');
        b.notes.push({ id: uid(), folderId: INBOX, title: `Revisão semanal · ${parseKey(today).toLocaleDateString('pt-BR')}`,
          content: `**Tarefas concluídas:** ${doneTasks.length} · **Foco:** ${fmtH(totalFocus)} · **Estudo:** ${fmtH(studyMin)}\n\n${reflection.value.trim()}`,
          pinned: false, createdAt: Date.now(), updatedAt: Date.now() });
        store.commit('brain');
        toast('Reflexão guardada na Caixa de entrada do Cérebro.');
      } }
    ]
  });
  d.el.addEventListener('close', offTasks);
}
