import { useMemo, useState } from 'react';
import { Download, Trash2 } from 'lucide-react';
import { useStore } from '../lib/store';

const csvCell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

export default function History() {
  const { jobs, wipeHistory, removeJob } = useStore();
  const [status, setStatus] = useState('all');
  const [q, setQ] = useState('');
  const rows = useMemo(() => jobs.filter((j) => (status === 'all' || j.status === status) && j.filename.toLowerCase().includes(q.toLowerCase())), [jobs, status, q]);

  const exportCsv = () => {
    const head = ['id', 'date', 'file', 'hash', 'pages', 'bytes', 'status', 'auto', 'printed_at'];
    const lines = [head.join(',')].concat(rows.map((j) => [j.id, new Date(j.createdAt).toISOString(), j.filename, j.hash, j.pages, j.size, j.status, j.auto, j.printedAt ? new Date(j.printedAt).toISOString() : ''].map(csvCell).join(',')));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    a.download = 'print-history.csv'; a.click();
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <h1 className="text-3xl font-extrabold">History</h1>
      <div className="flex flex-wrap gap-3">
        <input className="field !w-auto flex-1 min-w-[180px]" placeholder="Search file name" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="field !w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          {['all', 'incoming', 'held', 'printing', 'done', 'failed', 'rejected'].map((s) => <option key={s}>{s}</option>)}
        </select>
        <button className="btn-line" onClick={exportCsv}><Download size={18} /> Export CSV</button>
        <button className="btn-line" onClick={() => { if (confirm('Delete all history and stored files?')) void wipeHistory(); }}><Trash2 size={18} /> Clear</button>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-ink-700">
        <table className="w-full text-left">
          <thead className="bg-ink-800 text-ink-300 text-sm"><tr>{['Date', 'File', 'Pages', 'Status', 'How', ''].map((h, i) => <th key={i} className={'px-4 py-3 font-normal' + (h === 'How' ? ' hidden md:table-cell' : '')}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((j) => (
              <tr key={j.id} className="border-t border-ink-700">
                <td className="px-4 py-3 whitespace-nowrap">{new Date(j.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</td>
                <td className="px-4 py-3 break-all">{j.filename}</td>
                <td className="px-4 py-3">{j.pages}</td>
                <td className="px-4 py-3 font-bold">{j.status}</td>
                <td className="px-4 py-3 text-ink-300 hidden md:table-cell">{j.auto ? 'Automatic' : 'Approved'}</td>
                <td className="px-4 py-3 text-right"><button className="btn-line !p-2" title="Remove this record" aria-label="Remove this record" onClick={() => { if (confirm('Remove this record from history?')) void removeJob(j.id); }}><Trash2 size={16} /></button></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td className="px-4 py-6 text-ink-500" colSpan={6}>No jobs match.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-ink-500">Only the file name, a fingerprint, page count and time are kept. The PDF itself is deleted once printed.</p>
    </div>
  );
}
