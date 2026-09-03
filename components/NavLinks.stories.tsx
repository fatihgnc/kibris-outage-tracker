import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import NavLinks from './NavLinks';
import { dicts } from '../.storybook/fixtures';

const meta = {
  title: 'Components/NavLinks',
  component: NavLinks,
  args: { locale: 'tr', homeLabel: dicts.tr.nav.home, archiveLabel: dicts.tr.nav.archive, guidesLabel: dicts.tr.nav.guides },
} satisfies Meta<typeof NavLinks>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Home: Story = {
  parameters: { nextjs: { navigation: { pathname: '/tr' } } },
};

export const ArchiveActive: Story = {
  parameters: { nextjs: { navigation: { pathname: '/tr/arsiv' } } },
};

export const GuidesActive: Story = {
  parameters: { nextjs: { navigation: { pathname: '/tr/rehberler' } } },
};
