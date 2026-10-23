import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { StorageService } from '../storage/s3.service';
import { PrismaClient } from '../prisma/prisma-client';
import {
  extractBiodata,
  BIODATA_FIELDS,
  type BiodataExtraction,
  type BiodataField,
  type BiodataValue,
} from '@matrimony/shared';
import { extractPdfText } from './pdf-text.js';

/**
 * Biodata import — read a document, propose profile fields.
 *
 * THE CONTRACT WITH THE USER
 * --------------------------
 * This service never writes to a profile. It reads a document the caller
 * uploaded, extracts what it recognises, and returns a *proposal* the client
 * shows for confirmation. The save is the ordinary `PATCH /profile`, which
 * already validates every field; running the proposal through the same validators
 * is what keeps a bad extraction from becoming a bad save.
 *
 * WHY THE FILE IS RE-READ HERE
 * ----------------------------
 * The client uploads straight to object storage (as with photos) and sends only
 * the key. The API then fetches the object itself. It never accepts a URL to
 * fetch, so a caller cannot point the parser at `http://169.254.169.254/` or at
 * someone else's object — the SSRF hole that "parse this link" would open.
 *
 * AND WHY THE KEY IS RE-CHECKED
 * -----------------------------
 * Keys are namespaced `biodata/<profileId>/...`. `parse` rejects any key not
 * under the caller's own prefix rather than merely trusting the client, because
 * the key is a plain string in the body and a client that guessed another
 * profile's key would otherwise get its document parsed and returned.
 */

/** Section 8 bounds; a 10 MB document is already generous for a typed biodata. */
const MAX_BYTES = 10 * 1024 * 1024;

/** Fields that map to a master list and so need a value id, not free text. */
const MASTER_LIST_FIELDS: Partial<Record<BiodataField, string>> = {
  education: 'EDUCATION',
  profession: 'PROFESSION',
  community: 'COMMUNITY',
};

@Injectable()
export class BiodataService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly storage: StorageService,
  ) {}

  /**
   * Reserves an upload slot and returns the presigned PUT.
   *
   * Mirrors the photo handshake so the client has one upload pattern. The object
   * lives under a per-profile prefix, which is what makes `parse`'s ownership
   * check a pure string test rather than a database lookup.
   */
  async initiate(
    userId: string,
    input: { mime_type: string; byte_size: number },
  ): Promise<{ upload_url: string; object_key: string; expires_in_seconds: number }> {
    const profile = await this.requireProfile(userId);

    if (input.byte_size <= 0 || input.byte_size > MAX_BYTES) {
      throw new BadRequestException('Biodata must be between 1 byte and 10 MB');
    }

    const objectKey = `biodata/${profile.id}/${randomKey()}`;
    const uploadUrl = await this.storage.presignUpload(objectKey, input.mime_type, input.byte_size);

    return { upload_url: uploadUrl, object_key: objectKey, expires_in_seconds: 300 };
  }

  /**
   * Fetches the uploaded object, extracts fields and returns a proposal.
   *
   * Never throws on an unreadable document — a scanned PDF, an unsupported
   * layout — because "we could not read it, please type your details" is a
   * normal outcome the user acts on, not an error. It returns an empty proposal
   * with a warning instead. A genuinely malformed request (missing object) is
   * still a 400/404.
   */
  async parse(userId: string, objectKey: string): Promise<BiodataExtraction> {
    const profile = await this.requireProfile(userId);

    const expectedPrefix = `biodata/${profile.id}/`;
    if (!objectKey.startsWith(expectedPrefix)) {
      // Not this caller's object. 404, not 403: confirming the object exists but
      // is not theirs is itself a small leak.
      throw new NotFoundException('No upload was found for that key');
    }

    let bytes: Buffer;
    try {
      bytes = await this.storage.getObjectBytes(objectKey);
    } catch {
      throw new NotFoundException('The uploaded document could not be read');
    }

    if (bytes.byteLength > MAX_BYTES) {
      throw new BadRequestException('Biodata is too large');
    }

    const warnings: string[] = [];
    const text = this.toText(bytes, objectKey, warnings);

    const { values } = extractBiodata(text);
    const resolved = await this.resolveMasterLists(values);

    // A document that yielded no text at all is the scan case, and saying so is
    // more useful than an empty form with no explanation.
    if (text.trim() === '') {
      warnings.push(
        'No text could be read from this document. If it is a scan or a photo, please type your details instead.',
      );
    } else if (resolved.length === 0) {
      warnings.push('We could not recognise any profile fields in this document.');
    }

    // Fields the parser found but the master-list resolver dropped (an
    // education/profession/community that matched no list entry) go back into
    // `unrecognised`: they are not fillable, so they are still "needed".
    const resolvedFields = new Set(resolved.map((v) => v.field));
    const stillNeeded = BIODATA_FIELDS.filter((field) => !resolvedFields.has(field));

    return {
      values: resolved,
      unrecognised: stillNeeded,
      warnings,
    };
  }

  /** Turns the stored bytes into text: PDF via the extractor, text as-is. */
  private toText(bytes: Buffer, objectKey: string, warnings: string[]): string {
    const isPdf =
      bytes.subarray(0, 5).toString('latin1') === '%PDF-' || objectKey.toLowerCase().endsWith('.pdf');

    if (!isPdf) {
      // `text/plain` — already text. Decode as UTF-8, tolerating a BOM.
      return bytes.toString('utf8').replace(/^\uFEFF/, '');
    }

    const text = extractPdfText(bytes);
    if (text.trim() === '') {
      warnings.push('This PDF appears to contain no selectable text (it may be a scan).');
    }
    return text;
  }

  /**
   * Attaches a master-list id to education/profession/community when the free
   * text matches one, and drops the field when it does not.
   *
   * A value with no id cannot be saved — the profile endpoint accepts only ids —
   * so proposing it as fillable text would let the user "accept" something that
   * then fails validation. Dropping it into the unrecognised set instead means
   * the client asks them to pick from the list, which is the honest flow.
   */
  private async resolveMasterLists(values: BiodataValue[]): Promise<BiodataValue[]> {
    const out: BiodataValue[] = [];

    for (const value of values) {
      const listKey = MASTER_LIST_FIELDS[value.field];
      if (!listKey) {
        out.push(value);
        continue;
      }

      const match = await this.prisma.masterListValue.findFirst({
        where: { listKey, isActive: true, value: { equals: value.value, mode: 'insensitive' } },
        select: { id: true, value: true },
      });

      if (!match) continue;
      out.push({ ...value, value: match.value, master_list_id: match.id });
    }

    return out;
  }

  private async requireProfile(userId: string) {
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!profile) throw new NotFoundException('Profile not found');
    return profile;
  }
}

function randomKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}
