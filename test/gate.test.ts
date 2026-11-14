// The extension's one access check (src/extension/shared/gate.ts): which messages its two listeners answer.
import { describe, expect, it } from 'vitest';
import { forOffscreen, routeMessage } from '../src/extension/shared/gate';

const SELF = 'this-extension';
const popup = { id: SELF };
const page = { id: SELF, tab: { id: 7 } }; // a content script: the development build's bridge
const stranger = { id: 'another-extension' };

describe('the service worker', () => {
  it('handles the popup’s requests', () => {
    expect(routeMessage({ type: 'getState' }, popup, SELF, false)).toBe('handle');
    expect(routeMessage({ type: 'start', tabId: 7 }, popup, SELF, true)).toBe('handle');
  });

  it('does not answer another extension, a message for the offscreen document, or nothing at all', () => {
    expect(routeMessage({ type: 'getState' }, stranger, SELF, false)).toBe('ignore');
    expect(routeMessage({ type: 'cancel' }, {}, SELF, true)).toBe('ignore');
    expect(routeMessage({ target: 'offscreen', type: 'zip', root: 'x' }, popup, SELF, false)).toBe('ignore');
    expect(routeMessage(null, popup, SELF, false)).toBe('ignore');
    expect(routeMessage(undefined, popup, SELF, false)).toBe('ignore');
  });

  it('refuses a tab everything but the development build’s own commands', () => {
    for (const type of ['start', 'cancel', 'dismiss', 'getState', 'saveNow']) expect(routeMessage({ type }, page, SELF, true)).toBe('refuse');
    expect(routeMessage({ type: 'dev:state' }, page, SELF, true)).toBe('dev');
    expect(routeMessage({ type: 7 }, page, SELF, true)).toBe('refuse');
  });

  it('refuses every dev: command in the store build, whoever sends it', () => {
    expect(routeMessage({ type: 'dev:state' }, page, SELF, false)).toBe('refuse');
    expect(routeMessage({ type: 'dev:start' }, popup, SELF, false)).toBe('refuse');
    expect(routeMessage({ type: 'dev:spike', url: '/x' }, stranger, SELF, false)).toBe('ignore');
  });
});

describe('the offscreen document', () => {
  const zip = { target: 'offscreen', type: 'zip', root: 'maccabi-export-2026-11-14' };

  it('answers the service worker', () => {
    expect(forOffscreen(zip, popup, SELF)).toBe(true);
  });

  it('answers no tab, no other extension, and nothing not addressed to it', () => {
    expect(forOffscreen(zip, page, SELF)).toBe(false);
    expect(forOffscreen(zip, stranger, SELF)).toBe(false);
    expect(forOffscreen({ type: 'getState' }, popup, SELF)).toBe(false);
    expect(forOffscreen(null, popup, SELF)).toBe(false);
  });
});
