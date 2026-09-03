import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import OutageCard from './OutageCard';
import { dicts, mockOutages, NOW, outageByKind } from '../.storybook/fixtures';
import { deriveStatus } from '../lib/time';

const meta = {
  title: 'Components/OutageCard',
  component: OutageCard,
  parameters: { layout: 'padded' },
  decorators: [(Story) => <div style={{ maxWidth: 340 }}><Story /></div>],
  args: { locale: 'tr', dict: dicts.tr, now: NOW },
} satisfies Meta<typeof OutageCard>;

export default meta;
type Story = StoryObj<typeof meta>;

const planned = outageByKind('planned', 'active');
const fault = outageByKind('fault', 'active'); // open-ended: counts up from start
const upcoming = outageByKind('planned', 'upcoming');
const districtWide = mockOutages.find((o) => o.scope === 'district')!;

export const Active: Story = {
  args: { outage: planned, status: deriveStatus(planned, NOW) },
};

export const ActiveFaultOpenEnded: Story = {
  args: { outage: fault, status: deriveStatus(fault, NOW) },
};

export const Upcoming: Story = {
  args: { outage: upcoming, status: deriveStatus(upcoming, NOW) },
};

export const Past: Story = {
  args: {
    outage: mockOutages.find((o) => deriveStatus(o, NOW) === 'past' && o.endsAt)!,
    status: 'past',
  },
};

// A fault with no announced end that has fallen out of the active window
// (§10.7 caveat, NO_END_ASSUMED_OVER_MS): the card says the end is assumed,
// not announced. None of the mock records happen to be this old and open, so
// one is built from the open fault above.
const unconfirmedPast = { ...fault, id: 'a'.repeat(32), startsAt: new Date(NOW - 100 * 3600000).toISOString() };
export const PastUnconfirmedEnd: Story = {
  args: { outage: unconfirmedPast, status: deriveStatus(unconfirmedPast, NOW) },
};

export const DistrictWide: Story = {
  args: { outage: districtWide, status: deriveStatus(districtWide, NOW) },
};

// A retraction, only ever shown in the archive: the hours are struck through
// so they never read as fact.
export const Cancelled: Story = {
  args: { outage: planned, status: 'past', cancelled: true },
};

// The archive's smaller variant: no countdown, compact time block.
export const Compact: Story = {
  args: { outage: mockOutages.find((o) => deriveStatus(o, NOW) === 'past' && o.endsAt)!, status: 'past', compact: true },
};

// The same fault filed for neighbouring districts too (lib/events.ts).
export const WithSiblings: Story = {
  args: {
    outage: districtWide,
    status: deriveStatus(districtWide, NOW),
    siblings: [
      { district: 'guzelyurt', endsAt: null },
      { district: 'girne', endsAt: new Date(NOW - 30 * 60000).toISOString() },
    ],
  },
};
