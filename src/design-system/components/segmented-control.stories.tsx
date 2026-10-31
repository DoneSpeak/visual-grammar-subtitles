import * as React from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { SegmentedControl } from './segmented-control';

const THEMES = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'system', label: '跟随系统' },
] as const;

const meta = {
  title: 'Components/SegmentedControl',
  component: SegmentedControl,
  args: { options: THEMES, 'aria-label': '主题', fill: false, value: 'light', onChange: () => undefined },
} satisfies Meta<typeof SegmentedControl>;

export default meta;
type Story = StoryObj<typeof meta>;

function Demo({ fill }: { fill?: boolean }) {
  const [value, setValue] = React.useState<string>('light');
  return (
    <div className={fill ? 'w-[200px]' : ''}>
      <SegmentedControl options={THEMES} aria-label="主题" fill={fill} value={value} onChange={setValue} />
    </div>
  );
}

export const Inline: Story = { render: (args) => <Demo fill={args.fill} /> };
export const Fill: Story = { render: () => <Demo fill /> };
