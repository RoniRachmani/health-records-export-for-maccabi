// What scripts/discover-login.mjs prints is pasted back into a conversation, so this is where a value is
// made unprintable. No imports: test/session.test.ts runs it against the forms a secret takes on the wire.

/**
 * Every spelling a secret has in a request as the browser sends it: as typed, JSON-escaped (inside a JSON
 * body, where `"` and `\` are escaped), and URL-encoded (a form body or a query string, where a space may be
 * `%20` or `+`). An empty or missing value has no spelling at all: replacing '' would put the label between
 * every two characters of the text.
 * @param {unknown} value
 * @returns {string[]}
 */
export function spellings(value) {
  if (typeof value !== 'string' || !value) return [];
  const out = new Set([value, JSON.stringify(value).slice(1, -1), encodeURIComponent(value), encodeURIComponent(value).replace(/%20/g, '+')]);
  // Longest first, so a JSON-escaped form is taken whole before its raw substring is.
  return [...out].sort((a, b) => b.length - a.length);
}

/**
 * The redactor for one sign-in's credentials: a function over any text that replaces the password with
 * <PASSWORD>, the ID number with <ID> (also as the portal spells it, with a "0-" prefix and no leading
 * zeros), and anything that looks like a token with <jwt> or <token>. A JSON body is also parsed, and its
 * `password` and `id` fields blanked outright, so a password the patterns might miss is never printed.
 * @param {{ username?: string; password?: string }} [creds]
 * @returns {<T>(text: T) => T}
 */
export function redactor({ username, password } = {}) {
  const labels = [[password, '<PASSWORD>'], [username, '<ID>']];
  const replaceAll = (text) => {
    let out = text;
    for (const [value, label] of labels) for (const s of spellings(value)) out = out.split(s).join(label);
    if (typeof username === 'string' && /^\d+$/.test(username)) {
      out = out.split('0-' + Number.parseInt(username, 10)).join('0-<ID>');
      out = out.split(encodeURIComponent('0-' + Number.parseInt(username, 10))).join('0-<ID>');
    }
    out = out.replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '<jwt>');
    out = out.replace(/\b[A-Za-z0-9+/=_-]{48,}\b/g, '<token>');
    return out;
  };
  return (/** @type {any} */ text) => {
    if (typeof text !== 'string') return text;
    // A JSON body: the credential fields are blanked by name before any pattern looks at it.
    if (/^\s*[[{]/.test(text)) {
      try {
        return replaceAll(JSON.stringify(blankFields(JSON.parse(text))));
      } catch {
        /* not JSON after all: the patterns below */
      }
    }
    return replaceAll(text);
  };
}

const SECRET_FIELDS = new Set(['password', 'id', 'otp', 'code']);

function blankFields(value) {
  if (Array.isArray(value)) return value.map(blankFields);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = SECRET_FIELDS.has(k.toLowerCase()) ? (typeof v === 'string' && v === '' ? '' : '<' + k.toUpperCase() + '>') : blankFields(v);
    return out;
  }
  return value;
}

/**
 * A JSON value reduced to keys and types: {"status":"string","payload":{"SAMLResponse":"string(2048)"}}.
 * @param {unknown} v
 * @param {number} [depth]
 * @returns {unknown}
 */
export function shape(v, depth = 0) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return v.length ? [shape(v[0], depth + 1), ...(v.length > 1 ? ['…' + v.length] : [])] : [];
  if (typeof v === 'object') {
    if (depth > 4) return '{…}';
    const out = {};
    for (const [k, x] of Object.entries(v)) out[k] = shape(x, depth + 1);
    return out;
  }
  if (typeof v === 'string') return 'string' + (v.length > 24 ? '(' + v.length + ')' : v === '' ? '(empty)' : '');
  return typeof v;
}
