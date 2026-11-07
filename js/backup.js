// Backups automáticos: uma cópia completa por semana, guardada neste PC
// (storage.local) e, com o Google Drive conectado, também no Drive.
// Ficam as 8 mais recentes de cada lugar. Pastas trancadas e Finanças vão
// criptografadas, como estão no Hub.

import * as store from './store.js';
import * as drive from './sync/drive.js';
import { dateKey } from './dom.js';

const KEEP = 8;
const EVERY_MS = 7 * 86400000;

const localList = async () => (await store.local.get('backups')) ?? [];

/** Faz um backup se o último tiver mais de uma semana (ou se `force`). */
export async function auto({ force = false } = {}) {
  const last = (await store.local.get('lastBackupAt')) ?? 0;
  if (!force && Date.now() - last < EVERY_MS) return null;
  const snapshot = store.exportAll();
  const body = JSON.stringify(snapshot);
  const name = `bkp-${dateKey()}.json`;

  const list = (await localList()).filter(b => b.name !== name);
  list.unshift({ name, at: Date.now(), size: body.length, data: snapshot });
  await store.local.set('backups', list.slice(0, KEEP));

  if ((await store.syncConfig()).provider === 'drive') {
    try {
      const remote = await drive.backupList();
      for (const old of remote.filter(b => b.name === name)) await drive.backupDelete(old.id);
      await drive.backupPut(name, body);
      for (const old of remote.filter(b => b.name !== name).slice(KEEP - 1)) await drive.backupDelete(old.id);
    } catch { /* sem Drive agora: a cópia local já está feita */ }
  }
  await store.local.set('lastBackupAt', Date.now());
  return name;
}

/** Lista para os Ajustes: [{ where: 'local'|'drive', name, at, size, load() }] */
export async function list() {
  const out = (await localList()).map(b => ({ where: 'local', name: b.name, at: b.at, size: b.size, load: async () => b.data }));
  if ((await store.syncConfig()).provider === 'drive') {
    try {
      for (const b of await drive.backupList()) out.push({ where: 'drive', name: b.name, at: b.at, size: b.size, load: () => drive.backupGet(b.id) });
    } catch { /* offline */ }
  }
  return out.sort((a, b) => b.at - a.at);
}
