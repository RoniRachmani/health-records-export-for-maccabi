// Types of headless-lib.mjs for the test that imports it; the script itself is plain JavaScript.
import type { HttpRequest, HttpResponse, Problem, Session, Sink } from '../src/core';

export const STALL_MS: number;
export const MAX_BYTES: number;
export const FETCH_IN_PAGE: string;
export const XHR_IN_PAGE: string;
export const ACTIVITY_IN_PAGE: string;
export const SNAPSHOT: string;

export interface Page {
  evaluate(expression: string): Promise<unknown>;
  probe(expression: string, fallback: unknown): Promise<unknown>;
}

export function pageTransport(page: Page): {
  fetch(req: HttpRequest): Promise<HttpResponse>;
  xhr(req: HttpRequest): Promise<{ status: number; text: string }>;
  pagePath(): Promise<string>;
};

export function sessionOf(page: Page, core: unknown, tries?: number): Promise<Session | null>;

export interface FolderSink extends Sink {
  problems: Problem[];
  writeRootFiles(startedAt: string): { files: Record<string, number>; errors: unknown[] };
}
export function folderSink(core: unknown, dir: string, version: string): FolderSink;
