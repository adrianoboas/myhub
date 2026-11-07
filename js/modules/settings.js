import * as store from '../store.js';
import { h, icon, clear, fill, dialog, confirmDialog, toast, debounce, isExtension, segmented } from '../dom.js';
import * as drive from '../sync/drive.js';
import * as gcal from '../sync/gcal.js';
import { searchCity } from './widgets.js';
import { backup, analyze } from '../importer.js';
import * as backups from '../backup.js';
import { PLANS } from '../bible.js';
import * as reading from './reading.js';

export { ACCENTS } from '../seeds.js';
import { ACCENTS } from '../seeds.js';

export function applyAccent() {
  const a = ACCENTS[store.get('settings').accent] ?? ACCENTS.violet;
  document.documentElement.style.setProperty('--accent', a.color);
  document.documentElement.style.setProperty('--accent-ink', a.ink);
}

const settings = () => store.get('settings');
const save = () => store.commit('settings');

function section(id, title, ...children) {
  return h('section', { class: 'settings-section', dataset: { section: id } }, h('h3', {}, title), ...children);
}

function toggle(label, hint, checked, onChange) {
  const input = h('input', { type: 'checkbox', checked, onchange: e => onChange(e.target.checked) });
  return h('label', { class: 'toggle-row' },
    h('span', {}, h('span', {}, label), hint ? h('span', { class: 'muted small' }, hint) : null),
    h('span', { class: 'switch' }, input, h('span', { class: 'switch-track' }))
  );
}

