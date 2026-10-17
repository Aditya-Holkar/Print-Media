import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, X } from 'lucide-react';

export function useNow(ms = 1000) {
  const [n, setN] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setN(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return n;
}

/** One QR a customer can scan: a label (e.g. "Anywhere (internet)") and either a link or why it is not available. */
export interface QrSource { label: string; url?: string; error?: string }

interface Props { title: string; sources?: QrSource[]; url?: string; error?: string; pin?: string; expiresAt?: number; used?: boolean; onClose?: () => void }

export default function QrPanel({ title, sources, url, error, pin, expiresAt, used, onClose }: Props) {
  const now = useNow();
  const [tab, setTab] = useState(0);
  const list: QrSource[] = sources && sources.length ? sources : [{ label: '', url, error }];
  const idx = Math.min(tab, list.length - 1);
  const cur = list[idx];
  const left = expiresAt ? Math.max(0, Math.floor((expiresAt - now) / 1000)) : null;
  return (
    <div className="panel w-full max-w-[400px]">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-xl font-bold">{title}</h3>
        {onClose && <button className="p-2 -m-2 text-ink-300 hover:text-white" onClick={onClose} aria-label="Close"><X /></button>}
      </div>
      {list.length > 1 && (
        <div className="mt-3 flex gap-1 rounded-xl border border-ink-700 p-1" role="tablist">
          {list.map((s, i) => (
            <button key={s.label} role="tab" aria-selected={i === idx} onClick={() => setTab(i)}
              className={`min-w-0 flex-1 rounded-lg px-2 py-2 text-sm font-bold ${i === idx ? 'bg-ink-100 text-ink-950' : 'text-ink-300'}`}>{s.label}</button>
          ))}
        </div>
      )}
      {cur.error ? <p className="mt-3 text-py">{cur.error}</p> : cur.url && (
        <>
          <div className={`mt-4 rounded-xl bg-white p-3 ${used ? 'opacity-30' : ''}`}>
            <QRCodeSVG value={cur.url} size={320} level="M" style={{ width: '100%', height: 'auto' }} />
          </div>
          {used ? <p className="mt-3 text-lg font-bold text-py">File received</p> : (
            <div className="mt-3 flex items-end justify-between gap-3">
              {pin ? (
                <div><div className="text-sm text-ink-300">Match code</div><div className="text-4xl font-extrabold tracking-[.2em] text-py">{pin}</div></div>
              ) : (
                <div className="text-ink-300">{cur.label ? (cur.label.indexOf('Anywhere') === 0 ? 'Works from anywhere with internet' : 'Works on the shop WiFi') : 'Stays valid until you turn it off'}</div>
              )}
              {left !== null && <div className="text-2xl font-bold tabular-nums">{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</div>}
            </div>
          )}
          <button className="btn-line mt-3 w-full" onClick={() => navigator.clipboard?.writeText(cur.url ?? '')}><Copy size={18} /> Copy link</button>
        </>
      )}
    </div>
  );
}
