import type { Meta, StoryObj } from '@storybook/react-vite';

import { Badge } from './badge';

const meta = {
  title: 'Components/Badge',
  component: Badge,
  args: { children: '标签' },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Tag: Story = { args: { variant: 'tag', children: '字幕' } };
export const Count: Story = { args: { variant: 'count', children: '12' } };
export const Dot: Story = { args: { variant: 'dot', children: 'N3' } };

export const All: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Badge variant="tag">字幕</Badge>
      <Badge variant="count">12</Badge>
      <Badge variant="dot">N3</Badge>
    </div>
  ),
};
