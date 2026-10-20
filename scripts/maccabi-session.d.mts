// Types of maccabi-session.mjs for the test that imports it; the script itself is plain JavaScript.
import type { HttpRequest, HttpResponse, Session } from '../src/core';

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

/** What the session takes from core: the bundled src/cli/index.ts, or the sources in a test. */
export interface SessionCore {
  MACCABI_ORIGIN: string;
  LOGIN_ORIGIN: string;
  SUMMARY_PAGE: string;
  PACE_MS: number;
  signedOutUrl(url: string | undefined): string | null;
  jwtClaims(jwt: string | null | undefined): Record<string, unknown> | null;
}

export class MaccabiSession {
  constructor(options: { core: SessionCore; fetch?: typeof fetch; now?: () => number; sleep?: (ms: number) => Promise<void>; timeoutMs?: number; maxBytes?: number });
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
  bootstrap(): Promise<Session>;
  primeLegacy(): Promise<void>;
  backToPortal(): void;
  transport(): Transport;
}
