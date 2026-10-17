/**
 * Fresh Cloudflare TURN credentials, used by the shop peer and both hosted pages.
 * Cloudflare's public helper (the one behind their speed test) only answers requests that
 * carry a speed.cloudflare.com origin, so every XeroxStation deployment proxies it at
 * /api/turn - see api/turn.js (Vercel) and the LAN server in electron/server.js.
 * Without a relay, phones on strict mobile networks (carrier CGNAT) can never connect to
 * the shop. If anything here fails we simply continue with STUN + direct connections.
 */
let cached: { promise: Promise<RTCIceServer[]>; at: number } | null = null;

export function cloudflareTurn(base: string): Promise<RTCIceServer[]> {
  const now = Date.now();
  if (cached && now - cached.at < 600000) return cached.promise;
  const promise = (async () => {
    try {
      const b = (base || location.origin).replace(/\/+$/, '');
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 3500);
      try {
        const r = await fetch(b + '/api/turn', { cache: 'no-store', signal: ctrl.signal });
        if (!r.ok) return [];
        const j = await r.json();
        if (!j || typeof j.username !== 'string' || !j.urls) return [];
        return [{ urls: j.urls as string | string[], username: j.username, credential: String(j.credential ?? '') }];
      } finally { clearTimeout(t); }
    } catch { return []; }
  })();
  cached = { promise, at: now };
  return promise;
}
