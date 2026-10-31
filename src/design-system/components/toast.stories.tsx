import type { Meta, StoryObj } from '@storybook/react-vite';
import { useStorybookTheme } from '../lib/storybook-theme';

import { Button } from './button';
import { Toaster, toast } from './toast';

const meta = {
  title: 'Components/Toast',
  component: Toaster,
  parameters: { layout: 'fullscreen' },
  args: { theme: 'light' },
} satisfies Meta<typeof Toaster>;

export default meta;
type Story = StoryObj<typeof meta>;

const notify = (kind: 'success' | 'error' | 'info') => {
  if (kind === 'success') toast.success('已导入 24 条字幕');
  else if (kind === 'error') toast.error('导入失败', { description: '文件格式不受支持。' });
  else toast('正在搜索 kitsunekko…', { description: '首次搜索需要加载索引。' });
};

export const Default: Story = {
  render: () => {
    const theme = useStorybookTheme();
    return (
      <>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => notify('success')}>成功</Button>
          <Button onClick={() => notify('error')}>错误</Button>
          <Button onClick={() => notify('info')}>信息</Button>
        </div>
        <Toaster theme={theme} />
      </>
    );
  },
};
