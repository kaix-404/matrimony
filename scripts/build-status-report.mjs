#!/usr/bin/env node
/**
 * Renders docs/reports/PROJECT_STATUS_TILL_NOW.html from the markdown beside it.
 *
 * The report goes to the client as three files: the markdown we edit, a .txt
 * mirror, and an .html copy that is what they actually read. The .txt and .html
 * are copies, and copies drift — the HTML once reached the client still showing
 * a build from three weeks earlier, contradicting the markdown in the same
 * folder. So the content lives in the markdown and this script produces the HTML
 * from it, which makes them disagree by construction rather than by accident.
 *
 * It deliberately has no dependencies. The report is a handful of headings,
 * paragraphs, bullet lists and tables, and pulling a markdown library in for that
 * would mean a lockfile entry that has to stay working for as long as the report
 * does. Anything outside that subset is rejected loudly instead of being rendered
 * as literal text, so a new construct fails the build rather than shipping
 * `**bold**` markers to the client.
 *
 * The PDF is written only when a converter is installed. There is none on the
 * usual development machine, and a silent skip is how the PDF got three weeks
 * stale in the first place — so the skip is printed, not swallowed.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const markdownPath = join(root, 'docs/reports/PROJECT_STATUS_TILL_NOW.md');
const htmlPath = join(root, 'docs/reports/PROJECT_STATUS_TILL_NOW.html');

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

/** Escapes HTML, then applies the two inline marks the report uses. */
function inline(text) {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return escaped
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

const isBlockStart = (line) => /^(#|\||- )/.test(line);

function render(markdown) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const body = [];
  const counts = { h1: 0, h2: 0, h3: 0, li: 0, tr: 0 };
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') {
      i += 1;
      continue;
    }

    if (line.startsWith('#')) {
      const hashes = line.match(/^#+/)[0].length;
      const text = line.slice(hashes).trim();
      if (hashes > 3) throw new Error(`Heading level ${hashes} is not styled in this template: ${text}`);
      body.push(`<h${hashes}>${inline(text)}</h${hashes}>`);
      counts[`h${hashes}`] += 1;
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
      if (rows.length < 3) throw new Error('A table needs a header, a separator and at least one row');
      const [header, separator, ...rest] = rows;
      if (!separator.every((cell) => /^:?-+:?$/.test(cell))) {
        throw new Error(`Unrecognised table separator: ${separator.join(' | ')}`);
      }
      if (header.length !== separator.length) {
        throw new Error('A table header and its separator disagree on the number of columns');
      }
      for (const row of rest) {
        if (row.length !== header.length) {
          throw new Error(`A table row has ${row.length} cells but the header has ${header.length}`);
        }
      }
      body.push(
        [
          '<table>',
          '<thead>',
          `<tr>${header.map((cell) => `<th>${inline(cell)}</th>`).join('')}</tr>`,
          '</thead>',
          '<tbody>',
          ...rest.map((row) => `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join('')}</tr>`),
          '</tbody>',
          '</table>',
        ].join('\n'),
      );
      counts.tr += 1 + rest.length;
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
          items.push(inline(lines[i].slice(2).trim()));
        } else {
          items[items.length - 1] += ` ${inline(lines[i].trim())}`;
        }
        i += 1;
      }
      body.push(['<ul>', ...items.map((item) => `<li>${item}</li>`), '</ul>'].join('\n'));
      counts.li += items.length;
      continue;
    }

    const paragraph = [];
    while (i < lines.length && lines[i].trim() !== '' && !isBlockStart(lines[i])) {
      paragraph.push(lines[i].trim());
      i += 1;
    }
    const text = inline(paragraph.join(' '));
    const meta = text.startsWith('<strong>Report Date:</strong>') ? ' class="meta"' : '';
    body.push(`<p${meta}>${text}</p>`);
  }

  if (body.length === 0) throw new Error('The markdown rendered nothing');
  return { html: `${head}${body.join('\n')}\n</body>\n</html>\n`, counts };
}

/**
 * The markdown is the source of truth, so a construct this renderer does not
 * understand must fail the build: rendering it as text is how the client ends up
 * reading markup.
 */
function assertNothingUnrendered(markdown, html, counts) {
  const countsInSource = {
    h1: (markdown.match(/^# /gm) ?? []).length,
    h2: (markdown.match(/^## /gm) ?? []).length,
    h3: (markdown.match(/^### /gm) ?? []).length,
    li: (markdown.match(/^- /gm) ?? []).length,
  };
  for (const [key, expected] of Object.entries(countsInSource)) {
    if (counts[key] !== expected) {
      throw new Error(`${key}: rendered ${counts[key]} but the markdown has ${expected}`);
    }
  }
  const bodyHtml = html.slice(html.indexOf('<body>'));
  for (const marker of ['**', '`']) {
    if (bodyHtml.includes(marker)) throw new Error(`Unrendered ${marker} marker left in the output`);
  }
  if (bodyHtml.includes('<ul>') && bodyHtml.split('<ul>').length !== bodyHtml.split('</ul>').length) {
    throw new Error('Unbalanced list tags');
  }
  if (bodyHtml.split('<table>').length !== bodyHtml.split('</table>').length) {
    throw new Error('Unbalanced table tags');
  }
}

function findConverter() {
  for (const [command, args] of [
    ['pandoc', ['--version']],
    ['wkhtmltopdf', ['--version']],
  ]) {
    const probe = spawnSync(command, args, { stdio: 'ignore', shell: process.platform === 'win32' });
    if (probe.status === 0) return command;
  }
  return null;
}

function writePdf(command) {
  const pdfPath = join(root, 'docs/reports/PROJECT_STATUS_TILL_NOW.pdf');
  const [command_, ...args] =
    command === 'pandoc'
      ? ['pandoc', markdownPath, '-o', pdfPath, '--metadata', 'title=Networth Matrimony - Project Status Report']
      : ['wkhtmltopdf', '--print-media-type', htmlPath, pdfPath];
  const result = spawnSync(command_, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) throw new Error(`${command} failed to produce the PDF`);
  return pdfPath;
}

const markdown = readFileSync(markdownPath, 'utf8').replace(/^\uFEFF/, '');
const { html, counts } = render(markdown);
assertNothingUnrendered(markdown, html, counts);
writeFileSync(htmlPath, html, 'utf8');
console.log(
  `Wrote ${htmlPath}: ${counts.h2} sections, ${counts.h3} subsections, ${counts.li} items, ${counts.tr} table rows.`,
);

const converter = findConverter();
if (converter === null) {
  console.log(
    'PDF skipped: no pandoc or wkhtmltopdf on PATH. The .pdf beside the other copies is stale until one is installed or the HTML is printed from a browser.',
  );
} else {
  console.log(`Wrote ${writePdf(converter)}.`);
}
