import { useState } from 'react';
import { QrCode, Plus, Store } from 'lucide-react';
import { useStore } from '../lib/store';
import { newSession, dropSession } from '../lib/controller';
import { customerUrl } from '../lib/session';
import { caps } from '../lib/platform';
import JobCard from '../components/JobCard';
import QrPanel from '../components/QrPanel';
import type { Job, Mode } from '../lib/types';

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: 'manual', label: 'Manual', hint: 'Every file waits for your tap' },
  { id: 'smart', label: 'Smart auto', hint: 'Prints by itself within your limits' },
  { id: 'auto', label: 'Auto', hint: 'Prints everything valid (daily cap still applies)' }
];

const COLS: { id: string; label: string; color: string; match: (j: Job) => boolean }[] = [
  { id: 'in', label: 'Incoming', color: 'border-pc', match: (j) => j.status === 'incoming' || j.status === 'held' },
  { id: 'pr', label: 'Printing', color: 'border-pm', match: (j) => j.status === 'printing' },
  { id: 'dn', label: 'Done', color: 'border-py', match: (j) => j.status === 'done' },
  { id: 'fl', label: 'Failed', color: 'border-ink-500', match: (j) => j.status === 'failed' || j.status === 'rejected' }
];

export default function Dashboard() {
  const { settings, jobs, sessions, peerStatus, peerMsg, lanIps, port, patchSettings } = useStore();
  const [tab, setTab] = useState('in');
  const [wall, setWall] = useState(false);
  const [full, setFull] = useState(false);
  const live = sessions.filter((s) => s.used || s.expiresAt > Date.now());
  const recentDone = (j: Job) => Date.now() - (j.printedAt ?? j.createdAt) < 24 * 3600_000;

  const add = () => { if (!newSession()) setFull(true); else setFull(false); };
  const wallUrl = customerUrl(settings, settings.staticToken, lanIps, port);

  return (
    <div className="p-4 md:p-6 space-y-5">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl md:text-3xl font-extrabold mr-auto">{settings.shopName}</h1>
        <span className={`rounded-full px-3 py-1 text-sm font-bold ${peerStatus === 'online' ? 'bg-py text-ink-950' : 'bg-pm text-white'}`}>
          {peerStatus === 'online' ? 'Ready for customers' : peerStatus === 'connecting' ? 'Connecting…' : 'Offline'}
        </span>
      </header>
      {peerStatus !== 'online' && peerMsg && <p className="text-pm">{peerMsg}</p>}

      <div className="flex flex-wrap gap-3 items-center">
        <button className="btn-pc" onClick={add}><Plus /> New QR code</button>
        <button className="btn-line" onClick={() => setWall(!wall)}><Store size={20} /> Wall QR</button>
        <div className="ml-auto flex rounded-xl border border-ink-700 p-1" role="group" aria-label="Print mode">
          {MODES.map((m) => (
            <button key={m.id} title={m.hint} onClick={() => patchSettings({ mode: m.id })}
              className={`rounded-lg px-3 py-2 font-bold ${settings.mode === m.id ? 'bg-ink-100 text-ink-950' : 'text-ink-300'}`}>{m.label}</button>
          ))}
        </div>
      </div>
      <p className="text-sm text-ink-300">{MODES.find((m) => m.id === settings.mode)!.hint}{!caps.silentPrint && settings.mode !== 'manual' ? ' - on this device you still tap Print for each job.' : ''}</p>
      {full && <p className="text-py">You already have {settings.maxSessions} active QR codes. Close one first.</p>}

      {(live.length > 0 || wall) && (
        <div className="flex flex-wrap gap-4">
          {wall && (
            <div className="w-full max-w-[400px] space-y-3">
              {settings.staticEnabled ? (
                <QrPanel title="Wall QR (reusable)" url={'url' in wallUrl ? wallUrl.url : undefined} error={'error' in wallUrl ? wallUrl.error : undefined} onClose={() => setWall(false)} />
              ) : (
                <div className="panel space-y-3">
                  <h3 className="text-xl font-bold">Wall QR</h3>
                  <p className="text-ink-300">One QR code you print and stick outside the shop. Anyone can use it, so keep Manual or Smart mode on.</p>
                  <button className="btn-pc w-full" onClick={() => patchSettings({ staticEnabled: true })}>Turn on</button>
                </div>
              )}
              {settings.staticEnabled && <button className="btn-line w-full" onClick={() => { patchSettings({ staticEnabled: false }); setWall(false); }}>Turn off wall QR</button>}
            </div>
          )}
          {live.map((s) => {
            const u = customerUrl(settings, s.token, lanIps, port, s.expiresAt);
            return <QrPanel key={s.token} title="Customer QR" expiresAt={s.expiresAt}
              url={'url' in u ? u.url : undefined} error={'error' in u ? u.error : undefined} onClose={() => dropSession(s.token)} />;
          })}
        </div>
      )}

      {live.length === 0 && !wall && jobs.length === 0 && (
        <div className="panel flex items-center gap-4"><QrCode className="text-pc shrink-0" size={40} /><p className="text-lg">Tap <b>New QR code</b>, show it to the customer, and their PDF will appear here.</p></div>
      )}

      <nav className="flex gap-2 lg:hidden overflow-x-auto" aria-label="Queue">
        {COLS.map((c) => (
          <button key={c.id} onClick={() => setTab(c.id)} className={`whitespace-nowrap rounded-full px-4 py-2 font-bold border ${tab === c.id ? 'bg-ink-100 text-ink-950 border-ink-100' : 'border-ink-700 text-ink-300'}`}>
            {c.label} {jobs.filter((j) => c.match(j) && (c.id !== 'dn' || recentDone(j))).length}
          </button>
        ))}
      </nav>

      <div className="grid gap-5 lg:grid-cols-4">
        {COLS.map((c) => {
          const list = jobs.filter((j) => c.match(j) && (c.id === 'in' || c.id === 'pr' || recentDone(j)));
          return (
            <section key={c.id} className={`${tab === c.id ? '' : 'hidden'} lg:block`}>
              <h2 className={`hidden lg:flex items-center justify-between border-b-4 ${c.color} pb-2 mb-3 text-xl font-extrabold`}>{c.label}<span className="text-ink-300">{list.length}</span></h2>
              <div className="space-y-3">
                {list.map((j) => <JobCard key={j.id} job={j} />)}
                {list.length === 0 && <p className="text-ink-500 py-4">Nothing here.</p>}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
