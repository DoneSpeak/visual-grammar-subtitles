import * as React from 'react';
import {
  ChevronDown,
  ChevronRight,
  CloudDownload,
  FolderInput,
  Globe2,
  Link2,
  Trash2,
} from 'lucide-react';

import {
  Button,
  Card,
  CardTitle,
  Chip,
  EmptyState,
  Hint,
  PageHeader,
  Popover,
  SearchField,
  SegmentedControl,
  SettingRow,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  cn,
  toast,
  useConfirm,
} from '@/design-system';
import { DEFAULT_LANGUAGE } from '@/languages/registry';
import type { LanguageId } from '@/languages/types';
import { subtitleLanguageLabel } from '@/shared/subtitleLanguages';
import {
  originNoteForDisplay,
  packTitleForDisplay,
  t,
} from '@/shared/i18n';
import { importKitsunekkoArchive } from '@/shared/kitsunekkoLibrary';
import {
  importLibraryFiles,
  inferPackTitle,
  removeLibraryItem,
  removePack,
  type LibraryEntry,
  type LibraryPack,
  type SubtitleOrigin,
} from '@/shared/library';
import { folderNote, LOCAL_IMPORT_TITLE, UNFILED_TITLE } from '@/shared/persistedText';
import { describeSubtitles } from '@/shared/subtitleLabel';
import type { SeriesDir, SubFile } from '@/features/scraper/kitsunekko';
import { providerFor } from '@/features/scraper/providers';
import { fmtDate, fmtSize } from '../lib/format';
import { useKitsunekko, type KitsunekkoController } from '../hooks/use-kitsunekko';
import { useLearningLanguages } from '../hooks/use-learning-languages';
import type { LibraryController } from '../hooks/use-library';
import { ProviderPanel } from './ProviderPanel';

const SUBTITLE_EXT = /\.(srt|vtt|ass|ssa|txt)$/i;

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const originSummary = (origin: SubtitleOrigin): string => {
  if (origin.kind === 'kitsunekko') {
    return t('packs.origin.kitsu', {
      series: origin.seriesPath,
      archive: origin.archiveName,
      modified: origin.archiveModified,
      date: fmtDate(origin.importedAt),
    });
  }
  if (origin.kind === 'provider') {
    return t('packs.origin.provider', {
      provider: origin.provider,
      date: fmtDate(origin.importedAt),
    });
  }
  return origin.note
    ? t('packs.origin.localNote', {
        note: originNoteForDisplay(origin.note, t),
        date: fmtDate(origin.importedAt),
      })
    : t('packs.origin.local', { date: fmtDate(origin.importedAt) });
};

/** Page the pack can be traced back to; undefined for local imports and providers without one. */
const originSourceUrl = (origin: SubtitleOrigin): string | undefined => {
  if (origin.kind === 'kitsunekko') return origin.seriesUrl;
  if (origin.kind === 'provider') return origin.sourceUrl;
  return undefined;
};

const originLabel = (origin: SubtitleOrigin): string => {
  if (origin.kind === 'kitsunekko') return 'kitsunekko';
  if (origin.kind === 'provider') return origin.provider;
  return t('packs.origin.kindLocal');
};

const OriginIcon = ({ kind }: { kind: SubtitleOrigin['kind'] }) => {
  const Icon = kind === 'kitsunekko' ? Globe2 : kind === 'provider' ? CloudDownload : FolderInput;
  return <Icon className="size-3 flex-none" aria-hidden />;
};

