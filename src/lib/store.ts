import { create } from 'zustand';
import type { Job, PeerStatus, PrinterInfo, Session, Settings } from './types';
import { allJobs, clearJobs, defaultSettings, delJob, loadSettings, putJob, saveSettings } from './db';

interface State {
  ready: boolean;
  locked: boolean;
  settings: Settings;
  jobs: Job[];
  sessions: Session[];
  peerStatus: PeerStatus;
  peerMsg: string;
  netStatus: PeerStatus;
  netMsg: string;
  lanIps: string[];
  port: number;
  printers: PrinterInfo[];
  load(): Promise<void>;
  unlock(): void;
  patchSettings(p: Partial<Settings>): Promise<void>;
  upsertJob(j: Job): Promise<void>;
  wipeHistory(): Promise<void>;
  removeJob(id: string): Promise<void>;
  setSessions(fn: (s: Session[]) => Session[]): void;
  set(p: Partial<State>): void;
}

export const useStore = create<State>((set, get) => ({
  ready: false,
  locked: false,
  settings: defaultSettings(),
  jobs: [],
  sessions: [],
  peerStatus: 'connecting',
  peerMsg: '',
  netStatus: 'connecting',
  netMsg: '',
  lanIps: [],
  port: 0,
  printers: [],
  async load() {
    const [settings, jobs] = await Promise.all([loadSettings(), allJobs()]);
    set({ settings, jobs, ready: true, locked: !!settings.appPin });
  },
  unlock() { set({ locked: false }); },
  async patchSettings(p) {
    const settings = { ...get().settings, ...p };
    set({ settings });
    await saveSettings(settings);
  },
  async upsertJob(j) {
    await putJob(j);
    const rest = get().jobs.filter((x) => x.id !== j.id);
    set({ jobs: [j, ...rest].sort((a, b) => b.createdAt - a.createdAt) });
  },
  async wipeHistory() { await clearJobs(); set({ jobs: [] }); },
  async removeJob(id) { await delJob(id); set({ jobs: get().jobs.filter((x) => x.id !== id) }); },
  setSessions(fn) { set({ sessions: fn(get().sessions) }); },
  set(p) { set(p as any); }
}));
