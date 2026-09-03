import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import ConsentBanner from './ConsentBanner';
import { dicts } from '../.storybook/fixtures';

const meta = {
  title: 'Components/ConsentBanner',
  component: ConsentBanner,
  parameters: {
    layout: 'fullscreen',
    // Shown only while the choice is unanswered — the iframe's cookie jar
    // starts empty each load, which is exactly that state.
  },
  args: { locale: 'tr', strings: dicts.tr.consent },
} satisfies Meta<typeof ConsentBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

// Reject is one click and as prominent as Accept — no pre-ticked boxes,
// no cookie wall (§11.6).
export const Unanswered: Story = {};
