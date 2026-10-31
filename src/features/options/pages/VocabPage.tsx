import * as React from 'react';

import { EmptyState, PageHeader, SearchField } from '@/design-system';
import { t } from '@/shared/i18n';
import type { VocabularyGalleryItem } from '@/shared/vocabulary';
import { useVocabulary } from '../hooks/use-vocabulary';

/** N5 first: the gallery is a study aid, so easy words come before hard ones. */
const LEVEL_ORDER = [5, 4, 3, 2, 1] as const;

const matches = (item: VocabularyGalleryItem, query: string): boolean =>
  [item.word, item.reading, item.gloss ?? ''].some((field) =>
    field.toLowerCase().includes(query),
  );

export function VocabPage() {
  const { items, loading, failed } = useVocabulary();
  const [query, setQuery] = React.useState('');
  const needle = query.trim().toLowerCase();

  const visible = React.useMemo(
    () => (needle ? items.filter((item) => matches(item, needle)) : items),
    [items, needle],
  );

  const groups = React.useMemo(() => {
    const byLevel = new Map<number, VocabularyGalleryItem[]>();
    for (const item of visible) {
      if (!item.level) continue;
      byLevel.set(item.level, [...(byLevel.get(item.level) ?? []), item]);
    }
    return LEVEL_ORDER.filter((level) => byLevel.has(level)).map((level) => ({
      level,
      items: byLevel.get(level)!,
    }));
  }, [visible]);

  return (
    <>
      <PageHeader title={t('vocab.title')} description={t('vocab.description', { count: items.length })} />

      <div className="mb-4 flex items-center gap-2">
        <SearchField
          value={query}
          aria-label={t('vocab.search')}
          placeholder={t('vocab.search')}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {loading ? <EmptyState>{t('vocab.loading')}</EmptyState> : null}
      {failed ? <EmptyState>{t('vocab.failed')}</EmptyState> : null}
      {!loading && !failed && !visible.length ? <EmptyState>{t('vocab.noMatch')}</EmptyState> : null}

      {groups.map((group) => (
        <section key={group.level} className="mt-5">
          <h2 className="mb-2 text-xs font-medium text-muted-foreground">
            N{group.level} · {group.items.length}
          </h2>
          <ul className="grid list-none grid-cols-[repeat(auto-fill,minmax(66px,1fr))] gap-1.5 p-0">
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
      ))}

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
