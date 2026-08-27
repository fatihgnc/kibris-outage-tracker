'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Locale } from '@/lib/i18n/config';
import { parsePath, routeHref, type RouteKey } from '@/lib/routes';

type Props = { locale: Locale; homeLabel: string; archiveLabel: string; guidesLabel: string };

export default function NavLinks({ locale, homeLabel, archiveLabel, guidesLabel }: Props) {
  const pathname = usePathname() ?? '';
  // Compared by route, not by string. The address in the bar is /tr/arsiv
  // while proxy.ts renders /tr/archive, and either spelling has to light the
  // same link — a prefix match on one of them would miss half the time.
  // A path outside the map (a 404) is no section, and must not light 'home'.
  const here = parsePath(pathname);
  const linkClass = (active: boolean) =>
    `tap-target whitespace-nowrap text-small no-underline ${
      active ? 'text-lamp' : 'text-muted hover:text-text'
    }`;
  const section = (key: RouteKey) => linkClass(here?.key === key);

  return (
    <nav className="flex gap-4">
      <Link href={routeHref(locale)} className={linkClass(here !== null && here.key === null)}>
        {homeLabel}
      </Link>
      <Link href={routeHref(locale, 'archive')} className={section('archive')}>
        {archiveLabel}
      </Link>
      <Link href={routeHref(locale, 'guides')} className={section('guides')}>
        {guidesLabel}
      </Link>
    </nav>
  );
}
