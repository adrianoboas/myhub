import * as store from '../store.js';
import { h, icon, clear, fill, faviconUrl, hostname, isExtension, dateKey } from '../dom.js';
import { holiday } from './tasks.js';
import { PSALMS } from '../psalms.js';
import * as work from './work.js';

// ---------- Saudação, relógio e salmo do dia ----------


function greeting(hour) {
  if (hour < 5) return 'Boa madrugada';
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

export function mountHero(el) {
  const hello = h('p', { class: 'hello' });
  const time = h('div', { class: 'clock', 'aria-live': 'off' });
  const date = h('p', { class: 'date' });
  const quote = h('p', { class: 'quote' });
  const dayStatus = h('button', { class: 'day-status', title: 'Abrir a escala de trabalho', onclick: () => work.openSchedule() });
  el.append(hello, time, date, dayStatus, quote);
  const renderStatus = () => {
    const st = work.status();
    dayStatus.dataset.kind = st.kind;
    fill(dayStatus,
      icon(st.kind === 'off' ? 'tree-palm' : 'briefcase', 14),
      h('strong', {}, st.label),
      st.hours ? h('span', {}, `${st.hours} · ${st.phase}`) : null,
      st.detail ? h('span', { class: 'day-status-detail' }, st.detail) : null);
  };
  store.on('workdays', renderStatus);

  let lastDay = '';
  const tick = () => {
    const now = new Date();
    const name = store.get('settings').name.trim();
    hello.textContent = `${greeting(now.getHours())}${name ? ', ' + name : ''}.`;
    time.textContent = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const key = dateKey(now);
    if (key !== lastDay) {
      lastDay = key;
      const fer = holiday(key);
      const long = now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
      date.textContent = long[0].toUpperCase() + long.slice(1) + (fer ? ` · ${fer}` : '');
      // mesmo salmo o dia todo; muda à meia-noite (dias contados no fuso local)
      const n = Math.floor((now.getTime() - now.getTimezoneOffset() * 60000) / 86400000);
      const p = PSALMS[n % PSALMS.length];
      fill(quote, h('span', { class: 'quote-text' }, `“${p.text}”`), h('cite', {}, p.ref));
    }
    quote.hidden = !store.get('settings').widgets.quote;
    renderStatus();
  };
  tick();
  // alinha ao início de cada minuto para o relógio virar na hora certa
  setTimeout(() => { tick(); setInterval(tick, 60000); }, 60000 - (Date.now() % 60000));
  document.addEventListener('visibilitychange', () => document.hidden || tick());
  store.on('settings', tick);
}

// ---------- Clima (Open-Meteo) ----------

const WMO = {
  0: ['Céu limpo', 'sun'], 1: ['Predomínio de sol', 'sun'], 2: ['Parcialmente nublado', 'cloud-sun'], 3: ['Nublado', 'cloud'],
  45: ['Neblina', 'cloud-fog'], 48: ['Neblina', 'cloud-fog'],
  51: ['Garoa fraca', 'cloud-drizzle'], 53: ['Garoa', 'cloud-drizzle'], 55: ['Garoa forte', 'cloud-drizzle'],
  56: ['Garoa congelante', 'cloud-drizzle'], 57: ['Garoa congelante', 'cloud-drizzle'],
  61: ['Chuva fraca', 'cloud-rain'], 63: ['Chuva', 'cloud-rain'], 65: ['Chuva forte', 'cloud-rain'],
  66: ['Chuva congelante', 'cloud-rain'], 67: ['Chuva congelante', 'cloud-rain'],
  71: ['Neve fraca', 'cloud-snow'], 73: ['Neve', 'cloud-snow'], 75: ['Neve forte', 'cloud-snow'], 77: ['Neve', 'cloud-snow'],
  80: ['Pancadas de chuva', 'cloud-rain'], 81: ['Pancadas de chuva', 'cloud-rain'], 82: ['Temporal', 'cloud-rain'],
  85: ['Neve', 'cloud-snow'], 86: ['Neve forte', 'cloud-snow'],
  95: ['Trovoadas', 'cloud-lightning'], 96: ['Trovoadas com granizo', 'cloud-lightning'], 99: ['Trovoadas com granizo', 'cloud-lightning']
};
const NIGHT = { sun: 'moon', 'cloud-sun': 'cloud-moon' };
const WEATHER_TTL = 30 * 60 * 1000;

export async function searchCity(name) {
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=6&language=pt&format=json`);
  const j = await r.json();
  return (j.results ?? []).map(c => ({ name: c.name, region: [c.admin1, c.country].filter(Boolean).join(', '), lat: c.latitude, lon: c.longitude }));
}

/** Clima atual + próximos 5 dias. Cache de 30 min compartilhado com o modo repouso. */
export async function fetchWeather(city) {
  const key = `${city.lat.toFixed(2)},${city.lon.toFixed(2)}`;
  const cached = await store.local.get('weather2');
  if (cached?.key === key && Date.now() - cached.at < WEATHER_TTL) return cached.data;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}` +
    '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=6&timezone=auto';
  const j = await (await fetch(url)).json();
  const d = j.daily;
  const data = {
    temp: Math.round(j.current.temperature_2m), feels: Math.round(j.current.apparent_temperature),
    humidity: Math.round(j.current.relative_humidity_2m),
    code: j.current.weather_code, day: j.current.is_day === 1,
    max: Math.round(d.temperature_2m_max[0]), min: Math.round(d.temperature_2m_min[0]),
    rain: d.precipitation_probability_max?.[0] ?? null,
    days: d.time.slice(1, 6).map((date, i) => ({
      date, code: d.weather_code[i + 1],
      max: Math.round(d.temperature_2m_max[i + 1]), min: Math.round(d.temperature_2m_min[i + 1]),
      rain: d.precipitation_probability_max?.[i + 1] ?? null
    }))
  };
  await store.local.set('weather2', { key, at: Date.now(), data });
  return data;
}

/** Rótulo e ícone de um código WMO (night troca sol por lua). */
export function describe(code, night = false) {
  const [label, ic] = WMO[code] ?? ['—', 'cloud'];
  return { label, icon: night ? NIGHT[ic] ?? ic : ic };
}

const weekday = date => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
};

