import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import ArchiveMonthSelect from './ArchiveMonthSelect';

const options = [
  { value: 'all', label: 'Tüm aylar' },
  { value: '2026-09', label: 'Eylül 2026' },
  { value: '2026-08', label: 'Ağustos 2026' },
  { value: '2026-07', label: 'Temmuz 2026' },
];

const meta = {
  title: 'Components/ArchiveMonthSelect',
  component: ArchiveMonthSelect,
  args: { value: 'all', options, label: 'Ay', basePath: '/tr/arsiv' },
} satisfies Meta<typeof ArchiveMonthSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllMonths: Story = {};

export const MonthChosen: Story = { args: { value: '2026-08' } };
