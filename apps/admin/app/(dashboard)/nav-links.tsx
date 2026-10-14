'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Sidebar navigation with the current section highlighted. It is a client
 * component only so it can read the pathname; all it renders are links.
 */
const LINKS = [
  { href: '/', label: 'Overview' },
  { href: '/reports', label: 'Moderation queue' },
  { href: '/users', label: 'Members' },
  { href: '/admins', label: 'Administrators' },
];

export function NavLinks() {
  const pathname = usePathname();

  return (
    <nav>
      {LINKS.map((link) => {
        const active = link.href === '/' ? pathname === '/' : pathname.startsWith(link.href);
        return (
          <Link key={link.href} href={link.href} className={active ? 'active' : undefined}>
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
