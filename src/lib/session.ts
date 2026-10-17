import type { Settings } from './types';
import { isElectron } from './platform';
import { DEFAULT_STUN, DEFAULT_TURN } from './db';

export interface Net { host: string; port: number; path: string; secure: boolean; lan: boolean }
/** One QR a customer/console can scan: a label and either a link or why it is not available. */
export interface QrSource { label: string; url?: string; error?: string }

/**
 * Signaling servers used by the OWNER peer(s).
 * Desktop app: always the shop-WiFi server; "Shop WiFi + Internet" adds the internet peer on top.
 * Hosted web app: internet only.
 */
export function ownerNets(s: Settings, localPort: number): { lan?: Net; net?: Net } {
  if (!isElectron) return { net: { ...s.signaling, lan: false } };
  return {
    lan: { host: 'localhost', port: localPort, path: '/peerjs', secure: false, lan: true },
    ...(s.connection === 'public' ? { net: { ...s.signaling, lan: false } } : {})
  };
}

/** Where the hosted pages live (internet mode). */
function publicBase(s: Settings, file: string): { base: string } | { error: string } {
  const raw = s.publicUrl || (isElectron ? '' : new URL('.', location.href).href);
  if (!raw) return { error: `Set "Public page URL" in Settings (where ${file} is hosted).` };
  const base = raw.replace(/\/+$/, '');
  if (!/^https?:\/\//.test(base)) return { error: 'Public page URL must start with http:// or https://' };
  return { base };
}

/** Only embed custom ICE servers in the QR when they differ from the built-in defaults (the pages carry the defaults themselves). */
const addIce = (q: URLSearchParams, s: Settings) => {
  if (s.stun.trim() && s.stun.trim() !== DEFAULT_STUN) q.set('u', s.stun.trim());
  if (s.turnUrl.trim() && s.turnUrl.trim() !== DEFAULT_TURN) { q.set('r', s.turnUrl.trim()); q.set('ru', s.turnUser); q.set('rp', s.turnPass); }
};

/** QR sources for customer sessions: internet first (works from anywhere), then shop WiFi. */
export function customerSources(s: Settings, token: string, lanIps: string[], localPort: number, expiresAt?: number): QrSource[] {
  const out: QrSource[] = [];
  if (!isElectron || s.connection === 'public') {
    const pb = publicBase(s, 'customer.html');
    if ('base' in pb) {
      const net = { ...s.signaling, lan: false };
      const q = new URLSearchParams({
        p: s.peerId, t: token, h: net.host, o: String(net.port), a: net.path, x: net.secure ? '1' : '0',
        l: '0', n: s.shopName, m: String(s.maxMB)
      });
      if (expiresAt) q.set('e', String(expiresAt));
      addIce(q, s);
      out.push({ label: 'Anywhere (internet)', url: `${pb.base}/customer.html?${q.toString()}` });
    } else out.push({ label: 'Anywhere (internet)', error: pb.error });
  }
  if (isElectron) {
    const ip = s.lanIp || lanIps[0];
    if (!ip) out.push({ label: 'Shop WiFi', error: 'No network address found. Connect this PC to the shop WiFi / router.' });
    else {
      const q = new URLSearchParams({
        p: s.peerId, t: token, h: ip, o: String(localPort), a: '/peerjs', x: '0',
        l: '1', n: s.shopName, m: String(s.maxMB)
      });
      if (expiresAt) q.set('e', String(expiresAt));
      out.push({ label: 'Shop WiFi', url: `http://${ip}:${localPort}/customer.html?${q.toString()}` });
    }
  }
  return out;
}

/** Console (web/PWA) QR sources: shop WiFi first (the controlling phone is normally in the shop), internet second. */
export function operatorSources(s: Settings, lanIps: string[], localPort: number): QrSource[] {
  const link = (base: string, host: string, port: number, path: string, secure: boolean, lan: boolean) => {
    const q = new URLSearchParams({
      p: s.peerId, h: host, o: String(port), a: path, x: secure ? '1' : '0',
      l: lan ? '1' : '0', n: s.shopName, c: s.opCode
    });
    if (!lan) addIce(q, s);
    return `${base}/operator.html?${q.toString()}`;
  };
  const out: QrSource[] = [];
  if (isElectron) {
    const ip = s.lanIp || lanIps[0];
    if (!ip) out.push({ label: 'Shop WiFi', error: 'No network address found. Connect this PC to the shop WiFi / router.' });
    else out.push({ label: 'Shop WiFi', url: link(`http://${ip}:${localPort}`, ip, localPort, '/peerjs', false, true) });
  }
  if (!isElectron || s.connection === 'public') {
    const pb = publicBase(s, 'operator.html');
    if ('base' in pb) out.push({ label: 'Anywhere (internet)', url: link(pb.base, s.signaling.host, s.signaling.port, s.signaling.path, s.signaling.secure, false) });
    else out.push({ label: 'Anywhere (internet)', error: pb.error });
  }
  return out;
}
