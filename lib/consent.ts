export const CONSENT_COOKIE = 'consent';

// Six months. Long enough not to nag, short enough that the choice is revisited
// eventually.
export const CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 182;

export type ConsentChoice = 'granted' | 'denied';

export type ConsentState = ConsentChoice | 'unanswered';

export function isConsentChoice(value: string | undefined): value is ConsentChoice {
  return value === 'granted' || value === 'denied';
}

export function readConsent(value: string | undefined): ConsentState {
  return isConsentChoice(value) ? value : 'unanswered';
}

/**
 * Whether advertising is actually configured.
 *
 * Without a network client id `AdSlot` renders nothing at all, so no
 * advertising cookie is ever set — and a consent dialog for cookies that do
 * not exist is a question with no honest answer. It also trains a reader to
 * dismiss the banner, so it is worth less on the day it does matter.
 *
 * Gating on the same value `AdSlot` checks means the banner comes back on its
 * own the moment ads are switched on, rather than being a step someone has to
 * remember (§11.6).
 */
export function adsConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_AD_CLIENT_ID);
}
