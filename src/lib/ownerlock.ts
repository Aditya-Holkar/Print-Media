/**
 * One device, one station. The same stored Shop ID can be live in several places on one
 * device at the same time (installed PWA + a browser tab + a reloaded page). Without
 * coordination they fight over the ID on the signaling server: the first copy keeps it,
 * later copies sit at "Internet offline" forever, and if that first copy is a frozen or
 * forgotten tab it keeps the ID registered but never answers customers ("Could not reach
 * the shop").
 *
 * Rule: the copy that claims newest owns the Shop ID. Copies on the same device talk over
 * a BroadcastChannel:
 *  - a new copy claims the slot -> the current holder releases the ID immediately and says so
 *  - holders answer "who" presence checks; a released copy takes the slot back when it
 *    notices the holder is gone ("bye" on close, or no answer to a presence check)
 */
const NAME = 'xs-owner-slot';
let chan: BroadcastChannel | null = null;
try { chan = typeof BroadcastChannel === 'function' ? new BroadcastChannel(NAME) : null; } catch { chan = null; }
const me: string = (() => { try { return crypto.randomUUID(); } catch { return String(Math.random()).slice(2) + Date.now(); } })();

let holding = false;       // this copy owns the Shop ID right now
let claiming = false;      // this copy is asking for the slot right now
let claimSeq = 0;          // newest claim wins; ties break on id order
let releaseHook: (() => void) | null = null;
let freeHook: (() => void) | null = null;
let claimWakers: (() => void)[] = [];
let loseWait: (() => void) | null = null;
let hereWaker: (() => void) | null = null;
let lastProbe = 0;

const post = (t: string) => { try { chan?.postMessage({ t, id: me, seq: claimSeq }); } catch { /* channel closed */ } };

// Small event ring (diagnostics): module-level so tests can read what happened and when.
type Ev = { t: number; d: string };
const events: Ev[] = [];
export const ownerMark = (d: string) => { events.push({ t: Date.now(), d }); if (events.length > 500) events.shift(); };
export const ownerLog = () => events.slice();

if (chan) {
  chan.onmessage = (e: MessageEvent) => {
    const m = e.data as { t?: string; id?: string; seq?: number } | null;
    if (!m || typeof m.id !== 'string' || m.id === me) return;
    ownerMark('recv:' + m.t + ' seq=' + m.seq + ' from=' + String(m.id).slice(0, 8) + ' hold=' + holding + ' claim=' + claiming);
    if (m.t === 'claim') {
      const newer = typeof m.seq === 'number' && (m.seq > claimSeq || (m.seq === claimSeq && m.id > me));
      if (!newer) return;
      claimSeq = m.seq as number;
      if (holding) {
        // a newer copy of the app is taking over: release the ID right away
        holding = false;
        ownerMark('RELEASE (newer claim)');
        try { releaseHook?.(); } catch { /* ignore */ }
        post('released');
      } else if (claiming) {
        // we were still asking for the slot and a newer copy claimed it: bow out
        claiming = false;
        ownerMark('LOSE claim');
        loseWait?.();
      }
    } else if (m.t === 'released') {
      const w = claimWakers; claimWakers = [];
      for (const fn of w) fn();
    } else if (m.t === 'who') {
      if (holding) post('here');
    } else if (m.t === 'here') {
      hereWaker?.(); hereWaker = null;
    } else if (m.t === 'bye') {
      if (!holding) { ownerMark('BYE -> free hook'); freeHook?.(); }
    }
  };
}

/** The peer registers what to do when a newer copy of the app claims the connection. */
export function holderRelease(fn: (() => void) | null) { releaseHook = fn; }

/** Called when the copy that owned the slot went away - restart the peers and take over. */
export function onSlotFree(fn: (() => void) | null) { freeHook = fn; }

/**
 * Fresh copies wait here. Returns true when this copy owns the slot (or no coordination is
 * possible on this platform), false when a newer copy won while we asked.
 */
export async function claimSlot(): Promise<boolean> {
  if (!chan) { holding = true; return true; }
  if (holding) return true; // already ours - starting over must not redo the handshake
  await new Promise((r) => setTimeout(r, 40 + Math.floor(Math.random() * 100)));
  claimSeq = Date.now();
  claiming = true;
  const res = await new Promise<{ won: boolean; freed: boolean }>((resolve) => {
    let done = false;
    const fin = (v: { won: boolean; freed: boolean }) => { if (!done) { done = true; claimWakers = claimWakers.filter((fn) => fn !== waker); loseWait = null; resolve(v); } };
    const waker = () => fin({ won: true, freed: true });
    claimWakers.push(waker);
    loseWait = () => fin({ won: false, freed: false });
    // A live holder answers "released" in milliseconds. If nothing answers quickly, no other
    // copy is on this device - take the slot without making the shop wait (retries recover
    // if a busy copy surfaces later).
    setTimeout(() => fin({ won: true, freed: false }), 350);
    post('claim');
  });
  claiming = false;
  if (!res.won) { holding = false; return false; }
  // If an older holder released for us, its server socket needs a moment to close.
  if (res.freed) await new Promise((r) => setTimeout(r, 900));
  holding = true;
  return true;
}

/** Re-check on the way back from background: is anyone still holding the slot? If not, take it. */
export function watchPresence() {
  if (!chan) return;
  const check = async () => {
    if (holding || claiming) return;
    if (Date.now() - lastProbe < 7000) return;
    lastProbe = Date.now();
    const here = await new Promise<boolean>((resolve) => {
      let done = false;
      hereWaker = () => { if (!done) { done = true; resolve(true); } };
      setTimeout(() => { if (!done) { done = true; hereWaker = null; resolve(false); } }, 800);
      post('who');
    });
    if (!here && !holding && !claiming) freeHook?.();
  };
  // A released copy also checks on a slow timer: covers a holder that vanished without a
  // "bye" (crashed tab, force-closed window, frozen phone) so the shop never sits offline.
  setInterval(() => { void check(); }, 15000);
  document.addEventListener('visibilitychange', () => { void check(); });
  window.addEventListener('pagehide', () => { if (holding) { holding = false; post('bye'); } });
}

/** Diagnostics (tests): where this copy stands in the ownership of the slot. */
export function ownerState() { return { me, holding, claiming, claimSeq, hasChannel: !!chan }; }
