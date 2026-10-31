import type { Meta, StoryObj } from '@storybook/react-vite';

import { Button } from './button';
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger } from './dialog';

const meta = {
  title: 'Components/Dialog',
  component: Dialog,
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ConfirmDelete: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="destructive">删除整包</Button>
      </DialogTrigger>
      <DialogContent
        title="删除「进击的巨人」？"
        description="该字幕包及其 24 条字幕将被移除，此操作不可撤销。"
      >
        <DialogFooter>
          <DialogClose asChild>
            <Button>取消</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button variant="primary" onClick={() => undefined}>
              删除
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};
