import { Card, CardTitle, Kbd, PageHeader, SettingRow } from '@/design-system';
import { t, type MessageKey } from '@/shared/i18n';

type Shortcut = { titleKey: MessageKey; descriptionKey: MessageKey; keys: string[] };

const groups: { titleKey: MessageKey; rows: Shortcut[] }[] = [
  {
    titleKey: 'keys.group.time',
    rows: [
      {
        titleKey: 'keys.offset.title',
        descriptionKey: 'keys.offset.description',
        keys: ['Alt', '[', ']'],
      },
      {
        titleKey: 'keys.replay.title',
        descriptionKey: 'keys.replay.description',
        keys: ['Alt', 'Enter'],
      },
      {
        titleKey: 'keys.reshow.title',
        descriptionKey: 'keys.reshow.description',
        keys: ['Alt', 'P'],
      },
    ],
  },
  {
    titleKey: 'keys.group.ad',
    rows: [
      {
        titleKey: 'keys.skip.title',
        descriptionKey: 'keys.skip.description',
        keys: ['Alt', 'S'],
      },
    ],
  },
  {
    titleKey: 'keys.group.appearance',
    rows: [
      {
        titleKey: 'keys.translation.title',
        descriptionKey: 'keys.translation.description',
        keys: ['Alt', '\\'],
      },
      {
        titleKey: 'keys.font.title',
        descriptionKey: 'keys.font.description',
        keys: ['Alt', '=', '-'],
      },
      {
        titleKey: 'keys.move.title',
        descriptionKey: 'keys.move.description',
        keys: ['Alt', '↑', '↓', '←', '→'],
      },
    ],
  },
  {
    titleKey: 'keys.group.panel',
    rows: [
      {
        titleKey: 'keys.close.title',
        descriptionKey: 'keys.close.description',
        keys: ['Esc'],
      },
    ],
  },
];

export function KeysPage() {
  return (
    <>
      <PageHeader title={t('keys.title')} description={t('keys.description')} />
      {groups.map((group) => (
        <Card key={group.titleKey}>
          <CardTitle>{t(group.titleKey)}</CardTitle>
          <div className="mt-2">
            {group.rows.map((row) => (
              <SettingRow
                key={row.titleKey}
                title={t(row.titleKey)}
                description={t(row.descriptionKey)}
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
