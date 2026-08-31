import AdLoader from './AdLoader';

// The three placements from §11.3. All below the fold, all in-content.
export type AdSlotName = 'home-mid' | 'district-mid' | 'guide-in-article' | 'archive-foot';

// Height is reserved in CSS before the unit loads, so nothing shifts under a
// reader's thumb (§11.4). These match the network unit sizes the slots request.
const RESERVED_HEIGHT: Record<AdSlotName, string> = {
  'home-mid': 'min-h-[280px] sm:min-h-[100px]',
  'district-mid': 'min-h-[280px] sm:min-h-[100px]',
  'guide-in-article': 'min-h-[280px] sm:min-h-[100px]',
  'archive-foot': 'min-h-[100px]',
};

type Props = {
  slot: AdSlotName;
  label: string;
  // Suppressed on views where the reader is already poorly served: errors,
  // empty states, and anything showing a stale-data warning (§11.3).
  suppressed?: boolean;
};

const CLIENT_ID = process.env.NEXT_PUBLIC_AD_CLIENT_ID;
const SLOT_IDS: Partial<Record<AdSlotName, string | undefined>> = {
  'home-mid': process.env.NEXT_PUBLIC_AD_SLOT_HOME_MID,
  'district-mid': process.env.NEXT_PUBLIC_AD_SLOT_DISTRICT_MID,
  'guide-in-article': process.env.NEXT_PUBLIC_AD_SLOT_GUIDE,
  'archive-foot': process.env.NEXT_PUBLIC_AD_SLOT_ARCHIVE,
};

// A single component for every placement — no ad markup is duplicated across
// pages (§11.4). It can render either a network unit or, later, a static local
// sponsor card from config (§11.8), without any page needing to change.
export default function AdSlot({ slot, label, suppressed = false }: Props) {
  // Nothing renders while running on mocks, so development and screenshots stay
  // clean (§11.4).
  const usingMocks = process.env.USE_MOCKS === 'true';
  const slotId = SLOT_IDS[slot];
  if (usingMocks || suppressed || !CLIENT_ID || !slotId) return null;

  return (
    <aside className="my-6" aria-label={label}>
      <p className="m-0 mb-1.5 font-mono text-meta uppercase tracking-[0.09em] text-muted">{label}</p>
      {/* The reserved box carries the site's card treatment — 1px border, same
       * radius — so the unit sits inside the design rather than on top of it.
       * If the network fails or is blocked, this collapses to an empty bordered
       * box with no broken frame and no "disable your ad blocker" text. */}
      <div className={`overflow-hidden rounded-[4px] border border-dark ${RESERVED_HEIGHT[slot]}`}>
        <ins
          className="adsbygoogle block"
          style={{ display: 'block' }}
          data-ad-client={CLIENT_ID}
          data-ad-slot={slotId}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      </div>
      {/* Consent, and with it the network script, is the reader's own — it
       * loads client-side so the cached page stays the same for everyone. */}
      <AdLoader slot={slot} clientId={CLIENT_ID} />
    </aside>
  );
}
