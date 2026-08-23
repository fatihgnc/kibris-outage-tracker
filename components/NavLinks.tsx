'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Locale } from '@/lib/i18n/config';

type Props = { locale: Locale; homeLabel: string; archiveLabel: string };

export default function NavLinks({ locale, homeLabel, archiveLabel }: Props) {
  const pathname = usePathname() ?? '';
  const isArchive = pathname.startsWith(`/${locale}/archive`);
  const isHome = pathname === `/${locale}`;
  const linkClass = (active: boolean) =>
    `text-small no-underline ${active ? 'text-lamp' : 'text-muted hover:text-text'}`;

  return (
    <nav className="flex gap-4">
      <Link href={`/${locale}`} className={linkClass(isHome)}>
        {homeLabel}
      </Link>
      <Link href={`/${locale}/archive`} className={linkClass(isArchive)}>
        {archiveLabel}
      </Link>
    </nav>
  );
}
