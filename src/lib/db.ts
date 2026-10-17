import { openDB, IDBPDatabase } from 'idb';
import type { Job, Settings } from './types';
import { isElectron } from './platform';

let dbp: Promise<IDBPDatabase> | null = null;
const db = () =>
  (dbp ??= openDB('xerox-station', 1, {
    upgrade(d) {
      d.createObjectStore('jobs', { keyPath: 'id' });
      d.createObjectStore('files');
      d.createObjectStore('kv');
    }
  }));

const rand = (n: number, alphabet = 'abcdefghjkmnpqrstuvwxyz23456789') =>
  Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => alphabet[b % alphabet.length]).join('');
export const randPin = () => rand(4, '0123456789');
export const randToken = () => rand(16);
export const randCode = () => rand(6, 'abcdefghjkmnpqrstuvwxyz23456789').toUpperCase();
export const uid = () => (typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : rand(24));

/** Live hosted web/PWA (Vercel). Used for internet-mode customer links and the remote console. */
export const LIVE_PUBLIC_URL = 'https://print-media-eta.vercel.app';

export function defaultSettings(): Settings {
  return {
    shopName: 'My Xerox Shop',
    peerId: 'xs-' + rand(10),
    staticToken: randToken(),
    staticEnabled: false,
    mode: 'manual',
    maxPages: 20, maxMB: 10, maxPerHour: 10, cooldownSec: 30, dailyPageCap: 200, rejectPages: 300,
    sessionTtlMin: 10, maxSessions: 5,
    connection: isElectron ? 'lan' : 'public',
    publicUrl: LIVE_PUBLIC_URL, lanIp: '',
    signaling: { host: '0.peerjs.com', port: 443, path: '/', secure: true },
    stun: 'stun:stun.l.google.com:19302', turnUrl: '', turnUser: '', turnPass: '',
    printer: '', appPin: '',
    opEnabled: true, opCode: ''
  };
}

export async function loadSettings(): Promise<Settings> {
  const saved = (await (await db()).get('kv', 'settings')) as Partial<Settings> | undefined;
  const base = defaultSettings();
  const s = { ...base, ...saved, signaling: { ...base.signaling, ...(saved?.signaling ?? {}) } };
  if (!saved) await saveSettings(s); // persist generated peer id + static token
  return s;
}
export async function saveSettings(s: Settings) { await (await db()).put('kv', s, 'settings'); }
export async function allJobs(): Promise<Job[]> {
  const j = (await (await db()).getAll('jobs')) as Job[];
  return j.sort((a, b) => b.createdAt - a.createdAt);
}
export async function putJob(j: Job) { await (await db()).put('jobs', j); }
export async function putFile(id: string, bytes: ArrayBuffer) { await (await db()).put('files', bytes, id); }
export async function getFile(id: string) { return (await (await db()).get('files', id)) as ArrayBuffer | undefined; }
export async function delFile(id: string) { await (await db()).delete('files', id); }
export async function delJob(id: string) { const d = await db(); await d.delete('jobs', id); await d.delete('files', id); }
export async function clearJobs() { const d = await db(); await d.clear('jobs'); await d.clear('files'); }
