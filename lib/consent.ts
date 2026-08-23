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
