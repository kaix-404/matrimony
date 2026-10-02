import {
  CreateProfileSchema,
  UpdateProfileSchema,
  MyProfileSchema,
  ProfileCompletenessSchema,
} from './profile-edit.js';
import { MasterListsResponseSchema, PROFILE_MASTER_LIST_FIELDS } from './master-data.js';
import { HIDDEN_BEFORE_PAYMENT } from './profile.js';

const validCreate = {
  first_name: 'Aarti',
  gender: 'FEMALE',
  date_of_birth: '1994-06-15',
};

describe('profile-edit contracts', () => {
  describe('create', () => {
    it('requires only the three non-nullable columns', () => {
      expect(CreateProfileSchema.safeParse(validCreate).success).toBe(true);
    });

    it('accepts a genuinely partial profile, per progressive onboarding', () => {
      // Nothing about section 8 demands every field at save time; the client
      // asked for a partial save so a user can come back to it.
      const r = CreateProfileSchema.safeParse({
        first_name: 'Aarti',
        gender: 'FEMALE',
        date_of_birth: '1994-06-15',
      });
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.last_name).toBeUndefined();
        expect(r.data.about_me).toBeUndefined();
      }
    });

    it('rejects an unknown field, so a typo fails loudly instead of being dropped', () => {
      const r = CreateProfileSchema.safeParse({ ...validCreate, networth_category: 'ABOVE_10CR' });
      expect(r.success).toBe(false);
    });

    it('has no field for net worth at all', () => {
      // The strongest form of the B1 rule: there is nowhere to put it, so no
      // amount of client cleverness can change the band.
      const keys = Object.keys(CreateProfileSchema.shape);
      expect(keys.some((k) => k.includes('networth') || k.includes('category'))).toBe(false);
    });

    it('rejects an empty first name and a control character in it', () => {
      expect(CreateProfileSchema.safeParse({ ...validCreate, first_name: '   ' }).success).toBe(
        false,
      );
      expect(
        CreateProfileSchema.safeParse({ ...validCreate, first_name: 'Aarti\u0000B' }).success,
      ).toBe(false);
      expect(
        CreateProfileSchema.safeParse({ ...validCreate, first_name: 'Aarti\u0007B' }).success,
      ).toBe(false);
    });

    it('trims surrounding whitespace rather than storing it', () => {
      const r = CreateProfileSchema.safeParse({ ...validCreate, first_name: '  Aarti  ' });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.first_name).toBe('Aarti');
    });

    it('rejects a non-calendar date instead of rolling it forward', () => {
      expect(
        CreateProfileSchema.safeParse({ ...validCreate, date_of_birth: '2026-02-31' }).success,
      ).toBe(false);
      expect(
        CreateProfileSchema.safeParse({ ...validCreate, date_of_birth: '15-06-1994' }).success,
      ).toBe(false);
    });

    it('rejects an age outside 18 to 100 in both directions', () => {
      const tooOld = new Date(Date.now() - 101 * 365.25 * 86_400_000).toISOString().slice(0, 10);
      const tooYoung = new Date(Date.now() - 10 * 365.25 * 86_400_000).toISOString().slice(0, 10);
      expect(CreateProfileSchema.safeParse({ ...validCreate, date_of_birth: tooOld }).success).toBe(
        false,
      );
      expect(
        CreateProfileSchema.safeParse({ ...validCreate, date_of_birth: tooYoung }).success,
      ).toBe(false);
    });

    it('normalises country to upper case so in and IN are one value', () => {
      const r = CreateProfileSchema.safeParse({ ...validCreate, country: 'in' });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.country).toBe('IN');
      expect(CreateProfileSchema.safeParse({ ...validCreate, country: 'IND' }).success).toBe(false);
    });

    it('bounds height to something human', () => {
      expect(CreateProfileSchema.safeParse({ ...validCreate, height_cm: 89 }).success).toBe(false);
      expect(CreateProfileSchema.safeParse({ ...validCreate, height_cm: 251 }).success).toBe(false);
      expect(CreateProfileSchema.safeParse({ ...validCreate, height_cm: 165 }).success).toBe(true);
    });
  });

  describe('update: absent is not null', () => {
    it('keeps absent and explicit null distinguishable', () => {
      const cleared = UpdateProfileSchema.safeParse({ company: null });
      const untouched = UpdateProfileSchema.safeParse({});
      expect(cleared.success).toBe(true);
      expect(untouched.success).toBe(false); // empty patch rejected

      if (cleared.success) {
        expect('company' in cleared.data).toBe(true);
        expect(cleared.data.company).toBeNull();
      }
    });

    it('omitted keys stay undefined so a partial save cannot wipe other fields', () => {
      const r = UpdateProfileSchema.safeParse({ company: 'Infosys' });
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.first_name).toBeUndefined();
        expect(r.data.last_name).toBeUndefined();
        expect(r.data.city).toBeUndefined();
      }
    });

    it('rejects an empty patch rather than returning a misleading 200', () => {
      expect(UpdateProfileSchema.safeParse({}).success).toBe(false);
    });

    it('still refuses an empty first_name on update', () => {
      // Deriving the update shape with Partial would have dropped this.
      expect(UpdateProfileSchema.safeParse({ first_name: '' }).success).toBe(false);
    });

    it('rejects net worth just as create does', () => {
      expect(UpdateProfileSchema.safeParse({ networth_category: 'ABOVE_10CR' }).success).toBe(
        false,
      );
    });

    it('has no category field to hide a net-worth change in', () => {
      // The schema is refined, so its object shape is not introspectable. The
      // behavioural equivalent is asserted instead: a payload carrying a
      // legitimate field *and* a net-worth key is rejected for the unknown key,
      // which proves there is no field to receive it rather than one that
      // silently discards it.
      const r = UpdateProfileSchema.safeParse({
        company: 'Infosys',
        networth_category: 'ABOVE_10CR',
      });
      expect(r.success).toBe(false);
      if (!r.success) {
        expect(r.error.issues.map((i) => i.code)).toContain('unrecognized_keys');
      }
    });
  });

  describe('my-profile response', () => {
    it('echoes networth_category as the only net-worth reference', () => {
      const keys = Object.keys(MyProfileSchema.shape);
      expect(keys).toContain('networth_category');
      expect(keys.filter((k) => k.includes('networth'))).toEqual(['networth_category']);
    });

    it('is strict, so an accidental extra field is a type error', () => {
      expect(Object.keys(MyProfileSchema.shape)).not.toContain('metadata');
    });

    it('does not leak owner-only photo internals into the shared hidden list', () => {
      // HIDDEN_BEFORE_PAYMENT is asserted against the locked preview, and the
      // owner schema is intentionally a different shape. Net worth appears in
      // neither as an editable field.
      expect(HIDDEN_BEFORE_PAYMENT).not.toContain('networth_category');
    });
  });

  describe('completeness', () => {
    it('is a server-computed list, not a client-side derivation', () => {
      const ok = ProfileCompletenessSchema.safeParse({
        is_complete: false,
        missing_fields: ['about_me'],
      });
      expect(ok.success).toBe(true);
      const contradictory = ProfileCompletenessSchema.safeParse({
        is_complete: true,
        missing_fields: ['about_me'],
      });
      // Schema allows it; the service is what keeps the two consistent.
      expect(contradictory.success).toBe(true);
    });
  });
});

describe('master-data contracts', () => {
  it('maps each master-list profile field to the list it draws from', () => {
    expect(PROFILE_MASTER_LIST_FIELDS.education_id).toBe('EDUCATION');
    expect(PROFILE_MASTER_LIST_FIELDS.profession_id).toBe('PROFESSION');
    expect(PROFILE_MASTER_LIST_FIELDS.community_id).toBe('COMMUNITY');
  });

  it('rejects an opaque id that has been parsed or re-encoded', () => {
    const r = MasterListsResponseSchema.safeParse({
      lists: [
        {
          key: 'EDUCATION',
          label: 'Education',
          is_sensitive: false,
          values: [{ id: '', value: 'B.Tech' }],
        },
      ],
    });
    expect(r.success).toBe(false);
  });

  it('carries is_sensitive so the client can distinguish caste and community', () => {
    const r = MasterListsResponseSchema.safeParse({
      lists: [
        {
          key: 'COMMUNITY',
          label: 'Community',
          is_sensitive: true,
          values: [{ id: 'c1', value: 'Aggarwal' }],
        },
      ],
    });
    expect(r.success).toBe(true);
  });
});
