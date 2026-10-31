import { Card, PageHeader, PillGroup, SettingRow, Switch } from '@/design-system';
import { DurationInput } from '@/features/dict/duration-input';
import type { DictTrigger } from '@/shared/dictSettings';
import type { DictSettingsController } from '../hooks/use-dict-settings';

const levelOptions = [
  { value: '1', label: 'N1' },
  { value: '2', label: 'N2' },
  { value: '3', label: 'N3' },
  { value: '4', label: 'N4' },
  { value: '5', label: 'N5' },
] as const;

const triggerOptions: { value: DictTrigger; label: string }[] = [
  { value: 'click', label: '点击' },
  { value: 'hover', label: '悬停' },
];

const durationOptions = [
  { value: 'cue', label: '跟随字幕' },
  { value: 'fixed', label: '固定' },
] as const;

const pronounceOptions = [{ value: 'romaji', label: '罗马音' }] as const;

export function DictPage({ dict }: { dict: DictSettingsController }) {
  const { settings } = dict;
  const off = !settings.enabled;

  const levels = levelOptions
    .filter((option) => settings.levels[Number(option.value) as keyof typeof settings.levels])
    .map((option) => option.value);

  return (
    <>
      <PageHeader title="学习词典" description="字幕里的 JLPT 单词可点击查词，设置改动在播放页立即生效。" />
      <Card>
        <SettingRow title="启用查词" description="识别字幕中的词条并标记为可交互">
          <Switch
            checked={settings.enabled}
            aria-label="启用查词"
            onCheckedChange={(enabled) => void dict.save({ enabled })}
          />
        </SettingRow>

        <SettingRow title="JLPT 等级" description="只对所选等级的词汇生效">
          <PillGroup
            name="dictLevels"
            multiple
            disabled={off}
            options={levelOptions}
            value={levels}
            aria-label="JLPT 等级"
            onChange={(next) => {
              const selected = new Set(next as string[]);
              void dict.save({
                levels: {
                  1: selected.has('1'),
                  2: selected.has('2'),
                  3: selected.has('3'),
                  4: selected.has('4'),
                  5: selected.has('5'),
                },
              });
            }}
          />
        </SettingRow>

        <SettingRow title="触发方式" description="点击更稳定，悬停更快">
          <PillGroup
            name="dictTrigger"
            disabled={off}
            options={triggerOptions}
            value={settings.trigger}
            aria-label="触发方式"
            onChange={(next) => void dict.save({ trigger: next as DictTrigger })}
          />
        </SettingRow>

        <SettingRow title="查词时暂停" description="点击词条查词时暂停播放">
          <Switch
            checked={settings.pauseOnLookup}
            disabled={off || settings.trigger !== 'click'}
            aria-label="查词时暂停播放"
            onCheckedChange={(pauseOnLookup) => void dict.save({ pauseOnLookup })}
          />
        </SettingRow>

        <SettingRow title="卡片持续" description="跟随字幕或固定显示时长">
          <PillGroup
            name="dictDuration"
            disabled={off}
            options={durationOptions}
            value={settings.duration.mode}
            aria-label="卡片持续"
            onChange={(next) =>
              void dict.save({ duration: { ...settings.duration, mode: next as 'cue' | 'fixed' } })
            }
          />
          <DurationInput
            valueMs={settings.duration.ms}
            disabled={off || settings.duration.mode !== 'fixed'}
            aria-label="固定显示秒数"
            onChange={(seconds) => void dict.setDurationSeconds(seconds)}
          />
          <span className="text-2xs text-text-faint">秒</span>
        </SettingRow>

        <SettingRow title="发音显示" description="词卡里的读音呈现方式">
          <PillGroup
            name="dictPronounce"
            multiple
            disabled={off}
            options={pronounceOptions}
            value={settings.pronunciation.romaji ? ['romaji'] : []}
            aria-label="发音显示"
            onChange={(next) =>
              void dict.save({ pronunciation: { romaji: (next as string[]).includes('romaji') } })
            }
          />
        </SettingRow>
      </Card>
      <p className="text-2xs text-text-faint">词表来自 JMdict + open-anki-jlpt-decks；未收录的词不可点击。</p>
    </>
  );
}
