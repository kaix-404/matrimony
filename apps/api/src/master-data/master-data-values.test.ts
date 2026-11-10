import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CASTE_VALUES,
  EDUCATION_VALUES,
  MOTHER_TONGUE_VALUES,
  PROFESSION_VALUES,
  RELIGION_VALUES,
  STATE_VALUES,
  type MasterListValueSeed,
} from '../../prisma/master-data-values';

/**
 * The seeded lists against the client's own files.
 *
 * The arrays in `master-data-values.ts` are transcribed by hand from
 * `docs/Data Points list/`, so a dropped line or a label put under the wrong
 * religion is invisible at runtime: the picker simply offers less than the
 * client asked for, and the member never knows. Comparing the transcription to
 * the source files is the only check that catches that.
 *
 * The files are read from the repository rather than copied, so an edit to
 * either side breaks this test instead of drifting quietly.
 */
const DOCS = join(__dirname, '../../../../docs/Data Points list');

/**
 * The files were pasted from different tools: one uses bare carriage returns,
 * which `\r?\n` alone would leave glued to the following label.
 */
function nonEmptyLines(file: string): string[] {
  return readFileSync(join(DOCS, file), 'utf8')
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * A flat list: the title line, `--group--` headers and the `--More options--`
 * expansion marker carry no value of their own.
 */
function flatValues(file: string): string[] {
  return nonEmptyLines(file)
    .slice(1)
    .filter((line) => !/^--.*--$/.test(line));
}

/**
 * A grouped list: each `--Section--` header owns the lines beneath it.
 *
 * Lines above the first header are the file's quick picks — the same labels
 * are repeated under their real section further down, and the seed files them
 * there, so the preview is compared as part of the grouped list rather than as
 * a section of its own.
 */
function groupedValues(file: string): Array<{ group: string; value: string }> {
  const rows: Array<{ group: string; value: string }> = [];
  let group: string | null = null;
  for (const line of nonEmptyLines(file).slice(1)) {
    const header = /^--(.*)--$/.exec(line);
    if (header) {
      group = header[1];
      continue;
    }
    if (group === null) continue;
    rows.push({ group, value: line });
  }
  return rows;
}

/**
 * The sub-caste file numbers its religion headers ("5 Christian", "12 Jewish"),
 * and two caste names begin with a number themselves ("24 Manai Telugu
 * Chettiar", "96 Kuli Maratha"). A line is a header only when its text — with
 * the number removed — is one of the religions.
 */
function subCasteValues(): Array<{ group: string; value: string }> {
  const religions = new Map(RELIGION_VALUES.map((r) => [r.value.toLowerCase(), r.value]));
  // The last block belongs to no religion: it is offered to every member.
  religions.set('other sub cast', 'Other Sub Cast');
  const rows: Array<{ group: string; value: string }> = [];
  let group = '';
  for (const line of nonEmptyLines('sub cast list.txt').slice(1)) {
    const header = /^\d+\s+(.+)$/.exec(line);
    const religion = header ? religions.get(header[1].trim().toLowerCase()) : undefined;
    if (religion) {
      group = religion;
      continue;
    }
    rows.push({ group, value: line });
  }
  return rows;
}

function seedEntries(values: MasterListValueSeed[]) {
  return values.map((entry) => ({ group: entry.group ?? '', value: entry.value }));
}

function sorted(rows: Array<{ group: string; value: string }>) {
  return [...new Set(rows.map((row) => `${row.group}\u0000${row.value}`))].sort();
}

describe('master list values', () => {
  it.each([
    ['RELIGION', 'Religion List.txt', RELIGION_VALUES],
    ['MOTHER_TONGUE', 'Mother Tounge List.txt', MOTHER_TONGUE_VALUES],
    ['STATE', 'state list.txt', STATE_VALUES],
  ])('seeds every %s the client listed, and nothing else', (_key, file, values) => {
    const doc = flatValues(file)
      .map((value) => ({ group: '', value }))
      .sort((a, b) => a.value.localeCompare(b.value));
    const seeded = seedEntries(values).sort((a, b) => a.value.localeCompare(b.value));

    expect(new Set(seeded.map((entry) => entry.value))).toEqual(
      new Set(doc.map((entry) => entry.value)),
    );
  });

  it('seeds every education under the section the client filed it in', () => {
    expect(sorted(seedEntries(EDUCATION_VALUES))).toEqual(
      sorted(groupedValues('education details list.txt')),
    );
  });

  it('seeds every occupation under the section the client filed it in', () => {
    expect(sorted(seedEntries(PROFESSION_VALUES))).toEqual(
      sorted(groupedValues('occupation list.txt')),
    );
  });

  it('files each sub-caste under the religion whose block it came from', () => {
    // The file's Buddhist and Jewish blocks are empty, which is the client's
    // own state: those members see only the shared Other Sub Cast section.
    expect(sorted(seedEntries(CASTE_VALUES))).toEqual(sorted(subCasteValues()));
  });

  it('leaves no value without a section in the grouped lists', () => {
    for (const entry of [...EDUCATION_VALUES, ...PROFESSION_VALUES, ...CASTE_VALUES]) {
      expect(entry.group).toBeTruthy();
    }
  });
});
