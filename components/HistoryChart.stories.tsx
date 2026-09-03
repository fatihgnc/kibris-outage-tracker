import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import HistoryChart from './HistoryChart';
import { chartStrings, monthlyTotals } from '../.storybook/fixtures';

const meta = {
  title: 'Components/HistoryChart',
  component: HistoryChart,
  args: { totals: monthlyTotals, locale: 'tr', strings: chartStrings('tr') },
} satisfies Meta<typeof HistoryChart>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TwelveMonths: Story = {};

export const QuietYear: Story = {
  args: { totals: monthlyTotals.map((t) => ({ ...t, plannedHours: 0, faultHours: 0, openFaults: 0 })) },
};

export const WithOpenFaults: Story = {
  args: {
    totals: monthlyTotals.map((t, i) => (i === monthlyTotals.length - 1 ? { ...t, openFaults: 2 } : t)),
  },
};
