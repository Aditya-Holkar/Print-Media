import { useEffect, useState } from 'react';
import { isInstalled } from './platform';

interface Snapshot { canPrompt: boolean; installed: boolean }

let evt: any = null;
let installed = isInstalled;
const subs = new Set<() => void>();
const emit = () => { for (const f of subs) f(); };
const snapshot = (): Snapshot => ({ canPrompt: !!evt, installed });

// Captured once when the app loads: "install" prompts are a one-shot browser event,
// so a listener inside a single page would miss it (this module loads before any page mounts).
if (!installed) {
  window.addEventListener('beforeinstallprompt', (e: Event) => { e.preventDefault(); evt = e; emit(); });
  window.addEventListener('appinstalled', () => { evt = null; installed = true; emit(); });
}

/** Shared PWA install state: native prompt (Chrome/Edge/Android) or instructions fallback (iOS Safari). */
export function usePwaInstall() {
  const [s, setS] = useState<Snapshot>(snapshot);
  useEffect(() => {
    const f = () => setS(snapshot());
    subs.add(f); f();
    return () => { subs.delete(f); };
  }, []);
  return {
    ...s,
    /** Show the native install dialog. No-op when the browser did not offer one. */
    async prompt(): Promise<void> {
      if (!evt) return;
      try { evt.prompt(); await evt.userChoice; } catch { /* dismissed */ }
      evt = null; emit();
    }
  };
}
