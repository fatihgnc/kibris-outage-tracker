import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import IslandMapMini from './IslandMapMini';
import { geometry } from '../.storybook/fixtures';

const meta = {
  title: 'Components/IslandMapMini',
  component: IslandMapMini,
  args: {
    viewBox: geometry.viewBox,
    islandPath: geometry.islandPath,
    districts: geometry.districts,
    settlements: geometry.settlements,
    ariaLabel: 'Girne bölgesi haritadaki konumu',
    caption: 'Girne, adanın kuzeyinde',
  },
  decorators: [(Story) => <div style={{ maxWidth: 420 }}><Story /></div>],
} satisfies Meta<typeof IslandMapMini>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Girne: Story = { args: { district: 'girne' } };

export const Lefkosa: Story = { args: { district: 'lefkosa', caption: 'Lefkoşa, adanın ortasında' } };

export const Iskele: Story = { args: { district: 'iskele', caption: 'İskele, adanın doğusunda' } };
