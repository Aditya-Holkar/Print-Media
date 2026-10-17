import type { Job, Settings } from './types';
import { isElectron, isMobile } from './platform';
import { bridgePing, bridgePrint } from './bridge';

export interface PrintResult { ok: boolean; confirm?: boolean; error?: string }

export async function printBytes(bytes: ArrayBuffer, job: Pick<Job, 'filename' | 'copies' | 'color'>, s: Settings): Promise<PrintResult> {
  // Desktop app: silent print through SumatraPDF (bundled by pdf-to-printer)
  if (isElectron && window.xs) {
    const r = await window.xs.print({ bytes, printer: s.printer || undefined, copies: job.copies, color: job.color });
    return r.ok ? { ok: true } : { ok: false, error: r.error || 'Printer error' };
  }
  // Web/PWA running on the same PC as the desktop app: print through it - same silent
  // printing and the same printer list as the desktop app itself.
  if (!isMobile && (await bridgePing())) {
    const r = await bridgePrint(bytes, { printer: s.printer || undefined, copies: job.copies, color: job.color, filename: job.filename });
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

/** A small one-page PDF built by hand (no libraries) for the "Test print page" button. */
function testPagePdf(s: Settings): ArrayBuffer {
  const esc = (t: string) => t.replace(/[^\x20-\x7E]/g, '?').replace(/[\\()]/g, (m) => '\\' + m);
  const W = 595, H = 842; // A4, points
  const from = isElectron ? 'Desktop app (silent print)' : isMobile ? 'Phone browser' : 'Web browser';
  const line = (x: number, y: number, size: number, text: string, bold = false) => `BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x} ${y} Td (${esc(text)}) Tj ET`;
  const ops = [
    '0.7 w 0.6 0.6 0.6 RG', `20 20 ${W - 40} ${H - 40} re S`, // margin frame
    '1.5 w 0 0 0 RG', // tick marks at the middle of each edge
    `${W / 2} 20 m ${W / 2} 34 l S`, `${W / 2} ${H - 20} m ${W / 2} ${H - 34} l S`,
    `20 ${H / 2} m 34 ${H / 2} l S`, `${W - 20} ${H / 2} m ${W - 34} ${H / 2} l S`,
    '0 0 0 rg 60 80 42 42 re f', // black square
    '0.5 0.5 0.5 rg 118 80 42 42 re f', // grey square
    line(60, H - 100, 26, 'XeroxStation - test page', true),
    `0.5 w 0.6 0.6 0.6 RG 60 ${H - 150} m ${W - 60} ${H - 150} l S`,
    line(60, H - 190, 13, `Printer: ${s.printer || 'Windows default printer'}`, true),
    line(60, H - 212, 12, `Sent from: ${from}`),
    line(60, H - 232, 12, `Date: ${new Date().toLocaleString()}`),
    line(60, H - 292, 12, 'If you can read this, the printer is connected and working.'),
    line(60, H - 314, 12, 'The grey frame marks the paper margins - all four corners should be'),
    line(60, H - 332, 12, 'visible, with one black and one grey square at the bottom left.')
  ];
  const stream = ops.join('\n');
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  const obj = (body: string) => { offsets.push(pdf.length); pdf += `${offsets.length} 0 obj\n${body}\nendobj\n`; };
  obj('<< /Type /Catalog /Pages 2 0 R >>');
  obj('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`);
  obj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  obj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  obj(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  const xref = pdf.length;
  pdf += `xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf).buffer as ArrayBuffer;
}

/** Print a test page through the normal print path so the shop can verify the printer before real jobs. */
export async function printTestPage(s: Settings): Promise<PrintResult> {
  return printBytes(testPagePdf(s), { filename: 'XeroxStation test page.pdf', copies: 1, color: true }, s);
}
