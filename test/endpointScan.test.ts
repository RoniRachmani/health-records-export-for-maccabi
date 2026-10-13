// scripts/endpoint-scan.mjs lists what the site's own scripts can call. What it decides, apart from the
// browser and the rea process, is in endpoint-scan-lib.mjs: these run it on made-up scripts, and on a
// result shaped as rea 6.4.0 writes one.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  batches, builtString, candidates, chunkFiles, chunkUrl, coverage, isKnown, knownFrom, literals, locator, mappedRequests, pathLike, readCalls, readEvidence,
  routesIn,
} from '../scripts/endpoint-scan-lib.mjs';

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

  it('is null for a test of a string', () => {
    expect(builtString('"Case"===r')).toBeNull();
  });
});

describe('literals', () => {
  const values = (text: string) => literals(text).map((s) => s.value);

  it('keeps its place after a string too short or too long to be an address', () => {
    expect(values('x="";get("v1/banks/{0}/{1}",e)')).toEqual(['v1/banks/{0}/{1}']);
    expect(values('x="a";y=\'\';get("v1/banks/{0}/{1}",e)')).toEqual(['v1/banks/{0}/{1}']);
    expect(values(`x="${'z'.repeat(301)}";get("v1/banks/{0}/{1}",e)`)).toEqual(['v1/banks/{0}/{1}']);
    expect(values('x="";get("v1/banks/{0}/{1}",e)').filter(pathLike)).toEqual(['v1/banks/{0}/{1}']);
  });

  it('gives a template with {} for its parts, and the strings inside them', () => {
    expect(values('a=`v1/members/${f("v1/inner")}/x`')).toEqual(['v1/members/{}/x', 'v1/inner']);
  });

  it('steps over comments and regular expressions, whose quotes open nothing', () => {
    expect(values('// don\'t\nx.replace(/"/g,"&quot;");/* it\'s */get("v1/a/b")')).toEqual(['&quot;', 'v1/a/b']);
    expect(values('a=b/2;c="v1/a/b";d=e/f')).toEqual(['v1/a/b']);
    expect(values('if(/^https?:\\/\\//.test(u))get("v1/a/b")')).toEqual(['v1/a/b']);
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

  it('follows a path formatted into a variable, after the service base the site\'s client takes first', () => {
    const text = 'let{rest:e_}=T.A,ed="/sonline/VisitsAPI/webapi/mac/";function a(e){let s=eu()("v1/members/{0}/{1}/visits",e.c,e.i);return e_.get(ed,s,{})}'
      + 'function b(e){let t={data:{a:1}},s=eu()("v1/members/{0}/{1}/visits/{2}/read",e.c,e.i,e.v);return e_.patch(ed,s,t)}'
      + 'function c(e){return e_.post(ed,"v1/logs/client_error",{})}function d(e){return e_.get(ed,e.path,{})}';
    expect(methods(text)).toEqual([
      'GET /sonline/VisitsAPI/webapi/mac/v1/members/{0}/{1}/visits',
      'PATCH /sonline/VisitsAPI/webapi/mac/v1/members/{0}/{1}/visits/{2}/read',
      'POST /sonline/VisitsAPI/webapi/mac/v1/logs/client_error',
    ]);
  });

  it('reads a call once for each side of a conditional address', () => {
    const text = 'let b="/sonline/DocAPI/webapi/mac/";function a(e){let s=eu()((null==e?void 0:e.isV2)?"v2/members/{0}/{1}/drugs":"v1/members/{0}/{1}/drugs",e.c,e.i);return r.get(b,s,{})}'
      + 'function p(e,i){let a=i?"v3/members/{0}/{1}?checksum={2}":"v2/members/{0}/{1}?checksum={2}",s=eu()(a,e.c,e.i,e.k);return r.post(b,s,{})}';
    expect(methods(text)).toEqual([
      'GET /sonline/DocAPI/webapi/mac/v2/members/{0}/{1}/drugs',
      'GET /sonline/DocAPI/webapi/mac/v1/members/{0}/{1}/drugs',
      'POST /sonline/DocAPI/webapi/mac/v3/members/{0}/{1}?checksum={2}',
      'POST /sonline/DocAPI/webapi/mac/v2/members/{0}/{1}?checksum={2}',
    ]);
  });

  it('does not take the string a conditional tests for its value', () => {
    const text = 'function a(r,s,t,n){let i="";i="Case"===r?I()("v1/members/{0}/{1}/cases/{2}",s,t,n):I()("v1/members/{0}/{1}/service_requests/{2}",s,t,n),eB.put("/sonline/ReqAPI/webapi/mac/",i,{})}';
    expect(methods(text)).toEqual([
      'PUT /sonline/ReqAPI/webapi/mac/v1/members/{0}/{1}/cases/{2}',
      'PUT /sonline/ReqAPI/webapi/mac/v1/members/{0}/{1}/service_requests/{2}',
    ]);
  });

  it('follows an address a hand-written script puts in a variable, with spaces', () => {
    const text = "var url = jqe.appRoot + '/Ajax/Summary/WsSummaryPage.asmx/OrderAjax';\n\njQuery.ajax({\n  type: \"POST\",\n  url: url,\n  data: d\n});";
    expect(methods(text)).toEqual(['POST {}/Ajax/Summary/WsSummaryPage.asmx/OrderAjax']);
  });

  it('starts an address with the service a legacy script keeps at its top', () => {
    const far = '\n'.repeat(5000);
    const text = `var ajaxUrl = jqe.appRoot + '/Ajax/Drugs/WsDrugs.asmx/';\nPHR.AjaxUrl = jqe.appRoot + '/Ajax/PHR/WsPHR.asmx/';${far}`
      + 'var url = ajaxUrl + "GetAll";\njQuery.ajax({ type: "POST", url: url });\n$.ajax({ type: "POST", url: PHR.AjaxUrl + \'Search\' });';
    expect(methods(text)).toEqual(['POST {}/Ajax/Drugs/WsDrugs.asmx/GetAll', 'POST {}/Ajax/PHR/WsPHR.asmx/Search']);
  });

  it('reads the legacy Angular pages\' own client', () => {
    const text = "var webApiControllerName = 'Mailings';\nreturn webApi.Call(webApiControllerName, 'GetMailings', data, ok, fail,\n { useCache: c == null ? true : c, method: 'POST' });"
      + "webApi.Call(webApiControllerName, 'GetReminders', null, ok, fail );";
    expect(methods(text)).toEqual(['POST /webapi/Mailings/GetMailings/', 'GET /webapi/Mailings/GetReminders/']);
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

  it('names the files a legacy script\'s reference comments lean on, and nothing else in a comment', () => {
    const text = '/// <reference path="jquery-1.9.1.min.js" />\n/// <reference path="../Documentation/General.js" />\n// see "other.js"\nvar a = 1;';
    expect([...chunkFiles(text)]).toEqual(['jquery-1.9.1.min.js', '../Documentation/General.js']);
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
        node('endpoint', { endpoint_kind: 'network', value: '/sonline/LabsAPI/webapi/mac/', mechanism: 'call:r.get' }),
        node('javascript-asset', { path: 'app/static/js/a.js', file_kind: 'javascript', parse_status: 'complete' }),
        node('javascript-asset', { path: 'app/static/js/b.js', file_kind: 'javascript', parse_status: 'failed' }),
        node('javascript-asset', { path: 'app/static/js/c.js', file_kind: 'javascript', parse_status: 'partial' }),
        node('source-map', { declared_url: 'a.js.map' }),
      ],
    },
  },
};

describe('readEvidence', () => {
  const evidence = readEvidence(result);

  it('takes the calls, routes and coverage out of a rea result', () => {
    expect(evidence.endpoints.map((e) => `${e.call} ${e.path} ${e.file}:${e.line}:${e.column}`)).toEqual([
      'n.post v1/members/settings app/static/js/a.js:1:5', 'm.get cell app/static/js/a.js:1:1',
      'r.get /sonline/LabsAPI/webapi/mac/ app/static/js/a.js:1:1',
    ]);
    expect([...evidence.routes]).toEqual(['labs/:id']);
    expect(evidence.parsed).toBe(1);
    expect(evidence.unparsed).toEqual(['app/static/js/b.js']);
    expect(evidence.partial).toEqual(['app/static/js/c.js']);
    expect(evidence.sourceMaps.map((m) => m.url)).toEqual(['a.js.map']);
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

  it('leaves out a map key, a service base alone, and a string that is a piece of a call', () => {
    expect(line('cell')).toBeUndefined();
    expect(line('/sonline/LabsAPI/webapi/mac/')).toBeUndefined();
    expect(line('LabsAPI/v1/members/')).toBeUndefined();
  });

  it('leaves out a piece cut inside the service base', () => {
    const cut = 'let b="/sonline/TestsAPI/webapi/";function a(e){let s=f()("mac/v1/members/{0}/{1}/followed",e.c,e.i);return r.get(b,s,{})}';
    const found = candidates(new Map([['a.js', cut]]), readEvidence({}), known).map((c) => `${c.proof} ${c.path}`);
    expect(found).toEqual(['call /sonline/TestsAPI/webapi/mac/v1/members/{0}/{1}/followed']);
  });
});

describe('coverage', () => {
  const map = {
    sections: {
      labs: [{ method: 'POST', url: 'LabsAPI/v1/members/0/{mid}/labtests' }, { method: 'GET', url: 'LabsAPI/v1/members/0/{mid}/pdf?path=<link>&hash' }],
      letters: [{ method: 'POST', url: '/online/Ajax/Summary/WsSummaryPage.asmx/OrderAjax' }, { method: 'POST', url: '/online/Ajax/PHR/Ws.asmx/Search, then GET /online/Pages/P.aspx?id=<id>' }],
    },
    manual_not_fetched: { 'images/*.zip': 'Viewer handoff GET LabsAPI/pdf/members/0/{mid}/token/<uid>?checksum= works only in a tab.' },
    read_not_collected: { other: { request: 'GET https://viewer.maccabi4u.co.il/studies/<uid>/structure', reason: 'GET LabsAPI/v1/never is prose' } },
  };
  const requests = mappedRequests(map);

  it('reads the requests a map writes out, and where each is', () => {
    expect(requests.map((r) => `${r.method} ${r.path} ${r.where}`)).toEqual([
      'POST LabsAPI/v1/members/0/{mid}/labtests sections.labs', 'GET LabsAPI/v1/members/0/{mid}/pdf sections.labs',
      'POST /online/Ajax/Summary/WsSummaryPage.asmx/OrderAjax sections.letters', 'POST /online/Ajax/PHR/Ws.asmx/Search sections.letters',
      'GET /online/Pages/P.aspx sections.letters', 'GET LabsAPI/pdf/members/0/{mid}/token/<uid> manual_not_fetched',
      'GET https://viewer.maccabi4u.co.il/studies/<uid>/structure read_not_collected.other',
    ]);
  });

  it('says which of them the code still makes', () => {
    const text = 'let b="/sonline/LabsAPI/webapi/mac/";function a(e){let s=f()("v1/members/{0}/{1}/labtests",e.c,e.i);return r.get(b,s,{})}'
      + 'open(f()("v1/members/{0}/{1}/pdf?path={2}&hash={3}",a,b,c,d));'
      + "var url = root + '/Ajax/Summary/WsSummaryPage.asmx/OrderAjax';$.ajax({type:\"POST\",url:url});";
    const found = candidates(new Map([['a.js', text]]), readEvidence({}), known);
    expect(coverage(requests, found).map((r) => `${r.status} ${r.calledAs ?? ''}`.trim())).toEqual([
      'method GET', 'named', 'call POST', 'absent', 'absent', 'absent', 'elsewhere',
    ]);
  });
});

describe('docs/endpoints/scan-baseline.json', () => {
  it('names only requests its maps write out, as the scan prints them', () => {
    const read = (name: string) => JSON.parse(readFileSync(`docs/endpoints/${name}`, 'utf8'));
    const { _note, ...byMap } = read('scan-baseline.json') as Record<string, string[]>;
    expect(_note).toBeTruthy();
    for (const [name, expected] of Object.entries(byMap)) {
      const written = mappedRequests(read(name)).map((r) => `${r.method} ${r.path}`);
      expect(expected.filter((e) => !written.includes(e))).toEqual([]);
    }
  });
});

describe('the rest', () => {
  it('knows a legacy handler written from /online/ down', () => {
    expect(isKnown('/Ajax/GetVisits.ashx', known)).toBe(true);
    expect(isKnown('/Ajax/GetOther.ashx', known)).toBe(false);
  });

  it('reads the page routes a router\'s table spells out', () => {
    expect([...routesIn('[{path:"/HomePage/",element:a},{path:"/go/:url"},{path:""},{path:e.p}]')]).toEqual(['/HomePage/', '/go/:url']);
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
