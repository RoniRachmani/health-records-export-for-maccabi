// Types of rea-endpoints-lib.mjs for the test that imports it; the script itself is plain JavaScript.

export interface Known {
  paths: string[];
  services: Set<string>;
}

export interface Call {
  path: string;
  method: string;
  offset: number;
  via: string;
}

export interface Evidence {
  endpoints: { path: string; call: string; file: string; line: number; column: number }[];
  routes: Set<string>;
  sourceMaps: { file: string | null; url: string }[];
  partial: string[];
  unparsed: string[];
  parsed: number;
}

export interface Candidate {
  path: string;
  method: string | null;
  proof: 'ast' | 'call' | 'named';
  where: string;
  kind: 'api' | 'page' | 'app';
  known: boolean;
}

export const REA_FILTER: string;
export const PROOF: string[];

export function pathLike(s: string): boolean;
export function shape(path: string): string;
export function kind(path: string): 'api' | 'page' | 'app' | 'noise';
export function knownFrom(endpoints: unknown): Known;
export function isKnown(path: string, known: Known): boolean;
export function builtString(src: string): string | null;
export function readCalls(text: string): Call[];
export function literals(text: string): { value: string; offset: number }[];
export function locator(text: string): { at(offset: number): string };
export function chunkFiles(text: string): Set<string>;
export function chunkUrl(file: string, from: string): string;
export function readEvidence(result: unknown): Evidence;
export function candidates(files: Map<string, string>, evidence: Evidence, known: Known): Candidate[];
export function servicesIn(files: Map<string, string>, known: Known): { name: string; known: boolean }[];
export function batches(sizes: Map<string, number>, maxBytes?: number, maxFiles?: number): string[][];
