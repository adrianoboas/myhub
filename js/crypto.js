// Cofres criptografados (pastas trancadas do Cérebro e Finanças).
// Chave: PBKDF2-SHA256 (310 mil iterações) a partir da senha + sal aleatório.
// Conteúdo: AES-256-GCM, que também detecta senha errada (falha de autenticação).
// A senha nunca é guardada; sem ela o conteúdo é irrecuperável.

const ITERATIONS = 310000;
const enc = new TextEncoder();
const dec = new TextDecoder();

function toB64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
const fromB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function deriveKey(password, salt) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
}

async function seal(key, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
  return { iv: toB64(iv), ct: toB64(ct) };
}

export class WrongPassword extends Error {
  constructor() { super('Senha incorreta.'); }
}

/** Cria um cofre novo. Retorna { vault, key }. */
export async function createVault(password, data) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(password, salt);
  return { key, vault: { v: 1, salt: toB64(salt), ...(await seal(key, data)) } };
}

/** Abre um cofre. Retorna { key, data } ou lança WrongPassword. */
export async function openVault(password, vault) {
  const key = await deriveKey(password, fromB64(vault.salt));
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(vault.iv) }, key, fromB64(vault.ct));
    return { key, data: JSON.parse(dec.decode(plain)) };
  } catch {
    throw new WrongPassword();
  }
}

/** Relê um cofre com uma chave já derivada (ex.: chegou versão nova de outro PC). */
export async function readVault(key, vault) {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(vault.iv) }, key, fromB64(vault.ct));
  return JSON.parse(dec.decode(plain));
}

/** Recifra o conteúdo com a mesma chave (novo IV a cada gravação). */
export async function resealVault(key, vault, data) {
  return { ...vault, ...(await seal(key, data)) };
}

// ---------- Bloqueio automático ----------
// Cofres abertos voltam a trancar depois de 5 min com a aba em segundo plano.

const AUTO_LOCK_MS = 5 * 60 * 1000;
const lockers = new Set();
let hiddenAt = 0;

export function onAutoLock(fn) {
  lockers.add(fn);
  return () => lockers.delete(fn);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); return; }
  if (hiddenAt && Date.now() - hiddenAt > AUTO_LOCK_MS) lockers.forEach(fn => fn());
  hiddenAt = 0;
});
