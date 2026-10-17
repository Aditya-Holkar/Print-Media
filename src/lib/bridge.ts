import type { PrinterInfo } from './types';

/**
 * Local bridge to the XeroxStation desktop app on this same PC.
 * The web/PWA app cannot read a printer list and can only print through dialogs. But when
 * the desktop app is running on this machine it answers on 127.0.0.1:8787 - the web app
 * then shows the same printer list and prints exactly like the desktop app (silent, one
 * job after another). Whenever it is not reachable we fall back to the old behavior.
 */
const BASE = 'http://127.0.0.1:8787';
let cache = { ok: false, at: 0 };

async function jfetch(path: string, init?: RequestInit, timeoutMs = 2000): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(BASE + path, { cache: 'no-store', ...init, signal: ctrl.signal });
    if (!r.ok) throw new Error('bridge ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

/** True when the desktop app runs on this machine (cached for a few seconds). */
export async function bridgePing(force = false): Promise<boolean> {
  if (!force && Date.now() - cache.at < 8000) return cache.ok;
  try { const j = await jfetch('/api/bridge/ping', undefined, 1500); cache = { ok: !!j?.ok, at: Date.now() }; }
  catch { cache = { ok: false, at: Date.now() }; }
  return cache.ok;
}

export async function bridgePrinters(): Promise<PrinterInfo[]> {
  const j = await jfetch('/api/bridge/printers', undefined, 3000);
  return Array.isArray(j?.printers) ? j.printers : [];
}

export async function bridgePrinterSetup(): Promise<{ ok: boolean; error?: string }> {
  try { return await jfetch('/api/bridge/printer-setup', { method: 'POST' }, 3000); }
  catch { return { ok: false, error: 'Could not open Windows printer settings - is the desktop app running?' }; }
}

function b64(u8: Uint8Array): string {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, Array.from(u8.subarray(i, i + 0x8000)));
  return btoa(s);
}

/** Hand a PDF to the desktop app on this machine for silent printing. */
export async function bridgePrint(bytes: ArrayBuffer, o: { printer?: string; copies: number; color: boolean; filename: string }): Promise<{ ok: boolean; error?: string }> {
  try {
    const body = JSON.stringify({ pdf: b64(new Uint8Array(bytes)), printer: o.printer || '', copies: o.copies, color: o.color, filename: o.filename });
    return await jfetch('/api/bridge/print', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }, 30000);
  } catch {
    return { ok: false, error: 'Lost the connection to the desktop app. Keep it open while printing, or use Download.' };
  }
}
