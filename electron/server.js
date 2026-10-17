// LAN server: serves the customer page + a PeerJS signaling server + the local bridge.
// Lets walk-in customers on the shop WiFi send files with NO internet, and lets the
// hosted web/PWA app on this PC talk to the desktop app (printer list + silent printing).
const express = require('express');
const http = require('http');
const os = require('os');
const { ExpressPeerServer } = require('peer');

// Real network adapters first (192.168.x / 10.x), then 172.16-31.x, then virtual adapters
// (Hyper-V "vEthernet", VMware, VirtualBox, WSL...) - phones cannot reach virtual ones.
function lanIps() {
  const virt = /vEthernet|Hyper-V|Virtual|VMware|VirtualBox|WSL|Loopback|Tailscale|ZeroTier|Radmin|Hamachi|Bluetooth/i;
  const rows = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const i of list || []) {
      if (i.family !== 'IPv4' || i.internal || rows.some((r) => r.addr === i.address)) continue;
      const bad = virt.test(name) || /^169\.254\./.test(i.address) ? 2 : /^172\.(1[6-9]|2\d|3[01])\./.test(i.address) ? 1 : 0;
      rows.push({ addr: i.address, bad });
    }
  }
  return rows.sort((a, b) => a.bad - b.bad).map((r) => r.addr);
}

// Fresh Cloudflare TURN credentials (short-lived, minted on demand). Their helper only
// answers requests carrying a speed.cloudflare.com origin, so pages cannot call it
// directly - every deployment proxies it at /api/turn (see also api/turn.js for Vercel).
let turnCache = { at: 0, data: null };
async function turnCreds() {
  if (turnCache.data && Date.now() - turnCache.at < 600000) return turnCache.data;
  const r = await fetch('https://speed.cloudflare.com/turn-creds', {
    headers: {
      origin: 'https://speed.cloudflare.com',
      referer: 'https://speed.cloudflare.com/',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
    }
  });
  if (!r.ok) throw new Error('upstream ' + r.status);
  const j = await r.json();
  if (!j || !j.username || !j.urls) throw new Error('bad credentials');
  turnCache = { at: Date.now(), data: j };
  return j;
}

const isLocal = (ip) => {
  const a = String(ip || '').replace('::ffff:', '');
  return a === '::1' || /^127\./.test(a) || /^10\./.test(a) || /^192\.168\./.test(a) || /^172\.(1[6-9]|2\d|3[01])\./.test(a);
};

function startServer({ staticDir, port, bridge }) {
  return new Promise((resolve, reject) => {
    const app = express();
    app.disable('x-powered-by');
    app.use((req, res, next) => {
      res.set('Cache-Control', 'no-store');
      // Pages are served from the LAN host, from Vercel (web/PWA) and from file:// (packaged
      // app) - all of them may call /api/turn and the local bridge cross-origin.
      res.set('Access-Control-Allow-Origin', req.headers.origin || '*');
      res.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type');
      res.set('Access-Control-Allow-Private-Network', 'true'); // Chrome private-network preflight
      res.set('Vary', 'Origin');
      if (req.method === 'OPTIONS') return res.status(204).end();
      next();
    });
    app.use(express.json({ limit: '80mb' })); // bridge print bodies (base64 PDFs)

    app.get('/api/turn', async (_req, res) => {
      try { res.json(await turnCreds()); } catch { res.status(502).json({ error: 'Relay credentials unavailable' }); }
    });

    if (bridge) {
      // The bridge is only for pages on this machine / this LAN, never the open internet.
      const localOnly = (req, res, next) => (isLocal(req.socket && req.socket.remoteAddress) ? next() : res.status(403).json({ ok: false, error: 'Local network only.' }));
      app.get('/api/bridge/ping', (_req, res) => res.json({ ok: true, app: 'XeroxStation' }));
      app.get('/api/bridge/printers', localOnly, async (_req, res) => {
        try { res.json({ printers: await bridge.listPrinters() }); } catch (e) { res.status(500).json({ error: String((e && e.message) || e) }); }
      });
      app.post('/api/bridge/printer-setup', localOnly, async (_req, res) => {
        try { res.json(await bridge.openPrinterSetup()); } catch (e) { res.status(500).json({ ok: false, error: String((e && e.message) || e) }); }
      });
      app.post('/api/bridge/print', localOnly, async (req, res) => {
        try {
          const b = req.body || {};
          const bytes = Buffer.from(String(b.pdf || ''), 'base64');
          if (!bytes.length) return res.status(400).json({ ok: false, error: 'No PDF data.' });
          res.json(await bridge.printPdfBytes({ bytes, printer: b.printer || undefined, copies: b.copies, color: !!b.color }));
        } catch (e) { res.status(500).json({ ok: false, error: String((e && e.message) || e) }); }
      });
    }

    app.use(express.static(staticDir, { index: false }));
    const server = http.createServer(app);
    app.use('/peerjs', ExpressPeerServer(server, { path: '/', allow_discovery: false, proxied: false }));
    const tryListen = (p, left) => {
      server.once('error', (e) => {
        if (e.code === 'EADDRINUSE' && left > 0) tryListen(p + 1, left - 1);
        else reject(e);
      });
      server.listen(p, '0.0.0.0', () => resolve({ server, port: p }));
    };
    tryListen(port, 20);
  });
}

module.exports = { startServer, lanIps };
