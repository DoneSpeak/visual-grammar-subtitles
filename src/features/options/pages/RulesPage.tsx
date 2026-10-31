import * as React from 'react';

import {
  Button,
  Card,
  CardTitle,
  EmptyState,
  Input,
  PageHeader,
  Switch,
  toast,
  useConfirm,
} from '@/design-system';
import { ruleNameForDisplay, t } from '@/shared/i18n';
import {
  adEpisodeKey,
  DEFAULT_AD_DURATION,
  matchRuleUrl,
  resolveSite,
  type AdSlot,
  type SiteRule,
} from '@/shared/siteRules';
import { formatSlotList, groupEpisodeMarks, refreshSeriesDefault, type EpisodeMark } from '../lib/ad-slots';
import { fmtClock, parseClock } from '../lib/format';
import type { SiteRulesController } from '../hooks/use-site-rules';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-[76px] flex-none text-2xs text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

/** Clock field that only accepts `mm:ss` / `h:mm:ss`; rejects by returning false so the draft resets. */
function ClockInput({ value, placeholder, title, onCommit }: {
  value: string;
  placeholder?: string;
  title?: string;
  onCommit: (text: string) => boolean;
}) {
  const [draft, setDraft] = React.useState(value);

  React.useEffect(() => setDraft(value), [value]);

  const commit = () => {
    if (!onCommit(draft)) setDraft(value);
  };

  return (
    <Input
      type="text"
      className="h-6 w-[76px] px-2 text-2xs tabular-nums"
      placeholder={placeholder}
      title={title}
      spellCheck={false}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commit();
      }}
    />
  );
}

/** Per-series seconds the playback shortcut adds; blank/0 falls back to the default. */
function SeriesDurationInput({ value, onCommit }: { value: number; onCommit: (seconds: number) => void }) {
  const [draft, setDraft] = React.useState(String(value));

  React.useEffect(() => setDraft(String(value)), [value]);

  const commit = () => {
    const seconds = Math.round(Number(draft));
    if (!Number.isFinite(seconds) || seconds < 1) {
      setDraft(String(value));
      return;
    }
    onCommit(seconds);
  };

  return (
    <Input
      type="number"
      min={1}
      step={1}
      className="h-6 w-16 px-2 text-2xs tabular-nums"
      title={t('rules.seriesDurationTitle')}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commit();
      }}
    />
  );
}

