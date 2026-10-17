import { useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import { loadPrinters, startNet } from '../lib/controller';
import { randCode, randToken } from '../lib/db';
import { operatorSources } from '../lib/session';
import { QRCodeSVG } from 'qrcode.react';
import { caps, isAndroid, isElectron, isIOS, isInstalled, targetLabel } from '../lib/platform';
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
  const [installEvt, setInstallEvt] = useState<any>(null);
  const [opTab, setOpTab] = useState(0);
  const up = (p: Partial<S>) => { setD({ ...d, ...p }); setSaved(false); };

  useEffect(() => {
    const h = (e: Event) => { e.preventDefault(); setInstallEvt(e); };
    window.addEventListener('beforeinstallprompt', h);
    return () => window.removeEventListener('beforeinstallprompt', h);
  }, []);

  const save = async () => { await patchSettings(d); startNet(); setSaved(true); };
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
        {caps.printerList ? (
          <div>
            <label className="label">Printer</label>
            <div className="flex gap-2">
              <select className="field" value={d.printer} onChange={(e) => up({ printer: e.target.value })}>
                <option value="">Windows default printer</option>
                {printers.map((p) => <option key={p.name} value={p.name}>{p.name}{p.isDefault ? ' (default)' : ''}</option>)}
              </select>
              <button className="btn-line" onClick={() => loadPrinters()}>Refresh</button>
            </div>
          </div>
        ) : isIOS ? (
          <p>Tap <b>Print</b> on a job, then choose <b>Print</b> in the share sheet (AirPrint). iPhones always ask before printing.</p>
        ) : isAndroid ? (
          <p>Tap <b>Print</b> on a job, then choose <b>Print</b> or your printer app in the share sheet. You can also tap <b>Download</b> and print from Files. Android always asks before printing.</p>
        ) : (
          <p>The browser print window opens for each job. Print quality depends on your printer driver - use <b>Download</b> if margins look wrong. The desktop app prints without any dialog.</p>
        )}
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
            : 'Both QR codes are offered: Shop WiFi (works even without internet) and Anywhere (internet). A remote customer scans the internet QR and does not need your WiFi at all.'}
        </p>
        {isElectron && <Txt label="This PC's address (leave empty to detect)" v={d.lanIp} on={(s) => up({ lanIp: s.trim() })} ph="192.168.1.10" />}
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
          <p className="text-sm text-ink-300">Scan the QR with the phone that should run the console - the internet tab also works without shop WiFi. Click Save settings to apply.</p>
        </section>
      )}

      <section className="panel space-y-4">
        <h2 className="text-xl font-bold">Security and alerts</h2>
        <Txt label="App PIN (leave empty for none)" v={d.appPin} on={(s) => up({ appPin: s.replace(/\D/g, '').slice(0, 8) })} type="password" />
        {'Notification' in window && <button className="btn-line" onClick={() => Notification.requestPermission()}>Allow notifications for new jobs</button>}
        {installEvt && !isInstalled && <button className="btn-pc" onClick={() => installEvt.prompt()}>Install this app</button>}
        {!isElectron && <a className="btn-line inline-block text-center" href="downloads/XeroxStation-Setup.exe" download>Download the Windows app (.exe, 64-bit)</a>}
        {!isElectron && <p className="text-sm text-ink-300">Keep this app open while receiving files. {isIOS ? 'iPhones pause apps in the background after about 30 seconds.' : 'The screen is kept awake while the app is open.'}</p>}
      </section>

      <div className="sticky bottom-20 md:bottom-4 flex items-center gap-3">
        <button className="btn-pc" onClick={save}>Save settings</button>
        {saved && <span className="text-py font-bold">Saved</span>}
      </div>
    </div>
  );
}
