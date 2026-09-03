import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import FilterChips, { type Chip } from './FilterChips';
import { DISTRICT_IDS, DISTRICTS } from '../lib/districts';

const chips: Chip[] = [
  { key: 'all', name: 'Tümü', href: '/tr', active: true },
  ...DISTRICT_IDS.map((id) => ({ key: id, name: DISTRICTS[id].name, href: `/tr?district=${id}`, active: false })),
];

const meta = {
  title: 'Components/FilterChips',
  component: FilterChips,
  args: { ariaLabel: 'Bölgeye göre filtrele', chips },
} satisfies Meta<typeof FilterChips>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Links: Story = {};

export const Selected: Story = {
  args: { chips: chips.map((c, i) => ({ ...c, active: i === 2 })) },
};

// The home page filters client-side, through onSelect, instead of navigating.
export const ClientHandled: Story = {
  args: { chips, onSelect: fn() },
};
