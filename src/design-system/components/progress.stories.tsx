import type { Meta, StoryObj } from '@storybook/react-vite';

import { Progress } from './progress';

const meta = {
  title: 'Components/Progress',
  component: Progress,
  args: { label: '正在下载并导入字幕…' },
} satisfies Meta<typeof Progress>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Indeterminate: Story = {};

export const Half: Story = { args: { value: 50 } };

export const Complete: Story = { args: { value: 100 } };
