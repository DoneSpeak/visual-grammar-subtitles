import { Card, PageHeader, PillGroup, SettingRow, Switch } from '@/design-system';
import { DurationInput } from '@/features/dict/duration-input';
import type { MessageKey } from '@/shared/i18n';
import { t } from '@/shared/i18n';
import type { DictTrigger } from '@/shared/dictSettings';
import type { DictSettingsController } from '../hooks/use-dict-settings';

const triggerOptions: { value: DictTrigger; labelKey: MessageKey }[] = [
  { value: 'click', labelKey: 'dict.trigger.click' },
  { value: 'hover', labelKey: 'dict.trigger.hover' },
];

const durationOptions: { value: 'cue' | 'fixed'; labelKey: MessageKey }[] = [
  { value: 'cue', labelKey: 'dict.duration.cue' },
  { value: 'fixed', labelKey: 'dict.duration.fixed' },
];

const pronounceOptions: { value: 'romaji'; labelKey: MessageKey }[] = [
  { value: 'romaji', labelKey: 'dict.pronounce.romaji' },
];

/** Global lookup behaviour. Vocabulary bands are per language and live on `BandsPage`. */
export function DictPage({ dict }: { dict: DictSettingsController }) {
  const { settings } = dict;
  const off = !settings.enabled;

  return (
    <>
      <PageHeader title={t('dict.title')} description={t('dict.description')} />
      <Card>
        <SettingRow title={t('dict.enable')} description={t('dict.enableDescription')}>
          <Switch
            checked={settings.enabled}
            aria-label={t('dict.enable')}
            onCheckedChange={(enabled) => void dict.save({ enabled })}
          />
        </SettingRow>

        <SettingRow title={t('dict.trigger')} description={t('dict.triggerDescription')}>
          <PillGroup
            name="dictTrigger"
            disabled={off}
            options={triggerOptions.map((option) => ({ value: option.value, label: t(option.labelKey) }))}
            value={settings.trigger}
            aria-label={t('dict.trigger')}
            onChange={(next) => void dict.save({ trigger: next as DictTrigger })}
          />
        </SettingRow>

        <SettingRow title={t('dict.pause')} description={t('dict.pauseDescription')}>
          <Switch
            checked={settings.pauseOnLookup}
            disabled={off || settings.trigger !== 'click'}
            aria-label={t('dict.pause')}
            onCheckedChange={(pauseOnLookup) => void dict.save({ pauseOnLookup })}
          />
        </SettingRow>

        <SettingRow title={t('dict.duration')} description={t('dict.durationDescription')}>
          <PillGroup
            name="dictDuration"
            disabled={off}
            options={durationOptions.map((option) => ({ value: option.value, label: t(option.labelKey) }))}
            value={settings.duration.mode}
            aria-label={t('dict.duration')}
            onChange={(next) =>
              void dict.save({ duration: { ...settings.duration, mode: next as 'cue' | 'fixed' } })
            }
          />
          <DurationInput
            valueMs={settings.duration.ms}
            disabled={off || settings.duration.mode !== 'fixed'}
            aria-label={t('dict.fixedSeconds')}
            onChange={(seconds) => void dict.setDurationSeconds(seconds)}
          />
          <span className="text-2xs text-text-faint">{t('common.secondsShort')}</span>
        </SettingRow>

        <SettingRow title={t('dict.pronounce')} description={t('dict.pronounceDescription')}>
          <PillGroup
            name="dictPronounce"
            multiple
            disabled={off}
            options={pronounceOptions.map((option) => ({ value: option.value, label: t(option.labelKey) }))}
            value={settings.pronunciation.romaji ? ['romaji'] : []}
            aria-label={t('dict.pronounce')}
            onChange={(next) =>
              void dict.save({ pronunciation: { romaji: (next as string[]).includes('romaji') } })
            }
          />
        </SettingRow>
      </Card>
    </>
  );
}
