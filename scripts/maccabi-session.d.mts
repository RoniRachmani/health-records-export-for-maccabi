// Types of maccabi-session.mjs for the test that imports it; the script itself is plain JavaScript.
import type { HttpRequest, HttpResponse, Session } from '../src/core';

export const LOGIN_ORIGIN: string;
export const PORTAL_ORIGIN: string;

export class SessionEndedError extends Error {
  sessionEnded: true;
}
export class SignInError extends Error {
  code: string;
  status?: number;
}

export class CookieJar {
  clear(): void;
  set(header: string, url: string): void;
  get(url: string): string;
  has(name: string, url: string): boolean;
}

export interface Phone {
  index: number;
  number: string;
  sms: boolean;
}

export interface Transport {
  fetch(req: HttpRequest): Promise<HttpResponse>;
  xhr(req: HttpRequest): Promise<{ status: number; text: string }>;
  pagePath(): Promise<string>;
}

export class MaccabiSession {
  constructor(options?: { fetch?: typeof fetch; now?: () => number; timeoutMs?: number; maxBytes?: number });
  jar: CookieJar;
  jwt: string | null;
  mid: string | null;
  gender: unknown;
  legacySessionId: string | null;
  pagePath: string;
  readonly session: Session;
  request(input: string | URL, init?: RequestInit): Promise<Response & { finalUrl: string; hops: number; next?: string }>;
  beginSignIn(idNumber: string): Promise<Phone[]>;
  sendCode(phoneIndex?: number): Promise<void>;
  finishSignIn(code: string): Promise<void>;
  finishSignInWithPassword(password: string): Promise<void>;
  bootstrap(core?: unknown): Promise<Session>;
  keepAlive(): Promise<number>;
  primeLegacy(): Promise<void>;
  backToPortal(): void;
  transport(): Transport;
}
