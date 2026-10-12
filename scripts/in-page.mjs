// Code that a page evaluates, written from Node: the scripts that drive a browser over the DevTools
// Protocol (maccabi-browser.mjs, live-run.mjs, headless-lib.mjs) build expressions as text.

// A value written into such code: JSON, with the characters escaped that JSON leaves alone and
// JavaScript or an HTML parser would read as something else.
const UNSAFE = { '<': '\\u003C', '>': '\\u003E', '/': '\\u002F', '\u2028': '\\u2028', '\u2029': '\\u2029' };
export const lit = (value) => JSON.stringify(value).replace(/[<>/\u2028\u2029]/g, (c) => UNSAFE[c]);

/**
 * A call of `fn` with these arguments, as an expression for the page. `fn` is a function the extension
 * passes to chrome.scripting.executeScript, which has to be self-contained for that too: its source is
 * all the page gets.
 */
export const call = (fn, ...args) => '(' + fn + ')(' + args.map(lit).join(', ') + ')';
