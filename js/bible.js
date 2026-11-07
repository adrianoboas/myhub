// Livros da Bíblia (66, 1189 capítulos), com a abreviação usada pelo
// bibliaonline.com.br (Almeida Corrigida Fiel), e os planos de leitura.

export const BOOKS = [
  ['Gênesis', 'gn', 50], ['Êxodo', 'ex', 40], ['Levítico', 'lv', 27], ['Números', 'nm', 36], ['Deuteronômio', 'dt', 34],
  ['Josué', 'js', 24], ['Juízes', 'jz', 21], ['Rute', 'rt', 4], ['1 Samuel', '1sm', 31], ['2 Samuel', '2sm', 24],
  ['1 Reis', '1rs', 22], ['2 Reis', '2rs', 25], ['1 Crônicas', '1cr', 29], ['2 Crônicas', '2cr', 36], ['Esdras', 'ed', 10],
  ['Neemias', 'ne', 13], ['Ester', 'et', 10], ['Jó', 'job', 42], ['Salmos', 'sl', 150], ['Provérbios', 'pv', 31],
  ['Eclesiastes', 'ec', 12], ['Cânticos', 'ct', 8], ['Isaías', 'is', 66], ['Jeremias', 'jr', 52], ['Lamentações', 'lm', 5],
  ['Ezequiel', 'ez', 48], ['Daniel', 'dn', 12], ['Oseias', 'os', 14], ['Joel', 'jl', 3], ['Amós', 'am', 9],
  ['Obadias', 'ob', 1], ['Jonas', 'jn', 4], ['Miqueias', 'mq', 7], ['Naum', 'na', 3], ['Habacuque', 'hc', 3],
  ['Sofonias', 'sf', 3], ['Ageu', 'ag', 2], ['Zacarias', 'zc', 14], ['Malaquias', 'ml', 4],
  ['Mateus', 'mt', 28], ['Marcos', 'mc', 16], ['Lucas', 'lc', 24], ['João', 'jo', 21], ['Atos', 'at', 28],
  ['Romanos', 'rm', 16], ['1 Coríntios', '1co', 16], ['2 Coríntios', '2co', 13], ['Gálatas', 'gl', 6], ['Efésios', 'ef', 6],
  ['Filipenses', 'fp', 4], ['Colossenses', 'cl', 4], ['1 Tessalonicenses', '1ts', 5], ['2 Tessalonicenses', '2ts', 3],
  ['1 Timóteo', '1tm', 6], ['2 Timóteo', '2tm', 4], ['Tito', 'tt', 3], ['Filemom', 'fm', 1], ['Hebreus', 'hb', 13],
  ['Tiago', 'tg', 5], ['1 Pedro', '1pe', 5], ['2 Pedro', '2pe', 3], ['1 João', '1jo', 5], ['2 João', '2jo', 1],
  ['3 João', '3jo', 1], ['Judas', 'jd', 1], ['Apocalipse', 'ap', 22]
];

const chaptersOf = (from, to) => BOOKS.slice(from, to).flatMap(([name, ab, n]) => Array.from({ length: n }, (_, i) => ({ book: name, ab, ch: i + 1 })));
const book = name => BOOKS.findIndex(b => b[0] === name);

export const PLANS = {
  salmos30: { name: 'Salmos em 30 dias', days: 30, chapters: () => chaptersOf(book('Salmos'), book('Salmos') + 1) },
  salmos150: { name: 'Salmos em 150 dias (um por dia)', days: 150, chapters: () => chaptersOf(book('Salmos'), book('Salmos') + 1) },
  proverbios31: { name: 'Provérbios em 31 dias', days: 31, chapters: () => chaptersOf(book('Provérbios'), book('Provérbios') + 1) },
  nt90: { name: 'Novo Testamento em 90 dias', days: 90, chapters: () => chaptersOf(book('Mateus'), BOOKS.length) },
  biblia365: { name: 'Bíblia inteira em um ano', days: 365, chapters: () => chaptersOf(0, BOOKS.length) }
};

/** Capítulos do dia `d` (0 = primeiro dia) de um plano, divididos por igual. */
export function dayReading(planId, d) {
  const plan = PLANS[planId];
  const all = plan.chapters();
  const from = Math.floor((d * all.length) / plan.days), to = Math.floor(((d + 1) * all.length) / plan.days);
  return all.slice(from, to);
}

/** "Salmos 56–60" / "Gênesis 50 · Êxodo 1–2" */
export function label(chs) {
  const groups = [];
  for (const c of chs) {
    const g = groups[groups.length - 1];
    if (g && g.book === c.book && c.ch === g.to + 1) g.to = c.ch;
    else groups.push({ book: c.book, from: c.ch, to: c.ch });
  }
  return groups.map(g => `${g.book} ${g.from}${g.to !== g.from ? '–' + g.to : ''}`).join(' · ');
}

export const chapterUrl = c => `https://www.bibliaonline.com.br/acf/${c.ab}/${c.ch}`;
