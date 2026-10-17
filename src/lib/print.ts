import type { Job, Settings } from './types';
import { isElectron, isMobile } from './platform';

export interface PrintResult { ok: boolean; confirm?: boolean; error?: string }

export async function printBytes(bytes: ArrayBuffer, job: Job, s: Settings): Promise<PrintResult> {
  // Desktop app: silent print through SumatraPDF (bundled by pdf-to-printer)
  if (isElectron && window.xs) {
    const r = await window.xs.print({ bytes, printer: s.printer || undefined, copies: job.copies, color: job.color });
    return r.ok ? { ok: true } : { ok: false, error: r.error || 'Printer error' };
  }
  const file = new File([bytes], job.filename.replace(/[^\w.\- ]+/g, '_'), { type: 'application/pdf' });
  // Phone: share sheet (iOS -> Print / AirPrint, Android -> Print or a print service app)
  if (isMobile) {
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: job.filename });
        return { ok: true, confirm: true };
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') return { ok: false, error: 'Cancelled - tap Print to try again' };
    }
    const url = URL.createObjectURL(file);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 120000);
    return { ok: true, confirm: true };
  }
  // Desktop browser: hidden iframe + print dialog
  const url = URL.createObjectURL(file);
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  f.src = url;
  f.onload = () => { try { f.contentWindow?.focus(); f.contentWindow?.print(); } catch { window.open(url, '_blank'); } };
  document.body.appendChild(f);
  setTimeout(() => { f.remove(); URL.revokeObjectURL(url); }, 180000);
  return { ok: true, confirm: true };
}

export function saveBytes(bytes: ArrayBuffer, filename: string) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
