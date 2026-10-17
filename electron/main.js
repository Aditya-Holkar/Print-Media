const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { startServer, lanIps } = require('./server');

app.commandLine.appendSwitch('disable-features', 'WebRtcHideLocalIpsWithMdns');
const DEV = !!process.env.ELECTRON_DEV;
const DIST = path.join(__dirname, '..', 'dist');
const STATIC_DIR = DEV ? path.join(__dirname, '..', 'public') : DIST;
const ICON = path.join(__dirname, '..', 'build', 'icon.png');

let win, tray, serverInfo, quitting = false;

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => showWindow());

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 420, minHeight: 600,
    backgroundColor: '#0b1220', icon: ICON, autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  if (DEV) win.loadURL('http://localhost:5173');
  else win.loadFile(path.join(DIST, 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  // keep running in the tray when the window is closed
  win.on('close', (e) => { if (!quitting) { e.preventDefault(); win.hide(); } });
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 }));
  tray.setToolTip('XeroxStation');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show XeroxStation', click: showWindow },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } }
  ]));
  tray.on('click', showWindow);
}

ipcMain.handle('xs:info', () => ({ lanIps: lanIps(), port: serverInfo.port }));

ipcMain.handle('xs:printers', async () => {
  try {
    const { getPrinters, getDefaultPrinter } = require('pdf-to-printer');
    const [list, def] = await Promise.all([getPrinters(), getDefaultPrinter().catch(() => null)]);
    return list.map((p) => ({ name: p.name, isDefault: !!def && def.name === p.name }));
  } catch { return []; }
});

ipcMain.handle('xs:print', async (_e, { bytes, printer, copies, color }) => {
  const file = path.join(os.tmpdir(), `xs-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`);
  try {
    fs.writeFileSync(file, Buffer.from(bytes));
    const { print } = require('pdf-to-printer');
    const opts = { copies: Math.max(1, copies | 0), monochrome: !color, silent: true };
    if (printer) opts.printer = printer;
    await print(file, opts);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  } finally {
    setTimeout(() => fs.rm(file, { force: true }, () => {}), 30000);
  }
});

ipcMain.on('xs:badge', (_e, n) => {
  if (tray) tray.setToolTip(n > 0 ? `XeroxStation - ${n} waiting` : 'XeroxStation');
  if (win) win.setOverlayIcon(null, ''); // Windows overlay needs an icon asset; tooltip + title carry the count
});

app.whenReady().then(async () => {
  try {
    serverInfo = await startServer({ staticDir: STATIC_DIR, port: 8787 });
  } catch (e) {
    serverInfo = { port: 0 };
    console.error('LAN server failed:', e);
  }
  createWindow();
  createTray();
});

app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => { /* stay alive in tray */ });
