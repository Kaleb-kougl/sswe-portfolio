/**
 * INCREMENTAL JSON ARRAY-ITEM EXTRACTOR
 *
 * The model streams one JSON document a few characters at a time:
 *
 *   {"role": "…", "requirements": [ {…}, {…}, … ]}
 *
 * The UI wants each requirement the moment its closing `}` arrives, not when
 * the whole document is done. Re-parsing the growing string on every token is
 * O(n²) and throws on every incomplete prefix, so this is a single-pass
 * character scanner instead: it keeps a bracket stack and string/escape state
 * across chunks, remembers the most recent key of the root object, and
 * buffers only the characters of the item currently being read. Total work is
 * O(length of the stream), independent of how the stream is chunked.
 *
 * It does NOT validate JSON. It finds item boundaries; the caller runs
 * `JSON.parse` + the contract's Zod schema on each item, and on the whole
 * document at the end. With constrained decoding the input is well-formed
 * anyway; without it, a malformed item simply fails that later parse.
 *
 * Handled: chunk boundaries anywhere (inside strings, inside escapes, between
 * a key and its colon), escaped quotes and backslashes, brackets inside
 * strings, nested arrays/objects inside an item (e.g. `skills: [...]`),
 * primitive items, leading text before the root `{` (e.g. a stray code
 * fence), and anything after the root closes (ignored).
 *
 * Pure: no DOM, no WebGPU. Runs in the worker; unit-tested in vitest.
 */

export interface ArrayItemExtractor {
  /** Feed the next chunk; returns the raw JSON text of every item it completed. */
  push(chunk: string): string[];
  /** True once the root object has closed. */
  readonly done: boolean;
}

const WHITESPACE = new Set([' ', '\t', '\n', '\r']);

/**
 * @param key the property of the ROOT object whose array items to emit
 *   (nested properties with the same name are ignored).
 */
export function createArrayItemExtractor(key: string): ArrayItemExtractor {
  /** Open brackets, innermost last. Index 0 is the root `{`. */
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  let rootClosed = false;

  // Key tracking at root depth: a string directly inside the root object is
  // either a key or a value. `pendingKey` is set when a string is followed by
  // `:`, i.e. we know the next value belongs to that key.
  let rootString: string | null = null; // chars of the string being read at depth 1
  let lastRootString: string | null = null;
  let pendingKey: string | null = null;

  /** Stack depth of the target array when we are inside it (else -1). */
  let targetDepth = -1;

  // The item currently being collected.
  let item: string | null = null;
  /** 'container' items end when their bracket closes; primitives at `,` / `]`. */
  let itemKind: 'container' | 'primitive' = 'container';

  const out: string[] = [];

  function finishItem() {
    if (item !== null) {
      const text = item.trim();
      if (text.length > 0) out.push(text);
    }
    item = null;
  }

  function step(ch: string) {
    if (rootClosed) return;

    // Before the root object opens, skip anything that is not `{`.
    if (stack.length === 0) {
      if (ch === '{') stack.push('{');
      return;
    }

    const atArrayLevel = targetDepth !== -1 && stack.length === targetDepth;

    // ---- inside a string --------------------------------------------------
    if (inString) {
      if (item !== null) item += ch;
      if (escaped) {
        escaped = false;
        if (rootString !== null) rootString += ch;
        return;
      }
      if (ch === '\\') {
        escaped = true;
        if (rootString !== null) rootString += ch;
        return;
      }
      if (ch === '"') {
        inString = false;
        if (rootString !== null) {
          lastRootString = rootString;
          rootString = null;
        }
        return;
      }
      if (rootString !== null) rootString += ch;
      return;
    }

    // ---- a primitive item ends at `,` or `]` of the target array ----------
    if (atArrayLevel && item !== null && itemKind === 'primitive' && (ch === ',' || ch === ']')) {
      finishItem();
      // fall through: `]` still has to close the array below
    }

    // ---- starting a new item? --------------------------------------------
    if (atArrayLevel && item === null && !WHITESPACE.has(ch) && ch !== ',' && ch !== ']') {
      item = '';
      itemKind = ch === '{' || ch === '[' ? 'container' : 'primitive';
    }

    if (item !== null) item += ch;

    switch (ch) {
      case '"':
        inString = true;
        // Only strings directly in the root object are candidate keys.
        if (stack.length === 1) rootString = '';
        return;
      case ':':
        if (stack.length === 1) pendingKey = lastRootString;
        return;
      case ',':
        if (stack.length === 1) pendingKey = null;
        return;
      case '{':
      case '[': {
        const valueOfTarget = stack.length === 1 && ch === '[' && pendingKey === key;
        stack.push(ch);
        if (valueOfTarget) {
          targetDepth = stack.length;
          // The `[` itself is not part of any item.
          item = null;
        }
        return;
      }
      case '}':
      case ']': {
        stack.pop();
        if (targetDepth !== -1 && stack.length === targetDepth && item !== null && itemKind === 'container') {
          // Closed a container item.
          finishItem();
        } else if (targetDepth !== -1 && stack.length < targetDepth) {
          // Closed the target array itself.
          targetDepth = -1;
          item = null;
          pendingKey = null;
        }
        if (stack.length === 0) rootClosed = true;
        return;
      }
      default:
        return;
    }
  }

  return {
    push(chunk: string): string[] {
      out.length = 0;
      for (let i = 0; i < chunk.length; i++) step(chunk[i]);
      return out.slice();
    },
    get done() {
      return rootClosed;
    },
  };
}
