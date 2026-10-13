// scripts/rea-endpoints.mjs lists what the site's own scripts can call. What it decides, apart from the
// browser and the rea process, is in rea-endpoints-lib.mjs: these run it on made-up scripts, and on a
// result shaped as rea 6.4.0 writes one.
import { describe, expect, it } from 'vitest';
import {
  batches, builtString, candidates, chunkFiles, chunkUrl, isKnown, knownFrom, locator, missingChunks, readCalls, readEvidence,
} from '../scripts/rea-endpoints-lib.mjs';

const known = knownFrom({ steps: [{ url: 'LabsAPI/v1/members/{mid}/labtests' }, { url: '/online/Ajax/GetVisits.ashx' }] });

describe('builtString', () => {
  it('writes {} for each part made at run time', () => {
    expect(builtString('"v1/members/"+e+"/visits"')).toBe('v1/members/{}/visits');
    expect(builtString('`v1/members/${a.id}/labs/${b}?from=${c}`')).toBe('v1/members/{}/labs/{}?from={}');
    expect(builtString('"v1/members/".concat(e,"/visits/").concat(t)')).toBe('v1/members/{}/visits/{}');
    expect(builtString('base+`/x/${f({a:"}"})}/y`')).toBe('{}/x/{}/y');
  });

  it('is null for an address written somewhere else', () => {
    expect(builtString('url')).toBeNull();
    expect(builtString('e.url+t')).toBeNull();
  });
});

describe('readCalls', () => {
  const methods = (text: string) => readCalls(text).map((c) => `${c.method} ${c.path}`);

  it('reads each kind of call with its method', () => {
    expect(methods('a.get(`v1/members/${m}/labtests`);a.delete("v1/members/"+m+"/x",{})')).toEqual([
      'GET v1/members/{}/labtests', 'DELETE v1/members/{}/x',
    ]);
    expect(methods('fetch("/sonline/XAPI/webapi/mac/v1/a",{method:"POST",body:b})')).toEqual(['POST /sonline/XAPI/webapi/mac/v1/a']);
    expect(methods('fetch("/sonline/XAPI/webapi/mac/v1/a")')).toEqual(['GET /sonline/XAPI/webapi/mac/v1/a']);
    expect(methods('$.ajax({type:"POST",url:"/Ajax/Save.ashx",data:{a:[1,2]}})')).toEqual(['POST /Ajax/Save.ashx']);
    expect(methods('api.request({url:`v2/members/${m}/r`,method:"put"})')).toEqual(['PUT v2/members/{}/r']);
    expect(methods('x.open("POST","/online/Handlers/A.ashx?b="+c)')).toEqual(['POST /online/Handlers/A.ashx?b={}']);
  });

  it('leaves out what is not a request', () => {
    expect(methods('window.open("/online/Pages/P.aspx");fs.open(p,"r");a.get(url);refetch("x")')).toEqual([]);
  });
});

describe('chunkFiles', () => {
  it('names the lazy chunks of a runtime, under its public path', () => {
    const runtime = 'r.p="/sonline/medicalFile/";r.u=e=>"static/js/async/"+(({354:"lib-axios"})[e]||e)+"."+({354:"1343e675",337:"9a8b7c6d"})[e]+".js"';
    expect([...chunkFiles(runtime)].sort()).toEqual([
      '/sonline/medicalFile/static/js/async/337.9a8b7c6d.js',
      '/sonline/medicalFile/static/js/async/lib-axios.1343e675.js',
    ]);
  });

  it('places a chunk with no public path beside the script that named it', () => {
    const [file] = chunkFiles('r.u=e=>"static/js/async/"+e+"."+({337:"9a8b7c6d"})[e]+".js"');
    expect(chunkUrl(file, 'https://online.maccabi4u.co.il/sonline/static/js/index.js')).toBe(
      'https://online.maccabi4u.co.il/sonline/static/js/async/337.9a8b7c6d.js',
    );
  });
});

