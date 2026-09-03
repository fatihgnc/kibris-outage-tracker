import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import KindBadge from './KindBadge';
import { dicts } from '../.storybook/fixtures';

const meta = {
  title: 'Components/KindBadge',
  component: KindBadge,
  args: { dict: dicts.tr },
  argTypes: { dict: { table: { disable: true } } },
} satisfies Meta<typeof KindBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Planned: Story = { args: { kind: 'planned' } };
export const Fault: Story = { args: { kind: 'fault' } };
export const Rotating: Story = { args: { kind: 'rotating' } };

export const AllKinds: Story = {
  args: { kind: 'planned' },
  render: (args) => (
    <div style={{ display: 'flex', gap: 8 }}>
      <KindBadge {...args} kind="planned" />
      <KindBadge {...args} kind="rotating" />
      <KindBadge {...args} kind="fault" />
    </div>
  ),
};
