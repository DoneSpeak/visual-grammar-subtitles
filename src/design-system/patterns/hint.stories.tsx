import type { Meta, StoryObj } from '@storybook/react-vite';

import { Hint } from './hint';

const meta = {
  title: 'Patterns/Hint',
  component: Hint,
  args: { children: '拖入 .srt / .vtt / .ass 字幕后会自动归包。' },
} satisfies Meta<typeof Hint>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Inline: Story = {};

export const Warning: Story = {
  args: { tone: 'warning', children: '下载内容里没有字幕文件。' },
};

export const DisclosureCollapsed: Story = {
  args: {
    label: '提示',
    children: (
      <>
        <span>kitsunekko 用英文 / 罗马音命名。</span>
        <span>找不到？去 OpenSubtitles 下载后再导入。</span>
      </>
    ),
  },
};

export const DisclosureOpen: Story = {
  args: {
    label: '提示',
    defaultOpen: true,
    children: (
      <>
        <span>kitsunekko 用英文 / 罗马音命名。</span>
        <span>找不到？去 OpenSubtitles 下载后再导入。</span>
      </>
    ),
  },
};
