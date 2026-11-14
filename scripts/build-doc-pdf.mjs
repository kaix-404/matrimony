#!/usr/bin/env node
/**
 * Prints a markdown document to PDF, using the same renderer as the status report.
 *
 *   node scripts/build-doc-pdf.mjs docs/ops/store-submission-requirements.md
 *   npm run docs:pdf -- docs/ops/store-submission-requirements.md
 *
 * The HTML it prints is written to the system temp directory rather than beside
 * the document: it is only an intermediate for the print, and a stray copy in the
 * repository would be one more thing to keep in step with the markdown.
 *
 * Anything the renderer does not understand fails the run — see
 * `scripts/lib/markdown-doc.mjs` — so a new markdown construct shows up as an
 * error here rather than as literal `**bold**` in a document somebody sends on.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

import {
  assertNothingLost,
  findConverter,
  parse,
  renderHtml,
  renderText,
  writePdf,
} from './lib/markdown-doc.mjs';

const input = process.argv[2];
if (!input) {
  console.error('Usage: node scripts/build-doc-pdf.mjs <path-to-markdown>');
  process.exit(1);
}

const markdownPath = resolve(input);
const directory = dirname(markdownPath);
const name = basename(markdownPath).replace(/\.md$/i, '');
const pdfPath = join(directory, `${name}.pdf`);

const markdown = readFileSync(markdownPath, 'utf8').replace(/^\uFEFF/, '');
const title = (markdown.match(/^# (.+)$/m) ?? [, name])[1];

const blocks = parse(markdown);
const { html, counts } = renderHtml(blocks, { title });
const text = renderText(blocks);
// The plain-text copy is not written here, but rendering it is the cheapest way
// to prove the document survives the subset in both directions.
assertNothingLost(markdown, html, text, blocks);

const htmlPath = join(tmpdir(), `matrimony-${name}.html`);
writeFileSync(htmlPath, html, 'utf8');

const converter = findConverter();
if (converter === null) {
  throw new Error(
    'No PDF converter available: install pandoc or wkhtmltopdf, or a Chromium browser to print the HTML.',
  );
}

console.log(
  `${counts.heading} headings, ${counts.item} items, ${counts.row} table rows -> ${writePdf(converter, { markdownPath, htmlPath, pdfPath, title })}`,
);
