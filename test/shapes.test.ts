// shapes.json is the one file a live run writes into the repo, so most of this is about what must never get into it;
// the last test holds the fake site to it, once a live run has written one.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { newCtx } from '../src/core';
import { endpointKey, mergeShapes, shapeDrift, shapeOf, shapeTransport, sortedShapes, type Shapes } from '../src/extension/shared/shapes';
import { fakeMaccabi, fakeTransport, jsonResp, makeCollector, MID, runAll } from './fakes';

const FILE = new URL('../docs/endpoints/shapes.json', import.meta.url);

describe('shapeOf', () => {
  it('keeps field names and types, and never a value', () => {
    const shape = shapeOf({ tests: [{ doc_id: 'D/1 secret', n: 7 }, { doc_id: null }], ok: true });
    expect(shape).toEqual({
      $: ['object'], '$.tests': ['array'], '$.tests[]': ['object'], '$.tests[].doc_id': ['null', 'string'], '$.tests[].n': ['number'], '$.ok': ['boolean'],
    });
    expect(JSON.stringify(shape)).not.toContain('secret');
  });

  it('hides a key that is data rather than a field name', () => {
    const keys = Object.keys(shapeOf({ 'אקמול': 1, '123456789': 2, '2026-01-05': 3, ['a'.repeat(41)]: 4, ABC123456: 5, plain_name: 6 }));
    expect(keys.sort()).toEqual(['$', '$.<key>', '$.plain_name']);
  });
});

describe('endpointKey', () => {
  it('takes out the host, the query, the member and every id', () => {
    expect(endpointKey('GET', 'https://online.maccabi4u.co.il/sonline/X/webapi/mac/v1/members/0/' + MID + '/visits/A1/?hash=h', MID))
      .toBe('GET /sonline/X/webapi/mac/v1/members/0/{mid}/visits/{id}/');
    expect(endpointKey('GET', '/sonline/X/letters_for_member/L1/m80188' + MID + '01/pdf', MID)).toBe('GET /sonline/X/letters_for_member/{id}/{id}/pdf');
    expect(endpointKey('POST', '/online/Ajax/PHR/WsPHRManager.asmx/SearchByDate', MID)).toBe('POST /online/Ajax/PHR/WsPHRManager.asmx/SearchByDate');
  });
});

describe('shapeDrift', () => {
  const known: Shapes = { 'GET /a': { $: ['object'], '$.x': ['string'], '$.empty': ['null'] } };

  it('has nothing to say when the shapes agree, or a field is only empty', () => {
    expect(shapeDrift(known, { 'GET /a': { '$.x': ['null', 'string'], '$.empty': ['string'] } })).toEqual([]);
  });

  it('names a new endpoint, a new field and a new type', () => {
    expect(shapeDrift(known, { 'GET /b': {}, 'GET /a': { '$.y': ['number'], '$.x': ['number'] } })).toEqual([
      'new endpoint: GET /b', 'GET /a $.y: new field (number)', 'GET /a $.x: now number, was string',
    ]);
  });
});

describe('mergeShapes', () => {
  it('adds what another account shows, in an order that does not depend on the run', () => {
    const a = mergeShapes({ 'GET /b': { '$.z': ['string'] } }, { 'GET /b': { '$.z': ['null'], '$.a': ['number'] }, 'GET /a': { $: ['array'] } });
    expect(JSON.stringify(sortedShapes(a))).toBe('{"GET /a":{"$":["array"]},"GET /b":{"$.a":["number"],"$.z":["null","string"]}}');
  });
});

describe('shapeTransport', () => {
  it('records only JSON answers that came back 200, and passes every response on untouched', async () => {
    const seen: Shapes[] = [];
    const answers = [jsonResp({ a: 1 }), jsonResp({ b: 1 }, 500), { ...jsonResp({ c: 1 }), contentType: 'text/html' }, { ...jsonResp(undefined), bytes: new TextEncoder().encode('{') }];
    let i = 0;
    const t = shapeTransport({ fetch: async () => answers[i++], xhr: async () => ({ status: 0, text: '' }), pagePath: async () => '/' }, MID, (s) => void seen.push(s));
    for (const a of answers) expect(await t.fetch({ url: '/x', method: 'GET' })).toBe(a);
    expect(seen).toEqual([{ 'GET /x': { $: ['object'], '$.a': ['number'] } }]);
  });
});

describe('docs/endpoints/shapes.json', () => {
  const committed = existsSync(FILE) ? (JSON.parse(readFileSync(FILE, 'utf8')) as Shapes) : null;

  it.skipIf(!committed)('holds names and types only', () => {
    const text = readFileSync(FILE, 'utf8');
    expect(text).not.toMatch(/[֐-׿]/);
    expect(text).not.toMatch(/\d{5,}/);
  });

  // Written by `npm run live -- --shapes`. A line here is the fake answering something the site never has: a fake
  // field from before there was a snapshot, or the site having moved, and either way the tests prove less than they seem.
  it.skipIf(!committed)('holds the fake site to what the real one answers', async () => {
    const seen: Shapes = {};
    const site = fakeMaccabi();
    const transport = shapeTransport(fakeTransport(site.routes), MID, (s) => void mergeShapes(seen, s));
    await runAll(makeCollector(transport).c, newCtx());
    expect(shapeDrift(committed as Shapes, seen)).toEqual([]);
  });
});
