import type { Job, Settings } from './types';
import { caps } from './platform';

const startOfDay = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };

/** Decides whether an incoming job may print by itself. Limits are checked against local history. */
export function autoDecision(
  s: Settings,
  j: { pages: number; size: number; remote: string },
  jobs: Job[],
  now = Date.now()
): { auto: boolean; reason?: string } {
  if (s.mode === 'manual') return { auto: false };
  if (!caps.silentPrint) return { auto: false, reason: 'This device needs a tap to print' };

  const printedToday = jobs
    .filter((x) => x.createdAt >= startOfDay() && (x.status === 'done' || x.status === 'printing'))
    .reduce((n, x) => n + x.pages, 0);
  if (printedToday + j.pages > s.dailyPageCap) return { auto: false, reason: `Daily page cap (${s.dailyPageCap}) reached` };
  if (s.mode === 'auto') return { auto: true };

  // smart: every limit applies
  if (j.pages > s.maxPages) return { auto: false, reason: `${j.pages} pages is over the ${s.maxPages}-page auto limit` };
  if (s.maxMB > 0 && j.size > s.maxMB * 1048576) return { auto: false, reason: `Over the ${s.maxMB} MB auto limit` };
  const lastHour = jobs.filter((x) => x.auto && x.createdAt > now - 3600_000).length;
  if (lastHour >= s.maxPerHour) return { auto: false, reason: `Hourly limit (${s.maxPerHour} jobs) reached` };
  const recent = jobs.find((x) => x.remote === j.remote && x.createdAt > now - s.cooldownSec * 1000);
  if (recent) return { auto: false, reason: `Same customer sent another file within ${s.cooldownSec}s` };
  return { auto: true };
}
