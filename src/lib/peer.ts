import Peer, { DataConnection } from 'peerjs';
import type { PeerStatus, Settings } from './types';
import type { Net } from './session';
import { cloudflareTurn } from './turn';

export interface IncomingFile { token: string; kind: 'once' | 'static'; pin: string; remote: string; name: string; bytes: ArrayBuffer }
export interface ShopHandlers {
  status(s: PeerStatus, msg?: string): void;
  checkToken(token: string, remote: string): { ok: true; kind: 'once' | 'static'; pin: string } | { ok: false; reason: string };
  onFile(f: IncomingFile): Promise<{ ok: true; id: string } | { ok: false; reason: string }>;
  limits(): { maxBytes: number; maxMB: number; shop: string };
  opCheck(code: string): boolean;
  opState(): unknown;
  opCommand(c: { act: string; id: string }): void;
}

const links = new Map<string, DataConnection>();
const safeSend = (c: DataConnection, m: unknown) => { try { c.send(m); } catch { /* connection gone */ } };

/** Push a status update to the customer's open page (if still connected). */
export function notifyCustomer(jobId: string, status: string, reason?: string) {
  const c = links.get(jobId);
  if (c) safeSend(c, { type: 'status', status, reason });
}

const RETRY = new Set(['network', 'server-error', 'socket-error', 'socket-closed', 'unavailable-id']);

