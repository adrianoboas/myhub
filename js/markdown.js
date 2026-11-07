// Formatação simples das notas (subconjunto de Markdown), montada como DOM:
// nada do texto vira HTML. Suporta # títulos, **negrito**, *itálico*, `código`,
// listas (- e 1.), listas de verificação (- [ ] / - [x]), citações (>), linha (---),
// endereços web e [[links para outras notas]].

const el = (tag, cls, ...kids) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  for (const k of kids.flat()) if (k != null) n.append(k instanceof Node ? k : document.createTextNode(k));
  return n;
};

const INLINE = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[\[[^\]]+\]\]|https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g;

function inline(text, opts) {
  const out = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith('**')) out.push(el('strong', null, t.slice(2, -2)));
    else if (t.startsWith('`')) out.push(el('code', null, t.slice(1, -1)));
    else if (t.startsWith('[[')) {
      const name = t.slice(2, -2).trim();
      const a = el('a', `wikilink ${opts.exists?.(name) ? '' : 'missing'}`, name);
      a.href = '#';
      a.title = opts.exists?.(name) ? `Abrir “${name}”` : `Criar a nota “${name}”`;
      a.addEventListener('click', e => { e.preventDefault(); opts.onLink?.(name); });
      out.push(a);
    } else if (t.startsWith('*')) out.push(el('em', null, t.slice(1, -1)));
    else {
      const a = el('a', null, t);
      a.href = t; a.target = '_blank'; a.rel = 'noopener';
      out.push(a);
    }
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/**
 * Renderiza `src`. opts: { onToggle(lineIndex), onLink(name), exists(name) }.
 * onToggle recebe o número da linha de uma caixinha clicada.
 */
export function render(src, opts = {}) {
  const root = el('div', 'md');
  const lines = src.split('\n');
  let list = null, listType = null, para = [];
  const flushPara = () => { if (para.length) { root.append(el('p', null, inline(para.join(' '), opts))); para = []; } };
  const closeList = () => { list = null; listType = null; };

  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    let m;
    if (!line.trim()) { flushPara(); closeList(); return; }
    if ((m = line.match(/^(#{1,3})\s+(.*)$/))) { flushPara(); closeList(); root.append(el(`h${m[1].length + 1}`, null, inline(m[2], opts))); return; }
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) { flushPara(); closeList(); root.append(el('hr')); return; }
    if ((m = line.match(/^>\s?(.*)$/))) { flushPara(); closeList(); root.append(el('blockquote', null, inline(m[1], opts))); return; }
    if ((m = line.match(/^\s*[-*]\s+\[( |x|X)\]\s+(.*)$/))) {
      flushPara();
      if (listType !== 'check') { list = el('ul', 'checklist'); listType = 'check'; root.append(list); }
      const done = m[1].toLowerCase() === 'x';
      const box = el('button', `md-check ${done ? 'on' : ''}`);
      box.type = 'button';
      box.setAttribute('aria-pressed', String(done));
      box.addEventListener('click', () => opts.onToggle?.(i));
      list.append(el('li', done ? 'done' : '', box, el('span', null, inline(m[2], opts))));
      return;
    }
    if ((m = line.match(/^\s*[-*]\s+(.*)$/))) {
      flushPara();
      if (listType !== 'ul') { list = el('ul'); listType = 'ul'; root.append(list); }
      list.append(el('li', null, inline(m[1], opts)));
      return;
    }
    if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
      flushPara();
      if (listType !== 'ol') { list = el('ol'); listType = 'ol'; root.append(list); }
      list.append(el('li', null, inline(m[1], opts)));
      return;
    }
    closeList();
    para.push(line.trim());
  });
  flushPara();
  return root;
}

/** Alterna a caixinha da linha `i` no texto-fonte. */
export function toggleLine(src, i) {
  const lines = src.split('\n');
  lines[i] = lines[i].replace(/\[( |x|X)\]/, (_, c) => (c === ' ' ? '[x]' : '[ ]'));
  return lines.join('\n');
}

/** Nomes citados com [[...]] num texto. */
export const linksIn = src => [...src.matchAll(/\[\[([^\]]+)\]\]/g)].map(m => m[1].trim());
