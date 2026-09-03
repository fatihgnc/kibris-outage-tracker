import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import MapLegend from './MapLegend';
import { mapLegendProps } from '../.storybook/fixtures';

const meta = {
  title: 'Components/MapLegend',
  component: MapLegend,
  args: mapLegendProps('tr'),
} satisfies Meta<typeof MapLegend>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const English: Story = { args: mapLegendProps('en') };

export const Narrow: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
  decorators: [(Story) => <div style={{ maxWidth: 360 }}><Story /></div>],
};
