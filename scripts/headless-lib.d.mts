// Types of headless-lib.mjs for the test that imports it; the script itself is plain JavaScript.
import type { HttpRequest, HttpResponse, Problem, Session, Sink } from '../src/core';

export const SINK_STATE: string;

export interface Page {
  evaluate(expression: string, timeoutMs?: number): Promise<unknown>;
  probe(expression: string, fallback: unknown): Promise<unknown>;
}

export function pageTransport(page: Page, core: unknown): {
  fetch(req: HttpRequest): Promise<HttpResponse>;
  xhr(req: HttpRequest): Promise<{ status: number; text: string }>;
  pagePath(): Promise<string>;
};

export function keepAlive(page: Page, core: unknown): Promise<unknown>;

export function sessionOf(page: Page, core: unknown, tries?: number): Promise<Session | null>;

export interface FolderSink extends Sink {
  problems: (Problem & { step: string })[];
  setStep(name: string): void;
  writeRootFiles(startedAt: string, ran: readonly string[]): { files: Record<string, number>; errors: unknown[] };
}
export function folderSink(core: unknown, dir: string, version: string): FolderSink;
