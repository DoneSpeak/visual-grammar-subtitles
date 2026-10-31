import * as React from 'react';
import { ChevronDown, ChevronRight, Globe2, Link2 } from 'lucide-react';

import {
  Badge,
  Button,
  Card,
  CardTitle,
  Chip,
  EmptyState,
  PageHeader,
  SearchField,
  SettingRow,
  Switch,
  cn,
  toast,
  useConfirm,
} from '@/design-system';
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
import { fmtDate, fmtSize } from '../lib/format';
import { useKitsunekko, type KitsunekkoController } from '../hooks/use-kitsunekko';
import type { LibraryController } from '../hooks/use-library';

const SUBTITLE_EXT = /\.(srt|vtt|ass|ssa|txt)$/i;

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const originSummary = (origin: SubtitleOrigin): string =>
  origin.kind === 'kitsunekko'
    ? t('packs.origin.kitsu', {
        series: origin.seriesPath,
        archive: origin.archiveName,
        modified: origin.archiveModified,
        date: fmtDate(origin.importedAt),
      })
    : origin.note
      ? t('packs.origin.localNote', {
          note: originNoteForDisplay(origin.note, t),
          date: fmtDate(origin.importedAt),
        })
      : t('packs.origin.local', { date: fmtDate(origin.importedAt) });

function KitsuSection({ kitsu, onImport, importing }: {
  kitsu: KitsunekkoController;
  onImport: (dir: SeriesDir, file: SubFile) => Promise<void>;
  importing: string | null;
}) {
  const { trail, listing } = kitsu;
  const dir = trail[trail.length - 1];

  return (
    <Card>
      <CardTitle>{t('packs.kitsu.title')}</CardTitle>
      <p className="mt-1 mb-2.5 text-xs text-muted-foreground">{t('packs.kitsu.note')}</p>
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
    </Card>
  );
}

function ImportSection({ library, onImported }: {
  library: LibraryController;
  onImported: (packId: string) => void;
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
    onImported(pack.id);
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

  const totalBytes = library.entries.reduce((sum, entry) => sum + entry.size, 0);

  return (
    <Card>
      <CardTitle>{t('packs.import.title')}</CardTitle>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
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
        <span className="text-2xs text-text-faint">
          {library.packs.length
            ? `${t('packs.import.summaryPacks', { count: library.packs.length })} · ${t(
                'packs.import.summaryFiles',
                { count: library.entries.length },
              )}`
            : ''}
        </span>
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
          'mt-3 rounded-lg border border-dashed p-5 text-center text-xs',
          over ? 'border-foreground bg-secondary text-foreground' : 'border-border-strong bg-muted text-text-faint',
        )}
      >
        {t('packs.import.drop')}
      </div>
      <div className="mt-2 text-2xs text-text-faint">
        {library.entries.length ? t('packs.import.total', { size: fmtSize(totalBytes) }) : ''}
      </div>
    </Card>
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

  return (
    <div className="border-t border-border py-3 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          aria-expanded={open}
          aria-label={open ? t('packs.pack.collapse') : t('packs.pack.expand')}
          className="cursor-pointer border-0 bg-transparent px-1 text-2xs text-text-faint hover:text-foreground"
          onClick={onToggle}
        >
          {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        </button>
        <button
          type="button"
          className="cursor-pointer border-0 bg-transparent p-0 text-xs font-medium hover:underline hover:underline-offset-2"
          onClick={onToggle}
        >
          {title}
        </button>
        <Badge>{pack.origin.kind === 'kitsunekko' ? 'kitsunekko' : t('packs.pack.localBadge')}</Badge>
        <Badge>{t('popup.pack.fileCount', { count: entries.length })}</Badge>
        <span className="min-w-0 flex-1 truncate text-2xs text-text-faint" title={originSummary(pack.origin)}>
          {originSummary(pack.origin)}
          {pack.origin.kind === 'kitsunekko' ? (
            <a
              href={pack.origin.seriesUrl}
              target="_blank"
              rel="noreferrer"
              className="ml-1 inline-flex items-center gap-0.5 text-muted-foreground underline underline-offset-2"
            >
              <Link2 className="size-3" />
              {t('packs.pack.originLink')}
            </a>
          ) : null}
        </span>
        <Button
          variant="destructive"
          size="sm"
          onClick={async () => {
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
          }}
        >
          {t('packs.pack.deleteAll')}
        </Button>
      </div>

      {open ? (
        <div className="mt-2.5 grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-1.5 pl-2">
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
      ) : null}
    </div>
  );
}

function PackList({ library, expanded, setExpanded, confirm }: {
  library: LibraryController;
  expanded: Set<string>;
  setExpanded: React.Dispatch<React.SetStateAction<Set<string>>>;
  confirm: ReturnType<typeof useConfirm>['confirm'];
}) {
  const byPack = React.useMemo(() => {
    const map = new Map<string, LibraryEntry[]>();
    for (const entry of library.entries) {
      const list = map.get(entry.packId);
      if (list) list.push(entry);
      else map.set(entry.packId, [entry]);
    }
    return map;
  }, [library.entries]);

  const toggle = (packId: string) => {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(packId)) next.delete(packId);
      else next.add(packId);
      return next;
    });
  };

  return (
    <Card>
      <div className="mb-1 flex items-center justify-between gap-2">
        <CardTitle>{t('packs.list.title')}</CardTitle>
        <span className="text-2xs text-text-faint">
          {library.entries.length
            ? t('packs.list.total', {
                size: fmtSize(library.entries.reduce((sum, entry) => sum + entry.size, 0)),
              })
            : ''}
        </span>
      </div>
      <div className="mt-1">
        {library.packs.length ? (
          library.packs.map((pack) => (
            <PackCard
              key={pack.id}
              pack={pack}
              entries={byPack.get(pack.id) ?? []}
              open={expanded.has(pack.id)}
              onToggle={() => toggle(pack.id)}
              onChanged={library.refresh}
              confirm={confirm}
            />
          ))
        ) : (
          <EmptyState>{t('packs.list.empty')}</EmptyState>
        )}
      </div>
    </Card>
  );
}

export function PacksPage({ library }: { library: LibraryController }) {
  const confirmState = useConfirm();
  const kitsu = useKitsunekko((message) => toast.error(message));
  const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set());
  const [importing, setImporting] = React.useState<string | null>(null);

  const expand = React.useCallback((packId: string) => {
    setExpanded((previous) => new Set(previous).add(packId));
  }, []);

  const importRemote = async (dir: SeriesDir, file: SubFile) => {
    setImporting(file.path);
    try {
      const { pack, entries, errors } = await importKitsunekkoArchive(dir, file);
      expand(pack.id);
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
      <PageHeader title={t('packs.title')} description={t('packs.description')} />
      <KitsuSection kitsu={kitsu} onImport={importRemote} importing={importing} />
      <ImportSection library={library} onImported={expand} />
      <Card>
        <SettingRow title={t('packs.autoApply.title')} description={t('packs.autoApply.description')}>
          <Switch
            checked={library.autoApply}
            aria-label={t('packs.autoApply.title')}
            onCheckedChange={(checked) => void library.setAutoApply(checked)}
          />
        </SettingRow>
      </Card>
      <PackList library={library} expanded={expanded} setExpanded={setExpanded} confirm={confirmState.confirm} />
      {confirmState.element}
    </>
  );
}
