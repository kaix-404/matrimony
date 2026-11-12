'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { AdminPermissionKey } from '@matrimony/shared';

/**
 * Sidebar navigation with the current section highlighted. It is a client
 * component only so it can read the pathname; all it renders are links.
 *
 * A link that names a permission is drawn only when the API reported that grant
 * on `GET /admin/me`. That is a courtesy, not the access control: the API checks
 * the permission on every request, so a stale or hand-typed URL is refused with
 * a 403 rather than served.
 */
const LINKS: { href: string; label: string; permission?: AdminPermissionKey }[] = [
  { href: '/', label: 'Overview' },
  { href: '/reports', label: 'Moderation queue' },
  { href: '/profiles', label: 'Profile review' },
  { href: '/photos', label: 'Photo review' },
  { href: '/verifications', label: 'Identity checks' },
  { href: '/data-requests', label: 'Data requests' },
  { href: '/users', label: 'Members' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/master-lists', label: 'Master lists' },
  { href: '/admins', label: 'Administrators' },
  // Deployment state, not day-to-day operations: Super Admin only by default,
  // and grantable to another role in the seed's matrix if that changes.
  { href: '/status', label: 'System status', permission: 'system:read' },
];

export function NavLinks({ permissions }: { permissions: readonly AdminPermissionKey[] }) {
  const pathname = usePathname();

  const visible = LINKS.filter(
    (link) => link.permission === undefined || permissions.includes(link.permission),
  );

  return (
    <nav>
      {visible.map((link) => {
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