export function open(focusSection) {
  const s = settings();

  // Perfil
  const nameIn = h('input', { class: 'input', value: s.name, placeholder: 'Como quer ser chamado na saudação', autocomplete: 'off' });
  nameIn.addEventListener('input', debounce(() => { settings().name = nameIn.value.trim(); save(); }, 400));

  // Cor
  const swatches = h('div', { class: 'swatches' }, Object.entries(ACCENTS).map(([key, a]) =>
    h('button', {
      type: 'button', class: `swatch ${s.accent === key ? 'selected' : ''}`, title: a.label, 'aria-label': a.label,
      style: { '--c': a.color },
      onclick: e => {
        settings().accent = key; save(); applyAccent();
        e.currentTarget.parentNode.querySelectorAll('.swatch').forEach(b => b.classList.toggle('selected', b === e.currentTarget));
      }
    })
  ));

  // Clima
  const cityLabel = h('p', { class: 'muted small' }, s.city ? `Atual: ${s.city.name}` : 'Nenhuma cidade definida.');
  const cityIn = h('input', { class: 'input', placeholder: 'Buscar cidade…', autocomplete: 'off' });
  const results = h('div', { class: 'city-results' });
  const runSearch = debounce(async () => {
    const q = cityIn.value.trim();
    if (q.length < 2) return clear(results);
    try {
      const list = await searchCity(q);
      fill(results, ...(list.length ? list : [null]).map(c => c
        ? h('button', {
          type: 'button', class: 'city-option',
          onclick: () => {
            settings().city = { name: c.name, lat: c.lat, lon: c.lon }; save();
            cityLabel.textContent = `Atual: ${c.name}`; cityIn.value = ''; clear(results);
          }
        }, h('span', {}, c.name), h('span', { class: 'muted small' }, c.region))
        : h('p', { class: 'muted small' }, 'Nenhuma cidade encontrada.')));
    } catch { fill(results, h('p', { class: 'muted small' }, 'Sem conexão para buscar.')); }
  }, 350);
  cityIn.addEventListener('input', runSearch);
  cityIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); results.querySelector('button')?.click(); } });

  // Widgets
  const w = key => v => { settings().widgets[key] = v; save(); };
  const durations = h('div', { class: 'inline-fields' },
    h('label', { class: 'field' }, h('span', {}, 'Foco (min)'),
      h('input', { class: 'input', type: 'number', min: 1, max: 180, value: s.focusMinutes, onchange: e => { settings().focusMinutes = clamp(e.target.value, 25); save(); } })),
    h('label', { class: 'field' }, h('span', {}, 'Pausa (min)'),
      h('input', { class: 'input', type: 'number', min: 1, max: 60, value: s.breakMinutes, onchange: e => { settings().breakMinutes = clamp(e.target.value, 5); save(); } }))
  );

  // Links
  const openIn = h('select', { class: 'input', onchange: e => { settings().openIn = e.target.value; save(); } },
    h('option', { value: 'same', selected: s.openIn === 'same' }, 'Na mesma aba (Ctrl+clique abre em nova)'),
    h('option', { value: 'new', selected: s.openIn === 'new' }, 'Sempre em nova aba')
  );

  // Dados
  const file = h('input', { type: 'file', accept: '.json,application/json', hidden: true });
  file.addEventListener('change', async () => {
    const f = file.files[0];
    file.value = '';
    if (!f) return;
    try {
      const plan = analyze(JSON.parse(await f.text()));
      const ok = await confirmDialog(plan.kind === 'backup'
        ? { title: 'Restaurar backup?', message: `O backup tem ${plan.summary}. Ele substitui todos os dados atuais do Hub.`, confirm: 'Substituir', danger: true }
        : { title: 'Importar dados antigos?', message: `Encontrei ${plan.summary}. Eles serão somados ao que já existe no Hub.`, confirm: 'Importar' });
      if (!ok) return;
      plan.apply();
      applyAccent();
      toast('Importação concluída.');
    } catch (err) {
      toast(`Não consegui importar: ${err.message}`);
    }
  });

  const syncBox = h('div', { class: 'sync-box' });
  const copyCode = text => h('code', { class: 'copy', title: 'Toque para copiar', onclick: () => navigator.clipboard.writeText(text).then(() => toast('Copiado.')) }, text);
  let choosing = null;
  const renderSync = async () => {
    const i = store.syncInfo;
    if (i.status === 'off') {
      fill(syncBox, h('p', { class: 'muted small' }, 'Sincronização indisponível fora da extensão. Os dados ficam só neste navegador.'));
      return;
    }
    const cfg = await store.syncConfig();
    // versão web (tablet): só o Google Drive existe
    const web = drive.isWeb;
    const view = web ? 'drive' : choosing ?? cfg.provider;
    const pick = web ? null : segmented([
      { value: 'browser', label: 'Conta do navegador', icon: 'globe' },
      { value: 'drive', label: 'Google Drive', icon: 'cloud' }
    ], view, v => { choosing = v; renderSync(); });

    const statusLine = (text, extra) => h('div', { class: 'sync-line' },
      h('span', { class: `dot ${i.status}` }), h('span', {}, text), h('span', { class: 'spacer' }), extra ?? null);

    if (view === 'browser') {
      const pct = i.provider === 'browser' && i.quota ? Math.min(100, (i.bytes / i.quota) * 100) : 0;
      fill(syncBox, pick,
        cfg.provider === 'browser'
          ? [statusLine(i.status === 'ok' ? 'Sincronizando pela conta do navegador' : 'Sincronização com problema',
              h('span', { class: 'muted small' }, `${(i.bytes / 1024).toFixed(1)} de ${Math.round(i.quota / 1024)} KB`)),
            h('div', { class: `progress ${pct > 85 ? 'warn' : ''}` }, h('span', { style: { width: pct + '%' } })),
            i.message ? h('p', { class: 'field-error' }, i.message) : null,
            h('p', { class: 'muted small' }, 'Sem configuração, mas limitado a 100 KB no total. Para guardar estudos, notas e finanças à vontade, use o Google Drive.')]
          : h('button', { type: 'button', class: 'btn', onclick: async () => { await drive.disconnect(); await store.setProvider({ provider: 'browser', clientId: cfg.clientId }); choosing = null; toast('Voltou para a conta do navegador.'); } }, 'Usar a conta do navegador')
      );
      return;
    }

    const clientIn = h('input', { class: 'input input-sm', value: cfg.clientId ?? '', placeholder: '123456-abc.apps.googleusercontent.com', autocomplete: 'off', spellcheck: false });
    const connect = async () => {
      const id = clientIn.value.trim();
      if (!/\.apps\.googleusercontent\.com$/.test(id)) { toast('Cole o Client ID completo (termina em .apps.googleusercontent.com).'); clientIn.focus(); return; }
      try {
        // versão web: sai para o Google e volta já conectada (main.js avisa)
        await drive.connect(id, { pending: { cfg: { provider: 'drive', clientId: id } } });
        await store.setProvider({ provider: 'drive', clientId: id });
        choosing = null;
        toast('Google Drive conectado. Seus dados estão sincronizando.');
      } catch (err) { toast(err.message); }
    };
    const redirect = drive.redirectUrl();
    const connected = cfg.provider === 'drive';
    fill(syncBox, pick,
      web && !connected ? h('p', { class: 'muted small' }, 'Por enquanto os dados ficam só neste aparelho. Conecte o mesmo Google Drive dos PCs para ver e editar tudo daqui.') : null,
      connected ? statusLine(
        i.status === 'ok' ? `Sincronizando com o Google Drive${i.lastSync ? ' · ' + new Date(i.lastSync).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}` : i.status === 'auth' ? 'Google Drive desconectado' : 'Sincronização com problema',
        h('span', { class: 'muted small' }, `${(i.bytes / 1024).toFixed(1)} KB`)) : null,
      connected && i.message ? h('p', { class: 'field-error' }, i.message) : null,
      h('label', { class: 'field' }, h('span', {}, 'Client ID do Google'), clientIn),
      h('div', { class: 'button-row' },
        h('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: connect }, icon('cloud', 14), connected ? 'Reconectar' : 'Conectar'),
        connected ? h('button', { type: 'button', class: 'btn btn-sm', onclick: () => store.pull().then(() => toast('Sincronizado.')).catch(err => toast(err.message)) }, icon('refresh-cw', 14), 'Sincronizar agora') : null),
      connected ? gcalBlock(cfg) : null,
      h('details', { class: 'guide' },
        h('summary', {}, 'Como criar o Client ID (uma vez só, ~10 min)'),
        h('ol', {},
          h('li', {}, 'Acesse console.cloud.google.com e crie um projeto (ex.: “Hub”).'),
          h('li', {}, 'Em “APIs e serviços → Biblioteca”, ative a Google Drive API.'),
          h('li', {}, 'Em “Tela de permissão OAuth”, escolha Externo, preencha nome e e-mail, e em “Usuários de teste” adicione o seu e-mail.'),
          h('li', {}, 'Em “Credenciais → Criar credenciais → ID do cliente OAuth”, escolha “Aplicativo da Web”.'),
          h('li', {}, 'Em “URIs de redirecionamento autorizados”, adicione exatamente: ', copyCode(redirect)),
          web ? h('li', {}, 'Em “Origens JavaScript autorizadas”, adicione: ', copyCode(location.origin)) : null,
          h('li', {}, web
            ? 'Já criou o Client ID nos PCs? Basta acrescentar os endereços acima nele (Credenciais → seu cliente → Salvar), colar o mesmo Client ID aqui e tocar em Conectar.'
            : 'Copie o Client ID gerado, cole acima e clique em Conectar. Nos outros PCs, cole o mesmo Client ID.')),
        h('p', { class: 'muted small' }, 'Os dados ficam numa pasta oculta do seu Drive que só o Hub enxerga. Pastas trancadas e Finanças vão criptografadas.'))
    );
  };
  // Google Agenda: só com o Drive conectado (usa o mesmo login)
  const gcalBox = h('div', { class: 'gcal-box' });
  const gcalBlock = cfg => {
    const g = settings().gcal ?? {};
    const st = gcal.status;
    const line = !g.enabled ? null : h('div', { class: 'sync-line' },
      h('span', { class: `dot ${st.state === 'error' ? 'error' : 'ok'}` }),
      h('span', {}, st.state === 'syncing' ? 'Enviando para o Google Agenda…' : st.state === 'error' ? 'Google Agenda com problema'
        : st.lastSync ? `Agenda “Hub” atualizada às ${new Date(st.lastSync).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · ${st.count} itens` : 'Agenda “Hub” ligada'),
      h('span', { class: 'spacer' }),
      h('button', { type: 'button', class: 'btn btn-xs', onclick: () => gcal.sync() }, 'Sincronizar agora'));
    fill(gcalBox,
      toggle('Enviar para o Google Agenda (celular)', 'Cria a agenda “Hub” na sua conta com eventos, folgas e aniversários. Só nesse sentido: edite pelo Hub.', !!g.enabled, async v => {
        if (v) {
          try { await drive.connect(cfg.clientId, { calendar: true, pending: { cfg, gcal: true } }); }
          catch (err) { toast(err.message); renderSync(); return; }
          settings().gcal = { ...settings().gcal, enabled: true };
          save();
          gcal.sync();
        } else {
          settings().gcal = { ...settings().gcal, enabled: false };
          save();
          await drive.setCalendarScope(false);
          toast('Envio para o Google Agenda desligado. A agenda “Hub” continua na sua conta; apague por lá se quiser.');
        }
      }),
      line,
      g.enabled && st.state === 'error' ? h('p', { class: 'field-error' }, st.message) : null,
      g.enabled ? null : h('p', { class: 'muted small' }, 'Antes de ligar: no Google Cloud, em “APIs e serviços → Biblioteca”, ative também a Google Calendar API. O Hub só consegue ver e mexer na agenda que ele mesmo criar.'));
    return gcalBox;
  };
  const offGcal = gcal.onStatus(() => renderSync());

  renderSync();
  const offSync = store.on('sync', () => renderSync());

  // Backups automáticos
  const backupsBox = h('div', { class: 'backup-list' });
  const drawBackups = async () => {
    const items = await backups.list();
    fill(backupsBox,
      h('div', { class: 'sync-line' },
        h('span', {}, 'Backups automáticos, um por semana'),
        h('span', { class: 'spacer' }),
        h('button', { type: 'button', class: 'btn btn-xs', onclick: async () => { await backups.auto({ force: true }); toast('Backup feito.'); drawBackups(); } }, 'Fazer agora')),
      items.length ? items.slice(0, 16).map(b => {
        const when = new Date(b.at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
        return h('div', { class: 'backup-row' },
          icon(b.where === 'drive' ? 'cloud' : 'monitor', 14),
          h('span', {}, when),
          h('span', { class: 'muted small' }, `${b.where === 'drive' ? 'Google Drive' : 'neste PC'} · ${Math.max(1, Math.round(b.size / 1024))} KB`),
          h('span', { class: 'spacer' }),
          h('button', { type: 'button', class: 'btn btn-xs', onclick: async () => {
            const plan = analyze(await b.load());
            const ok = await confirmDialog({ title: 'Restaurar este backup?', message: `Backup de ${when} com ${plan.summary}. Ele substitui os dados atuais do Hub, inclusive nos outros PCs.`, confirm: 'Restaurar', danger: true });
            if (!ok) return;
            plan.apply();
            applyAccent();
            toast('Backup restaurado.');
          } }, 'Restaurar'));
      }) : h('p', { class: 'muted small' }, 'Nenhum backup ainda. O primeiro é feito sozinho alguns segundos depois de abrir o Hub.'));
  };
  drawBackups();

  // Atalho do HUD
  const comboLabel = c => [c.ctrl && 'Ctrl', c.alt && 'Alt', c.shift && 'Shift', c.meta && 'Meta', keyLabel(c)].filter(Boolean).join(' + ');
  const hudBtn = h('button', { type: 'button', class: 'btn shortcut-btn' }, comboLabel(s.hudShortcut));
  hudBtn.addEventListener('click', () => {
    hudBtn.textContent = 'Pressione a combinação…';
    hudBtn.classList.add('recording');
    const onKey = e => {
      e.preventDefault();
      e.stopPropagation();
      if (['Control', 'Alt', 'Shift', 'Meta', 'AltGraph'].includes(e.key)) return;
      window.removeEventListener('keydown', onKey, true);
      hudBtn.classList.remove('recording');
      if (e.key === 'Escape') { hudBtn.textContent = comboLabel(settings().hudShortcut); return; }
      if (!e.ctrlKey && !e.altKey && !e.metaKey) { hudBtn.textContent = comboLabel(settings().hudShortcut); toast('Use pelo menos Ctrl, Alt ou Meta junto com a tecla.'); return; }
      settings().hudShortcut = { key: e.key.toLowerCase(), code: e.code, ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey };
      save();
      hudBtn.textContent = comboLabel(settings().hudShortcut);
    };
    window.addEventListener('keydown', onKey, true);
  });

  const body = h('div', { class: 'settings' },
    section('perfil', 'Perfil', h('label', { class: 'field' }, h('span', {}, 'Seu nome'), nameIn)),
    section('cor', 'Cor de destaque', swatches),
    section('sync', 'Sincronização', syncBox),
    section('clima', 'Clima', cityLabel, cityIn, results),
    section('widgets', 'Tela inicial',
      toggle('Clima', null, s.widgets.weather, w('weather')),
      toggle('Tarefas de hoje', null, s.widgets.today, w('today')),
      toggle('Mais visitados', isExtension ? null : 'Disponível só na extensão', s.widgets.topSites, w('topSites')),
      toggle('Salmo do dia', null, s.widgets.quote, w('quote')),
      h('label', { class: 'field' }, h('span', {}, 'Plano de leitura bíblica (card no Início)'),
        h('select', { class: 'input', onchange: e => { reading.setPlan(e.target.value || null); toast(e.target.value ? 'Plano iniciado hoje.' : 'Plano de leitura desligado.'); } },
          h('option', { value: '', selected: !store.get('reading').plan }, 'Nenhum'),
          Object.entries(PLANS).map(([id, p]) => h('option', { value: id, selected: store.get('reading').plan === id }, p.name)))),
      toggle('Imagem de fundo do dia', 'Fotos de destaque do Wikimedia Commons, uma por dia', s.backdrop, v => { settings().backdrop = v; save(); }),
      h('label', { class: 'field' }, h('span', {}, 'Qualidade da imagem'),
        h('select', { class: 'input', onchange: e => { settings().backdropQuality = e.target.value; save(); } },
          h('option', { value: '4k', selected: s.backdropQuality !== 'hd' }, '4k: mais nítida (≈ 2 MB por dia)'),
          h('option', { value: 'hd', selected: s.backdropQuality === 'hd' }, 'Full HD: economia de dados (≈ 400 KB por dia)'))),
      toggle('Timer de foco', 'Na barra superior', s.widgets.focus, w('focus')),
      durations
    ),
    section('manha', 'Resumo da manhã',
      toggle('Notificação com o resumo do dia', 'Aniversários, compromissos, tarefas, contas e chuva', s.morning?.enabled !== false, v => { settings().morning = { ...settings().morning, enabled: v }; save(); }),
      h('label', { class: 'field' }, h('span', {}, 'Horário'),
        h('input', { class: 'input', type: 'time', value: s.morning?.time ?? '08:00', onchange: e => { if (e.target.value) { settings().morning = { ...settings().morning, time: e.target.value }; save(); } } }))
    ),
    section('repouso', 'Modo repouso',
      h('label', { class: 'field' }, h('span', {}, 'Ativar sozinho depois de'),
        h('select', { class: 'input', onchange: e => { settings().rest = { ...settings().rest, idleMinutes: Number(e.target.value) }; save(); } },
          [[0, 'Nunca (só manualmente)'], [5, '5 minutos sem uso'], [10, '10 minutos sem uso'], [15, '15 minutos sem uso'], [30, '30 minutos sem uso'], [60, '1 hora sem uso']]
            .map(([v, l]) => h('option', { value: v, selected: s.rest.idleMinutes === v }, l)))),
      toggle('Detectar inatividade do PC inteiro', 'Abre em tela cheia mesmo se você estiver em outro programa, e fecha ao mexer o mouse. Não ativa com áudio tocando.', s.rest.system, v => { settings().rest = { ...settings().rest, system: v }; save(); }),
      h('p', { class: 'muted small' }, 'Para ativar na hora: botão da lua na barra superior ou tecla R.')
    ),
    section('hud', 'HUD nos sites',
      h('div', { class: 'toggle-row' },
        h('span', {}, h('span', {}, 'Atalho para abrir o HUD'), h('span', { class: 'muted small' }, 'Funciona em qualquer site aberto depois da instalação. Clique e pressione a nova combinação.')),
        hudBtn),
      (() => {
        const box = h('div', { class: 'site-rules' });
        const draw = () => {
          const rules = Object.entries(settings().hudSites ?? {});
          fill(box, rules.length
            ? rules.map(([hst, mode]) => h('div', { class: 'backup-row' },
                icon(mode === 'off' ? 'eye-off' : 'minus', 14), h('span', {}, hst),
                h('span', { class: 'muted small' }, mode === 'off' ? 'não aparece' : 'começa minimizado'),
                h('span', { class: 'spacer' }),
                h('button', { type: 'button', class: 'btn btn-xs', onclick: () => { const x = { ...settings().hudSites }; delete x[hst]; settings().hudSites = x; save(); draw(); } }, 'Remover regra')))
            : h('p', { class: 'muted small' }, 'Nenhuma regra por site. No HUD, o botão ⋮ define como ele se comporta no site aberto.'));
        };
        draw();
        return box;
      })(),
      h('p', { class: 'muted small' }, 'Há também um atalho global (padrão Alt+Shift+H) que funciona mesmo com o foco na barra de endereço. Ele é configurado em chrome://extensions/shortcuts.')
    ),
    section('links', 'Links', h('label', { class: 'field' }, h('span', {}, 'Abrir links'), openIn)),
    section('dados', 'Backup',
      backupsBox,
      h('div', { class: 'button-row' },
        h('button', { type: 'button', class: 'btn', onclick: backup }, icon('download', 15), 'Exportar backup'),
        h('button', { type: 'button', class: 'btn', onclick: () => file.click() }, icon('upload', 15), 'Importar arquivo'),
        file
      ),
      h('p', { class: 'muted small' }, 'Importar aceita um backup do Hub ou o arquivo gerado por legado/tools/exportar.html com os dados do links.html, planner e smart notes antigos. Pastas trancadas e Finanças saem criptografadas no backup.')
    ),
    section('atalhos', 'Atalhos',
      h('dl', { class: 'shortcuts' },
        ...[['Ctrl+K', 'Buscar no Hub e executar comandos'], ['1 – 6', 'Início, Workspace, Studyspace, Concursos, Finanças, Atividade'], ['/', 'Pesquisar na web (abre em nova aba; Ctrl+Enter abre na mesma)'], ['R', 'Modo repouso'], ['T', 'Nova tarefa para hoje'], ['N', 'Nova nota no Cérebro'], ['E', 'Novo evento na agenda'], [',', 'Ajustes'], ['Esc', 'Fechar janelas']]
          .flatMap(([k, v]) => [h('dt', {}, h('kbd', {}, k)), h('dd', {}, v)])
      )
    )
  );

  const d = dialog({ title: 'Ajustes', className: 'dialog-settings', body });
  d.el.addEventListener('close', offSync);
  d.el.addEventListener('close', offGcal);
  if (focusSection) {
    const target = body.querySelector(`[data-section="${focusSection}"]`);
    target?.scrollIntoView({ block: 'start' });
    if (focusSection === 'clima') cityIn.focus();
  }
}

export const keyLabel = c => c.code?.startsWith('Key') ? c.code.slice(3) : c.code?.startsWith('Digit') ? c.code.slice(5) : (c.key ?? '').toUpperCase();

const clamp = (v, fallback) => { const n = Math.round(Number(v)); return n >= 1 && n <= 180 ? n : fallback; };
