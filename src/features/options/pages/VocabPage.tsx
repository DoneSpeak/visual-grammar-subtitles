import * as React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

import {
  EmptyState,
  PageHeader,
  SearchField,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/design-system';
import { DEFAULT_LANGUAGE, resolveLanguage, SELECTABLE_LANGUAGES } from '@/languages/registry';
import type { LanguageId } from '@/languages/types';
import { t } from '@/shared/i18n';
import { POS_GROUP_LABELS, POS_GROUPS } from '@/shared/posColors';
import { posGroupForPos } from '@/shared/posGroup';
import type { PosGroup } from '@/shared/types';
import type { VocabularyGalleryItem } from '@/shared/vocabulary';
import { useVocabulary } from '../hooks/use-vocabulary';

const matches = (item: VocabularyGalleryItem, query: string): boolean =>
  [item.word, item.reading, item.gloss ?? ''].some((field) =>
    field.toLowerCase().includes(query),
  );

export function VocabPage() {
  const { items, loading, failed } = useVocabulary();
  const [language, setLanguage] = React.useState<LanguageId>(DEFAULT_LANGUAGE);
  const [query, setQuery] = React.useState('');
  // Every group starts open; this only remembers the ones the reader closed.
  const [collapsed, setCollapsed] = React.useState<ReadonlySet<PosGroup>>(new Set());
  const needle = query.trim().toLowerCase();

  const toggleGroup = (group: PosGroup) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });

  // The index is built per subtitle language; a missing tag means the original Japanese file.
  const inLanguage = React.useMemo(
    () => items.filter((item) => (item.language ?? DEFAULT_LANGUAGE) === language),
    [items, language],
  );

  const visible = React.useMemo(
    () => (needle ? inLanguage.filter((item) => matches(item, needle)) : inLanguage),
    [inLanguage, needle],
  );

  const groups = React.useMemo(() => {
    const buckets = new Map<PosGroup, VocabularyGalleryItem[]>();
    for (const item of visible) {
      const group = posGroupForPos(item.pos ?? 'X');
      buckets.set(group, [...(buckets.get(group) ?? []), item]);
    }
    return POS_GROUPS.filter((group) => buckets.has(group)).map((group) => ({
      group,
      items: buckets.get(group)!,
    }));
  }, [visible]);

  const languageName = resolveLanguage(language).displayName;

  return (
    <>
      <PageHeader
        title={t('vocab.title')}
        description={t('vocab.description', { count: inLanguage.length })}
      />

      <div className="mb-4 flex items-center gap-2">
        <SearchField
          value={query}
          aria-label={t('vocab.search')}
          placeholder={t('vocab.search')}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Select value={language} onValueChange={(value) => setLanguage(value as LanguageId)}>
          <SelectTrigger className="w-40 flex-none" aria-label={t('vocab.language')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SELECTABLE_LANGUAGES.map((pack) => (
              <SelectItem key={pack.id} value={pack.id}>
                {pack.displayName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? <EmptyState>{t('vocab.loading')}</EmptyState> : null}
      {failed ? <EmptyState>{t('vocab.failed')}</EmptyState> : null}
      {!loading && !failed && !inLanguage.length ? (
        <EmptyState>{t('vocab.languageEmpty', { language: languageName })}</EmptyState>
      ) : null}
      {!loading && !failed && inLanguage.length && !visible.length ? (
        <EmptyState>{t('vocab.noMatch')}</EmptyState>
      ) : null}

      {groups.map((group) => {
        const open = !collapsed.has(group.group);
        const tilesId = `vocab-group-${group.group}`;
        return (
          <section key={group.group} className="mt-5">
            <h2 className="mb-2 text-xs font-medium text-muted-foreground">
              <button
                type="button"
                aria-expanded={open}
                aria-controls={tilesId}
                className="flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 font-medium text-muted-foreground hover:text-foreground"
                onClick={() => toggleGroup(group.group)}
              >
                {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                {t(POS_GROUP_LABELS[group.group].nameKey)} · {group.items.length}
              </button>
            </h2>
            <ul
              id={tilesId}
              hidden={!open}
              className="grid list-none grid-cols-[repeat(auto-fill,minmax(66px,1fr))] gap-1.5 p-0"
            >
              {group.items.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-col items-center gap-0.5 rounded-md border border-border bg-card px-1 py-1.5 text-center"
                >
                  <span className="grid size-8 place-items-center rounded-sm bg-image-tile">
                    <img
                      src={chrome.runtime.getURL(`vocab/openmoji/${item.img}.svg`)}
                      alt={t('vocab.imageAlt', { word: item.word })}
                      width={26}
                      height={26}
                      loading="lazy"
                      className="size-[26px]"
                    />
                  </span>
                  <span className="mt-1 text-2xs font-medium leading-tight">{item.word}</span>
                  {item.reading ? (
                    <span className="text-2xs leading-tight text-muted-foreground">{item.reading}</span>
                  ) : null}
                  {item.gloss ? (
                    <span title={item.gloss} className="w-full truncate text-2xs leading-tight text-muted-foreground">
                      {item.gloss}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <p className="mt-6 text-2xs text-text-faint">
        {t('vocab.creditLead')}
        <a
          className="underline underline-offset-2"
          href="https://openmoji.org"
          target="_blank"
          rel="noopener noreferrer"
        >
          OpenMoji
        </a>{' '}
        · CC BY-SA 4.0
      </p>
    </>
  );
}
