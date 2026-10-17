import { useState } from 'react';
import { Lock } from 'lucide-react';
import { useStore } from '../lib/store';

export default function PinGate() {
  const { settings, unlock } = useStore();
  const [v, setV] = useState(''); const [bad, setBad] = useState(false);
  const go = () => (v === settings.appPin ? unlock() : (setBad(true), setV('')));
  return (
    <div className="h-full grid place-items-center p-6">
      <div className="panel w-full max-w-sm space-y-4 text-center">
        <Lock className="mx-auto text-pc" size={36} />
        <h1 className="text-2xl font-bold">{settings.shopName}</h1>
        <input className="field text-center text-3xl tracking-[.4em]" type="password" inputMode="numeric" autoFocus value={v}
          onChange={(e) => { setV(e.target.value); setBad(false); }} onKeyDown={(e) => e.key === 'Enter' && go()} placeholder="PIN" />
        {bad && <p className="text-pm">Wrong PIN. Try again.</p>}
        <button className="btn-pc w-full" onClick={go}>Unlock</button>
      </div>
    </div>
  );
}
