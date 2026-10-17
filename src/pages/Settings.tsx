import { useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import { loadPrinters, startNet } from '../lib/controller';
import { randCode, randToken } from '../lib/db';
import { operatorSources } from '../lib/session';
import { QRCodeSVG } from 'qrcode.react';
import { caps, isAndroid, isElectron, isIOS, isMobile, targetLabel } from '../lib/platform';
import { printTestPage } from '../lib/print';
import { bridgeBluetoothSetup, bridgePing, bridgePrinterSetup } from '../lib/bridge';
import { usePwaInstall } from '../lib/pwa';
import type { Settings as S } from '../lib/types';

function Num({ label, v, on, min = 1 }: { label: string; v: number; on: (n: number) => void; min?: number }) {
  return <div><label className="label">{label}</label><input className="field" type="number" min={min} value={v} onChange={(e) => on(Math.max(min, +e.target.value || min))} /></div>;
}
function Txt({ label, v, on, ph, type = 'text' }: { label: string; v: string; on: (s: string) => void; ph?: string; type?: string }) {
  return <div><label className="label">{label}</label><input className="field" type={type} value={v} placeholder={ph} onChange={(e) => on(e.target.value)} /></div>;
}

export default function Settings() {
  const { settings, printers, patchSettings, lanIps, port } = useStore();
  const [d, setD] = useState<S>(settings);
  const [saved, setSaved] = useState(false);
  const [opTab, setOpTab] = useState(0);
  const [psOpen, setPsOpen] = useState(false);
  const [btOpen, setBtOpen] = useState(false);
  const [tp, setTp] = useState<{ busy: boolean; msg: string; ok: boolean }>({ busy: false, msg: '', ok: false });
  const inst = usePwaInstall();
  const [pSaved, setPSaved] = useState(false);
  const up = (p: Partial<S>) => { setD({ ...d, ...p }); setSaved(false); };

  // Web/PWA on the shop PC: when the desktop app runs on this same machine, the printer
  // section is exactly the desktop app's - same list, same silent printing.
  const [bridgeOk, setBridgeOk] = useState(false);
  useEffect(() => {
    if (caps.printerList) { setBridgeOk(true); return; }
    let live = true;
    const check = async (force = false) => {
      const ok = await bridgePing(force);
      if (!live) return;
      setBridgeOk(ok);
      if (ok) void loadPrinters();
    };
    void check(true);
    const f = () => { void check(); };
    window.addEventListener('focus', f);
    return () => { live = false; window.removeEventListener('focus', f); };
  }, []);
  const canList = caps.printerList || bridgeOk;

  const save = async () => { await patchSettings(d); void startNet(); setSaved(true); };

  /** Save just the printer choice right from its section - no need to scroll to Save settings. */
  const savePrinter = async () => {
    await patchSettings({ printer: d.printer });
    setPSaved(true);
    window.setTimeout(() => setPSaved(false), 3000);
  };

  /** Windows "add printer" screen - desktop app on this PC, or through the local bridge from the web app. */
  const addPrinter = async () => {
    setPsOpen(true);
    const r = window.xs ? await window.xs.printerSetup() : await bridgePrinterSetup();
    if (!r.ok) { setPsOpen(false); setTp({ busy: false, ok: false, msg: r.error || 'Could not open Windows printer settings.' }); }
  };
  /** Windows "Bluetooth & devices" screen - pair a Bluetooth printer once; it then shows in the list above. */
  const addBluetoothPrinter = async () => {
    setBtOpen(true);
    const r = window.xs ? await window.xs.bluetoothSetup() : await bridgeBluetoothSetup();
    if (!r.ok) { setBtOpen(false); setTp({ busy: false, ok: false, msg: r.error || 'Could not open Windows Bluetooth settings.' }); }
  };
  const doTest = async () => {
    setTp({ busy: true, msg: '', ok: false });
    try {
      const r = await printTestPage(d);
      setTp(r.ok
        ? { busy: false, ok: true, msg: r.confirm ? (isMobile ? 'Share sheet opened - pick Print.' : 'Print window opened - pick your printer.') : 'Test page sent to the printer.' }
        : { busy: false, ok: false, msg: r.error || 'Could not print the test page.' });
    } catch (e: any) {
      setTp({ busy: false, ok: false, msg: String((e && e.message) || e) });
    }
  };
  const showPublic = !isElectron || d.connection === 'public';

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-3xl">
      <h1 className="text-3xl font-extrabold">Settings</h1>
      <p className="text-ink-300">Running as: <b className="text-ink-100">{targetLabel}</b></p>

      <section className="panel space-y-4">
        <h2 className="text-xl font-bold">Shop</h2>
        <Txt label="Shop name (shown to customers)" v={d.shopName} on={(s) => up({ shopName: s })} />
        <Txt label="Shop ID (fixed - customers connect to this)" v={d.peerId} on={(s) => up({ peerId: s.replace(/[^a-zA-Z0-9_-]/g, '') })} />
        <button className="btn-line" onClick={() => up({ staticToken: randToken() })}>New wall-QR key (old wall QR stops working)</button>
      </section>

      <section className="panel space-y-4">
        <h2 className="text-xl font-bold">Auto-print limits</h2>
        <p className="text-ink-300">Used by Smart auto. Auto mode only uses the daily page cap. Limits are checked on this device.</p>
        <div className="grid grid-cols-2 gap-4">
          <Num label="Max pages per job" v={d.maxPages} on={(n) => up({ maxPages: n })} />
          <Num label="Max file size (MB, 0 = unlimited)" v={d.maxMB} on={(n) => up({ maxMB: n })} min={0} />
          <Num label="Max jobs per hour" v={d.maxPerHour} on={(n) => up({ maxPerHour: n })} />
          <Num label="Wait between files (sec)" v={d.cooldownSec} on={(n) => up({ cooldownSec: n })} min={0} />
          <Num label="Daily page cap" v={d.dailyPageCap} on={(n) => up({ dailyPageCap: n })} />
          <Num label="Refuse files over (pages)" v={d.rejectPages} on={(n) => up({ rejectPages: n })} />
          <Num label="QR code lifetime (min)" v={d.sessionTtlMin} on={(n) => up({ sessionTtlMin: n })} />
          <Num label="Max active QR codes" v={d.maxSessions} on={(n) => up({ maxSessions: n })} />
        </div>
      </section>

      <section className="panel space-y-4">
        <h2 className="text-xl font-bold">Printer</h2>
        {canList ? (
          <div className="space-y-2">
            <label className="label">Printer used for every job</label>
            <div className="flex flex-wrap gap-2">
              <select className="field" value={d.printer} onChange={(e) => up({ printer: e.target.value })}>
                <option value="">Windows default printer</option>
                {printers.map((p) => <option key={p.name} value={p.name}>{p.name}{p.isDefault ? ' (default)' : ''}</option>)}
              </select>
              <button className="btn-line" onClick={() => void loadPrinters()}>Refresh</button>
              <button className="btn-line" onClick={() => void addPrinter()}>Add printer</button>
              <button className="btn-line" onClick={() => void addBluetoothPrinter()}>Bluetooth printer</button>
              <button className="btn-pc" onClick={() => void savePrinter()}>Save</button>
              {pSaved && <span className="self-center font-bold text-py">Saved ✓</span>}
            </div>
            {printers.length === 0 && <p className="text-pm">No printers found on this PC. Use <b>Add printer</b> or <b>Bluetooth printer</b> to add one in Windows, then come back - the list updates automatically.</p>}
            {psOpen && <p className="text-sm text-ink-300">Windows printer settings opened. After adding a printer, it appears in the list above automatically (or press Refresh).</p>}
            {btOpen && <p className="text-sm text-ink-300">Windows Bluetooth settings opened. Pair the printer there - Windows adds it as a printer, and it appears in the list above automatically (or press Refresh).</p>}
            <p className="text-sm text-ink-300"><b>Bluetooth printer?</b> Pair it once with the <b>Bluetooth printer</b> button - it then prints like any printer in the list.</p>
          </div>
        ) : isIOS ? (
          <div className="space-y-2">
            <p>Tap <b>Print</b> on a job, then choose <b>Print</b> in the share sheet (AirPrint). iPhones always ask before printing.</p>
            <p className="text-ink-300"><b>Bluetooth printer?</b> Install your printer's app once (HP Smart, Canon PRINT, Epson iPrint…), then tap <b>Print</b> on a job and pick that app in the share sheet - it prints over Bluetooth.</p>
          </div>
        ) : isAndroid ? (
          <div className="space-y-2">
            <p>Tap <b>Print</b> on a job, then choose <b>Print</b> or your printer app in the share sheet. You can also tap <b>Download</b> and print from Files. Android always asks before printing.</p>
            <p className="text-ink-300"><b>Bluetooth printer?</b> Install your printer's app once (HP Smart, Canon PRINT, Epson iPrint…), then tap <b>Print</b> on a job and pick that app in the share sheet - it prints over Bluetooth.</p>
          </div>
        ) : (
          <div className="space-y-2">
            <p>The XeroxStation <b>desktop app</b> is not running on this PC, so this page opens the Windows print window for every job - pick any installed printer there.</p>
            <p className="text-ink-300">For a printer list inside this app and printing with no dialogs (exactly like the desktop app), keep the desktop app open on this PC - <a className="underline" href="downloads/XeroxStation-Setup.exe" download>get it here</a>.</p>
            <p className="text-ink-300">To add a printer to Windows: <b>Settings &gt; Printers &amp; scanners &gt; Add device</b>. For Bluetooth printers: <b>Settings &gt; Bluetooth &amp; devices &gt; Add device</b>.</p>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-line" disabled={tp.busy} onClick={() => void doTest()}>{tp.busy ? 'Sending…' : 'Test print page'}</button>
          {tp.msg && <span className={tp.ok ? 'font-bold text-py' : 'text-pm'}>{tp.msg}</span>}
        </div>
        <p className="text-sm text-ink-300">
          {canList ? 'Jobs print one by one with no dialog, to the printer chosen here.' : isMobile ? 'The test page opens the same share sheet a job uses.' : 'The test page opens the same print window a job uses.'}
        </p>
      </section>

      <section className="panel space-y-4">
        <h2 className="text-xl font-bold">Connection</h2>
        {isElectron ? (
          <div className="flex flex-wrap gap-1 rounded-xl border border-ink-700 p-1 w-fit">
            {(['lan', 'public'] as const).map((c) => (
              <button key={c} onClick={() => up({ connection: c })} className={`rounded-lg px-4 py-2 font-bold ${d.connection === c ? 'bg-ink-100 text-ink-950' : 'text-ink-300'}`}>{c === 'lan' ? 'Shop WiFi only' : 'Shop WiFi + Internet'}</button>
            ))}
          </div>
        ) : (
          <p className="text-ink-300">The hosted web app always uses the internet.</p>
        )}
        <p className="text-ink-300">
          {!isElectron || d.connection === 'lan'
            ? 'Shop WiFi QR codes only - works without internet. Customers must be on the shop WiFi.'
            : 'Internet QR codes only - they open the live page and work from anywhere. Choose "Shop WiFi only" if you want local QR codes that work without internet.'}
        </p>
        {isElectron && d.connection === 'lan' && <Txt label="This PC's address (leave empty to detect)" v={d.lanIp} on={(s) => up({ lanIp: s.trim() })} ph="192.168.1.10" />}
        {showPublic && (
          <>
            <Txt label="Public page URL (folder where customer.html is hosted)" v={d.publicUrl} on={(s) => up({ publicUrl: s.trim() })} ph="https://print-media-eta.vercel.app" />
            <div className="grid grid-cols-2 gap-4">
              <Txt label="Signaling server" v={d.signaling.host} on={(s) => up({ signaling: { ...d.signaling, host: s.trim() } })} />
              <Num label="Port" v={d.signaling.port} on={(n) => up({ signaling: { ...d.signaling, port: n } })} />
            </div>
            <Txt label="STUN servers (comma separated)" v={d.stun} on={(s) => up({ stun: s })} />
            <div className="grid sm:grid-cols-3 gap-4">
              <Txt label="TURN servers (optional, comma separated)" v={d.turnUrl} on={(s) => up({ turnUrl: s })} ph="turn:host:3478" />
              <Txt label="TURN user" v={d.turnUser} on={(s) => up({ turnUser: s })} />
              <Txt label="TURN password" v={d.turnPass} on={(s) => up({ turnPass: s })} type="password" />
            </div>
          </>
        )}
      </section>

      {isElectron && (
        <section className="panel space-y-4">
          <h2 className="text-xl font-bold">Remote console (web/PWA)</h2>
          <p className="text-ink-300">Open your queue on a phone, tablet or another PC. It sees every job and can print, hold or reject - printing happens on this PC. Shop WiFi needs no internet; the internet link works from anywhere.</p>
          <div className="flex flex-wrap gap-2">
            <button className={d.opEnabled ? 'btn-line' : 'btn-pc'} onClick={() => up({ opEnabled: !d.opEnabled })}>{d.opEnabled ? 'Turn off' : 'Turn on'}</button>
            {d.opEnabled && <button className="btn-line" onClick={() => up({ opCode: randCode() })}>New access code</button>}
          </div>
          {d.opEnabled && (() => {
            const os = operatorSources(d, lanIps, port);
            const i = Math.min(opTab, os.length - 1);
            const o = os[i];
            return (
              <div className="space-y-3">
                {os.length > 1 && (
                  <div className="flex gap-1 rounded-xl border border-ink-700 p-1 w-fit" role="tablist">
                    {os.map((x, n) => (
                      <button key={x.label} onClick={() => setOpTab(n)} className={`rounded-lg px-3 py-1.5 text-sm font-bold ${n === i ? 'bg-ink-100 text-ink-950' : 'text-ink-300'}`}>{x.label}</button>
                    ))}
                  </div>
                )}
                {o.error ? <p className="text-pm">{o.error}</p> : (
                  <div className="flex flex-wrap items-start gap-5">
                    <div className="rounded-xl bg-white p-3"><QRCodeSVG value={o.url ?? ''} size={150} /></div>
                    <div className="space-y-2 min-w-[200px] flex-1">
                      <p>Access code: <b className="text-2xl tracking-widest text-py">{d.opCode || '-'}</b></p>
                      <button className="btn-line" onClick={() => void navigator.clipboard.writeText(o.url ?? '')}>Copy console link</button>
                      <p className="text-sm text-ink-300 break-all">{o.url}</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
          <p className="text-sm text-ink-300">Scan the QR with the phone that should run the console. Click Save settings to apply.</p>
        </section>
      )}

      <section className="panel space-y-4">
        <h2 className="text-xl font-bold">Security and alerts</h2>
        <Txt label="App PIN (leave empty for none)" v={d.appPin} on={(s) => up({ appPin: s.replace(/\D/g, '').slice(0, 8) })} type="password" />
        {'Notification' in window && <button className="btn-line" onClick={() => Notification.requestPermission()}>Allow notifications for new jobs</button>}
      </section>

      {!isElectron && (
        <section className="panel space-y-3">
          <h2 className="text-xl font-bold">Get the apps</h2>
          {inst.installed ? (
            <p className="font-bold text-py">Installed - open it from your home screen.</p>
          ) : inst.canPrompt ? (
            <button className="btn-pc w-full" onClick={() => void inst.prompt()}>Install this app</button>
          ) : (
            <p className="text-ink-300">{isIOS ? 'On iPhone: tap the Share button, then "Add to Home Screen".' : 'In the browser menu (or the address-bar icon) choose "Install app" or "Add to Home screen".'}</p>
          )}
          <a className="btn-line inline-block text-center" href="downloads/XeroxStation-Setup.exe" download>Download the Windows app (.exe, 64-bit)</a>
          <p className="text-sm text-ink-300">Keep this app open while receiving files. {isIOS ? 'iPhones pause apps in the background after about 30 seconds.' : 'The screen is kept awake while the app is open.'}</p>
        </section>
      )}

      <div className="sticky bottom-20 md:bottom-4 flex items-center gap-3">
        <button className="btn-pc" onClick={save}>Save settings</button>
        {saved && <span className="text-py font-bold">Saved</span>}
      </div>
    </div>
  );
}
