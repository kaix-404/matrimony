#!/usr/bin/env node
/**
 * Renders the client status report's HTML and plain-text copies from the markdown,
 * and records the counts that must not be typed by hand.
 *
 * The report goes to the client in three files: the markdown we edit, a .txt
 * mirror, and an .html copy that is what they actually read. The .txt and .html
 * are copies, and copies drift — the HTML once reached the client still showing a
 * build from three weeks earlier, contradicting the markdown in the same folder.
 * So the content lives in the markdown and this script produces both copies from
 * it, which makes them disagree by construction rather than by accident.
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
 * It deliberately has no dependencies. The report is a handful of headings,
 * paragraphs, bullet lists and tables, and pulling a markdown library in for that
 * would mean a lockfile entry that has to stay working for as long as the report
 * does. Anything outside that subset is rejected loudly instead of being rendered
 * as literal text, so a new construct fails the build rather than shipping
 * `**bold**` markers to the client.
 *
 * The HTML is what gets printed, so it carries the A4 stylesheet; the .txt is the
 * same content wrapped to a terminal width, for reading in an editor or a mail
 * client that mangles HTML. Both are outputs and are ignored by git, so the
 * markdown is the only copy anyone can edit — the drift this replaced came from
 * three committed copies competing to be the real one.
 *
 * The PDF is written only when a converter is installed. There is none on the
 * usual development machine, and a silent skip is how the PDF got three weeks
 * stale in the first place — so the skip is printed, not swallowed.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const reportDir = join(root, 'docs/reports');
const markdownPath = join(reportDir, 'PROJECT_STATUS_TILL_NOW.md');
const htmlPath = join(reportDir, 'PROJECT_STATUS_TILL_NOW.html');
const textPath = join(reportDir, 'PROJECT_STATUS_TILL_NOW.txt');

/** The plain-text copies wrap here, which keeps them readable in an 80+ column view. */
const TEXT_WIDTH = 96;

/** The workspaces whose tests the report counts, in the order it names them. */
const WORKSPACES = [
  { label: 'API', dir: 'apps/api' },
  { label: 'Admin', dir: 'apps/admin' },
  { label: 'Shared', dir: 'packages/shared' },
  { label: 'Mobile', dir: 'apps/mobile' },
];

/** Jest's machine-readable result, written by each workspace's `npm test`. */
const RESULTS_FILE = '.jest-results.json';

/**
 * A4 print styling, so the HTML and the printed PDF are the same document: the
 * page box, the sizes and the table rules all exist for the printed copy.
 */
