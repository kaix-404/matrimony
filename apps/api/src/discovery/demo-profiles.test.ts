import {
  DEMO_BANDS,
  DEMO_MARKER,
  DEMO_MOBILE_PREFIX,
  DEMO_PROFILES,
  type DemoBand,
} from '../../prisma/demo-profiles';

/**
 * The fixtures are data, so these are assertions about the data rather than
 * about code paths: a fixture set that silently loses a band, reuses a mobile
 * number or includes a minor would produce a demo that looks fine until someone
 * tries to use it.
 */
describe('demo profiles', () => {
  it('puts at least two profiles in every band, in both genders', () => {
    for (const band of DEMO_BANDS) {
      const inBand = DEMO_PROFILES.filter((profile) => profile.band === band);
      expect(inBand.length).toBeGreaterThanOrEqual(2);
    }

    // A test member is one gender or the other; a single-gender fixture set
    // would show half of them nothing.
    expect(new Set(DEMO_PROFILES.map((profile) => profile.gender))).toEqual(
      new Set(['MALE', 'FEMALE']),
    );
  });

  it('covers exactly the four discoverable bands', () => {
    const used = new Set<DemoBand>(DEMO_PROFILES.map((profile) => profile.band));
    expect([...used].sort()).toEqual([...DEMO_BANDS].sort());
  });

  it('uses unique numbers inside the reserved block', () => {
    const mobiles = DEMO_PROFILES.map((profile) => profile.mobile);

    expect(new Set(mobiles).size).toBe(mobiles.length);
    for (const mobile of mobiles) {
      expect(mobile).toMatch(/^[6-9]\d{9}$/);
      expect(mobile.startsWith(DEMO_MOBILE_PREFIX)).toBe(true);
    }
  });

  it('describes adults only', () => {
    const today = new Date('2026-11-09T00:00:00.000Z');

    for (const profile of DEMO_PROFILES) {
      const birth = new Date(`${profile.dateOfBirth}T00:00:00.000Z`);
      expect(Number.isNaN(birth.getTime())).toBe(false);

      const age = (today.getTime() - birth.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
      expect(age).toBeGreaterThanOrEqual(18);
      expect(age).toBeLessThan(70);
    }
  });

  it('labels every profile as a demo in its own text', () => {
    // The label is what makes a fixture honest if a real member ever sees one.
    for (const profile of DEMO_PROFILES) {
      expect(profile.aboutMe.startsWith(DEMO_MARKER)).toBe(true);
      expect(profile.firstName.trim()).not.toBe('');
      expect(profile.lastName.trim()).not.toBe('');
      expect(profile.city.trim()).not.toBe('');
    }
  });
});
