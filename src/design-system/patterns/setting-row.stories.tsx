import * as React from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { Button } from '../components/button';
import { PillGroup } from '../components/pill-group';
import { Switch } from '../components/switch';
import { SettingRow } from './setting-row';

const meta = {
  title: 'Patterns/SettingRow',
  component: SettingRow,
  args: { title: '启用查词', description: '悬停字幕中的日语词，显示读音与释义。' },
} satisfies Meta<typeof SettingRow>;

export default meta;
type Story = StoryObj<typeof meta>;

function Demo() {
  const [on, setOn] = React.useState(true);
  const [level, setLevel] = React.useState<string>('n4');
  return (
    <div className="max-w-[560px]">
      <SettingRow title="启用查词" description="悬停字幕中的日语词，显示读音与释义。">
        <Switch checked={on} onCheckedChange={setOn} aria-label="启用查词" />
      </SettingRow>
      <SettingRow title="取词等级" description="高于所选等级的词不显示卡片。">
        <PillGroup
          name="level"
          aria-label="取词等级"
          disabled={!on}
          value={level}
          onChange={(next) => setLevel(next as string)}
          options={[
            { value: 'n5', label: 'N5' },
            { value: 'n4', label: 'N4' },
            { value: 'n3', label: 'N3' },
            { value: 'n2', label: 'N2' },
          ]}
        />
      </SettingRow>
      <SettingRow title="重置全部设置" description="还原主题、字幕包与学习偏好。" align="center">
        <Button variant="destructive">重置</Button>
      </SettingRow>
    </div>
  );
}

export const Default: Story = { render: () => <Demo /> };
