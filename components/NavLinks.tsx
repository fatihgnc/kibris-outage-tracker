'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Locale } from '@/lib/i18n/config';

type Props = { locale: Locale; homeLabel: string; archiveLabel: string; guidesLabel: string };

export default function NavLinks({ locale, homeLabel, archiveLabel, guidesLabel }: Props) {
  const pathname = usePathname() ?? '';
  const linkClass = (active: boolean) =>
    `text-small no-underline ${active ? 'text-lamp' : 'text-muted hover:text-text'}`;

  return (
    <nav className="flex gap-4">
      <Link href={`/${locale}`} className={linkClass(pathname === `/${locale}`)}>
        {homeLabel}
      </Link>
      <Link href={`/${locale}/archive`} className={linkClass(pathname.startsWith(`/${locale}/archive`))}>
        {archiveLabel}
      </Link>
      <Link href={`/${locale}/guides`} className={linkClass(pathname.startsWith(`/${locale}/guides`))}>
        {guidesLabel}
      </Link>
    </nav>
  );
}
