export type JobStatus = 'incoming' | 'held' | 'printing' | 'done' | 'failed' | 'rejected';
export type Mode = 'manual' | 'smart' | 'auto';
export type PeerStatus = 'connecting' | 'online' | 'offline' | 'error';

export interface Job {
  id: string;
  token: string;
  kind: 'once' | 'static';
  pin: string;
  filename: string;
  hash: string;
  size: number;
  pages: number;
  copies: number;
  color: boolean;
  status: JobStatus;
  auto: boolean;
  note?: string; // why it needs approval / why it failed
  createdAt: number;
  printedAt?: number;
  remote: string;
  needsConfirm?: boolean; // print dialog was opened; owner confirms it printed
}

export interface Settings {
  shopName: string;
  peerId: string;
  staticToken: string;
  staticEnabled: boolean;
  mode: Mode;
  maxPages: number;
  maxMB: number;
  maxPerHour: number;
  cooldownSec: number;
  dailyPageCap: number;
  rejectPages: number;
  sessionTtlMin: number;
  maxSessions: number;
  connection: 'lan' | 'public';
  publicUrl: string;
  lanIp: string;
  signaling: { host: string; port: number; path: string; secure: boolean };
  stun: string;
  turnUrl: string;
  turnUser: string;
  turnPass: string;
  printer: string;
  appPin: string;
  opEnabled: boolean;   // allow the web/PWA remote console (paired with opCode over the shop WiFi)
  opCode: string;       // access code shown in Settings, embedded in the console QR/link
  iceV2?: boolean;      // one-time upgrade flag: recommended STUN/TURN defaults applied
  pubV1?: boolean;      // one-time upgrade flag: live (Vercel) links everywhere + internet mode default
}

export interface Session {
  token: string;
  pin: string;
  createdAt: number;
  expiresAt: number;
  used: boolean;
  claimedBy?: string;
}

export interface PrinterInfo { name: string; isDefault?: boolean }
