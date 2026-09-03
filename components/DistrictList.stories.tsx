import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import DistrictList from './DistrictList';
import { dicts, mockOutages, NOW } from '../.storybook/fixtures';

const meta = {
  title: 'Components/DistrictList',
  component: DistrictList,
  args: { locale: 'tr', dict: dicts.tr, now: NOW },
} satisfies Meta<typeof DistrictList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MixedState: Story = { args: { outages: mockOutages } };

export const AllQuiet: Story = { args: { outages: [] } };
