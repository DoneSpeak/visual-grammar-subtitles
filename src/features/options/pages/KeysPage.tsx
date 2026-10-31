import { Card, CardTitle, Kbd, PageHeader, SettingRow } from '@/design-system';

type Shortcut = { title: string; description: string; keys: string[] };

const groups: { title: string; rows: Shortcut[] }[] = [
  {
    title: '时间',
    rows: [
      {
        title: '字幕偏移',
        description: '左括号提前、右括号延后；按住 Shift 步进 0.5 秒',
        keys: ['Alt', '[', ']'],
      },
      {
        title: '重听当前句',
        description: '回到当前字幕起点前 0.15 秒重新播放',
        keys: ['Alt', 'Enter'],
      },
      {
        title: '重显字幕',
        description: '强制显示 1.8 秒，不受“显示时长”限制',
        keys: ['Alt', 'P'],
      },
    ],
  },
  {
    title: '外观',
    rows: [
      {
        title: '切换译文层',
        description: '临时隐藏或恢复译文，不改动原文',
        keys: ['Alt', '\\'],
      },
      {
        title: '原文字号',
        description: '等号放大、减号缩小；按住 Shift 粗调',
        keys: ['Alt', '=', '-'],
      },
      {
        title: '移动原文',
        description: '方向键每次移动 1%，仅作用于原文层',
        keys: ['Alt', '↑', '↓', '←', '→'],
      },
    ],
  },
  {
    title: '面板',
    rows: [
      {
        title: '关闭',
        description: '收起查词卡片；库列表里同时关闭下拉',
        keys: ['Esc'],
      },
    ],
  },
];

export function KeysPage() {
  return (
    <>
      <PageHeader title="快捷键" description="仅在播放页生效，统一用 Alt 起手，不会拦截普通输入。" />
      {groups.map((group) => (
        <Card key={group.title}>
          <CardTitle>{group.title}</CardTitle>
          <div className="mt-2">
            {group.rows.map((row) => (
              <SettingRow
                key={row.title}
                title={row.title}
                description={row.description}
                align="center"
              >
                <span className="inline-flex flex-none items-center gap-1">
                  {row.keys.map((key) => (
                    <Kbd key={key}>{key}</Kbd>
                  ))}
                </span>
              </SettingRow>
            ))}
          </div>
        </Card>
      ))}
    </>
  );
}
