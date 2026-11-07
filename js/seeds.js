// Valores iniciais de cada coleção. Usados em memória com carimbo 0: assim um
// PC recém-instalado nunca sobrescreve os dados que já estão na nuvem.

export const INBOX = 'inbox';

export const DEFAULTS = {
  boards: [],
  tasks: [],
  events: [],
  // escala: todo dia é de trabalho no horário padrão, salvo folgas e horários ajustados
  // off[dia] = true (folga) ou false (trabalha mesmo sendo feriado); custom: feriados próprios
  workdays: { start: '06:00', end: '15:48', off: {}, hours: {}, holidaysOff: false, custom: [] },
  birthdays: [], // { id, name, day, month, year? }
  stats: { focus: {} }, // minutos de foco por dia, somando todos os PCs
  habits: [],
  notes: [], // formato da v1, migrado para brain
  brain: {
    sections: [{ id: 'geral', name: 'Geral', color: 'violet' }],
    folders: [
      { id: INBOX, sectionId: null, name: 'Caixa de entrada', system: true },
      { id: 'notas', sectionId: 'geral', name: 'Notas' }
    ],
    notes: []
  },
  study: {
    subjects: [
      { id: 'religiao', name: 'Religião', icon: 'book', color: 'amber', description: '' },
      { id: 'filosofia', name: 'Filosofia', icon: 'sparkles', color: 'violet', description: '' },
      { id: 'ciencia-politica', name: 'Ciências políticas', icon: 'globe', color: 'blue', description: '' },
      { id: 'oratoria', name: 'Oratória', icon: 'message-circle', color: 'coral', description: '' }
    ],
    topics: []
  },
  exams: { activeId: null, list: [], sessions: [], questions: [], days: [], errors: [], mocks: [] },
  reading: { plan: null, start: null, done: {} }, // plano de leitura bíblica (js/bible.js)
  readLater: [], // { id, url, title, minutes, addedAt, read }
  // tempo de tela: days['<pc>|<dia>'] = { sites: { host: segundos }, hours: [24] }; limits: { id, site, minutes, days }
  activity: { enabled: true, days: {}, limits: [] },
  finance: null, // cofre criptografado { v, salt, iv, ct }
  settings: {
    name: '',
    accent: 'violet',
    city: null,
    openIn: 'same',
    widgets: { weather: true, topSites: true, quote: true, today: true, focus: true },
    focusMinutes: 25,
    breakMinutes: 5,
    hudShortcut: { key: 'q', alt: true, ctrl: false, shift: false, meta: false },
    rest: { idleMinutes: 10, system: true },
    backdrop: true,
    backdropQuality: '4k', // '4k' ≈ 2 MB por dia; 'hd' ≈ 400 KB
    hudSites: {}, // host → 'min' (começa minimizado) | 'off' (não aparece)
    morning: { enabled: true, time: '08:00' },
    gcal: { enabled: false, calendarId: null } // agenda "Hub" no Google Agenda (js/sync/gcal.js)
  }
};

export const COLORS = {
  violet: '#8b5cf6', blue: '#3b82f6', cyan: '#22d3ee', green: '#34d399',
  amber: '#fbbf24', coral: '#fb7185', pink: '#e879f9', slate: '#94a3b8'
};

// cores de destaque (Ajustes → Cor); `ink` é a cor do texto sobre ela
export const ACCENTS = {
  violet: { label: 'Violeta', color: '#8b5cf6', ink: '#ffffff' },
  blue: { label: 'Azul', color: '#3b82f6', ink: '#ffffff' },
  cyan: { label: 'Ciano', color: '#22d3ee', ink: '#06232a' },
  green: { label: 'Verde', color: '#34d399', ink: '#04241a' },
  amber: { label: 'Âmbar', color: '#fbbf24', ink: '#2a1d02' },
  coral: { label: 'Coral', color: '#fb7185', ink: '#2b0710' },
  pink: { label: 'Rosa', color: '#e879f9', ink: '#2a0630' },
  mono: { label: 'Mono', color: '#e4e4e7', ink: '#0a0a0a' }
};
