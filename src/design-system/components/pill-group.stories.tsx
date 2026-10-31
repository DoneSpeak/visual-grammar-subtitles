import * as React from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { PillGroup } from './pill-group';

const LEVELS = [
  { value: 'n5', label: 'N5' },
  { value: 'n4', label: 'N4' },
  { value: 'n3', label: 'N3' },
  { value: 'n2', label: 'N2' },
  { value: 'n1', label: 'N1' },
] as const;

const meta = {
  title: 'Components/PillGroup',
  component: PillGroup,
  args: {
    options: LEVELS,
    name: 'level',
    'aria-label': 'JLPT 等级',
    disabled: false,
    value: 'n5',
    onChange: () => undefined,
  },
} satisfies Meta<typeof PillGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

function Single({ initial = 'n5', disabled }: { initial?: (typeof LEVELS)[number]['value']; disabled?: boolean }) {
  const [value, setValue] = React.useState<string>(initial);
  return (
    <PillGroup
      options={LEVELS}
      name="level"
      aria-label="JLPT 等级"
      disabled={disabled}
      value={value}
      onChange={(next) => setValue(next as string)}
    />
  );
}

function Multiple({ disabled }: { disabled?: boolean }) {
  const [value, setValue] = React.useState<string[]>(['n5', 'n4']);
  return (
    <PillGroup
      options={LEVELS}
      name="level"
      aria-label="JLPT 等级"
      multiple
      value={value}
      onChange={(next) => setValue(next as string[])}
      disabled={disabled}
    />
  );
}

export const SingleSelect: Story = { render: (args) => <Single {...args} /> };
export const MultiSelect: Story = { render: (args) => <Multiple disabled={args.disabled} /> };
export const Disabled: Story = { render: (args) => <Single {...args} disabled /> };
