'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CONSENT_COOKIE, CONSENT_MAX_AGE_SECONDS, type ConsentChoice } from '@/lib/consent';
import type { Locale } from '@/lib/i18n/config';

type Props = {
  locale: Locale;
  strings: { title: string; body: string; accept: string; reject: string; more: string };
};

// Shown before any advertising cookie is set (§11.6). It sits at the bottom of
// the viewport and never covers the status bar or the headline — §11.1 applies
// to consent UI too. "Reject" is one click and as prominent as "Accept": no
// pre-ticked boxes, no cookie wall, no second screen.
//
// Rendered only when the choice is still unanswered, so a refusal is never
// re-prompted.
export default function ConsentBanner({ locale, strings }: Props) {
  const [answered, setAnswered] = useState(false);

  const answer = (choice: ConsentChoice) => {
    document.cookie = `${CONSENT_COOKIE}=${choice}; path=/; max-age=${CONSENT_MAX_AGE_SECONDS}; samesite=lax`;
    setAnswered(true);
  };

  if (answered) return null;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label={strings.title}
      className="sticky bottom-0 z-20 border-t border-dark bg-night"
    >
      <div className="mx-auto flex w-full max-w-[1060px] flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="m-0 max-w-[62ch] text-pretty text-meta text-muted">
          <span className="text-text">{strings.title}.</span> {strings.body}{' '}
          <Link href={`/${locale}/privacy`} className="text-text underline decoration-muted underline-offset-[3px] hover:text-lamp">
            {strings.more}
          </Link>
        </p>
        <div className="flex flex-none gap-2">
          {/* Equal weight, both one click. */}
          <button
            type="button"
            onClick={() => answer('denied')}
            className="min-h-11 rounded-[2px] border border-dark px-4 text-small text-text hover:border-lamp"
          >
            {strings.reject}
          </button>
          <button
            type="button"
            onClick={() => answer('granted')}
            className="min-h-11 rounded-[2px] border border-lamp px-4 text-small text-lamp hover:bg-transparent"
          >
            {strings.accept}
          </button>
        </div>
      </div>
    </div>
  );
}
