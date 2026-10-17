# XeroxStation

Print-shop station: a desktop app (Electron) plus a web/PWA version. Customers scan a QR code, send a PDF from their phone, and the shop prints it.

- **Desktop app (Electron)** — runs the shop, talks to the printer, and serves the shop-WiFi QR pages (LAN mode, works with no internet).
- **Web / PWA** — internet mode: customers and the remote console connect over the internet through the PeerJS signaling server. Hosted on Vercel from this repo.

## Live

- Web/PWA: https://print-media-eta.vercel.app
- Customer upload page (internet mode): https://print-media-eta.vercel.app/customer.html
- Remote console (link + QR + access code are generated in the desktop app: **Settings → Remote console**)

## Develop

```sh
npm install
npm run dev            # web dev server (http://localhost:5173)
npm run electron:dev   # desktop app for development
npm run build          # web/PWA production build -> dist/
npm run electron:build # Windows installer -> release/
```

## Notes

- Internet mode uses the public PeerJS signaling server (0.peerjs.com); a custom signaling server can be set in Settings.
- LAN mode serves the customer/console pages from the shop PC on port 8787 — nothing leaves the shop WiFi.
- After printing, document copies are deleted from the shop PC automatically.
