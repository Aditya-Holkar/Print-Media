export interface XsBridge {
  info(): Promise<{ lanIps: string[]; port: number }>;
  printers(): Promise<{ name: string; isDefault?: boolean }[]>;
  printerSetup(): Promise<{ ok: boolean; error?: string }>;
  bluetoothSetup(): Promise<{ ok: boolean; error?: string }>;
  print(a: { bytes: ArrayBuffer; printer?: string; copies: number; color: boolean }): Promise<{ ok: boolean; error?: string }>;
  badge(n: number): void;
}
declare global { interface Window { xs?: XsBridge } }

const ua = navigator.userAgent;
export const isElectron = !!window.xs;
export const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isAndroid = /Android/i.test(ua);
export const isMobile = isIOS || isAndroid;
export const isInstalled = matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;

/** electron = desktop EXE, phone = phone browser / installed PWA, web = desktop browser */
export const target: 'electron' | 'phone' | 'web' = isElectron ? 'electron' : isMobile ? 'phone' : 'web';
export const caps = {
  silentPrint: isElectron,      // only the desktop app can print without a dialog
  lanServer: isElectron,        // only the desktop app can host the LAN page + signaling
  printerList: isElectron
};
export const targetLabel = { electron: 'Desktop app', phone: isInstalled ? 'Phone app (PWA)' : 'Phone browser', web: 'Web app' }[target];
