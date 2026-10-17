import { PDFDocument } from 'pdf-lib';
import { useStore } from './store';
import { startShop, notifyCustomer } from './peer';
import type { ShopHandlers } from './peer';
import { delFile, getFile, LIVE_PUBLIC_URL, putFile, randCode, randPin, randToken, uid } from './db';
import { autoDecision } from './limits';
import { ownerNet } from './session';
import { printBytes, saveBytes } from './print';
import { caps, isElectron } from './platform';
import type { Job, Session } from './types';

const S = () => useStore.getState();
let shop: { destroy(): void; ops(m: unknown): void } | null = null;
let booted = false;

async function sha256(bytes: ArrayBuffer): Promise<string> {
  try {
    const d = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
  } catch { // insecure context (plain http): cheap fallback fingerprint
    let h = 2166136261; const v = new Uint8Array(bytes);
    for (let i = 0; i < v.length; i += 97) h = Math.imul(h ^ v[i], 16777619);
    return 'f' + (h >>> 0).toString(16) + '-' + v.length;
  }
}

function beep() {
  try {
    const c = new AudioContext(); const o = c.createOscillator(); const g = c.createGain();
    o.frequency.value = 880; g.gain.value = 0.15; o.connect(g); g.connect(c.destination); o.start();
    setTimeout(() => { o.stop(); void c.close(); }, 200);
  } catch { /* autoplay blocked */ }
}

const handlers: ShopHandlers = {
  status: (peerStatus, peerMsg = '') => S().set({ peerStatus, peerMsg }),
  limits: () => ({ maxBytes: S().settings.maxMB > 0 ? S().settings.maxMB * 1048576 : 0, maxMB: S().settings.maxMB, shop: S().settings.shopName }),

  opCheck: (code) => { const s = S().settings; return s.opEnabled && code === s.opCode; },
  opState: () => S().jobs.map(jobPub),
  opCommand: ({ act, id }) => {
    if (act === 'print') printJob(id);
    else if (act === 'hold') void holdJob(id);
    else if (act === 'reject') void rejectJob(id);
  },

  checkToken(token, _remote) {
    const { settings, sessions } = S();
    if (settings.staticEnabled && token === settings.staticToken) return { ok: true, kind: 'static', pin: randPin() };
    const sess = sessions.find((x) => x.token === token);
    if (!sess) return { ok: false, reason: 'This QR code is not valid any more. Ask the shop for a new one.' };
    if (sess.expiresAt < Date.now()) return { ok: false, reason: 'This QR code has expired. Ask the shop for a new one.' };
    // Reusable until it expires: several customers can send at the same time and one
    // customer can send several files. Every file gets its own match code.
    return { ok: true, kind: 'once', pin: randPin() };
  },

  async onFile(f) {
    const { settings, jobs } = S();
    const head = new TextDecoder().decode(new Uint8Array(f.bytes.slice(0, 5)));
    if (head !== '%PDF-') return { ok: false, reason: 'That file is not a PDF.' };
    let pages = 0;
    try { pages = (await PDFDocument.load(f.bytes, { ignoreEncryption: true, updateMetadata: false })).getPageCount(); }
    catch { return { ok: false, reason: 'This PDF could not be read. It may be damaged or protected.' }; }
    if (pages > settings.rejectPages) return { ok: false, reason: `Too many pages (${pages}). The shop accepts up to ${settings.rejectPages}.` };

    const hash = await sha256(f.bytes);
    const d = autoDecision(settings, { pages, size: f.bytes.byteLength, remote: f.remote }, jobs);
    const job: Job = {
      id: uid(), token: f.token, kind: f.kind, pin: f.pin, filename: f.name, hash,
      size: f.bytes.byteLength, pages, copies: 1, color: true, status: 'incoming', auto: d.auto,
      note: d.auto ? undefined : d.reason, createdAt: Date.now(), remote: f.remote
    };
    await putFile(job.id, f.bytes);
    await S().upsertJob(job);
    beep();
    if ('Notification' in window && Notification.permission === 'granted') new Notification('New print job', { body: `${f.name} - ${pages} pages - code ${f.pin}` });
    if (d.auto) void printJob(job.id);
    return { ok: true, id: job.id };
  }
};

const find = (id: string) => S().jobs.find((j) => j.id === id);
const update = (j: Job, p: Partial<Job>) => S().upsertJob({ ...j, ...p });
/** Job as sent to the remote console - the customer's peer id is not needed there. */
const jobPub = (j: Job) => ({ ...j, remote: '' });
let lastJobs: Job[] | null = null;

