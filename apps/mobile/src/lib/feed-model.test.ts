import type { DiscoveryCard, UnlockPrice } from '@matrimony/shared';
import { formatUnlockPrice, fromDiscoveryCard, fromSample } from './feed-model';

const price = (overrides: Partial<UnlockPrice> = {}): UnlockPrice => ({
  base_amount: '249.00',
  gst_rate: '0.1800',
  gst_amount: '44.82',
  total_amount: '293.82',
  currency: 'INR',
  ...overrides,
});

const card = (overrides: Partial<DiscoveryCard> = {}): DiscoveryCard => ({
  profile_id: 'profile_1',
  photos: [],
  profile_locked: true,
  unlock_price: price(),
  ...overrides,
});

describe('formatUnlockPrice', () => {
  it('shows a whole-rupee base amount without decimals', () => {
    expect(formatUnlockPrice(price())).toBe('₹249');
  });

  it('keeps the paise when the base amount has a fraction', () => {
    expect(formatUnlockPrice(price({ base_amount: '588.82' }))).toBe('₹588.82');
  });

  it('falls back to the raw total when the base amount is not numeric', () => {
    expect(formatUnlockPrice(price({ base_amount: 'oops', total_amount: '293.82' }))).toBe(
      'INR 293.82',
    );
  });
});

describe('fromDiscoveryCard', () => {
  it('carries the price label and the locked flag', () => {
    const model = fromDiscoveryCard(card());
    expect(model.id).toBe('profile_1');
    expect(model.locked).toBe(true);
    expect(model.priceLabel).toBe('₹249');
    expect(model.image).toBeNull();
    expect(model.title).toBeNull();
  });

  it('prefers the primary photo over the first in the list', () => {
    const model = fromDiscoveryCard(
      card({
        photos: [
          {
            photo_id: 'a',
            url: 'https://example.com/a.jpg',
            width_px: 800,
            height_px: 600,
            is_primary: false,
            photo_type: 'SINGLE',
          },
          {
            photo_id: 'b',
            url: 'https://example.com/b.jpg',
            width_px: 800,
            height_px: 600,
            is_primary: true,
            photo_type: 'SINGLE',
          },
        ],
      }),
    );
    expect(model.image).toBe('https://example.com/b.jpg');
    expect(model.photoCount).toBe(2);
  });

  it('falls back to the first photo when none is marked primary', () => {
    const model = fromDiscoveryCard(
      card({
        photos: [
          {
            photo_id: 'a',
            url: 'https://example.com/a.jpg',
            width_px: null,
            height_px: null,
            is_primary: false,
            photo_type: 'FAMILY',
          },
        ],
      }),
    );
    expect(model.image).toBe('https://example.com/a.jpg');
  });
});

describe('fromSample', () => {
  it('maps preview content as unlocked and without a price', () => {
    const model = fromSample({
      id: 's1',
      image: 'https://example.com/a.jpg',
      title: 'Sample',
      location: 'Pune',
      badge: 'New',
    });
    expect(model).toMatchObject({
      id: 's1',
      title: 'Sample',
      location: 'Pune',
      badge: 'New',
      locked: false,
      priceLabel: null,
      photoCount: 1,
    });
  });
});
