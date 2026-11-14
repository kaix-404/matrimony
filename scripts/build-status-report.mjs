#!/usr/bin/env node
/**
 * Renders the client status report's HTML, plain-text and PDF copies from the
 * markdown, and records the counts that must not be typed by hand.
 *
 * The report goes to the client as copies of one markdown file. Copies drift —
 * the HTML once reached the client still showing a build from three weeks
 * earlier, contradicting the markdown in the same folder — so the content lives
 * in the markdown and this script produces the others from it, which makes them
 * disagree by construction rather than by accident.
 *
 * THE COUNTS ARE MEASURED
 * -----------------------
 * The number of tests, the number of suites and the size of the permission
 * catalogue used to be edited by hand, and they were wrong between the commit
 * that changed the code and the commit that remembered to change the number. So
 * they are read from the runs themselves: each workspace's `npm test` writes
 * Jest's own JSON result to `.jest-results.json`, the permission count is read
 * from the catalogue the API seeds from, and this script rewrites the markdown's
 * figures from those sources before rendering. Running it without a test run
 * fails with an instruction rather than a stale number.
 *
 * The rendering — parser, HTML, text and the print path — lives in
 * `scripts/lib/markdown-doc.mjs`, shared with `build-doc-pdf.mjs` so a second
 * document cannot drift from this one in how it is laid out.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  TEXT_WIDTH,
  assertNothingLost,
  findConverter,
  parse,
  renderHtml,
  renderText,
  writePdf,
} from './lib/markdown-doc.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const reportDir = join(root, 'docs/reports');
const markdownPath = join(reportDir, 'PROJECT_STATUS_TILL_NOW.md');
const htmlPath = join(reportDir, 'PROJECT_STATUS_TILL_NOW.html');
const textPath = join(reportDir, 'PROJECT_STATUS_TILL_NOW.txt');
const pdfPath = join(reportDir, 'PROJECT_STATUS_TILL_NOW.pdf');

const TITLE = 'Networth Matrimony - Project Status Report';

/** The workspaces whose tests the report counts, in the order it names them. */
const WORKSPACES = [
  { label: 'API', dir: 'apps/api' },
  { label: 'Admin', dir: 'apps/admin' },
  { label: 'Shared', dir: 'packages/shared' },
  { label: 'Mobile', dir: 'apps/mobile' },
];

/** Jest's machine-readable result, written by each workspace's `npm test`. */
const RESULTS_FILE = '.jest-results.json';

// ---------------------------------------------------------------------------
// Measured facts
// ---------------------------------------------------------------------------

/**
 * One workspace's test totals, from the JSON its own run wrote.
 *
 * Missing results fail rather than guessing: a report that quietly kept last
 * week's number is exactly what this replaced, and the message says what to run.
 */
function readResults({ label, dir }) {
  const path = join(root, dir, RESULTS_FILE);
  if (!existsSync(path)) {
    throw new Error(
      `No test results in ${dir}/${RESULTS_FILE}. The report's counts are measured, not typed: ` +
        'run `npm test` first (`npm run verify` runs the tests before this script).',
    );
  }
  const results = JSON.parse(readFileSync(path, 'utf8'));
  if (!Number.isInteger(results.numTotalTests) || !Number.isInteger(results.numTotalTestSuites)) {
    throw new Error(`${dir}/${RESULTS_FILE} does not look like a Jest result summary.`);
  }
  return { label, tests: results.numTotalTests, suites: results.numTotalTestSuites };
}

/**
 * How many permission keys exist, read from the catalogue itself.
 *
 * The API seeds the `Permission` table from `ADMIN_PERMISSIONS` and guards are
 * limited to those keys, so this file is the authority on the number. Counting
 * lines inside the object literal is enough — a key that stopped matching the
 * pattern would fail the catalogue's own tests first.
 */
