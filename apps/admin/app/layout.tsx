import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Networth Matrimony - Admin',
  description: 'Moderation and administration for the Networth Matrimony platform',
};

/**
 * The single root layout. The dashboard shell lives one level down, in the
 * `(dashboard)` group, so the login page renders without a sidebar: an
 * unauthenticated visitor should never see the navigation of an area they
 * cannot enter.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
