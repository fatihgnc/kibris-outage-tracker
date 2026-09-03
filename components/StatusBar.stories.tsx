import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import StatusBar from './StatusBar';
import { dicts, mockOutages, NOW } from '../.storybook/fixtures';

const meta = {
  title: 'Components/StatusBar',
  component: StatusBar,
  parameters: { layout: 'fullscreen' },
  args: { locale: 'tr', dict: dicts.tr, now: NOW },
} satisfies Meta<typeof StatusBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ActiveFault: Story = {
  args: { outages: mockOutages, freshness: { lastCheckedAt: new Date(NOW - 3 * 60000).toISOString(), stale: false } },
};

export const AllClear: Story = {
  args: { outages: [], freshness: { lastCheckedAt: new Date(NOW - 3 * 60000).toISOString(), stale: false } },
};

// Stale data is said out loud rather than served silently (§10.7).
export const Stale: Story = {
  args: {
    outages: mockOutages,
    freshness: { lastCheckedAt: new Date(NOW - 5 * 3600000).toISOString(), stale: true },
  },
};

export const NeverChecked: Story = {
  args: { outages: [], freshness: { lastCheckedAt: null, stale: true } },
};
