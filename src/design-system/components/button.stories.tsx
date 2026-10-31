import type { Meta, StoryObj } from '@storybook/react-vite';
import { Download, Plus } from 'lucide-react';

import { Button } from './button';

const meta = {
  title: 'Components/Button',
  component: Button,
  args: { children: '按钮' },
  argTypes: {
    variant: { control: 'select', options: ['default', 'primary', 'destructive', 'ghost'] },
    size: { control: 'select', options: ['sm', 'default', 'lg', 'icon', 'icon-sm'] },
    disabled: { control: 'boolean' },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Variants: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-2">
      <Button {...args} variant="default">
        默认
      </Button>
      <Button {...args} variant="primary">
        主要
      </Button>
      <Button {...args} variant="destructive">
        危险
      </Button>
      <Button {...args} variant="ghost">
        幽灵
      </Button>
    </div>
  ),
};

export const Sizes: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-2">
      <Button {...args} size="sm">
        小
      </Button>
      <Button {...args} size="default">
        默认
      </Button>
      <Button {...args} size="lg">
        大
      </Button>
      <Button {...args} size="icon" aria-label="新增">
        <Plus className="size-3.5" />
      </Button>
    </div>
  ),
};

export const WithIcon: Story = {
  args: { variant: 'primary', children: (<><Download className="size-3.5" />导入</>) },
};

export const Disabled: Story = {
  args: { disabled: true, children: '不可用' },
};
