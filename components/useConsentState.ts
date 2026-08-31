'use client';

import { useSyncExternalStore } from 'react';
import { readConsentCookie, type ConsentState } from '@/lib/consent';

// 'unknown' is the server's answer: the pages are cached and shared, so the
// HTML cannot know any one reader's choice. Everything consuming this hook
// renders nothing while it holds — a banner or an ad script that flashed on a
// guess would be answering for the reader.
export type BrowserConsent = ConsentState | 'unknown';

// document.cookie has no change event worth chasing here: the only writer is
// the consent banner itself, which keeps its own state for the same render.
const subscribe = () => () => {};
const readServer = (): BrowserConsent => 'unknown';

export function useConsentState(): BrowserConsent {
  return useSyncExternalStore(subscribe, readConsentCookie, readServer);
}