function KitsuPanel({ kitsu, onImport, importing }: {
  kitsu: KitsunekkoController;
  onImport: (dir: SeriesDir, file: SubFile) => Promise<void>;
  importing: string | null;
}) {
  const { trail, listing } = kitsu;
  const dir = trail[trail.length - 1];

  return (
    <div>
      <div className="flex items-center gap-2">
        <SearchField
          value={kitsu.query}
          placeholder={t('packs.kitsu.searchPlaceholder')}
          autoComplete="off"
          spellCheck={false}
          aria-label={t('packs.kitsu.searchAria')}
          onChange={(event) => kitsu.setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void kitsu.search();
          }}
        />
        <Button variant="primary" onClick={() => void kitsu.search()} disabled={kitsu.searching}>
          {t('packs.kitsu.search')}
        </Button>
        {trail.length ? (
          <Button onClick={() => void kitsu.back()} disabled={kitsu.dirLoading}>
            {t('packs.kitsu.back')}
          </Button>
        ) : null}
      </div>

      <div className="mt-2 flex flex-col">
        {dir ? (
          <>
            <div className="px-1 pb-1 text-xs font-medium">{dir.name}</div>
            {kitsu.dirLoading ? (
              <EmptyState>{t('packs.kitsu.dirLoading')}</EmptyState>
            ) : listing ? (
              <>
                {listing.dirs.map((sub) => (
                  <div key={sub.path} className="flex items-center gap-3 border-t border-border px-1 py-1.5 first:border-t-0">
                    <span className="min-w-0 flex-1 truncate text-xs" title={sub.name}>
                      {sub.name}
                    </span>
                    <span className="flex-none text-2xs text-text-faint">{t('packs.kitsu.subdir')}</span>
                    <Button size="sm" onClick={() => void kitsu.openDir(sub)}>
                      {t('packs.kitsu.open')}
                    </Button>
                  </div>
                ))}
                {listing.files.map((file) => (
                  <div key={file.path} className="flex items-center gap-3 border-t border-border px-1 py-1.5 first:border-t-0">
                    <span className="min-w-0 flex-1 truncate text-xs" title={file.name}>
                      {file.name}
                    </span>
                    <span className="flex-none text-2xs text-text-faint tabular-nums">
                      {fmtSize(file.size)} · {file.modified}
                    </span>
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={importing !== null}
                      onClick={() => void onImport(dir, file)}
                    >
                      {importing === file.path ? t('packs.kitsu.downloading') : t('packs.kitsu.downloadImport')}
                    </Button>
                  </div>
                ))}
                {listing.dirs.length || listing.files.length ? null : <EmptyState>{t('packs.kitsu.emptyDir')}</EmptyState>}
              </>
            ) : null}
          </>
        ) : kitsu.searching ? (
          <EmptyState>{t('packs.kitsu.indexLoading')}</EmptyState>
        ) : kitsu.hits === null ? null : (
          <>
            {kitsu.translated ? (
              <EmptyState>{t('packs.kitsu.translated', { title: kitsu.translated })}</EmptyState>
            ) : null}
            {kitsu.hits.length ? (
              kitsu.hits.slice(0, 40).map((hit) => (
                <div key={hit.path} className="flex items-center gap-3 border-t border-border px-1 py-1.5 first:border-t-0">
                  <Globe2 className="size-3.5 flex-none text-text-faint" />
                  <span className="min-w-0 flex-1 truncate text-xs" title={hit.name}>
                    {hit.name}
                  </span>
                  <Button size="sm" onClick={() => void kitsu.openDir(hit)}>
                    {t('packs.kitsu.viewFiles')}
                  </Button>
                </div>
              ))
            ) : (
              <EmptyState>{t('packs.kitsu.noMatch')}</EmptyState>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function LocalImportPanel({ library, onImported }: {
  library: LibraryController;
  onImported: (packId: string, language: LanguageId) => void;
}) {
  const fileRef = React.useRef<HTMLInputElement>(null);
  const dirRef = React.useRef<HTMLInputElement>(null);
  const packTitleRef = React.useRef<HTMLInputElement>(null);
  const [over, setOver] = React.useState(false);

  React.useEffect(() => {
    // webkitdirectory has no React prop; set it on the DOM node.
    dirRef.current?.setAttribute('webkitdirectory', '');
  }, []);

  const importFiles = async (files: File[], folder?: string) => {
    if (!files.length) return;
    const typed = packTitleRef.current?.value.trim() ?? '';
    const inferred = folder ?? (files.length ? inferPackTitle(files[0].name) : '');
    const title = typed || (inferred && inferred !== UNFILED_TITLE ? inferred : LOCAL_IMPORT_TITLE);
    const { pack, added, errors } = await importLibraryFiles(files, {
      title,
      origin: { kind: 'local', note: folder ? folderNote(folder) : undefined, importedAt: Date.now() },
    });
    if (packTitleRef.current) packTitleRef.current.value = '';
    onImported(pack.id, pack.language);
    await library.refresh();
    if (added.length) {
      toast.success(
        t('packs.import.imported', {
          count: added.length,
          pack: packTitleForDisplay(pack.title, t),
        }),
      );
    }
    if (errors.length) toast.error(errors.join(t('packs.import.errorSeparator')));
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={() => fileRef.current?.click()}>
          {t('packs.import.chooseFiles')}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".srt,.vtt,.ass,.ssa,.txt"
          multiple
          hidden
          onChange={(event) => {
            const files = [...(event.target.files ?? [])];
            event.target.value = '';
            void importFiles(files);
          }}
        />
        <Button onClick={() => dirRef.current?.click()}>{t('packs.import.chooseFolder')}</Button>
        <input
          ref={dirRef}
          type="file"
          multiple
          hidden
          onChange={(event) => {
            const files = [...(event.target.files ?? [])].filter((file) => SUBTITLE_EXT.test(file.name));
            event.target.value = '';
            if (!files.length) {
              toast.error(t('packs.import.noFiles'));
              return;
            }
            const folder = files[0].webkitRelativePath.split('/')[0] || '';
            void importFiles(files, folder);
          }}
        />
        <input
          ref={packTitleRef}
          type="search"
          placeholder={t('packs.import.packNamePlaceholder')}
          className="h-[26px] w-[200px] rounded-md border border-border-strong bg-card px-2.5 text-xs focus:border-foreground focus:ring-3 focus:ring-ring focus:outline-none"
        />
        <Popover label={t('packs.import.tipsLabel')} className="ml-auto">
          <p className="m-0 mb-1 font-medium text-foreground">{t('packs.import.tipsTitle')}</p>
          <ul className="m-0 flex list-disc flex-col gap-1 pl-4">
            <li>{t('packs.import.tip.formats')}</li>
            <li>{t('packs.import.tip.timeline')}</li>
            <li>{t('packs.import.tip.encoding')}</li>
            <li>{t('packs.import.tip.grouping')}</li>
          </ul>
        </Popover>
      </div>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          void importFiles([...(event.dataTransfer.files ?? [])]);
        }}
        className={cn(
          'mt-2.5 rounded-lg border border-dashed px-3 py-4 text-center text-2xs',
          over ? 'border-foreground bg-secondary text-foreground' : 'border-border-strong bg-muted text-text-faint',
        )}
      >
        {t('packs.import.dropShort')}
      </div>
    </div>
  );
}

function PackCard({ pack, entries, open, onToggle, onChanged, confirm }: {
  pack: LibraryPack;
  entries: LibraryEntry[];
  open: boolean;
  onToggle: () => void;
  onChanged: () => Promise<void>;
  confirm: ReturnType<typeof useConfirm>['confirm'];
}) {
  const title = packTitleForDisplay(pack.title, t);
  const ordered = React.useMemo(() => {
    const labels = describeSubtitles(entries.map((entry) => entry.name));
    return entries
      .map((entry) => ({ entry, label: labels.get(entry.name)?.label ?? entry.name, ep: labels.get(entry.name)?.ep ?? null }))
      .sort((a, b) => (a.ep ?? Number.MAX_SAFE_INTEGER) - (b.ep ?? Number.MAX_SAFE_INTEGER));
  }, [entries]);

  const totalBytes = entries.reduce((sum, entry) => sum + entry.size, 0);
  const summary = originSummary(pack.origin);
  const sourceUrl = originSourceUrl(pack.origin);

  const deletePack = async () => {
    const ok = await confirm({
      title: t('packs.pack.deleteTitle', { title }),
      description: t('packs.pack.deleteDescription', { count: entries.length }),
      confirmLabel: t('packs.pack.deleteAll'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    });
    if (!ok) return;
    await removePack(pack.id);
    await onChanged();
    toast.success(t('packs.pack.deleted', { title }));
  };

  return (
    <div className="border-t border-border py-2.5 first:border-t-0 first:pt-0">
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-expanded={open}
          aria-label={open ? t('packs.pack.collapse') : t('packs.pack.expand')}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-1 py-1 text-left hover:bg-secondary"
          onClick={onToggle}
        >
          {open ? <ChevronDown className="size-3.5 flex-none" /> : <ChevronRight className="size-3.5 flex-none" />}
          <span className="min-w-0 truncate text-xs font-medium">{title}</span>
          <span className="flex flex-none items-center gap-1 text-2xs text-text-faint" title={summary}>
            <OriginIcon kind={pack.origin.kind} />
            <span className="tabular-nums">
              {t('packs.pack.meta', {
                origin: originLabel(pack.origin),
                count: entries.length,
                size: fmtSize(totalBytes),
              })}
            </span>
          </span>
        </button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-text-faint hover:text-destructive"
          aria-label={t('packs.pack.deleteAria', { title })}
          title={t('packs.pack.deleteAll')}
          onClick={() => void deletePack()}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>

      {open ? (
        <div className="mt-2 pl-6">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-1.5">
            {ordered.length ? (
              ordered.map(({ entry, label }) => (
                <Chip
                  key={entry.id}
                  title={`${label}\n${entry.name}\n${t('popup.entry.cueCount', {
                    count: entry.cueCount,
                  })} · ${fmtSize(entry.size)}`}
                  removeLabel={t('common.remove')}
                  onRemove={async () => {
                    const ok = await confirm({
                      title: t('packs.pack.removeTitle', { name: entry.name }),
                      confirmLabel: t('common.remove'),
                      cancelLabel: t('common.cancel'),
                      destructive: true,
                    });
                    if (!ok) return;
                    await removeLibraryItem(entry.id);
                    await onChanged();
                    toast.success(t('packs.pack.removed', { name: entry.name }));
                  }}
                >
                  {label}
                </Chip>
              ))
            ) : (
              <EmptyState>{t('packs.pack.empty')}</EmptyState>
            )}
          </div>

          <Hint className="mt-2">
            <div className="flex flex-col gap-1">
              <span className="break-words">{summary}</span>
              {sourceUrl ? (
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-0.5 self-start underline underline-offset-2"
                >
                  <Link2 className="size-3" aria-hidden />
                  {t('packs.pack.originLink')}
                </a>
              ) : null}
            </div>
          </Hint>

          <div className="mt-2 flex justify-end">
            <Button variant="destructive" size="sm" onClick={() => void deletePack()}>
              {t('packs.pack.deleteAll')}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PackList({ packs, entries, onChanged, expanded, setExpanded, confirm, onAddOnline, onAddLocal }: {
  packs: LibraryPack[];
  entries: LibraryEntry[];
  onChanged: () => Promise<void>;
  expanded: Set<string>;
  setExpanded: React.Dispatch<React.SetStateAction<Set<string>>>;
  confirm: ReturnType<typeof useConfirm>['confirm'];
  onAddOnline: () => void;
  onAddLocal: () => void;
}) {
  const byPack = React.useMemo(() => {
    const map = new Map<string, LibraryEntry[]>();
    for (const entry of entries) {
      const list = map.get(entry.packId);
      if (list) list.push(entry);
      else map.set(entry.packId, [entry]);
    }
    return map;
  }, [entries]);

  const toggle = (packId: string) => {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(packId)) next.delete(packId);
      else next.add(packId);
      return next;
    });
  };

  const totalBytes = entries.reduce((sum, entry) => sum + entry.size, 0);

  return (
    <Card>
      <div className="mb-1 flex items-center justify-between gap-2">
        <CardTitle>{t('packs.list.title')}</CardTitle>
        <span className="text-2xs text-text-faint tabular-nums">
          {entries.length
            ? `${t('packs.list.count', { count: packs.length })} · ${t('packs.list.total', {
                size: fmtSize(totalBytes),
              })}`
            : ''}
        </span>
      </div>
      <div className="mt-1">
        {packs.length ? (
          packs.map((pack) => (
            <PackCard
              key={pack.id}
              pack={pack}
              entries={byPack.get(pack.id) ?? []}
              open={expanded.has(pack.id)}
              onToggle={() => toggle(pack.id)}
              onChanged={onChanged}
              confirm={confirm}
            />
          ))
        ) : (
          <div className="flex flex-col items-start gap-2.5 py-2">
            <EmptyState className="py-0">{t('packs.list.empty')}</EmptyState>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={onAddOnline}>
                {t('packs.list.emptyActionOnline')}
              </Button>
              <Button size="sm" onClick={onAddLocal}>
                {t('packs.list.emptyActionLocal')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

export function PacksPage({ library }: { library: LibraryController }) {
  const confirmState = useConfirm();
  const kitsu = useKitsunekko((message) => toast.error(message));
  const learning = useLearningLanguages();
  const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set());
  const [importing, setImporting] = React.useState<string | null>(null);
  const [activeLanguage, setActiveLanguage] = React.useState<LanguageId>(DEFAULT_LANGUAGE);
  const [tab, setTab] = React.useState<'online' | 'local'>('online');

  const tabLanguages = React.useMemo(() => {
    const ids = [...learning.languages, ...library.packs.map((pack) => pack.language)];
    return [...new Set(ids.length ? ids : [DEFAULT_LANGUAGE])];
  }, [learning.languages, library.packs]);

  const language = tabLanguages.includes(activeLanguage)
    ? activeLanguage
    : (tabLanguages[0] ?? DEFAULT_LANGUAGE);

  const packs = React.useMemo(
    () => library.packs.filter((pack) => pack.language === language),
    [library.packs, language],
  );
  const packIds = React.useMemo(() => new Set(packs.map((pack) => pack.id)), [packs]);
  const entries = React.useMemo(
    () => library.entries.filter((entry) => packIds.has(entry.packId)),
    [library.entries, packIds],
  );

  const expand = React.useCallback((packId: string) => {
    setExpanded((previous) => new Set(previous).add(packId));
  }, []);

  const expandLanguage = React.useCallback(
    (packId: string, packLanguage: LanguageId) => {
      setActiveLanguage(packLanguage);
      expand(packId);
    },
    [expand],
  );

  const importProvider = React.useCallback(
    (packId: string, packLanguage: LanguageId) => {
      expandLanguage(packId, packLanguage);
      void library.refresh();
    },
    [expandLanguage, library.refresh],
  );

  const importRemote = async (dir: SeriesDir, file: SubFile) => {
    setImporting(file.path);
    try {
      const { pack, entries, errors } = await importKitsunekkoArchive(dir, file);
      expandLanguage(pack.id, pack.language);
      await library.refresh();
      const imported = t('popup.toast.imported', {
        count: entries.length,
        pack: packTitleForDisplay(pack.title, t),
      });
      if (errors) toast.warning(imported + t('popup.toast.parseFailed', { count: errors }));
      else toast.success(imported);
    } catch (error) {
      toast.error(t('errors.downloadFailed', { error: errorText(error) }));
    } finally {
      setImporting(null);
    }
  };

  return (
    <>
      <PageHeader title={t('packs.title')} />
      {tabLanguages.length > 1 ? (
        <SegmentedControl
          fill
          value={language}
          options={tabLanguages.map((id) => ({
            value: id,
            label: subtitleLanguageLabel(id),
          }))}
          onChange={(value) => setActiveLanguage(value as LanguageId)}
          aria-label={t('packs.language.aria')}
        />
      ) : null}

      <Card className="mt-5">
        <div className="flex items-center gap-1.5">
          <CardTitle>{t('packs.add.title')}</CardTitle>
          <Popover label={t('packs.hint.label')} align="start">
            <p className="m-0 mb-1 font-medium text-foreground">{t('packs.hint.title')}</p>
            <ul className="m-0 flex list-disc flex-col gap-1 pl-4">
              {language === 'ja' ? <li>{t('packs.hint.naming')}</li> : null}
              {language !== 'ja' ? <li>{t('packs.hint.providerKey')}</li> : null}
              <li>
                {t('packs.hint.opensubtitles')}{' '}
                <a
                  href="https://www.opensubtitles.org"
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-2"
                >
                  opensubtitles.org
                </a>
              </li>
            </ul>
          </Popover>
        </div>

        <Tabs value={tab} onValueChange={(value) => setTab(value as 'online' | 'local')} className="mt-3">
          <TabsList aria-label={t('packs.tabs.aria')}>
            <TabsTrigger value="online">{t('packs.tabs.online')}</TabsTrigger>
            <TabsTrigger value="local">{t('packs.tabs.local')}</TabsTrigger>
          </TabsList>
          <TabsContent value="online" className="mt-2.5">
            {language === 'ja' ? (
              <KitsuPanel kitsu={kitsu} onImport={importRemote} importing={importing} />
            ) : (
              <ProviderPanel
                key={language}
                initialLanguage={providerFor(language) ? language : 'en'}
                onImported={importProvider}
              />
            )}
          </TabsContent>
          <TabsContent value="local" className="mt-2.5">
            <LocalImportPanel library={library} onImported={expandLanguage} />
          </TabsContent>
        </Tabs>
      </Card>

      <PackList
        packs={packs}
        entries={entries}
        onChanged={library.refresh}
        expanded={expanded}
        setExpanded={setExpanded}
        confirm={confirmState.confirm}
        onAddOnline={() => setTab('online')}
        onAddLocal={() => setTab('local')}
      />

      <Card>
        <SettingRow title={t('packs.autoApply.title')} description={t('packs.autoApply.description')}>
          <Switch
            checked={library.autoApply}
            aria-label={t('packs.autoApply.title')}
            onCheckedChange={(checked) => void library.setAutoApply(checked)}
          />
        </SettingRow>
      </Card>
      {confirmState.element}
    </>
  );
}
