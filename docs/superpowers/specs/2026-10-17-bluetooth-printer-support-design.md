# Bluetooth printer support — design

Date: 2026-10-17
Status: approved by user (approach + design), ready to implement

## Goal

Let the shop print through **Bluetooth printers of any brand and type**, whether the
shop runs on the Windows PC (desktop app / web + PWA with the desktop app open) or on a
phone (PWA). Same UI everywhere — no new configuration for customers.

## Reality check (why this design)

- Browsers cannot talk to document printers over Bluetooth: they have no access to
  Bluetooth Classic (SPP/BPP), which is what document printers use. Web Bluetooth (BLE)
  exists only on Android Chrome and only serves niche BLE devices (some receipt printers).
  Rejected — it cannot satisfy "works on all kinds of printers".
- The universal route is the operating system:
  - **Windows**: a paired Bluetooth printer becomes a normal printer queue → appears in
    XeroxStation's printer list → prints with the existing silent pipeline.
  - **Phones**: the share sheet hands the PDF to the printer's own app / print service
    (HP Smart, Canon PRINT, Epson iPrint, Brother, Android print services, iOS AirPrint),
    which handle Bluetooth. Already the app's phone print path.

So XeroxStation reaches every Bluetooth printer *through the OS doors* — nothing to
reimplement, no protocol limits.

## Scope

### 1. Shop PC — desktop app and web/PWA (bridge)

- New **"Bluetooth printer"** button in Settings → Printer, next to "Add printer".
  - Desktop app: new IPC `xs:bluetoothSetup` → main process opens
    `ms-settings:bluetooth` (Windows); macOS/Linux equivalent or a friendly error,
    mirroring `openPrinterSetup`.
  - Web/PWA on the shop PC: new route `POST /api/bridge/bluetooth-setup` (localOnly)
    → same `shell.openExternal`, exposed via `bridge.bluetoothSetup`.
- Small note after tapping (same pattern as the Add-printer note):
  *"Windows Bluetooth settings opened. Pair the printer there, then press Refresh — it
  appears in the list above."*
- Hint under the list + updated "no printers found" message: pair the Bluetooth printer
  once in Windows; it then works like any other printer (silent, one by one).

### 2. Phone (PWA) — Printer section

- Plain-word Bluetooth guidance replaces/extends the current mobile text:
  *"Using a Bluetooth printer? Install your printer's app once (HP Smart, Canon PRINT,
  Epson iPrint…). Tap Print on a job and choose that app (or Print) in the share sheet —
  it prints over Bluetooth."*
- The share-sheet path stays the always-available route; the "open PDF in a new tab"
  fallback stays. "Test print page" already exercises the same phone flow.

### 3. Unchanged

Silent printing pipeline, one-by-one job printing, printer selection + Save button,
connection/relay behavior, customer QR flow, remote console.

## Files to touch

| File | Change |
|---|---|
| `electron/main.js` | `openBluetoothSetup()` + `ipcMain.handle('xs:bluetoothSetup')` + pass into `startServer` bridge object |
| `electron/preload.js` | `bluetoothSetup: () => ipcRenderer.invoke('xs:bluetoothSetup')` |
| `electron/server.js` | `POST /api/bridge/bluetooth-setup` (localOnly) calling `bridge.openBluetoothSetup` |
| `src/lib/bridge.ts` | `bridgeBluetoothSetup()` |
| `src/pages/Settings.tsx` | Bluetooth button (desktop/bridge), note text, list hint, "no printers" message, phone guidance |
| `src/lib/global.d.ts` (or existing typing for `window.xs`) | add `bluetoothSetup` to the `xs` type |

## Behavior details

- Button shows whenever the printer-list UI shows (`canList`) — desktop app or bridge;
  identical in both (parity rule).
- Button does not change the selected printer or settings; purely opens the OS screen.
- After the OS window closes, the existing focus re-scan (`loadPrinters` on window focus)
  picks up a newly paired printer automatically; Refresh remains.
- Phone guidance is text only — no new buttons; the phone already has no silent path.

## Testing

1. Desktop app: click "Bluetooth printer" → Windows Bluetooth page opens (verify via
   main-process call/log + no-op screenshot of the settings window state).
2. Bridge: `POST http://127.0.0.1:8787/api/bridge/bluetooth-setup` → `{ok:true}`; button
   visible and working from the web build on the same PC.
3. Screenshot updated Printer section (desktop + web) — Bluetooth button, hint, Save.
4. Build passes; print pipeline untouched (existing probes still pass — e2e fast re-check).
5. Rebuild the installer, refresh `public/downloads/XeroxStation-Setup.exe`, commit, push,
   verify the live download link serves the new size.

## Out of scope (explicitly)

- Direct in-app Bluetooth protocols (BLE/Classic) — rejected as non-universal.
- iOS Safari Bluetooth web APIs — impossible; share sheet covers it.
