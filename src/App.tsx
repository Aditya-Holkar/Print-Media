import { useEffect, useState } from 'react';
import { History as HistoryIcon, LayoutDashboard, Settings as Cog } from 'lucide-react';
import { useStore } from './lib/store';
import Dashboard from './pages/Dashboard';
import History from './pages/History';
import Settings from './pages/Settings';
import PinGate from './components/PinGate';
import { isElectron } from './lib/platform';

const NAV = [
  { id: 'dash', label: 'Queue', icon: LayoutDashboard },
  { id: 'hist', label: 'History', icon: HistoryIcon },
  { id: 'set', label: 'Settings', icon: Cog }
] as const;

function useWakeLock() {
  useEffect(() => {
    if (isElectron) return;
    let lock: any = null;
    const get = async () => { try { lock = await (navigator as any).wakeLock?.request('screen'); } catch { /* not allowed */ } };
    const vis = () => { if (document.visibilityState === 'visible') void get(); };
    void get(); document.addEventListener('visibilitychange', vis);
    return () => { document.removeEventListener('visibilitychange', vis); void lock?.release?.(); };
  }, []);
}

export default function App() {
  const { ready, locked, jobs } = useStore();
  const [page, setPage] = useState<(typeof NAV)[number]['id']>('dash');
  useWakeLock();
  if (!ready) return <div className="h-full grid place-items-center text-ink-300">Loading…</div>;
  if (locked) return <PinGate />;
  const waiting = jobs.filter((j) => j.status === 'incoming' || j.status === 'held').length;

  return (
    <div className="h-full md:flex">
      <aside className="hidden md:flex w-56 shrink-0 flex-col gap-1 bg-ink-900 border-r border-ink-700 p-3">
        <div className="h-1.5 rounded bg-gradient-to-r from-pc via-pm to-py mb-4" />
        {NAV.map((n) => (
          <button key={n.id} onClick={() => setPage(n.id)} className={`flex items-center gap-3 rounded-xl px-4 py-3 text-lg font-bold ${page === n.id ? 'bg-ink-100 text-ink-950' : 'text-ink-300 hover:bg-ink-800'}`}>
            <n.icon size={22} /> {n.label}
            {n.id === 'dash' && waiting > 0 && <span className="ml-auto rounded-full bg-pm px-2 text-sm text-white">{waiting}</span>}
          </button>
        ))}
      </aside>
      <main className="flex-1 overflow-y-auto pb-24 md:pb-0">
        {page === 'dash' && <Dashboard />}
        {page === 'hist' && <History />}
        {page === 'set' && <Settings />}
      </main>
      <nav className="md:hidden fixed bottom-0 inset-x-0 grid grid-cols-3 bg-ink-900 border-t border-ink-700" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {NAV.map((n) => (
          <button key={n.id} onClick={() => setPage(n.id)} className={`relative flex flex-col items-center gap-1 py-3 font-bold ${page === n.id ? 'text-pc' : 'text-ink-300'}`}>
            <n.icon size={24} /> {n.label}
            {n.id === 'dash' && waiting > 0 && <span className="absolute top-1 right-[28%] rounded-full bg-pm px-2 text-xs text-white">{waiting}</span>}
          </button>
        ))}
      </nav>
    </div>
  );
}
