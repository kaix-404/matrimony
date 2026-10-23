import { inflateSync } from 'node:zlib';

/**
 * Best-effort text extraction from a PDF, on `node:zlib` alone.
 *
 * WHY NOT A LIBRARY
 * -----------------
 * The one thing this needs is to inflate FlateDecode streams and pull the
 * strings out of the text operators. A full PDF library is a large dependency
 * with its own CVE surface for a feature that only feeds a suggestion the user
 * reviews anyway, and the codebase already prefers to hand-roll a bounded parser
 * (the TOTP implementation) over pulling a package in. So this does the small
 * useful subset and is explicit about what it cannot do.
 *
 * WHAT IT HANDLES
 * ---------------
 *  - FlateDecode content streams (the common case for a typed/exported PDF).
 *  - The text-showing operators `Tj`, `'`, `"` and `TJ`, which is how every
 *    word processor emits text.
 *  - Literal-string escapes and, at a basic level, the octal form.
 *
 * WHAT IT DOES NOT
 * ----------------
 *  - A scanned image has no text layer, so it yields empty text — the caller
 *    surfaces that as a warning rather than an error, because "your PDF is a
 *    scan" is actionable for the user.
 *  - Object streams (`ObjStm`) and cross-reference streams are not followed;
 *    content streams are usually top-level, and a document that hides them is
 *    rare enough to fail soft.
 *  - Font glyph remapping (a custom encoding/ToUnicode CMaps) is ignored, so a
 *    PDF using a subset font with a non-standard encoding can produce gibberish.
 *    This is why the result is a *proposal*: the user confirms it.
 */

/** Decompresses every FlateDecode stream and returns the concatenated text. */
export function extractPdfText(bytes: Buffer): string {
  const chunks = collectStreams(bytes);
  const parts: string[] = [];
  for (const chunk of chunks) {
    const inflated = inflateStream(chunk);
    if (inflated === null) continue;
    parts.push(extractTextOperators(inflated.toString('latin1')));
  }
  return parts.join('\n');
}

/**
 * Finds `stream ... endstream` runs and returns their raw bytes.
 *
 * Scans the whole file rather than walking the xref: a linear scan is what makes
 * this robust to the several ways a producer may lay the file out, and a PDF's
 * binary streams never contain the literal `endstream` sequence by accident
 * because it is not a valid PDF token inside a stream's data in practice.
 */
function collectStreams(bytes: Buffer): Buffer[] {
  const streams: Buffer[] = [];
  let from = 0;

  for (;;) {
    const start = bytes.indexOf('stream', from, 'latin1');
    if (start === -1) break;

    // Skip the `stream` keyword and the EOL that must follow it (CRLF or LF).
    let dataStart = start + 'stream'.length;
    if (bytes[dataStart] === 0x0d) dataStart += 1;
    if (bytes[dataStart] === 0x0a) dataStart += 1;

    const end = bytes.indexOf('endstream', dataStart, 'latin1');
    if (end === -1) break;

    streams.push(bytes.subarray(dataStart, end));
    from = end + 'endstream'.length;
  }

  return streams;
}

/** Inflate a stream, returning null when it is not zlib data (e.g. already text). */
function inflateStream(stream: Buffer): Buffer | null {
  try {
    return inflateSync(stream);
  } catch {
    // Not Flate-encoded. If it already looks like content (`BT`/`Tj`), keep it;
    // otherwise it is an image or font and holds no text we want.
    const asText = stream.toString('latin1');
    return /\bBT\b|\bTj\b|\bTJ\b/.test(asText) ? Buffer.from(asText, 'latin1') : null;
  }
}

/** Pulls the string arguments out of the text-showing operators. */
function extractTextOperators(content: string): string {
  const out: string[] = [];
  // `Tj` shows one string; `TJ` shows an array of strings and number kerning.
  // `'` and `"` are movement-plus-show. Capturing the parenthesised strings
  // between the operators and inserting a newline per operator is enough for
  // a labelled biodata, where layout is line-oriented anyway.
  const show = /(?:\((?:\\.|[^\\()])*\)|\[[^\]]*\])\s*(?:Tj|TJ|'|")/g;
  const matches = content.match(show);
  if (!matches) return '';

  for (const match of matches) {
    const strings = match.match(/\((?:\\.|[^\\()])*\)/g);
    if (!strings) continue;
    out.push(strings.map((s) => unescapePdfString(s.slice(1, -1))).join(''));
  }
  return out.join('\n');
}

/** Resolves the escapes PDF literal strings may contain. */
function unescapePdfString(raw: string): string {
  return raw.replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (_, esc: string) => {
    switch (esc) {
      case 'n':
        return '\n';
      case 'r':
        return '\r';
      case 't':
        return '\t';
      case 'b':
        return '\b';
      case 'f':
        return '\f';
      case '(':
        return '(';
      case ')':
        return ')';
      case '\\':
        return '\\';
      default: {
        const code = Number.parseInt(esc, 8);
        return Number.isNaN(code) ? esc : String.fromCharCode(code);
      }
    }
  });
}
