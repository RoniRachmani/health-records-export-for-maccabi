// Types of redact.mjs for the test that imports it; the script itself is plain JavaScript.
export function spellings(value: unknown): string[];
export function redactor(creds?: { username?: string; password?: string }): <T>(text: T) => T;
export function shape(v: unknown, depth?: number): unknown;