function permissionKeyCount() {
  const path = join(root, 'packages/shared/src/contracts/admin.ts');
  const source = readFileSync(path, 'utf8');
  const start = source.indexOf('export const ADMIN_PERMISSIONS = {');
  const end = source.indexOf('} as const satisfies', start);
  if (start === -1 || end === -1) {
    throw new Error('Could not find the ADMIN_PERMISSIONS catalogue in packages/shared.');
  }
  const keys = source.slice(start, end).match(/^ {2}'[a-z_]+:[a-z_]+': \{$/gm) ?? [];
  if (keys.length === 0) throw new Error('The permission catalogue reported no keys.');
  return keys.length;
}

function measure() {
  const workspaces = WORKSPACES.map(readResults);
  const sum = (key) => workspaces.reduce((total, workspace) => total + workspace[key], 0);

  return {
    tests: sum('tests'),
    suites: sum('suites'),
    permissionKeys: permissionKeyCount(),
    testsBreakdown: workspaces.map((workspace) => `${workspace.tests} ${workspace.label}`),
    suitesBreakdown: workspaces.map((workspace) => `${workspace.suites} ${workspace.label}`),
    counts: workspaces,
  };
}

/**
 * Writes the measured figures into the markdown, which stays the source of truth
 * for everything else.
 *
 * The replacements are anchored rather than free-form: a rewording that loses the
 * phrase fails the build instead of leaving a hand-typed number behind. The table
 * is re-rendered whole, with columns padded to their widest cell, which is how
 * Prettier lays it out — so committing the rewritten markdown does not trip the
 * formatter.
 */
function syncFacts(markdown, metrics) {
  const testsCell = `${metrics.tests} (${metrics.testsBreakdown.join(' + ')})`;
  const suitesCell = `${metrics.suites} (${metrics.suitesBreakdown.join(' + ')})`;

  const lines = markdown.split('\n');
  const headerAt = lines.findIndex((line) => /^\| Metric\s+\| Value\s+\|$/.test(line));
  if (headerAt === -1) throw new Error('Could not find the Key Metrics table');

  let endAt = headerAt;
  while (endAt < lines.length && lines[endAt].startsWith('|')) endAt += 1;

  const rows = lines.slice(headerAt, endAt).map((line) =>
    line
      .trim()
      .replace(/^\||\|$/g, '')
      .split('|')
      .map((cell) => cell.trim()),
  );
  if (rows.length < 3) throw new Error('The Key Metrics table has no rows to update');

  const measured = new Map([
    ['Automated Tests', testsCell],
    ['Test Suites', suitesCell],
    ['Admin Permission Keys', String(metrics.permissionKeys)],
  ]);
  const data = rows.slice(2).map(([key, value]) => [key, measured.get(key) ?? value]);
  const width = (column) => Math.max(...[rows[0], ...data].map((row) => row[column].length));
  const widths = [width(0), width(1)];
  const render = (row) => `| ${row[0].padEnd(widths[0])} | ${row[1].padEnd(widths[1])} |`;

  lines.splice(
    headerAt,
    endAt - headerAt,
    render(rows[0]),
    `| ${'-'.repeat(widths[0])} | ${'-'.repeat(widths[1])} |`,
    ...data.map(render),
  );

  let synced = lines.join('\n');

  const sentence = /All gates are green with \d+ automated tests passing\./;
  if (!sentence.test(synced)) {
    throw new Error('Could not find the sentence that states the automated test count');
  }
  synced = synced.replace(
    sentence,
    `All gates are green with ${metrics.tests} automated tests passing.`,
  );

  const qa = /^- Tests: \d+ passed \(.*\)$/m;
  if (!qa.test(synced)) throw new Error('Could not find the QA "Tests:" line');
  // `1189 passed (773 API + ...)`: the count leads and the breakdown follows, so
  // it cannot simply reuse the table's cell.
  synced = synced.replace(
    qa,
    `- Tests: ${metrics.tests} passed (${metrics.testsBreakdown.join(' + ')})`,
  );

  return synced;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

const metrics = measure();

const original = readFileSync(markdownPath, 'utf8').replace(/^\uFEFF/, '');
const markdown = syncFacts(original, metrics);
if (markdown !== original) {
  writeFileSync(markdownPath, markdown, 'utf8');
  console.log('Recorded the measured counts in the markdown.');
}

const blocks = parse(markdown);
const { html, counts } = renderHtml(blocks, { title: TITLE });
const text = renderText(blocks);
assertNothingLost(markdown, html, text, blocks);

writeFileSync(htmlPath, html, 'utf8');
writeFileSync(textPath, text, 'utf8');
console.log(
  `Wrote the HTML and text copies: ${counts.heading} headings, ${counts.item} items, ${counts.row} table rows, wrapped to ${TEXT_WIDTH} columns.`,
);
console.log(
  `Measured ${metrics.tests} tests in ${metrics.suites} suites (${metrics.counts
    .map((workspace) => `${workspace.label} ${workspace.tests}/${workspace.suites}`)
    .join(', ')}), ${metrics.permissionKeys} permission keys.`,
);

const converter = findConverter();
if (converter === null) {
  console.log(
    'PDF skipped: no pandoc, wkhtmltopdf or Chromium browser found. The .pdf beside the other copies is stale until one is available or the HTML is printed from a browser.',
  );
} else {
  console.log(`Wrote ${writePdf(converter, { markdownPath, htmlPath, pdfPath, title: TITLE })}.`);
}
