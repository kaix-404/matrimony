import type { DiscoveryCard, UnlockPrice } from '@matrimony/shared';
import type { FeedItem } from '../data/sample';

/**
 * One card as the home feed renders it.
 *
 * Two producers feed it — sample content (for the unauthenticated design
 * preview) and the discovery API — so the view model carries both shapes and
 * lets the card decide what to show when a field is absent.
 */
export interface FeedCardModel {
  id: string;
  image: string | null;
  title: string | null;
  location: string | null;
  badge: string | null;
  /** True when identity is withheld until the profile is unlocked. */
  locked: boolean;
  priceLabel: string | null;
  photoCount: number;
}

/** Formats a decimal-string money amount as an Indian-rupee label. */
export function formatUnlockPrice(price: UnlockPrice): string {
  const value = Number(price.base_amount);
  if (!Number.isFinite(value)) return `${price.currency} ${price.total_amount}`;
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: price.currency,
      maximumFractionDigits: value % 1 === 0 ? 0 : 2,
    }).format(value);
  } catch {
    return `${price.currency} ${price.total_amount}`;
  }
}

export function fromSample(item: FeedItem): FeedCardModel {
  return {
    id: item.id,
    image: item.image,
    title: item.title,
    location: item.location,
    badge: item.badge,
    locked: false,
    priceLabel: null,
    photoCount: 1,
  };
}

/**
 * Discovery cards deliberately carry no name, age or location — section 12
 * keeps locked fields out of the search response entirely — so the model
 * surfaces the primary photo and the unlock price and nothing else.
 */
export function fromDiscoveryCard(card: DiscoveryCard): FeedCardModel {
  const primary = card.photos.find((photo) => photo.is_primary) ?? card.photos[0] ?? null;
  return {
    id: card.profile_id,
    image: primary?.url ?? null,
    title: null,
    location: null,
    badge: null,
    locked: card.profile_locked,
    priceLabel: formatUnlockPrice(card.unlock_price),
    photoCount: card.photos.length,
  };
}
