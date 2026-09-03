import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import LocaleSwitcher from './LocaleSwitcher';
import { dicts } from '../.storybook/fixtures';

const meta = {
  title: 'Components/LocaleSwitcher',
  component: LocaleSwitcher,
  parameters: { nextjs: { navigation: { pathname: '/tr/bolge/girne' } } },
  args: { locale: 'tr', labels: dicts.tr.switcher },
} satisfies Meta<typeof LocaleSwitcher>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Turkish: Story = {};

export const English: Story = {
  parameters: { nextjs: { navigation: { pathname: '/en/district/girne' } } },
  args: { locale: 'en', labels: dicts.en.switcher },
};