/** Faixa compacta com os próximos dias (usada no Início e no modo repouso). */
export function forecastStrip(days) {
  return h('div', { class: 'forecast' }, days.map(f => {
    const x = describe(f.code);
    return h('div', { class: 'fc-day', title: `${x.label}${f.rain != null ? ` · chuva ${f.rain}%` : ''}` },
      h('span', { class: 'fc-name' }, weekday(f.date)),
      icon(x.icon, 16),
      h('span', { class: 'fc-temp' }, h('b', {}, `${f.max}°`), ` ${f.min}°`));
  }));
}

export function mountWeather(el, openSettings) {
  const render = async () => {
    const s = store.get('settings');
    el.hidden = !s.widgets.weather;
    if (el.hidden) return;
    if (!s.city) {
      fill(el, h('button', { class: 'weather-setup', onclick: () => openSettings('clima') }, icon('cloud-sun', 20), 'Definir cidade para o clima'));
      return;
    }
    try {
      const w = await fetchWeather(s.city);
      const now = describe(w.code, !w.day);
      fill(el,
        h('div', { class: 'weather-now' },
          h('div', { class: 'weather-main' }, icon(now.icon, 30), h('span', { class: 'weather-temp' }, `${w.temp}°`)),
          h('div', { class: 'weather-info' },
            h('span', {}, now.label),
            h('span', { class: 'muted small' }, `${w.min}° / ${w.max}° · sensação ${w.feels}°`),
            h('span', { class: 'muted small' }, `Umidade ${w.humidity}%${w.rain != null ? ` · chuva ${w.rain}%` : ''}`),
            h('span', { class: 'muted small' }, s.city.name))
        ),
        w.days?.length ? forecastStrip(w.days) : null
      );
    } catch {
      fill(el, h('div', { class: 'weather-info' }, icon('cloud-off', 20), h('span', { class: 'muted small' }, 'Clima indisponível agora')));
    }
  };
  render();
  store.on('settings', render);
  setInterval(render, WEATHER_TTL);
}

// ---------- Mais visitados ----------

export function mountTopSites(el) {
  const render = async () => {
    const on = store.get('settings').widgets.topSites && isExtension && chrome.topSites;
    el.hidden = !on;
    if (!on) return;
    const sites = (await chrome.topSites.get()).slice(0, 8);
    const newTab = store.get('settings').openIn === 'new';
    fill(el, 
      h('header', { class: 'card-head' }, h('span', { class: 'eyebrow' }, 'Mais visitados')),
      h('div', { class: 'top-sites' }, sites.map(s =>
        h('a', { class: 'top-site', href: s.url, title: s.title, target: newTab ? '_blank' : null },
          h('img', { src: faviconUrl(s.url, 32), alt: '', width: 20, height: 20 }),
          h('span', {}, hostname(s.url).split('.')[0])
        )
      ))
    );
  };
  render();
  store.on('settings', render);
}
