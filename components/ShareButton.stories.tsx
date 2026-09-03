import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import ShareButton from './ShareButton';
import { dicts } from '../.storybook/fixtures';

const meta = {
  title: 'Components/ShareButton',
  component: ShareButton,
  args: {
    title: 'Girne elektrik kesintisi',
    url: 'https://example.com/tr/kesinti/f8c4df7fb73e24db',
    labels: dicts.tr.share,
  },
} satisfies Meta<typeof ShareButton>;

export default meta;
type Story = StoryObj<typeof meta>;

// Click it: on a real handheld this opens the native share sheet, everywhere
// else it copies the link and shows the "copied" receipt for two seconds.
export const Default: Story = {};
