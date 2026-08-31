'use client';

import Script from 'next/script';
import { useConsentState } from './useConsentState';

type Props = {
  slot: string;
  clientId: string;
};

// The half of AdSlot that depends on the reader. The pages are cached and
// shared, so the consent choice lives only in the browser: this waits for
// hydration, reads the cookie, and only then asks for the network script —
// non-personalised unless consent was granted. Until the cookie has been
// read, no request leaves the page at all.
export default function AdLoader({ slot, clientId }: Props) {
  const consent = useConsentState();
  if (consent === 'unknown') return null;

  return (
    // lazyOnload: never blocks first paint, hydration, or the map render.
    <Script
      id={`adsbygoogle-${slot}`}
      strategy="lazyOnload"
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${clientId}`}
      crossOrigin="anonymous"
      data-npa={consent === 'granted' ? '0' : '1'}
    />
  );
}
