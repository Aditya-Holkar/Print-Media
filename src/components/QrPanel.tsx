import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, X } from 'lucide-react';

export function useNow(ms = 1000) {
  const [n, setN] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setN(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return n;
}

interface Props { url?: string; error?: string; title: string; pin?: string; expiresAt?: number; used?: boolean; onClose?: () => void }

export default function QrPanel({ url, error, title, pin, expiresAt, used, onClose }: Props) {
  const now = useNow();
  const left = expiresAt ? Math.max(0, Math.floor((expiresAt - now) / 1000)) : null;
  return (
    <div className="panel w-full max-w-[400px]">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-xl font-bold">{title}</h3>
        {onClose && <button className="p-2 -m-2 text-ink-300 hover:text-white" onClick={onClose} aria-label="Close"><X /></button>}
      </div>
      {error ? <p className="mt-3 text-py">{error}</p> : url && (
        <>
          <div className={`mt-4 rounded-xl bg-white p-3 ${used ? 'opacity-30' : ''}`}>
            <QRCodeSVG value={url} size={320} level="M" style={{ width: '100%', height: 'auto', minWidth: 300 }} />
          </div>
          {used ? <p className="mt-3 text-lg font-bold text-py">File received</p> : (
            <div className="mt-3 flex items-end justify-between">
              {pin ? <div><div className="text-sm text-ink-300">Match code</div><div className="text-4xl font-extrabold tracking-[.2em] text-py">{pin}</div></div> : <div className="text-ink-300">Stays valid until you turn it off</div>}
              {left !== null && <div className="text-2xl font-bold tabular-nums">{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</div>}
            </div>
          )}
          <button className="btn-line mt-3 w-full" onClick={() => navigator.clipboard?.writeText(url)}><Copy size={18} /> Copy link</button>
        </>
      )}
    </div>
  );
}
