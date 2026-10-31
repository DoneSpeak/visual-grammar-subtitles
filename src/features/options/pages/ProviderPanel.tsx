import * as React from 'react';
import { CheckCircle2, Globe2, Link2 } from 'lucide-react';

import {
  Button,
  EmptyState,
  Hint,
  Input,
  Progress,
  SearchField,
  SettingRow,
  cn,
  toast,
} from '@/design-system';
import type { LanguageId } from '@/languages/types';
import { packTitleForDisplay, t } from '@/shared/i18n';
import { importLibraryFiles } from '@/shared/library';
import type { EpisodeFile } from '@/features/scraper/providers';
import { fmtSize } from '../lib/format';
import { useProviderSearch } from '../hooks/use-provider-search';

const errorText = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Search-and-import card for a keyed subtitle provider. Shown on the pack tab of any language a
 * provider serves; the key is supplied by the user and never shipped.
 */
export function ProviderPanel({
  language,
  onImported,
}: {
  language: LanguageId;
  onImported: (packId: string, language: LanguageId) => void;
}) {
  const search = useProviderSearch(language);
  const [draft, setDraft] = React.useState('');
  /** File being downloaded; its presence replaces the result list with the progress bar. */
  const [pending, setPending] = React.useState<EpisodeFile | null>(null);
  /** `running` → `done` (check icon) → `leaving` (fade out) → gone. */
  const [phase, setPhase] = React.useState<'running' | 'done' | 'leaving' | null>(null);
  /** Kept true after a successful import so the result list stays folded away. */
  const [collapsed, setCollapsed] = React.useState(false);
  const timers = React.useRef<number[]>([]);

  React.useEffect(() => setDraft(search.key), [search.key]);
  React.useEffect(() => () => timers.current.forEach((id) => window.clearTimeout(id)), []);

  if (!search.provider) return null;
  const { provider } = search;

  const clearTimers = () => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  };

  /** Hold the completed bar briefly, then fade the whole row out; success needs no toast. */
  const celebrate = () => {
    clearTimers();
    setPhase('done');
    timers.current.push(
      window.setTimeout(() => setPhase('leaving'), 700),
      window.setTimeout(() => {
        setPending(null);
        setPhase(null);
      }, 950),
    );
  };

  const importFile = async (file: EpisodeFile) => {
    if (!search.hit) return;
    clearTimers();
    setCollapsed(true);
    setPending(file);
    setPhase('running');
    search.setImporting(file.id);
    try {
      const fetched = await provider.create(search.key).fetch(file);
      if (!fetched.length) {
        toast.error(t('packs.provider.emptyFile'));
        setPending(null);
        setPhase(null);
        return;
      }
      const files = fetched.map(
        (item) => new File([item.text], item.name, { type: 'text/plain' }),
      );
      const { pack, added, errors } = await importLibraryFiles(files, {
        title: search.hit.title,
        language: provider.language,
        origin: {
          kind: 'provider',
          provider: provider.id,
          seriesId: search.hit.id,
          season: search.season ? Number(search.season) : undefined,
          episode: search.episode ? Number(search.episode) : undefined,
          release: file.release,
          url: file.url,
          importedAt: Date.now(),
        },
      });
      onImported(pack.id, pack.language);
      if (errors.length) {
        toast.warning(
          t('popup.toast.imported', {
            count: added.length,
            pack: packTitleForDisplay(pack.title, t),
          }) + t('popup.toast.parseFailed', { count: errors.length }),
        );
      }
      celebrate();
    } catch (error) {
      toast.error(t('errors.downloadFailed', { error: errorText(error) }));
      // Restore the list so the user can retry a different file.
      setCollapsed(false);
      setPending(null);
      setPhase(null);
    } finally {
      search.setImporting(null);
    }
  };

  return (
    <div>
      <SettingRow title={t('packs.provider.key.title')}>
        <div className="flex items-center gap-2">
          <Input
            type="password"
            value={draft}
            placeholder={t('packs.provider.key.placeholder')}
            aria-label={t('packs.provider.key.title')}
            autoComplete="off"
            spellCheck={false}
            className="w-44"
            onChange={(event) => setDraft(event.target.value)}
          />
          <Button
            onClick={() => {
              void search.saveKey(provider.id, draft).then(() => {
                if (draft.trim()) toast.success(t('packs.provider.key.saved'));
              });
            }}
          >
            {t('packs.provider.key.save')}
          </Button>
        </div>
      </SettingRow>

      {search.key ? (
        <>
          <div className="mt-3 flex items-center gap-2">
            <SearchField
              value={search.query}
              placeholder={t('packs.provider.searchPlaceholder')}
              aria-label={t('packs.provider.searchPlaceholder')}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => search.setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                setCollapsed(false);
                void search.search();
              }}
            />
            <Input
              type="number"
              min={0}
              value={search.season}
              placeholder={t('packs.provider.season')}
              aria-label={t('packs.provider.season')}
              className="w-20"
              onChange={(event) => search.setSeason(event.target.value)}
            />
            <Input
              type="number"
              min={0}
              value={search.episode}
              placeholder={t('packs.provider.episode')}
              aria-label={t('packs.provider.episode')}
              className="w-20"
              onChange={(event) => search.setEpisode(event.target.value)}
            />
            <Button
              variant="primary"
              onClick={() => {
                setCollapsed(false);
                void search.search();
              }}
              disabled={search.searching || search.importing !== null}
            >
              {t('packs.provider.search')}
            </Button>
          </div>

          {pending ? (
            <div
              className={cn(
                'mt-2 flex items-center gap-3 rounded-lg border border-border px-3 py-2.5',
                'transition-opacity duration-200 ease-out motion-reduce:transition-none',
                phase === 'leaving' ? 'opacity-0' : 'opacity-100',
              )}
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="truncate text-xs" title={pending.name} role="status">
                  {phase === 'running'
                    ? t('packs.provider.importProgress', { name: pending.name })
                    : t('packs.provider.importDone')}
                </span>
                <Progress
                  label={
                    phase === 'running'
                      ? t('packs.provider.importing')
                      : t('packs.provider.importDone')
                  }
                  value={phase === 'running' ? undefined : 100}
                />
              </div>
              {phase === 'running' ? null : (
                <CheckCircle2 className="size-4 flex-none text-success" aria-hidden />
              )}
            </div>
          ) : collapsed ? null : (
          <div className="mt-2 flex flex-col">
            {search.hit ? (
              <>
                <div className="px-1 pb-1 text-xs font-medium">{search.hit.title}</div>
                {search.listing ? (
                  <EmptyState>{t('packs.provider.loading')}</EmptyState>
                ) : search.files.length ? (
                  search.files.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center gap-3 border-t border-border px-1 py-1.5 first:border-t-0"
                    >
                      <span className="min-w-0 flex-1 truncate text-xs" title={file.name}>
                        {file.name}
                      </span>
                      {file.size !== undefined ? (
                        <span className="flex-none text-2xs text-text-faint tabular-nums">
                          {fmtSize(file.size)}
                        </span>
                      ) : null}
                      <span className="flex-none text-2xs text-text-faint">{file.language}</span>
                      {file.sourceUrl ? (
                        <a
                          href={file.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          title={file.sourceUrl}
                          aria-label={t('packs.provider.source')}
                          className="flex-none text-text-faint hover:text-foreground"
                        >
                          <Link2 className="size-3" aria-hidden />
                        </a>
                      ) : null}
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={search.importing !== null}
                        onClick={() => void importFile(file)}
                      >
                        {search.importing === file.id
                          ? t('packs.provider.importing')
                          : t('packs.provider.import')}
                      </Button>
                    </div>
                  ))
                ) : (
                  <EmptyState>{t('packs.provider.noResults')}</EmptyState>
                )}
              </>
            ) : search.searching ? (
              <EmptyState>{t('packs.provider.loading')}</EmptyState>
            ) : search.hits === null ? null : search.hits.length ? (
              search.hits.slice(0, 40).map((hit) => (
                <div
                  key={hit.id}
                  className="flex items-center gap-3 border-t border-border px-1 py-1.5 first:border-t-0"
                >
                  <Globe2 className="size-3.5 flex-none text-text-faint" />
                  <span className="min-w-0 flex-1 truncate text-xs" title={hit.title}>
                    {hit.title}
                    {hit.year ? <span className="text-text-faint"> · {hit.year}</span> : null}
                  </span>
                  <Button
                    size="sm"
                    onClick={() => {
                      setCollapsed(false);
                      void search.open(hit);
                    }}
                  >
                    {t('packs.provider.viewFiles')}
                  </Button>
                </div>
              ))
            ) : (
              <EmptyState>{t('packs.provider.noResults')}</EmptyState>
            )}
          </div>
          )}
        </>
      ) : (
        <Hint className="mt-2.5">{t('packs.provider.key.missing')}</Hint>
      )}
    </div>
  );
}
