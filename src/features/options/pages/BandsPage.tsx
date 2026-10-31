import { Card, PageHeader, PillGroup, SettingRow } from '@/design-system';
import { resolveLanguage } from '@/languages/registry';
import type { LanguageId } from '@/languages/types';
import { t } from '@/shared/i18n';
import type { DictSettingsController } from '../hooks/use-dict-settings';

/** One language's vocabulary bands; the lookup behaviour itself is global (`DictPage`). */
export function BandsPage({
  dict,
  language,
}: {
  dict: DictSettingsController;
  language: LanguageId;
}) {
  const pack = resolveLanguage(language);
  const off = !dict.settings.enabled;
  const bandOptions = (pack.bands?.definitions ?? []).map((band) => ({
    value: band.id,
    label: band.label,
  }));
  const selection = dict.settings.bands[language] ?? {};
  const selected = bandOptions
    .filter((option) => selection[option.value])
    .map((option) => option.value);

  return (
    <>
      <PageHeader
        title={t('bands.title')}
        description={t('bands.description', { language: pack.displayName })}
      />
      <Card>
        <SettingRow title={t('dict.bands')} description={t('dict.bandsDescription')}>
          {bandOptions.length ? (
            <PillGroup
              name={`dictBands-${language}`}
              multiple
              disabled={off}
              options={bandOptions}
              value={selected}
              aria-label={t('dict.bands')}
              onChange={(next) => {
                const checked = new Set(next as string[]);
                void dict.save({
                  bands: {
                    ...dict.settings.bands,
                    [language]: Object.fromEntries(
                      bandOptions.map((option) => [option.value, checked.has(option.value)]),
                    ),
                  },
                });
              }}
            />
          ) : (
            <span className="text-2xs text-text-faint">{t('dict.bandsEmpty')}</span>
          )}
        </SettingRow>
      </Card>
      <p className="mt-2 text-2xs text-text-faint">{t('dict.footnote')}</p>
    </>
  );
}
