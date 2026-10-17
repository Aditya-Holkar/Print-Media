import type { Settings } from './types';
import { isElectron } from './platform';

export interface Net { host: string; port: number; path: string; secure: boolean; lan: boolean }

/** Signaling settings used by the OWNER peer. */
export function ownerNet(s: Settings, localPort: number): Net {
  if (isElectron && s.connection === 'lan') return { host: 'localhost', port: localPort, path: '/peerjs', secure: false, lan: true };
  return { ...s.signaling, lan: false };
}

/** Full URL encoded in the QR code. Returns null (+ reason) if it cannot be built yet. */
export function customerUrl(
  s: Settings, token: string, lanIps: string[], localPort: number, expiresAt?: number
): { url: string } | { error: string } {
  const lan = isElectron && s.connection === 'lan';
  let base: string; let net: Net;
  if (lan) {
    const ip = s.lanIp || lanIps[0];
    if (!ip) return { error: 'No network address found. Connect this PC to the shop WiFi / router.' };
    base = `http://${ip}:${localPort}`;
    net = { host: ip, port: localPort, path: '/peerjs', secure: false, lan: true };
  } else {
    base = (s.publicUrl || new URL('.', location.href).href).replace(/\/+$/, '');
    if (isElectron && !s.publicUrl) return { error: 'Set "Public page URL" in Settings (where customer.html is hosted).' };
    if (!/^https?:\/\//.test(base)) return { error: 'Public page URL must start with http:// or https://' };
    net = { ...s.signaling, lan: false };
  }
  const q = new URLSearchParams({
    p: s.peerId, t: token, h: net.host, o: String(net.port), a: net.path, x: net.secure ? '1' : '0',
    l: net.lan ? '1' : '0', n: s.shopName, m: String(s.maxMB)
  });
  if (expiresAt) q.set('e', String(expiresAt));
  return { url: `${base}/customer.html?${q.toString()}` };
}

/** Full URL of the remote console (web/PWA) that pairs to this shop with the access code. */
export function operatorUrl(
  s: Settings, lanIps: string[], localPort: number
): { url: string } | { error: string } {
  const lan = isElectron && s.connection === 'lan';
  let base: string; let host: string; let port: number; let path: string; let secure: boolean;
  if (lan) {
    const ip = s.lanIp || lanIps[0];
    if (!ip) return { error: 'No network address found. Connect this PC to the shop WiFi / router.' };
    base = `http://${ip}:${localPort}`;
    host = ip; port = localPort; path = '/peerjs'; secure = false;
  } else {
    base = (s.publicUrl || new URL('.', location.href).href).replace(/\/+$/, '');
    if (isElectron && !s.publicUrl) return { error: 'Set "Public page URL" in Settings (where operator.html is hosted).' };
    if (!/^https?:\/\//.test(base)) return { error: 'Public page URL must start with http:// or https://' };
    host = s.signaling.host; port = s.signaling.port; path = s.signaling.path; secure = s.signaling.secure;
  }
  const q = new URLSearchParams({
    p: s.peerId, h: host, o: String(port), a: path, x: secure ? '1' : '0',
    l: lan ? '1' : '0', n: s.shopName, c: s.opCode
  });
  return { url: `${base}/operator.html?${q.toString()}` };
}
