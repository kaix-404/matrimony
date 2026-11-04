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
/**
 * Splits a document into `{ label, value }` pairs.
 *
 * Handles the two shapes a biodata uses: `Label: value` on one line, and a
 * label line followed by its value on the next (`Education\nB.E. Computer
 * Science`). A line with no separator is treated as a label whose value is the
 * following line, which is how the second shape is recovered.
 */
export declare function splitLines(text: string): {
    label: string;
    value: string;
}[];
/**
 * `5'4"` / `5 ft 4 in` / `5.4` / `160 cm` → centimetres.
 *
 * The feet/inches form is ambiguous (`5.4` could be 5'4" or 5.4 ft), so a bare
 * decimal in the 3–7 range is read as feet.inches, which is what a biodata means
 * by it; anything already marked `cm` is taken as-is. A value that yields a
 * nonsensical height is dropped rather than clamped, so the user is asked.
 */
export declare function parseHeight(value: string): string | null;
/**
 * `12/03/1996`, `12-03-1996`, `1996-03-12`, `12 March 1996` → `YYYY-MM-DD`.
 *
 * The day/month order is genuinely ambiguous for values like `03/04/1996`. We
 * read `dd/mm/yyyy` (the Indian convention the biodatas use) but reject the
 * result unless it is a real calendar date, and hand back `null` when the two
 * readings differ and both are valid — better a blank the user fills than a
 * birthday silently swapped.
 */
export declare function parseDateOfBirth(value: string): string | null;
/**
 * Extracts what it can from a document's text.
 *
 * Returns a proposal plus the fields it did not fill. Ordering is stable by
 * `BIODATA_FIELDS` so the output does not depend on line order in the document.
 */
export declare function extractBiodata(text: string): {
    values: BiodataValue[];
    unrecognised: BiodataField[];
};
//# sourceMappingURL=biodata-parse.d.ts.map