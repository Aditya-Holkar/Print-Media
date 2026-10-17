import { Check, Download, FileText, Hand, Minus, Plus, Printer, RotateCcw, X } from 'lucide-react';
import type { Job } from '../lib/types';
import { downloadJob, holdJob, markDone, printJob, rejectJob, setCopies, toggleColor } from '../lib/controller';
import { caps } from '../lib/platform';

const ago = (t: number) => {
  const m = Math.floor((Date.now() - t) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};
const size = (b: number) => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB');

export default function JobCard({ job: j }: { job: Job }) {
  const waiting = j.status === 'incoming' || j.status === 'held';
  return (
    <article className="panel !p-4 space-y-3">
      <div className="flex gap-3">
        <FileText className="shrink-0 text-ink-300 mt-1" />
        <div className="min-w-0 flex-1">
          <h4 className="text-xl font-bold break-words">{j.filename}</h4>
          <p className="text-ink-300">{j.pages} {j.pages === 1 ? 'page' : 'pages'} · {size(j.size)} · {ago(j.createdAt)}</p>
        </div>
        <div className="text-right"><div className="text-xs text-ink-300">code</div><div className="text-2xl font-extrabold tracking-widest text-py">{j.pin}</div></div>
      </div>

      {j.note && <p className="text-sm text-py">{j.note}</p>}
      {j.status === 'held' && <p className="text-sm text-ink-300">On hold</p>}
      {j.status === 'rejected' && <p className="text-sm text-ink-300">Rejected</p>}

      {waiting && caps.silentPrint && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center rounded-xl border border-ink-700">
            <button className="p-3" onClick={() => setCopies(j.id, j.copies - 1)} aria-label="Fewer copies"><Minus size={18} /></button>
            <span className="w-10 text-center text-lg font-bold">{j.copies}</span>
            <button className="p-3" onClick={() => setCopies(j.id, j.copies + 1)} aria-label="More copies"><Plus size={18} /></button>
          </div>
          <button className="btn-line !py-2" onClick={() => toggleColor(j.id)}>{j.color ? 'Colour' : 'Black & white'}</button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {waiting && <button className="btn-pc flex-1" onClick={() => printJob(j.id)}><Printer size={20} /> Print</button>}
        {j.status === 'incoming' && <button className="btn-line" onClick={() => holdJob(j.id)} aria-label="Hold"><Hand size={20} /></button>}
        {waiting && <button className="btn-line" onClick={() => rejectJob(j.id)} aria-label="Reject"><X size={20} /></button>}
        {j.status === 'printing' && j.needsConfirm && <>
          <button className="btn-py flex-1" onClick={() => markDone(j.id)}><Check size={20} /> It printed</button>
          <button className="btn-line" onClick={() => printJob(j.id)}><RotateCcw size={18} /> Again</button>
        </>}
        {j.status === 'printing' && !j.needsConfirm && <p className="text-pm font-bold">Sending to printer…</p>}
        {j.status === 'failed' && <button className="btn-pm flex-1" onClick={() => printJob(j.id)}><RotateCcw size={18} /> Try again</button>}
        {(waiting || j.status === 'failed' || (j.status === 'printing' && j.needsConfirm)) && <button className="btn-line" onClick={() => downloadJob(j.id)} aria-label="Download PDF"><Download size={20} /></button>}
      </div>
    </article>
  );
}
