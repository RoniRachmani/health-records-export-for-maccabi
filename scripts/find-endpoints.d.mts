// Types of find-endpoints.mjs for the test that imports it; the script itself is plain JavaScript.

export function literals(text: string): string[];
export function scan(text: string): { paths: Set<string>; services: Set<string>; routes: Set<string>; files: Set<string> };
