/* Who may ask what of the extension's two listeners, the service worker's and the offscreen document's. Both hear every
   chrome.runtime message, so this is the extension's one access check: kept apart from their chrome.* wiring so it is
   decided in one place and tested. */

/** What the listeners know of a message's sender (chrome.runtime.MessageSender). */
interface Sender {
  id?: string;
  /** Set when a content script sent it: only the development build has one, its bridge on the Maccabi page. */
  tab?: unknown;
}

/**
 * What the service worker does with a message:
 * - `ignore`: not for it (the offscreen document's, or not from this extension), so it does not answer;
 * - `dev`: a development build's bridge command, for handleDev;
 * - `refuse`: answered "not allowed": a `dev:` command in the store build, or anything else a tab sent;
 * - `handle`: one of the popup's requests.
 */
export type Route = 'ignore' | 'dev' | 'refuse' | 'handle';

export function routeMessage(msg: unknown, sender: Sender, selfId: string, devBridge: boolean): Route {
  const m = msg as { target?: unknown; type?: unknown } | null | undefined;
  if (!m || m.target === 'offscreen') return 'ignore';
  // Only this extension's own pages (and, in the development build, its bridge content script).
  if (sender.id !== selfId) return 'ignore';
  const isDev = typeof m.type === 'string' && m.type.startsWith('dev:');
  if (isDev && devBridge) return 'dev';
  return isDev || sender.tab ? 'refuse' : 'handle';
}

/** Whether the offscreen document answers a message: one addressed to it, by the service worker, never by a tab. */
export function forOffscreen(msg: unknown, sender: Sender, selfId: string): boolean {
  const m = msg as { target?: unknown } | null | undefined;
  return !!m && m.target === 'offscreen' && sender.id === selfId && !sender.tab;
}
