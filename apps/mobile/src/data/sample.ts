/**
 * Placeholder content for the home feed.
 *
 * Remote image URLs are used so the layout can be previewed without shipping
 * sample assets; swap these for profile API data once discovery is wired up.
 */

export interface FeedItem {
  id: string;
  image: string;
  title: string;
  location: string;
  badge: string;
}

export interface Story {
  id: string;
  avatar: string;
  /** First item in the row carries a coral add badge. */
  isNew?: boolean;
}

export const stories: Story[] = [
  { id: 's1', avatar: 'https://i.pravatar.cc/120?img=12', isNew: true },
  { id: 's2', avatar: 'https://i.pravatar.cc/120?img=32' },
  { id: 's3', avatar: 'https://i.pravatar.cc/120?img=45' },
  { id: 's4', avatar: 'https://i.pravatar.cc/120?img=5' },
  { id: 's5', avatar: 'https://i.pravatar.cc/120?img=22' },
  { id: 's6', avatar: 'https://i.pravatar.cc/120?img=60' },
];

export const filterChips: string[] = ['All', 'Verified', 'Near me', 'Recently active', 'Premium'];

export const feedItems: FeedItem[] = [
  {
    id: 'f1',
    image: 'https://picsum.photos/seed/matrimony-1/900/660',
    title: 'Aarav & Meera',
    location: 'Pune, Maharashtra',
    badge: 'Verified',
  },
  {
    id: 'f2',
    image: 'https://picsum.photos/seed/matrimony-2/900/660',
    title: 'Rohan & Divya',
    location: 'Bengaluru, Karnataka',
    badge: 'Premium',
  },
  {
    id: 'f3',
    image: 'https://picsum.photos/seed/matrimony-3/900/660',
    title: 'Karthik & Ananya',
    location: 'Chennai, Tamil Nadu',
    badge: 'New',
  },
];
