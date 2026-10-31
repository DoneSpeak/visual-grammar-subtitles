import * as React from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Globe2, Package } from 'lucide-react';

import {
  Badge,
  Button,
  Card,
  EmptyState,
  PillGroup,
  SearchField,
  SegmentedControl,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Toaster,
  cn,
} from '@/design-system';
import { DurationInput } from '@/features/dict/duration-input';
import { useLanguage } from '@/features/i18n/use-language';
import { useTheme } from '@/features/theme/use-theme';
import { packTitleForDisplay, ruleNameForDisplay, t, type MessageKey } from '@/shared/i18n';
import type { LibraryEntry } from '@/shared/library';
import type { DictTrigger } from '@/shared/dictSettings';
import type { SubFile } from '@/features/scraper/kitsunekko';
import { orderEntries } from './entries';
import { usePopup, type PopupController } from './use-popup';

const themeOptions: { value: 'light' | 'dark' | 'system'; labelKey: MessageKey }[] = [
  { value: 'light', labelKey: 'popup.theme.light' },
  { value: 'dark', labelKey: 'popup.theme.dark' },
  { value: 'system', labelKey: 'popup.theme.system' },
];

const levelOptions = [
  { value: '1', label: 'N1' },
  { value: '2', label: 'N2' },
  { value: '3', label: 'N3' },
  { value: '4', label: 'N4' },
  { value: '5', label: 'N5' },
] as const;

const triggerOptions: { value: DictTrigger; labelKey: MessageKey }[] = [
  { value: 'click', labelKey: 'popup.trigger.click' },
  { value: 'hover', labelKey: 'popup.trigger.hover' },
];

const durationOptions: { value: 'cue' | 'fixed'; labelKey: MessageKey }[] = [
  { value: 'cue', labelKey: 'popup.duration.cue' },
  { value: 'fixed', labelKey: 'popup.duration.fixed' },
];

const pronounceOptions: { value: 'romaji'; labelKey: MessageKey }[] = [
  { value: 'romaji', labelKey: 'popup.pronounce.romaji' },
];

