import type { Meta, StoryObj } from '@storybook/react-vite';

import { Popover } from './popover';

const meta = {
  title: 'Components/Popover',
  component: Popover,
  args: {
    label: 'Import tips',
    children: (
      <>
        <p className="m-0 mb-1 font-medium text-foreground">Before you import</p>
        <ul className="m-0 flex list-disc flex-col gap-1 pl-4">
          <li>Accepts .srt, .vtt, .ass and .ssa</li>
          <li>Every file needs a readable timeline</li>
          <li>Save files as UTF-8</li>
        </ul>
      </>
    ),
  },
} satisfies Meta<typeof Popover>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Info: Story = {};

export const CustomIcon: Story = {
  args: { icon: <span aria-hidden>!</span> },
};

export const AlignStart: Story = {
  args: { align: 'start' },
};
