import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import HomeOutages from './HomeOutages';
import OutageCard from './OutageCard';
import { deriveStatus } from '../lib/time';
import { DISTRICT_IDS, DISTRICTS } from '../lib/districts';
import { dicts, mockOutages, NOW } from '../.storybook/fixtures';

const dict = dicts.tr;
const items = mockOutages
  .filter((o) => deriveStatus(o, NOW) !== 'past')
  .map((outage) => ({
    id: outage.id,
    districts: [outage.district],
    node: <OutageCard outage={outage} status={deriveStatus(outage, NOW)} locale="tr" dict={dict} now={NOW} />,
  }));

const strings = {
  titleAll: dict.list.titleAll,
  titleDistrict: dict.list.titleDistrict,
  sorted: dict.list.sorted,
  filterAriaLabel: dict.filter.ariaLabel,
  filterAll: dict.filter.all,
};

const meta = {
  title: 'Components/HomeOutages',
  component: HomeOutages,
  args: {
    items,
    districts: DISTRICT_IDS.map((id) => ({ id, name: DISTRICTS[id].name })),
    strings,
    basePath: '/tr',
    locale: 'tr',
    firstBlock: 6,
    adSlot: null,
    emptyLine: dict.list.empty,
  },
} satisfies Meta<typeof HomeOutages>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ActiveAndUpcoming: Story = {};

// An ad slot breaks up the list after the first block of cards (§11.3).
export const WithAdBreak: Story = {
  args: {
    firstBlock: 2,
    adSlot: (
      <div style={{ margin: '24px 0', padding: 16, border: '1px dashed var(--color-dark)', textAlign: 'center', color: 'var(--color-muted)' }}>
        ad slot
      </div>
    ),
  },
};

export const Empty: Story = { args: { items: [] } };