const hostOf = (template: string): string | null => {
  const matched = template.match(/^https?:\/\/([^/?#]+)/i);
  const host = matched?.[1];
  if (!host || host.includes('*') || host.includes('<')) return null;
  return `https://${host}`;
};

function Header({ popup }: { popup: PopupController }) {
  const { mode, setMode } = useTheme();
  const version = React.useMemo(() => chrome.runtime.getManifest().version, []);

  return (
    <header className="flex items-center justify-between gap-2 px-3.5 pt-3 pb-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <span className="grid size-6 flex-none place-items-center rounded-md bg-primary text-[10px] font-bold text-primary-foreground">
          JP
        </span>
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold">{t('meta.brand')}</div>
          <div className="text-2xs text-text-faint">v{version}</div>
        </div>
      </div>
      <div className="flex flex-none items-center gap-1.5">
        <SegmentedControl
          value={mode}
          options={themeOptions.map((option) => ({ value: option.value, label: t(option.labelKey) }))}
          onChange={setMode}
          aria-label={t('popup.theme.aria')}
        />
        <Button variant="ghost" size="sm" onClick={() => void popup.openPanel()}>
          {t('popup.openPanel')}
        </Button>
      </div>
    </header>
  );
}

function PageCard({ popup }: { popup: PopupController }) {
  const { tabUrl, hasTab, site, boundPack, status, statusChecked } = popup;

  const host = React.useMemo(() => {
    try {
      const url = new URL(tabUrl);
      return { text: `${url.host}${url.pathname}`, title: tabUrl };
    } catch {
      return { text: hasTab ? t('popup.page.restricted') : t('popup.page.noTab'), title: '' };
    }
  }, [tabUrl, hasTab]);

  const meta = React.useMemo(() => {
    if (!site) return t('popup.page.noRule');
    const ep =
      site.episode === null
        ? ''
        : site.season
          ? t('popup.page.seasonEpisode', { season: site.season, episode: site.episode })
          : t('popup.page.episode', { episode: site.episode });
    const series =
      site.seriesTitle ||
      (site.seriesId ? t('popup.page.series', { id: site.seriesId }) : '');
    return [ruleNameForDisplay(site.rule.name, t), series, ep].filter(Boolean).join(' · ');
  }, [site]);

  const statusText = !statusChecked
    ? t('popup.status.detecting')
    : status
      ? status.subtitle
        ? t('popup.status.subtitle', { name: status.subtitle })
        : t('popup.status.ready')
      : t('popup.status.noPlayer');

  return (
    <Card variant="box" className="mx-3.5 mb-2.5 px-3 py-2.5">
      <div className="truncate text-xs font-medium" title={host.title}>
        {host.text}
      </div>
      <div className="mt-0.5 truncate text-2xs text-muted-foreground">{meta}</div>
      {boundPack ? (
        <div
          className="mt-0.5 truncate text-2xs text-muted-foreground"
          title={packTitleForDisplay(boundPack.title, t)}
        >
          {t('popup.boundPack', { title: packTitleForDisplay(boundPack.title, t) })}
        </div>
      ) : null}
      <div className={cn('mt-0.5 truncate text-2xs', status ? 'text-muted-foreground' : 'text-warning')}>
        {statusText}
      </div>
      {status ? (
        <div className="mt-2 flex">
          <Button
            size="sm"
            variant={status.theater ? 'primary' : 'default'}
            aria-pressed={status.theater}
            onClick={() => void popup.toggleTheater()}
          >
            {status.theater ? t('popup.theater.exit') : t('popup.theater.enter')}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

function EntryRow({ popup, entry, label }: { popup: PopupController; entry: LibraryEntry; label: string }) {
  const [applying, setApplying] = React.useState(false);

  const apply = async () => {
    setApplying(true);
    const ok = await popup.applyEntry(entry);
    if (!ok) setApplying(false);
  };

  return (
    <div
      className="flex items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-secondary"
      title={`${entry.name}\n${t('popup.entry.cueCount', { count: entry.cueCount })}`}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="flex-none text-2xs text-text-faint tabular-nums">
        {t('popup.entry.cueCount', { count: entry.cueCount })}
      </span>
      <Button size="sm" disabled={applying} onClick={() => void apply()}>
        {applying ? t('popup.entry.applying') : t('popup.entry.apply')}
      </Button>
    </div>
  );
}

function PackGroup({ popup, packId }: { popup: PopupController; packId: string }) {
  const pack = popup.packs.find((item) => item.id === packId);
  const packEntries = popup.byPack.get(packId) ?? [];
  const open = popup.query.trim() ? true : popup.openPacks.has(packId);
  const ordered = React.useMemo(() => orderEntries(packEntries), [packEntries]);
  const shown = React.useMemo(() => {
    const q = popup.query.trim().toLowerCase();
    return q ? ordered.filter(({ entry }) => entry.name.toLowerCase().includes(q)) : ordered;
  }, [ordered, popup.query]);

  if (!pack) return null;

  return (
    <div>
      <button
        type="button"
        className={cn(
          'flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs',
          !popup.query.trim() && 'hover:bg-secondary',
        )}
        onClick={() => {
          if (popup.query.trim()) return;
          popup.setOpenPacks((previous) => {
            const next = new Set(previous);
            if (next.has(packId)) next.delete(packId);
            else next.add(packId);
            return next;
          });
        }}
      >
        <Package className="size-3.5 flex-none text-text-faint" />
        <span className="min-w-0 flex-1 truncate font-medium">{packTitleForDisplay(pack.title, t)}</span>
        <Badge className="flex-none">{t('popup.pack.fileCount', { count: packEntries.length })}</Badge>
        {popup.query.trim() ? null : open ? (
          <ChevronDown className="size-3.5 flex-none text-text-faint" />
        ) : (
          <ChevronRight className="size-3.5 flex-none text-text-faint" />
        )}
      </button>
      {open ? (
        <div className="ml-3.5 border-l border-border pl-1">
          {shown.length ? (
            shown.map(({ entry, label }) => (
              <EntryRow key={entry.id} popup={popup} entry={entry} label={label} />
            ))
          ) : (
            <EmptyState>{t('popup.pack.empty')}</EmptyState>
          )}
        </div>
      ) : null}
    </div>
  );
}

function DirView({ popup }: { popup: PopupController }) {
  const state = popup.online;
  const [importing, setImporting] = React.useState<string | null>(null);
  if (state.mode !== 'dir') return null;

  const importOne = async (file: SubFile) => {
    setImporting(file.path);
    await popup.importFile(state.dir, file);
    setImporting(null);
  };

  return (
    <div className="flex flex-col gap-0.5">
      <Button variant="ghost" size="sm" className="self-start" onClick={() => void popup.goBack()}>
        <ChevronLeft className="size-3.5" />
        {t('popup.dir.back')}
      </Button>
      <div className="px-2 pt-1 pb-0.5 text-2xs font-medium text-text-faint">{state.dir.name}</div>
      {state.dirs.map((dir) => (
        <button
          key={dir.path}
          type="button"
          className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs hover:bg-secondary"
          onClick={() => void popup.showDir(dir, true)}
        >
          <span className="min-w-0 flex-1 truncate">{dir.name}</span>
          <ChevronRight className="size-3.5 flex-none text-text-faint" />
        </button>
      ))}
      {state.files.map((file) => (
        <div key={file.path} className="flex items-center gap-2 rounded-md px-2 py-1 text-xs">
          <span className="min-w-0 flex-1 truncate" title={file.name}>
            {file.name}
          </span>
          <span className="flex-none text-2xs text-text-faint">{file.modified}</span>
          <Button
            size="sm"
            variant="primary"
            disabled={importing !== null}
            onClick={() => void importOne(file)}
          >
            {importing === file.path ? t('popup.dir.downloading') : t('popup.dir.import')}
          </Button>
        </div>
      ))}
      {state.dirs.length || state.files.length ? null : <EmptyState>{t('popup.dir.empty')}</EmptyState>}
    </div>
  );
}

function SubsResults({ popup }: { popup: PopupController }) {
  if (popup.online.mode === 'dir') return <DirView popup={popup} />;

  const query = popup.query.trim();
  const searching = popup.online.mode === 'searching';
  const translated = popup.online.mode === 'results' ? popup.online.translated : null;

  return (
    <div className="flex flex-col gap-0.5">
      {query ? (
        <div className="px-2 pt-1 pb-0.5 text-2xs font-medium text-text-faint">
          {t('popup.local.heading')}
        </div>
      ) : null}
      {popup.packs.length ? (
        popup.visiblePacks.length ? (
          popup.visiblePacks.map((pack) => <PackGroup key={pack.id} popup={popup} packId={pack.id} />)
        ) : (
          query && <EmptyState className="px-2">{t('popup.local.noMatch')}</EmptyState>
        )
      ) : (
        <EmptyState className="px-2">{t('popup.local.empty')}</EmptyState>
      )}

      {query ? (
        <>
          <div className="flex items-baseline gap-2 px-2 pt-2 pb-0.5 text-2xs font-medium text-text-faint">
            <span>{t('popup.online.heading')}</span>
            {translated ? <span className="truncate font-normal">{translated}</span> : null}
          </div>
          {searching ? (
            <EmptyState className="px-2">{t('popup.online.searching')}</EmptyState>
          ) : popup.online.mode === 'results' ? (
            popup.onlineHits.length ? (
              popup.onlineHits.slice(0, 20).map((hit) => (
                <button
                  key={hit.path}
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs hover:bg-secondary"
                  onClick={() => void popup.showDir(hit, true)}
                >
                  <Globe2 className="size-3.5 flex-none text-text-faint" />
                  <span className="min-w-0 flex-1 truncate">{hit.name}</span>
                  <ChevronRight className="size-3.5 flex-none text-text-faint" />
                </button>
              ))
            ) : (
              <EmptyState className="px-2">{t('popup.online.noMatch')}</EmptyState>
            )
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function SitesResults({ popup }: { popup: PopupController }) {
  if (!popup.rules.rules.length) {
    return <EmptyState className="px-2">{t('popup.sites.empty')}</EmptyState>;
  }

  return (
    <div className="flex flex-col">
      {popup.rules.rules.map((rule) => {
        const host = hostOf(rule.urlTemplate);
        const name = ruleNameForDisplay(rule.name, t) || rule.id;
        return (
          <div key={rule.id} className="border-t border-border px-2 py-1.5 first:border-t-0">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-xs" title={name}>
                {name}
              </span>
              <Switch
                checked={rule.enabled}
                aria-label={t('popup.sites.enable', { name })}
                onCheckedChange={(enabled) => void popup.toggleRule(rule.id, enabled)}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  host ? void chrome.tabs.create({ url: host }) : popup.openOptions('#rules')
                }
              >
                {host ? t('common.open') : t('common.edit')}
              </Button>
            </div>
            <div className="truncate font-mono text-[10.5px] text-text-faint" title={rule.urlTemplate}>
              {rule.urlTemplate}
              {rule.adapter ? t('popup.sites.autoParse') : ''}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DictCard({ popup }: { popup: PopupController }) {
  const { dict } = popup;
  const off = !dict.enabled;

  const levels = levelOptions
    .filter((option) => dict.levels[Number(option.value) as keyof typeof dict.levels])
    .map((option) => option.value);

  const rows: { title: string; control: React.ReactNode }[] = [
    {
      title: t('popup.dict.levels'),
      control: (
        <PillGroup
          name="dictLevels"
          multiple
          options={levelOptions}
          value={levels}
          disabled={off}
          aria-label={t('popup.dict.levels')}
          onChange={(next) => {
            const selected = new Set(next as string[]);
            void popup.saveDict({
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
      ),
    },
    {
      title: t('popup.dict.trigger'),
      control: (
        <PillGroup
          name="dictTrigger"
          options={triggerOptions.map((option) => ({ value: option.value, label: t(option.labelKey) }))}
          value={dict.trigger}
          aria-label={t('popup.dict.triggerLabel')}
          onChange={(next) => void popup.saveDict({ trigger: next as DictTrigger })}
        />
      ),
    },
    {
      title: t('popup.dict.pause'),
      control: (
        <Switch
          checked={dict.pauseOnLookup}
          disabled={off || dict.trigger !== 'click'}
          aria-label={t('popup.dict.pauseLabel')}
          onCheckedChange={(pauseOnLookup) => void popup.saveDict({ pauseOnLookup })}
        />
      ),
    },
    {
      title: t('popup.dict.duration'),
      control: (
        <>
          <PillGroup
            name="dictDuration"
            options={durationOptions.map((option) => ({ value: option.value, label: t(option.labelKey) }))}
            value={dict.duration.mode}
            aria-label={t('popup.dict.durationLabel')}
            onChange={(next) =>
              void popup.saveDict({ duration: { ...dict.duration, mode: next as 'cue' | 'fixed' } })
            }
          />
          {dict.duration.mode === 'fixed' && !off ? (
            <DurationInput
              valueMs={dict.duration.ms}
              aria-label={t('popup.dict.fixedSeconds')}
              onChange={(seconds) => void popup.setDictDurationSeconds(seconds)}
            />
          ) : null}
        </>
      ),
    },
    {
      title: t('popup.dict.pronounce'),
      control: (
        <PillGroup
          name="dictPronounce"
          multiple
          options={pronounceOptions.map((option) => ({ value: option.value, label: t(option.labelKey) }))}
          value={dict.pronunciation.romaji ? ['romaji'] : []}
          aria-label={t('popup.dict.pronounce')}
          onChange={(next) =>
            void popup.saveDict({ pronunciation: { romaji: (next as string[]).includes('romaji') } })
          }
        />
      ),
    },
  ];

  return (
    <Card variant="plain" className="mx-0">
      <div className="flex items-center justify-between">
        <h2 className="m-0 text-xs font-semibold">{t('popup.dict.heading')}</h2>
        <Switch
          checked={dict.enabled}
          aria-label={t('popup.dict.enable')}
          onCheckedChange={(enabled) => void popup.saveDict({ enabled })}
        />
      </div>
      <div className="mt-1 flex flex-col">
        {rows.map((row) => (
          <div key={row.title} className="flex items-center gap-2 py-1">
            <span className="flex-1 text-xs text-muted-foreground">{row.title}</span>
            <div className={cn('flex flex-none items-center gap-1.5', off && 'opacity-45')}>{row.control}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function App() {
  useLanguage('meta.popupTitle');
  const popup = usePopup();
  const { resolved } = useTheme();

  return (
    <div className="w-[372px] bg-background text-foreground">
      <div className="flex max-h-[600px] flex-col overflow-y-auto">
        <Header popup={popup} />
        <PageCard popup={popup} />

        <div className="mx-3.5 mb-2.5 rounded-lg border border-border bg-card p-2.5">
          <Tabs value={popup.activeTab} onValueChange={(value) => popup.setActiveTab(value as 'subs' | 'sites')}>
            <TabsList aria-label={t('popup.tabs.aria')}>
              <TabsTrigger value="subs">{t('popup.tab.subs')}</TabsTrigger>
              <TabsTrigger value="sites">{t('popup.tab.sites')}</TabsTrigger>
            </TabsList>
            <TabsContent value="subs" className="mt-2">
              <SearchField
                autoFocus
                value={popup.query}
                placeholder={t('popup.search.placeholder')}
                autoComplete="off"
                spellCheck={false}
                aria-label={t('popup.search.aria')}
                onChange={(event) => popup.setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') popup.submitSearch();
                }}
              />
              <div className="mt-1 max-h-[300px] overflow-y-auto">
                <SubsResults popup={popup} />
              </div>
            </TabsContent>
            <TabsContent value="sites" className="mt-2">
              <div className="max-h-[300px] overflow-y-auto">
                <SitesResults popup={popup} />
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <DictCard popup={popup} />

        <footer className="flex items-center gap-3 border-t border-border px-3.5 py-2.5 text-2xs">
          <button
            type="button"
            className="cursor-pointer border-0 bg-transparent p-0 text-muted-foreground hover:text-foreground hover:underline"
            onClick={() => popup.openOptions('#rules')}
          >
            {t('popup.footer.rules')}
          </button>
          <button
            type="button"
            className="cursor-pointer border-0 bg-transparent p-0 text-muted-foreground hover:text-foreground hover:underline"
            onClick={() => popup.openOptions('#binds')}
          >
            {t('popup.footer.binds')}
          </button>
          <span className="flex-1" />
          <button
            type="button"
            className="cursor-pointer border-0 bg-transparent p-0 text-muted-foreground hover:text-foreground hover:underline"
            onClick={() => popup.openOptions()}
          >
            {t('popup.footer.settings')}
          </button>
        </footer>
      </div>
      <Toaster theme={resolved} />
    </div>
  );
}

export default App;
