// Copies the peerjs browser bundle into /public so the customer page can load it
// from the same origin (works offline on the shop LAN, no CDN needed).
// Also normalizes peer/package.json: it ships a STRING "binary" field, which
// makes electron-builder's dependency scanner fail ("readObjectStart: expect { or n").
// Nothing reads that field at runtime, so remove it after install.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const src = 'node_modules/peerjs/dist/peerjs.min.js';
if (existsSync(src)) {
  mkdirSync('public', { recursive: true });
  copyFileSync(src, 'public/peerjs.min.js');
  console.log('copied peerjs.min.js -> public/');
} else {
  console.warn('peerjs not installed yet - skipping copy');
}

const peerPkg = 'node_modules/peer/package.json';
if (existsSync(peerPkg)) {
  try {
    const pkg = JSON.parse(readFileSync(peerPkg, 'utf8'));
    if (typeof pkg.binary === 'string') {
      delete pkg.binary;
      writeFileSync(peerPkg, JSON.stringify(pkg, null, '\t') + '\n');
      console.log('patched peer/package.json for electron-builder (removed string "binary" field)');
    }
  } catch (e) {
    console.warn('could not patch peer/package.json:', e.message);
  }
}
