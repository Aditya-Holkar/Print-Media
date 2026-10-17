// LAN server: serves the customer page + a PeerJS signaling server.
// Lets walk-in customers on the shop WiFi send files with NO internet.
const express = require('express');
const http = require('http');
const path = require('path');
const os = require('os');
const { ExpressPeerServer } = require('peer');

function lanIps() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal) out.push(i.address);
  }
  return out;
}

function startServer({ staticDir, port }) {
  return new Promise((resolve, reject) => {
    const app = express();
    app.disable('x-powered-by');
    app.use((_, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
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