function EpisodeRow({ rule, sites, mark }: {
  rule: SiteRule;
  sites: SiteRulesController;
  mark: EpisodeMark;
}) {
  const edit = (fn: (draft: SiteRule) => void) => sites.editRule(rule.id, fn);

  const setSlot = (index: number, start: number, finish: number) => {
    edit((draft) => {
      const slot = draft.episodeAdSlots[mark.key]?.[index];
      if (!slot) return;
      slot.at = start;
      slot.duration = finish - start;
      refreshSeriesDefault(draft, mark.series);
    });
  };

  const removeSlot = (index: number) => {
    edit((draft) => {
      const slots = draft.episodeAdSlots[mark.key];
      if (!slots) return;
      slots.splice(index, 1);
      if (!slots.length) delete draft.episodeAdSlots[mark.key];
      refreshSeriesDefault(draft, mark.series);
    });
  };

  const addSlot = () => {
    edit((draft) => {
      (draft.episodeAdSlots[mark.key] ??= []).push({ at: 0, duration: 15 });
      refreshSeriesDefault(draft, mark.series);
    });
  };

  const removeEpisode = () => {
    edit((draft) => {
      delete draft.episodeAdSlots[mark.key];
      refreshSeriesDefault(draft, mark.series);
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-[72px] flex-none text-2xs text-muted-foreground">
        {mark.season === '*'
          ? t('rules.episodeLabel', { episode: mark.episode })
          : t('rules.seasonEpisode', { season: mark.season, episode: mark.episode })}
      </span>
      {mark.slots.map((slot, index) => {
        const end = slot.at + slot.duration;
        return (
          <span key={index} className="inline-flex items-center gap-1">
            <span className="text-2xs text-text-faint">{t('rules.slotStart')}</span>
            <ClockInput
              value={fmtClock(slot.at)}
              placeholder="08:17"
              title={t('rules.slotStartTitle')}
              onCommit={(text) => {
                const start = parseClock(text);
                if (start === null || start >= end) return false;
                setSlot(index, start, end);
                return true;
              }}
            />
            <span className="text-2xs text-text-faint">{t('rules.slotEnd')}</span>
            <ClockInput
              value={fmtClock(end)}
              placeholder="08:47"
              title={t('rules.slotEndTitle')}
              onCommit={(text) => {
                const finish = parseClock(text);
                if (finish === null || finish <= slot.at) return false;
                setSlot(index, slot.at, finish);
                return true;
              }}
            />
            <Button
              variant="destructive"
              size="icon-sm"
              aria-label={t('rules.deleteSlot')}
              onClick={() => removeSlot(index)}
            >
              ×
            </Button>
          </span>
        );
      })}
      <Button size="sm" onClick={addSlot}>
        {t('rules.addSegment')}
      </Button>
      <Button variant="destructive" size="sm" onClick={removeEpisode}>
        {t('rules.deleteEpisode')}
      </Button>
    </div>
  );
}

function AddSlotForm({ rule, sites }: { rule: SiteRule; sites: SiteRulesController }) {
  const [series, setSeries] = React.useState('');
  const [season, setSeason] = React.useState('');
  const [episode, setEpisode] = React.useState('');
  const [start, setStart] = React.useState('');
  const [end, setEnd] = React.useState('');
  const [message, setMessage] = React.useState('');

  const add = () => {
    const episodeNo = Number(episode.trim());
    const startAt = parseClock(start.trim());
    const finishAt = parseClock(end.trim());
    if (
      !series.trim() ||
      !Number.isInteger(episodeNo) ||
      episodeNo < 0 ||
      startAt === null ||
      finishAt === null ||
      finishAt <= startAt
    ) {
      setMessage(t('rules.formIncomplete'));
      return;
    }
    const key = adEpisodeKey(series.trim(), season.trim() === '*' ? null : season.trim() || null, episodeNo);
    if (!key) {
      setMessage(t('rules.invalidEpisode'));
      return;
    }
    sites.editRule(rule.id, (draft) => {
      (draft.episodeAdSlots[key] ??= []).push({ at: startAt, duration: finishAt - startAt });
      refreshSeriesDefault(draft, series.trim());
    });
    setMessage('');
    setEpisode('');
    setStart('');
    setEnd('');
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-[76px] flex-none text-2xs text-muted-foreground">{t('rules.addAd')}</span>
      <Input
        className="h-6 w-[104px] px-2 text-2xs"
        placeholder={t('rules.seriesIdPlaceholder')}
        title={t('rules.seriesIdTitle')}
        value={series}
        onChange={(event) => setSeries(event.target.value)}
      />
      <Input
        className="h-6 w-[64px] px-2 text-2xs"
        placeholder={t('rules.seasonPlaceholder')}
        title={t('rules.seasonTitle')}
        value={season}
        onChange={(event) => setSeason(event.target.value)}
      />
      <Input
        className="h-6 w-[56px] px-2 text-2xs"
        placeholder={t('rules.episodePlaceholder')}
        title={t('rules.episodeTitle')}
        value={episode}
        onChange={(event) => setEpisode(event.target.value)}
      />
      <Input
        className="h-6 w-[92px] px-2 text-2xs"
        placeholder={t('rules.startPlaceholder')}
        value={start}
        onChange={(event) => setStart(event.target.value)}
      />
      <Input
        className="h-6 w-[92px] px-2 text-2xs"
        placeholder={t('rules.endPlaceholder')}
        value={end}
        onChange={(event) => setEnd(event.target.value)}
      />
      <Button size="sm" onClick={add}>
        {t('rules.add')}
      </Button>
      {message ? <span className="text-2xs text-destructive">{message}</span> : null}
    </div>
  );
}

function AdSlotsEditor({ rule, sites }: { rule: SiteRule; sites: SiteRulesController }) {
  const [needle, setNeedle] = React.useState('');
  const groups = React.useMemo(() => groupEpisodeMarks(rule), [rule]);
  const total = [...groups.values()].reduce((count, list) => count + list.length, 0);

  const query = needle.trim().toLowerCase();
  const visible = [...groups]
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([series, marks]) => {
      if (!query) return [{ series, marks }];
      const seriesHit = series.toLowerCase().includes(query);
      const shown = seriesHit ? marks : marks.filter((mark) => String(mark.episode) === query);
      return shown.length ? [{ series, marks: shown }] : [];
    });

  return (
    <details className="border-t border-border pt-2.5">
      <summary className="cursor-pointer py-1 text-xs text-muted-foreground">
        {t('rules.adSlotsSummary', { series: groups.size, episodes: total })}
      </summary>
      <div className="flex flex-col gap-2.5 py-2">
        <Input
          type="search"
          className="h-6 w-[220px] px-2 text-2xs"
          placeholder={t('rules.filterPlaceholder')}
          value={needle}
          onChange={(event) => setNeedle(event.target.value)}
        />
        {visible.length ? (
          visible.map(({ series, marks }) => (
            <div key={series} className="flex flex-col gap-1.5 rounded-lg border border-border p-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium">{series}</span>
                <span className="truncate text-2xs text-text-faint">
                  {t('rules.seriesDefault', {
                    slots: formatSlotList(seriesAdSlotsOf(rule, series)) || t('common.none'),
                  })}
                </span>
              </div>
              <div className="flex items-center gap-2 text-2xs text-muted-foreground">
                <span>{t('rules.seriesDuration')}</span>
                <SeriesDurationInput
                  value={rule.seriesAdDuration?.[series] ?? DEFAULT_AD_DURATION}
                  onCommit={(seconds) =>
                    sites.editRule(rule.id, (draft) => {
                      if (!draft.seriesAdDuration) draft.seriesAdDuration = {};
                      if (seconds === DEFAULT_AD_DURATION) delete draft.seriesAdDuration[series];
                      else draft.seriesAdDuration[series] = seconds;
                    })
                  }
                />
                <span>{t('rules.seriesDurationHint')}</span>
              </div>
              {marks.map((mark) => (
                <EpisodeRow key={mark.key} rule={rule} sites={sites} mark={mark} />
              ))}
            </div>
          ))
        ) : (
          <EmptyState>
            {groups.size ? t('rules.noMatchingEpisodes') : t('rules.noEpisodeSlots')}
          </EmptyState>
        )}
        <AddSlotForm rule={rule} sites={sites} />
      </div>
    </details>
  );
}

const seriesAdSlotsOf = (rule: SiteRule, series: string): AdSlot[] => rule.seriesAdSlots[series] ?? [];

function ParseTest({ rule }: { rule: SiteRule }) {
  const [url, setUrl] = React.useState('');
  const [adapterNote, setAdapterNote] = React.useState('');
  const seq = React.useRef(0);

  React.useEffect(() => {
    const text = url.trim();
    if (!text || !rule.adapter) {
      setAdapterNote('');
      return;
    }
    const current = ++seq.current;
    const timer = window.setTimeout(() => {
      void resolveSite({ version: 2, rules: [rule], binds: {} }, text).then((resolved) => {
        if (current !== seq.current || !resolved) return;
        setAdapterNote(
          t('rules.parseNote', {
            title: resolved.seriesTitle ?? '-',
            episode: resolved.episode ?? '-',
          }),
        );
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [url, rule]);

  const text = url.trim();
  const hit = text ? matchRuleUrl(rule, text) : null;
  const result = !text
    ? ''
    : hit
      ? t('rules.parseResult', {
          id: hit.id ?? '-',
          season: hit.season ?? '-',
          episode: hit.episode ?? '-',
          note: adapterNote,
        })
      : t('rules.noMatch');

  return (
    <Field label={t('rules.parseTest')}>
      <Input
        type="search"
        className="h-6 min-w-[240px] flex-1 px-2 text-2xs"
        placeholder={t('rules.parseTestPlaceholder')}
        value={url}
        onChange={(event) => setUrl(event.target.value)}
      />
      {result ? (
        <span className={hit ? 'text-2xs text-muted-foreground' : 'text-2xs text-destructive'}>{result}</span>
      ) : null}
    </Field>
  );
}

function RuleEditor({ rule, sites, confirm }: {
  rule: SiteRule;
  sites: SiteRulesController;
  confirm: ReturnType<typeof useConfirm>['confirm'];
}) {
  const edit = (patch: Partial<SiteRule>) => sites.editRule(rule.id, (draft) => Object.assign(draft, patch));
  const displayName = ruleNameForDisplay(rule.name, t);

  return (
    <div className="flex flex-col gap-2 border-t border-border py-3.5 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Switch
            checked={rule.enabled}
            aria-label={t('rules.enabledAria')}
            title={t('rules.enabledAria')}
            onCheckedChange={(enabled) => edit({ enabled })}
          />
          <Input
            type="search"
            className="h-6 w-[160px] px-2 text-2xs"
            placeholder={t('rules.namePlaceholder')}
            value={displayName}
            onChange={(event) => edit({ name: event.target.value })}
          />
        </div>
        <Button
          variant="destructive"
          size="sm"
          onClick={async () => {
            const ok = await confirm({
              title: t('rules.deleteTitle', { name: displayName || rule.id }),
              confirmLabel: t('rules.deleteRule'),
              cancelLabel: t('common.cancel'),
              destructive: true,
            });
            if (ok) sites.removeRule(rule.id);
          }}
        >
          {t('rules.deleteRule')}
        </Button>
      </div>

      <Field label={t('rules.urlTemplate')}>
        <Input
          type="search"
          className="h-6 min-w-[240px] flex-1 px-2 text-2xs"
          placeholder="https://*/cid/<id>-<season>-<episode>.html"
          value={rule.urlTemplate}
          onChange={(event) => edit({ urlTemplate: event.target.value })}
        />
      </Field>

      {rule.adapter ? (
        <Field label={t('rules.autoParse')}>
          <span className="text-2xs text-text-faint">
            {rule.adapter === 'bilibili' ? t('rules.bilibiliAdapter') : rule.adapter}
          </span>
        </Field>
      ) : null}

      <ParseTest rule={rule} />

      <Field label={t('rules.fileTemplate')}>
        <Input
          type="search"
          className="h-6 min-w-[240px] flex-1 px-2 text-2xs"
          placeholder={t('rules.fileTemplatePlaceholder')}
          value={rule.fileTemplate}
          onChange={(event) => edit({ fileTemplate: event.target.value })}
        />
      </Field>

      <AdSlotsEditor rule={rule} sites={sites} />
    </div>
  );
}

export function RulesPage({ sites }: { sites: SiteRulesController }) {
  const confirmState = useConfirm();
  const fileRef = React.useRef<HTMLInputElement>(null);

  const exportRules = () => {
    const blob = new Blob([JSON.stringify(sites.rules, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'jp-sub-site-rules.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  const importRules = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as Partial<{ rules: SiteRule[]; binds: Record<string, string> }>;
      if (!Array.isArray(parsed.rules)) throw new Error(t('rules.importMissingRules'));
      const rules = parsed.rules.map((rule) => ({
        ...rule,
        seriesAdSlots: rule.seriesAdSlots ?? {},
        episodeAdSlots: rule.episodeAdSlots ?? {},
        seriesAdDuration: rule.seriesAdDuration ?? {},
      }));
      sites.replaceRules({ version: 2, rules, binds: parsed.binds ?? {} });
      toast.success(t('rules.imported', { count: rules.length }));
    } catch (error) {
      toast.error(
        t('errors.importFailed', {
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  };

  return (
    <>
      <PageHeader title={t('rules.title')} description={t('rules.description')} />
      <Card>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <CardTitle>{t('rules.listTitle')}</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" size="sm" onClick={sites.addRule}>
              {t('rules.addRule')}
            </Button>
            <Button size="sm" onClick={exportRules}>
              {t('rules.export')}
            </Button>
            <Button size="sm" onClick={() => fileRef.current?.click()}>
              {t('rules.import')}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".json"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void importRules(file);
              }}
            />
          </div>
        </div>
        <div>
          {sites.rules.rules.length ? (
            sites.rules.rules.map((rule) => (
              <RuleEditor key={rule.id} rule={rule} sites={sites} confirm={confirmState.confirm} />
            ))
          ) : (
            <EmptyState>{t('rules.empty')}</EmptyState>
          )}
        </div>
      </Card>

      <p className="text-2xs leading-relaxed text-text-faint">{t('rules.hint')}</p>
      {confirmState.element}
    </>
  );
}