export function startShop(s: Settings, h: ShopHandlers, net: Net): { destroy(): void; ops(m: unknown): void } {
  const ops = new Set<DataConnection>();
  const sendOps = (m: unknown) => { for (const c of ops) safeSend(c, m); };
  let peer: Peer | null = null; let dead = false; let timer: number | undefined;
  let watch: number | undefined; let isOpen = false; let fails = 0; let bootAt = 0; let booting = false;
  let fastTries = 0;
  let relay: RTCIceServer[] | null = null; // fresh relay credentials, fetched once per start

  const clearWatch = () => { if (watch !== undefined) { clearTimeout(watch); watch = undefined; } };

  // Human-readable reason for the connection problem (shown under the status pill).
  const why = (type: string) =>
    type === 'unavailable-id' ? 'The Shop ID is taken by another copy of the app on this device - it reconnects by itself when that copy closes.'
      : type === 'network' ? (net.lan ? 'Lost the shop server - reconnecting…' : "Can't reach the internet - retrying by itself. Shop WiFi QR codes keep working.")
      : type === 'server-error' ? 'The signaling server is not answering - reconnecting…'
      : type === 'socket-error' || type === 'socket-closed' ? 'Connection dropped - reconnecting…'
      : 'Connection problem (' + (type || 'error') + ')';

  // Fast retries cover normal hand-offs: another copy of the app on this device holds the
  // Shop ID for a moment while it closes, or a fresh socket is dropped before it registers.
  // After a few quick tries the normal backoff takes over.
  const FAST_TRIES = 4;
  const retry = (fast = false) => {
    if (dead) return;
    clearTimeout(timer); clearWatch(); isOpen = false;
    const p = peer; peer = null;
    try { p?.destroy(); } catch { /* ignore */ }
    let wait: number;
    if (fast && fastTries < FAST_TRIES) {
      fastTries++;
      wait = 1000 + fastTries * 500; // 1.5s, 2s, 2.5s, 3s
    } else {
      // Back off so a long outage does not hammer the server (3s, 6s, 12s, 24s, then 30s).
      wait = Math.min(30000, 3000 * Math.pow(2, fails));
      fails = Math.min(fails + 1, 5);
    }
    timer = window.setTimeout(() => { void boot(); }, wait);
  };

  const boot = async () => {
    if (dead || peer || booting) return;
    booting = true;
    try {
      bootAt = Date.now();
      h.status('connecting');
      // Comma-separated STUN/TURN lists. Used on the shop WiFi too: some routers block local
      // peer discovery (mDNS), and real srflx/relay candidates make the connection work anyway.
      const urlList = (v: string) => v.split(',').map((u) => u.trim()).filter(Boolean);
      const ownTurn: RTCIceServer[] = s.turnUser.trim() ? urlList(s.turnUrl).map((urls) => ({ urls, username: s.turnUser, credential: s.turnPass })) : [];
      const iceServers: RTCIceServer[] = [
        ...urlList(s.stun).map((urls) => ({ urls })),
        ...ownTurn,
        ...(relay ?? [])
      ];
      const p = new Peer(s.peerId, { host: net.host, port: net.port, path: net.path, secure: net.secure, config: { iceServers } });
      peer = p;
      // Fresh Cloudflare relay credentials unless the shop configured their own TURN server.
      // Phones on strict mobile networks can only reach the shop through a relay. Fetched in
      // the background so a slow lookup never holds up the shop going online - peerjs reads
      // the config for every new connection, so the credentials apply as soon as they arrive.
      if (relay === null) {
        relay = [];
        if (!ownTurn.length) {
          void cloudflareTurn(s.publicUrl || location.origin).then((creds) => {
            relay = creds;
            if (creds.length && !dead && p === peer) p.options.config.iceServers = iceServers.concat(creds);
          });
        }
      }
      let opened = false;
      p.on('open', () => {
        if (p !== peer) return; // a retry already replaced this one
        opened = true; isOpen = true; fails = 0; fastTries = 0;
        clearWatch(); h.status('online');
      });
      p.on('connection', onConn);
      p.on('disconnected', () => {
        if (p !== peer) return; // stale socket from a previous attempt
        isOpen = false;
        if (!opened) {
          // Dropped before the ID ever registered (e.g. another copy still holds it).
          // Never reconnect() a socket that never opened - rebuild it quickly instead.
          h.status('connecting');
          retry(true);
          return;
        }
        h.status('offline');
        try { p.reconnect(); } catch { retry(true); return; }
        // If the socket does not come back quickly, rebuild the peer from scratch.
        clearWatch();
        watch = window.setTimeout(() => { if (!dead && p === peer && !isOpen) retry(true); }, 4000);
      });
      p.on('close', () => {
        // The peer was closed behind our back - rebuild unless this was a planned stop.
        if (p !== peer || dead) return;
        retry(true);
      });
      p.on('error', (e: any) => {
        if (p !== peer) return; // stale socket's error - a retry is already scheduled
        const type = String(e?.type ?? 'error');
        h.status('error', why(type));
        if (RETRY.has(type)) retry(true);
      });
    } finally {
      booting = false;
    }
  };

  // Devices freeze background pages and sleep. On the way back a peer that never
  // registered - or whose socket died while frozen - is rebuilt right away instead of
  // waiting for the slow retry to expire.
  const wake = () => {
    if (dead || isOpen || booting) return;
    if (peer && Date.now() - bootAt < 8000) return; // a fresh attempt is already running
    fails = 0; fastTries = 0;
    clearTimeout(timer); clearWatch();
    const p = peer; peer = null;
    try { p?.destroy(); } catch { /* ignore */ }
    timer = window.setTimeout(() => { void boot(); }, 300);
  };
  const onVis = () => { if (document.visibilityState === 'visible') wake(); };
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('online', wake);

  const onConn = (conn: DataConnection) => {
    let authed = false; let isOp = false; let token = ''; let kind: 'once' | 'static' = 'once'; let pin = '';
    let meta: { name: string; size: number } | null = null; let chunks: ArrayBuffer[] = []; let got = 0;
    const authTimer = window.setTimeout(() => { if (!authed) conn.close(); }, 10000);
    const reset = () => { meta = null; chunks = []; got = 0; };

    conn.on('data', async (d: unknown) => {
      if (d instanceof ArrayBuffer || ArrayBuffer.isView(d)) {
        if (!authed || !meta || isOp) return;
        const ab = d instanceof ArrayBuffer ? d : ((d as ArrayBufferView).buffer.slice((d as ArrayBufferView).byteOffset, (d as ArrayBufferView).byteOffset + (d as ArrayBufferView).byteLength) as ArrayBuffer);
        got += ab.byteLength;
        if (got > meta.size || (h.limits().maxBytes > 0 && got > h.limits().maxBytes)) { safeSend(conn, { type: 'rejected', reason: 'File is larger than allowed.' }); reset(); return; }
        chunks.push(ab);
        return;
      }
      const m = d as { type?: string; token?: string; name?: string; size?: number; code?: string; act?: string; id?: string } | null;
      if (!m || typeof m !== 'object') return;

      // Remote console (web/PWA): logs in with the shop access code, then talks in commands.
      if (m.type === 'op-auth') {
        if (authed) return;
        if (!h.opCheck(String(m.code ?? ''))) { safeSend(conn, { type: 'op-fail', reason: 'Wrong access code.' }); setTimeout(() => conn.close(), 500); return; }
        authed = true; isOp = true; clearTimeout(authTimer); ops.add(conn);
        safeSend(conn, { type: 'op-ok', shop: h.limits().shop, jobs: h.opState() });
        return;
      }
      if (isOp) {
        if (m.type === 'op-cmd' && typeof m.act === 'string' && typeof m.id === 'string') h.opCommand({ act: m.act, id: m.id });
        return;
      }

      if (m.type === 'auth') {
        const r = h.checkToken(String(m.token ?? ''), conn.peer);
        if (!r.ok) { safeSend(conn, { type: 'auth-fail', reason: r.reason }); setTimeout(() => conn.close(), 500); return; }
        authed = true; token = String(m.token); kind = r.kind; pin = r.pin; clearTimeout(authTimer);
        const lim = h.limits();
        safeSend(conn, { type: 'auth-ok', pin, shop: lim.shop, maxMB: lim.maxMB });
      } else if (m.type === 'meta' && authed) {
        const maxB = h.limits().maxBytes;
        if (typeof m.size !== 'number' || m.size <= 0 || (maxB > 0 && m.size > maxB)) { safeSend(conn, { type: 'rejected', reason: 'File is larger than allowed.' }); return; }
        meta = { name: String(m.name ?? 'document.pdf').slice(0, 120), size: m.size }; chunks = []; got = 0;
      } else if (m.type === 'done' && authed && meta) {
        if (got !== meta.size) { safeSend(conn, { type: 'rejected', reason: 'Upload was incomplete. Please try again.' }); reset(); return; }
        const bytes = await new Blob(chunks).arrayBuffer();
        const name = meta.name; reset();
        const res = await h.onFile({ token, kind, pin, remote: conn.peer, name, bytes });
        if (res.ok) { links.set(res.id, conn); safeSend(conn, { type: 'received', id: res.id }); }
        else safeSend(conn, { type: 'rejected', reason: res.reason });
      }
    });
    conn.on('close', () => {
      clearTimeout(authTimer);
      ops.delete(conn);
      for (const [id, c] of links) if (c === conn) links.delete(id);
    });
  };

  void boot();
  return {
    destroy() {
      dead = true; clearTimeout(timer); clearWatch();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('online', wake);
      const p = peer; peer = null;
      try { p?.destroy(); } catch { /* ignore */ }
    },
    ops: sendOps
  };
}
