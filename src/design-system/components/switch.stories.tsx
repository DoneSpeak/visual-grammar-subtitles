import * as React from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { Switch } from './switch';

const meta = {
  title: 'Components/Switch',
  component: Switch,
  args: { disabled: false },
} satisfies Meta<typeof Switch>;

export default meta;
type Story = StoryObj<typeof meta>;

function Toggle({ initial = false, ...rest }: { initial?: boolean; disabled?: boolean }) {
  const [checked, setChecked] = React.useState(initial);
  return <Switch checked={checked} onCheckedChange={setChecked} {...rest} />;
}

export const Off: Story = { render: (args) => <Toggle {...args} /> };
export const On: Story = { render: (args) => <Toggle {...args} initial /> };
export const Disabled: Story = { render: (args) => <Toggle {...args} disabled /> };
