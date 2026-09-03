import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import Countdown from './Countdown';
import { dicts, NOW } from '../.storybook/fixtures';

const units = { day: dicts.tr.time.day, hour: dicts.tr.time.hour, minute: dicts.tr.time.minute };

const meta = {
  title: 'Components/Countdown',
  component: Countdown,
  args: { units, initialNow: NOW },
} satisfies Meta<typeof Countdown>;

export default meta;
type Story = StoryObj<typeof meta>;

export const UntilStart: Story = {
  args: {
    targetIso: new Date(NOW + 2.5 * 3600000).toISOString(),
    pattern: dicts.tr.countdown.untilStart,
    direction: 'until',
  },
};

export const UntilEnd: Story = {
  args: {
    targetIso: new Date(NOW + 45 * 60000).toISOString(),
    pattern: dicts.tr.countdown.untilEnd,
    direction: 'until',
  },
};

// A fault with no announced end counts up from its start instead.
export const SinceStart: Story = {
  args: {
    targetIso: new Date(NOW - 3 * 3600000 - 20 * 60000).toISOString(),
    pattern: dicts.tr.countdown.sinceStart,
    direction: 'since',
  },
};
