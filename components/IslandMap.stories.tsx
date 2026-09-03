import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import IslandMap from './IslandMap';
import { islandMapProps } from '../.storybook/fixtures';

const meta = {
  title: 'Components/IslandMap',
  component: IslandMap,
  parameters: { layout: 'fullscreen' },
  args: islandMapProps('tr'),
} satisfies Meta<typeof IslandMap>;

export default meta;
type Story = StoryObj<typeof meta>;

// The full lit-up island, with the mock day's active faults dark and the
// places that came back on today ringed as embers (§3.3).
export const Default: Story = {};

export const AllLit: Story = { args: { ...meta.args, outages: {}, embers: [] } };

// A night hour: the sky wash comes on near dawn and dusk.
export const NightHour: Story = { args: { ...meta.args, hour: 4 } };

export const English: Story = { args: islandMapProps('en') };