const head = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Networth Matrimony - Project Status Report</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Arial, sans-serif; color: #1a1a1a; font-size: 11px; line-height: 1.5; margin: 0; }
  h1 { font-size: 22px; margin: 0 0 4px; color: #6b1f3a; }
  h2 { font-size: 14px; margin: 22px 0 6px; padding-bottom: 3px; border-bottom: 2px solid #6b1f3a; color: #6b1f3a; }
  h3 { font-size: 12px; margin: 14px 0 4px; color: #333; }
  .meta { color: #555; font-size: 10.5px; margin: 0 0 4px; }
  p { margin: 6px 0; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0; }
  th, td { border: 1px solid #d0d0d0; padding: 5px 8px; text-align: left; vertical-align: top; }
  th { background: #f3e7ec; color: #4a1528; font-weight: 600; }
  tr:nth-child(even) td { background: #fafafa; }
  ul { margin: 6px 0 6px 18px; padding: 0; }
  li { margin: 3px 0; }
  code { background: #f0f0f0; padding: 1px 4px; border-radius: 3px; font-family: Consolas, monospace; font-size: 10px; }
  .pill { display: inline-block; padding: 1px 6px; border-radius: 8px; font-size: 9.5px; font-weight: 600; }
  .done { background: #d8f0dd; color: #1d6b31; }
  .wip { background: #fdecc8; color: #8a5a00; }
  .plan { background: #e4e4e4; color: #555; }
</style>
</head>
<body>
`;

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
// Parsing: one parser, two renderers, so both copies describe the same document
// ---------------------------------------------------------------------------

const isBlockStart = (line) => /^(#|\||- )/.test(line);

/**
 * Turns the markdown into blocks of plain text.
 *
 * Inline marks (`code`, **bold**) are left in place here and handled per
 * renderer: HTML turns them into tags, text strips them. Parsing twice instead
 * would be two chances to disagree about what the document says.
 */
function parse(markdown) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') {
      i += 1;
      continue;
    }

    if (line.startsWith('#')) {
      const hashes = line.match(/^#+/)[0].length;
      if (hashes > 3) throw new Error(`Heading level ${hashes} is not styled: ${line}`);
      blocks.push({ type: 'heading', level: hashes, text: line.slice(hashes).trim() });
      i += 1;
      continue;
    }

    if (line.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        rows.push(
          lines[i]
            .trim()
            .replace(/^\||\|$/g, '')
            .split('|')
            .map((cell) => cell.trim()),
        );
        i += 1;
      }
      if (rows.length < 3)
        throw new Error('A table needs a header, a separator and at least one row');
      const [header, separator, ...body] = rows;
      if (!separator.every((cell) => /^:?-+:?$/.test(cell))) {
        throw new Error(`Unrecognised table separator: ${separator.join(' | ')}`);
      }
      for (const row of [header, ...body]) {
        if (row.length !== header.length) {
          throw new Error(
            `A table row has ${row.length} cells but the header has ${header.length}`,
          );
        }
      }
      blocks.push({ type: 'table', header, rows: body });
      continue;
    }

    if (line.startsWith('- ')) {
      // A wrapped bullet is indented rather than starting a new one; joining it
      // keeps a long sentence in the item it belongs to.
      const items = [];
      while (
        i < lines.length &&
        (lines[i].startsWith('- ') || (lines[i].startsWith('  ') && lines[i].trim() !== ''))
      ) {
        if (lines[i].startsWith('- ')) {
          items.push(lines[i].slice(2).trim());
        } else {
          items[items.length - 1] += ` ${lines[i].trim()}`;
        }
        i += 1;
      }
      blocks.push({ type: 'list', items });
      continue;
    }

    // A paragraph, joined back together from its wrapped lines.
    const paragraph = [];
    while (i < lines.length && lines[i].trim() !== '' && !isBlockStart(lines[i])) {
      paragraph.push(lines[i].trim());
      i += 1;
    }
    blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
  }

  if (blocks.length === 0) throw new Error('The markdown rendered nothing');
  return blocks;
}

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

/** Escapes HTML, then applies the two inline marks the report uses. */
function inlineHtml(text) {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return escaped
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

function renderHtml(blocks) {
  const body = [];
  const counts = { heading: 0, item: 0, row: 0 };

  for (const block of blocks) {
    if (block.type === 'heading') {
      body.push(`<h${block.level}>${inlineHtml(block.text)}</h${block.level}>`);
      counts.heading += 1;
    } else if (block.type === 'table') {
      body.push(
        [
          '<table>',
          '<thead>',
          `<tr>${block.header.map((cell) => `<th>${inlineHtml(cell)}</th>`).join('')}</tr>`,
          '</thead>',
          '<tbody>',
          ...block.rows.map(
            (row) => `<tr>${row.map((cell) => `<td>${inlineHtml(cell)}</td>`).join('')}</tr>`,
          ),
          '</tbody>',
          '</table>',
        ].join('\n'),
      );
      counts.row += 1 + block.rows.length;
    } else if (block.type === 'list') {
      body.push(
        ['<ul>', ...block.items.map((item) => `<li>${inlineHtml(item)}</li>`), '</ul>'].join('\n'),
      );
      counts.item += block.items.length;
    } else {
      const text = inlineHtml(block.text);
      const meta = text.startsWith('<strong>Report Date:</strong>') ? ' class="meta"' : '';
      body.push(`<p${meta}>${text}</p>`);
    }
  }

  return { html: `${head}${body.join('\n')}\n</body>\n</html>\n`, counts };
}

// ---------------------------------------------------------------------------
// Plain text
// ---------------------------------------------------------------------------

/** Drops the inline marks that only mean something to a renderer. */
function inlineText(text) {
  return text.replace(/`([^`]+)`/g, '$1').replace(/\*\*([^*]+)\*\*/g, '$1');
}

/** Greedy word wrap; a word longer than the column is split rather than allowed to run on. */
function wrap(text, width) {
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (word.length > width) {
      if (line !== '') {
        lines.push(line);
        line = '';
      }
      for (let at = 0; at < word.length; at += width) lines.push(word.slice(at, at + width));
      continue;
    }
    if (line === '') {
      line = word;
    } else if (`${line} ${word}`.length <= width) {
      line += ` ${word}`;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line !== '') lines.push(line);
  return lines.length === 0 ? [''] : lines;
}

/**
 * Lays a table out as aligned columns.
 *
 * Columns are sized from their own content but capped, then every cell is wrapped
 * into the space it got: a deliverables column left at its natural width would
 * push the other three off the page.
 */
function renderTable(block) {
  const columns = block.header.length;
  const gap = '  ';
  const usable = TEXT_WIDTH - gap.length * (columns - 1);
  const cap = columns <= 2 ? usable : Math.max(12, Math.floor(usable / columns));
  const widths = block.header.map((_, column) => {
    const content = [block.header, ...block.rows]
      .map((row) => inlineText(row[column]).length)
      .concat([block.header[column].length]);
    return Math.min(Math.max(...content), cap);
  });
  // Give unused width back to the last column rather than leaving a ragged edge.
  const spent = widths.reduce((total, width) => total + width, 0);
  if (spent < usable && columns > 1) widths[columns - 1] += usable - spent;

  const lines = [];
  for (const row of [block.header, ...block.rows]) {
    const cells = row.map((cell, column) => wrap(inlineText(cell), widths[column]));
    const height = Math.max(...cells.map((cell) => cell.length));
    for (let at = 0; at < height; at += 1) {
      const line = cells
        .map((cell, column) => (cell[at] ?? '').padEnd(widths[column]))
        .join(gap)
        .trimEnd();
      lines.push(line);
    }
  }
  return lines;
}

function renderText(blocks) {
  const out = [];
  const blank = () => {
    if (out.length > 0 && out[out.length - 1] !== '') out.push('');
  };

  for (const block of blocks) {
    if (block.type === 'heading') {
      blank();
      const text = inlineText(block.text);
      out.push(block.level === 3 ? text : text.toUpperCase());
      out.push('');
      continue;
    }
    if (block.type === 'table') {
      blank();
      out.push(...renderTable(block));
      out.push('');
      continue;
    }
    if (block.type === 'list') {
      blank();
      for (const item of block.items) {
        const lines = wrap(inlineText(item), TEXT_WIDTH - 4);
        out.push(`  - ${lines[0]}`);
        for (const line of lines.slice(1)) out.push(`    ${line}`);
      }
      out.push('');
      continue;
    }
    blank();
    out.push(...wrap(inlineText(block.text), TEXT_WIDTH));
    out.push('');
  }

  while (out.length > 0 && out[out.length - 1] === '') out.pop();
  return `${out.join('\n')}\n`;
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

/**
 * The markdown is the source of truth, so a construct this renderer does not
 * understand must fail the build: rendering it as text is how the client ends up
 * reading markup, and dropping it is how a section silently disappears.
 */
function assertNothingLost(markdown, html, text, blocks) {
  const headings = (level) =>
    (markdown.match(new RegExp(`^${'#'.repeat(level)} `, 'gm')) ?? []).length;
  const items = (markdown.match(/^- /gm) ?? []).length;

  const htmlCounts = {
    1: (html.match(/<h1>/g) ?? []).length,
    2: (html.match(/<h2>/g) ?? []).length,
    3: (html.match(/<h3>/g) ?? []).length,
  };
  for (const level of [1, 2, 3]) {
    if (htmlCounts[level] !== headings(level)) {
      throw new Error(
        `HTML h${level}: rendered ${htmlCounts[level]}, markdown has ${headings(level)}`,
      );
    }
  }
  const bodyHtml = html.slice(html.indexOf('<body>'));
  if ((bodyHtml.match(/<li>/g) ?? []).length !== items) {
    throw new Error('HTML list items do not match the markdown');
  }
  for (const marker of ['**', '`']) {
    if (bodyHtml.includes(marker)) throw new Error(`Unrendered ${marker} marker left in the HTML`);
  }
  if (bodyHtml.split('<ul>').length !== bodyHtml.split('</ul>').length) {
    throw new Error('Unbalanced list tags');
  }
  if (bodyHtml.split('<table>').length !== bodyHtml.split('</table>').length) {
    throw new Error('Unbalanced table tags');
  }

  // The text copy has no tags to count, so it is checked by its section titles:
  // every heading in the document has to appear in it.
  for (const block of blocks.filter((each) => each.type === 'heading')) {
    const expected =
      block.level === 3 ? inlineText(block.text) : inlineText(block.text).toUpperCase();
    if (!text.includes(expected)) throw new Error(`The text copy is missing "${expected}"`);
  }
  if (text.includes('**') || text.includes('`')) {
    throw new Error('Unrendered inline marker left in the text copy');
  }
  const overlong = text
    .split('\n')
    .map((line, index) => ({ line, number: index + 1 }))
    .filter(({ line }) => line.length > TEXT_WIDTH);
  if (overlong.length > 0) {
    throw new Error(`The text copy has ${overlong.length} line(s) over ${TEXT_WIDTH} columns`);
  }
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function findConverter() {
  for (const [command, args] of [
    ['pandoc', ['--version']],
    ['wkhtmltopdf', ['--version']],
  ]) {
    const probe = spawnSync(command, args, {
      stdio: 'ignore',
      shell: process.platform === 'win32',
    });
    if (probe.status === 0) return command;
  }
  return null;
}

function writePdf(command) {
  const pdfPath = join(reportDir, 'PROJECT_STATUS_TILL_NOW.pdf');
  const [name, ...args] =
    command === 'pandoc'
      ? [
          'pandoc',
          markdownPath,
          '-o',
          pdfPath,
          '--metadata',
          'title=Networth Matrimony - Project Status Report',
        ]
      : ['wkhtmltopdf', '--print-media-type', htmlPath, pdfPath];
  const result = spawnSync(name, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) throw new Error(`${command} failed to produce the PDF`);
  return pdfPath;
}

const metrics = measure();

const original = readFileSync(markdownPath, 'utf8').replace(/^\uFEFF/, '');
const markdown = syncFacts(original, metrics);
if (markdown !== original) {
  writeFileSync(markdownPath, markdown, 'utf8');
  console.log('Recorded the measured counts in the markdown.');
}

const blocks = parse(markdown);
const { html, counts } = renderHtml(blocks);
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
    'PDF skipped: no pandoc or wkhtmltopdf on PATH. The .pdf beside the other copies is stale until one is installed or the HTML is printed from a browser.',
  );
} else {
  console.log(`Wrote ${writePdf(converter)}.`);
}