const printQ: string[] = [];
let printBusy = false;

/** Queue a print - jobs print one after another so parallel uploads never fight over the printer. */
export function printJob(id: string) {
  if (!printQ.includes(id)) printQ.push(id);
  if (!printBusy) void runPrintQ();
}

async function runPrintQ() {
  printBusy = true;
  try { while (printQ.length) await doPrint(printQ.shift()!); }
  finally { printBusy = false; }
}

async function doPrint(id: string) {
  const j = find(id); if (!j) return;
  await update(j, { status: 'printing', needsConfirm: false, note: undefined });
  notifyCustomer(id, 'printing');
  const bytes = await getFile(id);
  if (!bytes) { await update(j, { status: 'failed', note: 'File is no longer stored' }); notifyCustomer(id, 'failed', 'Please send the file again.'); return; }
  const r = await printBytes(bytes, { ...j }, S().settings);
  const cur = find(id) ?? j;
  if (!r.ok) { await update(cur, { status: 'failed', note: r.error }); notifyCustomer(id, 'failed', 'Printer problem - please speak to the shop.'); return; }
  if (r.confirm) { await update(cur, { status: 'printing', needsConfirm: true }); return; }
  await markDone(id);
}

export async function markDone(id: string) {
  const j = find(id); if (!j) return;
  await update(j, { status: 'done', printedAt: Date.now(), needsConfirm: false, note: undefined });
  await delFile(id); // no document copies kept after printing
  notifyCustomer(id, 'done');
}
export async function holdJob(id: string) { const j = find(id); if (j) await update(j, { status: 'held', note: 'On hold' }); }
export async function rejectJob(id: string) {
  const j = find(id); if (!j) return;
  await update(j, { status: 'rejected', note: 'Rejected by shop' });
  await delFile(id);
  notifyCustomer(id, 'rejected', 'The shop declined this file.');
}
export async function setCopies(id: string, copies: number) { const j = find(id); if (j) await update(j, { copies: Math.min(99, Math.max(1, copies)) }); }
export async function toggleColor(id: string) { const j = find(id); if (j) await update(j, { color: !j.color }); }
export async function downloadJob(id: string) {
  const j = find(id); const b = await getFile(id);
  if (j && b) saveBytes(b, j.filename);
}

export function newSession(): Session | null {
  const { settings, sessions } = S();
  const live = sessions.filter((x) => !x.used && x.expiresAt > Date.now());
  if (live.length >= settings.maxSessions) return null;
  const now = Date.now();
  const sess: Session = { token: randToken(), pin: randPin(), createdAt: now, expiresAt: now + settings.sessionTtlMin * 60000, used: false };
  S().setSessions((l) => [sess, ...l]);
  return sess;
}
export const dropSession = (token: string) => S().setSessions((l) => l.filter((x) => x.token !== token));

/** (Re)connect the shop peer using current settings. */
export function startNet() {
  shop?.destroy();
  const { settings, port } = S();
  if (!isElectron && settings.connection === 'lan') {
    S().set({ peerStatus: 'error', peerMsg: 'LAN mode needs the desktop app - open XeroxStation on the shop PC. This browser window can not run the shop WiFi QR server.' });
    return;
  }
  shop = startShop(settings, handlers, ownerNet(settings, port));
}

export async function loadPrinters() {
  if (caps.printerList && window.xs) S().set({ printers: await window.xs.printers() });
}

export async function boot() {
  if (booted) return; booted = true;
  await S().load();
  if (!S().settings.opCode) await S().patchSettings({ opCode: randCode() });
  if (!S().settings.publicUrl) await S().patchSettings({ publicUrl: LIVE_PUBLIC_URL });
  if (isElectron && window.xs) { const i = await window.xs.info(); S().set({ lanIps: i.lanIps, port: i.port }); void loadPrinters(); }
  startNet();
  setInterval(() => S().setSessions((l) => l.filter((x) => x.used ? Date.now() < x.expiresAt + 60000 : x.expiresAt > Date.now())), 1000);
  useStore.subscribe((st) => {
    const n = st.jobs.filter((j) => j.status === 'incoming' || j.status === 'held').length;
    document.title = n ? `(${n}) XeroxStation` : 'XeroxStation';
    window.xs?.badge(n);
    // Push the queue to logged-in remote consoles (web/PWA) whenever jobs change.
    if (st.jobs !== lastJobs) { lastJobs = st.jobs; shop?.ops({ type: 'jobs', jobs: st.jobs.map(jobPub) }); }
  });
}
