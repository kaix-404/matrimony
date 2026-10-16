import type { ViewStyle } from 'react-native';

/**
 * Design tokens for the mobile UI.
 *
 * Everything visual is declared once here so screens and components describe
 * intent ("surface", "card radius") rather than literals. The values come from
 * the client-supplied design description: coral accent, near-white surfaces,
 * 24-28px card radii, pill controls, and soft diffused shadows.
 */

export const colors = {
  /** Coral / warm-red accent for active controls, badges and CTAs. */
  primary: '#FF5A43',
  /** Deep magenta/berry used as the far end of the accent gradient. */
  primaryDeep: '#B83280',
  /** Primary app background. */
  background: '#FFFFFF',
  /** Secondary elevated surface (cards, inset inputs). */
  surface: '#F4F4F6',
  /** Lighter secondary surface for stacked/selected states. */
  surfaceAlt: '#F8F9FB',
  /** Headers and primary text/icons. */
  textPrimary: '#1C1917',
  /** Slightly softer dark for brand text and strong labels. */
  textStrong: '#2C2724',
  /** Subtext, placeholders and inactive states. */
  textMuted: '#8E8E93',
  /** Scrim text and content on accent fills. */
  white: '#FFFFFF',
  /** Hairline borders on chips and inputs. */
  hairline: 'rgba(0, 0, 0, 0.08)',
  /** Dark overlay sitting behind text on media cards. */
  scrim: 'rgba(15, 10, 30, 0.85)',
  shadow: '#000000',
} as const;

export const gradients = {
  /** Vibrant pink-to-orange ring used for highlight borders. */
  ring: ['#FF5A43', '#B83280'] as [string, string],
  /** Bottom scrim on media cards: transparent -> near-black purple. */
  scrim: ['rgba(0, 0, 0, 0)', 'rgba(15, 10, 30, 0.85)'] as [string, string],
  scrimStops: [0.2, 1] as [number, number],
  /** Dark hero card background (photographic fallback). */
  hero: ['rgba(28, 20, 40, 0.80)', 'rgba(15, 10, 30, 0.96)'] as [string, string],
};

export const radii = {
  /** Standard cards and banners. */
  card: 28,
  cardMd: 24,
  /** Compact form inputs. */
  input: 12,
  inputSm: 8,
  /** Fully pill-shaped controls. */
  pill: 9999,
  /** Circular elements (avatars, nav tabs). */
  circle: 9999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  /** Lateral screen padding. */
  screenX: 20,
  /** Floating bottom-nav height. */
  navHeight: 72,
  /** Bottom padding that reserves room for the floating nav. */
  navClearance: 88,
} as const;

export const layout = {
  /** Constrain the canvas on tablets and web. */
  maxWidth: 412,
} as const;

export const typography = {
  brand: { fontSize: 20, fontWeight: '700' },
  h1: { fontSize: 22, fontWeight: '700' },
  h2: { fontSize: 18, fontWeight: '700' },
  title: { fontSize: 16, fontWeight: '600' },
  body: { fontSize: 15, fontWeight: '400' },
  caption: { fontSize: 13, fontWeight: '400' },
} as const;

export const shadows: Record<'card' | 'floating' | 'chip', ViewStyle> = {
  card: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 6,
  },
  floating: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 20,
    elevation: 12,
  },
  chip: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
};
