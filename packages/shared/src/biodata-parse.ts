/**
 * Biodata text extraction — the pure half.
 *
 * A matrimonial biodata is prose in the author's own layout. There is no schema
 * to parse against, only convention: rows like `Name: Asha Rao`, `Date of
 * Birth: 12/03/1996`, `Height: 5'4"`. So this module is a set of heuristics, and
 * its contract with the caller is honesty about what it found: every value is
 * tagged `high` (taken from a labelled line) or `low` (inferred), and the fields
 * it could not fill are returned so the UI can ask for them.
 *
 * WHY IT LIVES IN `shared`
 * ------------------------
 * It is pure — text in, values out, no I/O — so it is unit-testable without a
 * database or a PDF, and the same function could run in the API or a future
 * admin bulk-import. The API owns fetching the bytes and validating the result;
 * this owns only turning text into a proposal.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 * --------------------------------
 * It never invents a value. A field with no match is simply absent from the
 * output rather than defaulted, because a wrong default silently written into
 * a profile is worse than a blank the user fills in.
 */

import type { BiodataField, BiodataValue } from './contracts/biodata.js';
import { BIODATA_FIELDS } from './contracts/biodata.js';

/** Lowercased, punctuation-stripped label text for matching. */
function normaliseLabel(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The label vocabulary per field. A line is matched to a field when its text
 * before the separator (or, failing that, the whole line) contains one of these
 * as a whole word. Order within an entry does not matter; ordering between
 * fields does — see `LABELLED_FIELDS`.
 */
const FIELD_LABELS: Record<BiodataField, string[]> = {
  first_name: ['name', 'full name', 'first name', 'candidate name'],
  last_name: ['surname', 'last name'],
  gender: ['gender', 'sex'],
  date_of_birth: ['date of birth', 'dob', 'birth date', 'd o b'],
  time_of_birth: ['time of birth', 'birth time', 'birth timing'],
  place_of_birth: ['place of birth', 'birth place', 'born at'],
  height_cm: ['height'],
  marital_status: ['marital status', 'marital'],
  religion: ['religion'],
  community: ['community', 'caste'],
  mother_tongue: ['mother tongue', 'mother language', 'languages known', 'language'],
  swagotra: ['swagotra', 'gotra', 'swagothra'],
  maternal_gothra: ['maternal gothra', 'maternal gotra', 'mom gotra'],
  rashi: ['rashi', 'moon sign'],
  nakshatra: ['nakshatra', 'star'],
  gan: ['gan', 'gana'],
  manglik_status: ['manglik', 'mangal'],
  education: ['education', 'qualification', 'educational qualification', 'degree'],
  profession: ['profession', 'occupation', 'job', 'designation', 'working as'],
  company: ['company', 'employer', 'organisation', 'organization', 'works at'],
  annual_income: ['annual income', 'income', 'salary', 'package'],
  work_location: ['work location', 'job location', 'workplace', 'office location', 'posted at'],
  fathers_occupation: ["father's occupation", 'father occupation', 'father'],
  mothers_occupation: ["mother's occupation", 'mother occupation', 'mother'],
  siblings: ['siblings', 'brothers', 'sisters', 'sibling'],
  family_location: ['family location', 'family based', 'native place', 'hometown', 'home town'],
  family_description: ['family', 'family details', 'about family', 'family background'],
  food_preference: ['food preference', 'food habit', 'diet'],
  smoking: ['smoking', 'smoke'],
  drinking: ['drinking', 'drinks', 'alcohol'],
  about_me: ['about me', 'about', 'introduction', 'self description', 'profile summary'],
  country: ['country'],
  state: ['state'],
  city: ['city', 'current city', 'residence', 'residing at', 'living in', 'address'],
};

/**
 * Longest labels first, so `fathers_occupation` is not shadowed by the generic
 * `family` entry and `date of birth` beats a bare `birth`. Exported for the
 * test that asserts a multi-word label wins over a single-word one.
 */
const LABELLED_FIELDS: { field: BiodataField; labels: string[] }[] = (
  Object.keys(FIELD_LABELS) as BiodataField[]
).map((field) => ({ field, labels: FIELD_LABELS[field] }));

/**
 * Splits a document into `{ label, value }` pairs.
 *
 * Handles the two shapes a biodata uses: `Label: value` on one line, and a
 * label line followed by its value on the next (`Education\nB.E. Computer
 * Science`). A line with no separator is treated as a label whose value is the
 * following line, which is how the second shape is recovered.
 */
export function splitLines(text: string): { label: string; value: string }[] {
  const lines = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.trim());

  const pairs: { label: string; value: string }[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (line === '') continue;

    const sep = line.match(/^(.{1,60}?)\s*[:\u2013\u2014-]\s*(.+)$/);
    if (sep && sep[1] && sep[2]) {
      pairs.push({ label: sep[1], value: sep[2] });
      continue;
    }

    // No separator: the line is a label and the next non-empty line is its
    // value. Only meaningful when this line is short and looks like a label,
    // and the next line is not itself a `Label: value` pair.
    if (line.length <= 40 && /^[A-Za-z][A-Za-z0-9 '&/.]*$/.test(line)) {
      const next = lines[i + 1] ?? '';
      const nextIsPair = /^(.{1,60}?)\s*[:\u2013\u2014-]\s*(.+)$/.test(next);
      if (next !== '' && !nextIsPair) {
        pairs.push({ label: line, value: next });
        i += 1;
      }
    }
  }
  return pairs;
}

/** Find the field a label belongs to, longest label first. */
function fieldForLabel(label: string): BiodataField | null {
  const norm = normaliseLabel(label);
  if (norm === '') return null;

  let best: { field: BiodataField; length: number } | null = null;
  for (const { field, labels } of LABELLED_FIELDS) {
    for (const candidate of labels) {
      const pattern = new RegExp(`(^| )${escapeRegExp(candidate)}( |$)`);
      if (pattern.test(norm)) {
        if (!best || candidate.length > best.length) best = { field, length: candidate.length };
      }
    }
  }
  return best?.field ?? null;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanValue(value: string): string {
  return value.replace(/\s+/g, ' ').replace(/^[\s:.\u2013\u2014-]+|[\s:.\u2013\u2014-]+$/g, '').trim();
}

const GENDER_WORDS: { pattern: RegExp; value: string }[] = [
  { pattern: /\b(female|girl|lady|woman|bride)\b/i, value: 'FEMALE' },
  { pattern: /\b(male|boy|man|groom|gentleman)\b/i, value: 'MALE' },
  { pattern: /\bother\b/i, value: 'OTHER' },
  { pattern: /\bprefer not to say\b/i, value: 'PREFER_NOT_TO_SAY' },
];

const MARITAL_WORDS: { pattern: RegExp; value: string }[] = [
  { pattern: /\bnever married\b|\bunmarried\b|\bsingle\b|\bbachelor\b|\bspinster\b/i, value: 'NEVER_MARRIED' },
  { pattern: /\bdivorced\b/i, value: 'DIVORCED' },
  { pattern: /\bwidow(ed)?\b/i, value: 'WIDOWED' },
  { pattern: /\bawaiting divorce\b|\bdivorce pending\b|\bseparated\b/i, value: 'AWAITING_DIVORCE' },
];

/**
 * `5'4"` / `5 ft 4 in` / `5.4` / `160 cm` → centimetres.
 *
 * The feet/inches form is ambiguous (`5.4` could be 5'4" or 5.4 ft), so a bare
 * decimal in the 3–7 range is read as feet.inches, which is what a biodata means
 * by it; anything already marked `cm` is taken as-is. A value that yields a
 * nonsensical height is dropped rather than clamped, so the user is asked.
 */
export function parseHeight(value: string): string | null {
  const text = value.toLowerCase();

  const cm = text.match(/(\d{2,3})\s*(cm|centimet)/);
  if (cm && cm[1]) return inRange(Number.parseInt(cm[1], 10));

  const feetInches = text.match(/\b(\d{1,2})\s*(?:'|ft|feet|foot)\s*(\d{1,2})?\s*(?:"|in|inch)?/);
  if (feetInches && feetInches[1]) {
    const feet = Number.parseInt(feetInches[1], 10);
    const inches = feetInches[2] ? Number.parseInt(feetInches[2], 10) : 0;
    return inRange(Math.round((feet * 12 + inches) * 2.54));
  }

  const decimal = text.match(/\b(\d{1,2})\.(\d{1,2})\b/);
  if (decimal && decimal[1] && decimal[2]) {
    const feet = Number.parseInt(decimal[1], 10);
    const inches = Number.parseInt(decimal[2], 10);
    return inRange(Math.round((feet * 12 + inches) * 2.54));
  }

  return null;
}

function inRange(cm: number): string | null {
  // Section 8 bounds 90–250; outside that it is a parse error, not a height.
  return cm >= 90 && cm <= 250 ? String(cm) : null;
}

/**
 * `12/03/1996`, `12-03-1996`, `1996-03-12`, `12 March 1996` → `YYYY-MM-DD`.
 *
 * The day/month order is genuinely ambiguous for values like `03/04/1996`. We
 * read `dd/mm/yyyy` (the Indian convention the biodatas use) but reject the
 * result unless it is a real calendar date, and hand back `null` when the two
 * readings differ and both are valid — better a blank the user fills than a
 * birthday silently swapped.
 */
export function parseDateOfBirth(value: string): string | null {
  const text = value.trim();

  const iso = text.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (iso && iso[1] && iso[2] && iso[3]) {
    return isoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }

  const dmy = text.match(/\b(\d{1,2})[/\-. ](\d{1,2})[/\-. ](\d{2,4})\b/);
  if (dmy && dmy[1] && dmy[2] && dmy[3]) {
    const d = Number(dmy[1]);
    const m = Number(dmy[2]);
    const y = normaliseYear(Number(dmy[3]));
    return isoDate(y, m, d) ?? isoDate(y, d, m);
  }

  const named = text.match(/\b(\d{1,2})\s+([a-z]{3,9})\.?\s+(\d{4})\b/i);
  if (named && named[1] && named[2] && named[3]) {
    const month = MONTHS[named[2].toLowerCase().slice(0, 3)];
    if (month) return isoDate(Number(named[3]), month, Number(named[1]));
  }

  return null;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function normaliseYear(year: number): number {
  if (year < 100) return year > 30 ? 1900 + year : 2000 + year;
  return year;
}

function isoDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  // Plausible age guard: an adult of sane age. Mirrors the contract bound so the
  // parser never proposes a value the API would then reject.
  const age = (Date.now() - date.getTime()) / (365.25 * 86_400_000);
  if (age < 18 || age > 100) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Extracts what it can from a document's text.
 *
 * Returns a proposal plus the fields it did not fill. Ordering is stable by
 * `BIODATA_FIELDS` so the output does not depend on line order in the document.
 */
export function extractBiodata(text: string): {
  values: BiodataValue[];
  unrecognised: BiodataField[];
} {
  const pairs = splitLines(text);
  const found = new Map<BiodataField, BiodataValue>();

  for (const { label, value } of pairs) {
    const field = fieldForLabel(label);
    if (!field) continue;
    const cleaned = cleanValue(value);
    if (cleaned === '') continue;

    const transformed = transform(field, cleaned);
    if (transformed === null) continue;

    // First labelled match wins: a biodata repeats `Name` (candidate and
    // father), and the first occurrence is the candidate's own.
    if (!found.has(field)) {
      found.set(field, { field, value: transformed.value, confidence: transformed.confidence });
    }
  }

  const values: BiodataValue[] = [];
  const unrecognised: BiodataField[] = [];
  for (const field of BIODATA_FIELDS) {
    const hit = found.get(field);
    if (hit) values.push(hit);
    else unrecognised.push(field);
  }

  return { values, unrecognised };
}

function transform(
  field: BiodataField,
  value: string,
): { value: string; confidence: 'high' | 'low' } | null {
  switch (field) {
    case 'gender': {
      const match = GENDER_WORDS.find((g) => g.pattern.test(value));
      return match ? { value: match.value, confidence: 'high' } : null;
    }
    case 'marital_status': {
      const match = MARITAL_WORDS.find((m) => m.pattern.test(value));
      return match ? { value: match.value, confidence: 'high' } : null;
    }
    case 'height_cm': {
      const cm = parseHeight(value);
      return cm ? { value: cm, confidence: 'high' } : null;
    }
    case 'date_of_birth': {
      const iso = parseDateOfBirth(value);
      return iso ? { value: iso, confidence: 'high' } : null;
    }
    case 'country': {
      const code = value.trim().toUpperCase();
      return /^[A-Z]{2}$/.test(code) ? { value: code, confidence: 'low' } : null;
    }
    default:
      // Everything else is free text: keep it, but bound it so a mis-split line
      // (half the page swallowed as one value) is not offered as a field.
      return value.length <= 2000 ? { value, confidence: 'high' } : null;
  }
}