// One observation of a node, as rea writes it.
const node = (kind: string, properties: object, source = 'app/static/js/a.js', line = 1, column = 0) => ({
  kind,
  observations: [{ properties, evidence: { location: { available: true, value: { source, start: { line, column } } } } }],
});
const result = {
  normalized_result: {
    graph: {
      nodes: [
        node('endpoint', { endpoint_kind: 'network', value: 'v1/members/settings', mechanism: 'call:n.post' }, 'app/static/js/a.js', 1, 4),
        node('endpoint', { endpoint_kind: 'network', value: 'cell', mechanism: 'call:m.get' }),
        node('endpoint', { endpoint_kind: 'route', value: 'labs/:id', mechanism: 'property:path' }),
        node('javascript-chunk', { path: 'app/static/js/a.js', chunk_keys: ['1'] }),
        node('javascript-chunk', { chunk_key: '9', resolution_status: 'not-found' }),
        node('javascript-asset', { path: 'app/static/js/a.js', file_kind: 'javascript', parse_status: 'complete' }),
        node('javascript-asset', { path: 'app/static/js/b.js', file_kind: 'javascript', parse_status: 'failed' }),
        node('source-map', { declared_url: 'a.js.map' }),
      ],
      edges: [
        { relation: 'imports', properties: { kind: 'dynamic-import', specifier: 'chunk:1' }, evidence: { location: { value: { source: 'app/static/js/a.js' } } } },
        { relation: 'imports', properties: { kind: 'dynamic-import', specifier: 'chunk:9' }, evidence: { location: { value: { source: 'app/static/js/a.js' } } } },
        { relation: 'imports', properties: { kind: 'require', specifier: '2' }, evidence: { location: { value: { source: 'app/static/js/a.js' } } } },
      ],
    },
  },
};

describe('readEvidence', () => {
  const evidence = readEvidence(result);

  it('takes the calls, routes, chunks and coverage out of a rea result', () => {
    expect(evidence.endpoints.map((e) => `${e.call} ${e.path} ${e.file}:${e.line}:${e.column}`)).toEqual([
      'n.post v1/members/settings app/static/js/a.js:1:5', 'm.get cell app/static/js/a.js:1:1',
    ]);
    expect([...evidence.routes]).toEqual(['labs/:id']);
    expect(evidence.parsed).toBe(1);
    expect(evidence.unparsed).toEqual(['app/static/js/b.js']);
    expect(evidence.sourceMaps.map((m) => m.url)).toEqual(['a.js.map']);
  });

  it('finds the chunks the code loads that were not read', () => {
    expect(missingChunks(evidence)).toEqual([{ build: 'app', keys: ['9'] }]);
  });

  it('is empty for a result with no graph', () => {
    expect(readEvidence({}).endpoints).toEqual([]);
  });
});

describe('candidates', () => {
  const text = 'n.post("v1/members/settings",{});n.get(`LabsAPI/v1/members/${m}/labtests`);m.get("cell");'
    + 'const T={orders:"PharmacyAPI/webapi/mac/v1/orders"};const base="LabsAPI/v1/members/";';
  const all = candidates(new Map([['app/static/js/a.js', text]]), readEvidence(result), known);
  const line = (path: string) => all.find((c) => c.path === path);

  it('says how each was found, and what endpoints.json already has', () => {
    expect(line('v1/members/settings')).toMatchObject({ method: 'POST', proof: 'ast', known: false, where: 'app/static/js/a.js:1:5' });
    expect(line('LabsAPI/v1/members/{}/labtests')).toMatchObject({ method: 'GET', proof: 'call', known: true });
    expect(line('PharmacyAPI/webapi/mac/v1/orders')).toMatchObject({ method: null, proof: 'named', known: false });
  });

  it('leaves out a map key, and a string that is a piece of a call', () => {
    expect(line('cell')).toBeUndefined();
    expect(line('LabsAPI/v1/members/')).toBeUndefined();
  });
});

describe('the rest', () => {
  it('knows a legacy handler written from /online/ down', () => {
    expect(isKnown('/Ajax/GetVisits.ashx', known)).toBe(true);
    expect(isKnown('/Ajax/GetOther.ashx', known)).toBe(false);
  });

  it('counts lines and columns from 1', () => {
    const where = locator('ab\ncd\r\nef');
    expect([where.at(0), where.at(4), where.at(8)]).toEqual(['1:1', '2:2', '3:2']);
  });

  it('groups files within a size and a count', () => {
    const sizes = new Map([['a', 10], ['b', 10], ['c', 25], ['d', 1]]);
    expect(batches(sizes, 20, 2)).toEqual([['a', 'b'], ['c'], ['d']]);
  });
});
