import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import DistrictFilter from './DistrictFilter';
import { dicts } from '../.storybook/fixtures';

const meta = {
  title: 'Components/DistrictFilter',
  component: DistrictFilter,
  args: { dict: dicts.tr, selected: null, basePath: '/tr' },
} satisfies Meta<typeof DistrictFilter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllSelected: Story = {};

export const OneDistrictSelected: Story = { args: { selected: 'girne' } };

// The archive keeps its month filter in the query when a district is chosen.
export const PreservesExtraQuery: Story = {
  args: { selected: 'gazimagusa', basePath: '/tr/arsiv', extraQuery: { month: '2026-08' } },
};
