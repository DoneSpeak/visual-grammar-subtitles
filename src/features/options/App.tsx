import * as React from 'react';
import {
  BookOpen,
  ChevronRight,
  Keyboard,
  Images,
  Layers3,
  Link2,
  Palette,
  SlidersHorizontal,
  Tags,
  X,
  type LucideIcon,
} from 'lucide-react';

import {
  SegmentedControl,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Toaster,
  cn,
} from '@/design-system';
import { useLanguage } from '@/features/i18n/use-language';
import { useTheme } from '@/features/theme/use-theme';
import {
  DEFAULT_LANGUAGE,
  isSelectableLanguage,
  resolveLanguage,
  SELECTABLE_LANGUAGES,
} from '@/languages/registry';
import type { BandSelection, LanguageId } from '@/languages/types';
import { setLanguage, t, type Language, type MessageKey } from '@/shared/i18n';
import { useDictSettings } from './hooks/use-dict-settings';
import { useLearningLanguages } from './hooks/use-learning-languages';
import { useLibrary } from './hooks/use-library';
import { useSiteRules } from './hooks/use-site-rules';
import { BandsPage } from './pages/BandsPage';
import { BindsPage } from './pages/BindsPage';
import { DictPage } from './pages/DictPage';
import { KeysPage } from './pages/KeysPage';
import { ModesPage } from './pages/ModesPage';
import { PacksPage } from './pages/PacksPage';
import { RulesPage } from './pages/RulesPage';
import { VocabPage } from './pages/VocabPage';

type StaticPageId = 'packs' | 'dict' | 'vocab' | 'rules' | 'binds' | 'keys';
type PageId = StaticPageId | `modes:${string}` | `bands:${string}`;

type GroupId = 'content' | 'study' | 'site' | 'actions' | 'appearance';

type NavEntry = {
  id: StaticPageId;
  labelKey: MessageKey;
  group: GroupId;
  icon: LucideIcon;
  count?: 'packs' | 'rules' | 'binds';
};

const NAV: NavEntry[] = [
  { id: 'packs', labelKey: 'options.nav.packs', group: 'content', icon: Layers3, count: 'packs' },
  { id: 'vocab', labelKey: 'options.nav.vocab', group: 'content', icon: Images },
  { id: 'dict', labelKey: 'options.nav.dict', group: 'study', icon: BookOpen },
  { id: 'rules', labelKey: 'options.nav.rules', group: 'site', icon: SlidersHorizontal, count: 'rules' },
  { id: 'binds', labelKey: 'options.nav.binds', group: 'site', icon: Link2, count: 'binds' },
  { id: 'keys', labelKey: 'options.nav.keys', group: 'actions', icon: Keyboard },
];

const GROUP_ORDER: GroupId[] = ['content', 'study', 'site', 'actions', 'appearance'];

const GROUP_LABEL_KEYS: Record<GroupId, MessageKey> = {
  content: 'options.nav.group.content',
  study: 'options.nav.group.study',
  site: 'options.nav.group.site',
  actions: 'options.nav.group.actions',
  appearance: 'options.nav.group.appearance',
};

/** `modes:ja` → `#modes/ja`; static ids stay bare. */
const hashOf = (id: PageId): string => id.replace(':', '/');

const isStaticPage = (raw: string): raw is StaticPageId =>
  NAV.some((entry) => entry.id === raw);

/** Hash → page. A language that is no longer in the set falls back to the packs list. */
const readPage = (languages: LanguageId[]): PageId => {
  const raw = window.location.hash.slice(1);
  const [kind, language] = raw.split('/');
  const first = languages[0] ?? DEFAULT_LANGUAGE;

  if (raw === 'online') return 'packs';
  if (raw === 'colors') return `modes:${first}`;
  if (kind === 'modes' && !language) return `modes:${first}`;
  if (kind === 'bands' && !language) return `bands:${first}`;
  if ((kind === 'modes' || kind === 'bands') && language) {
    return languages.includes(language) ? `${kind}:${language}` : 'packs';
  }
  return isStaticPage(raw) ? raw : 'packs';
};

const themeOptions = [
  { value: 'light', labelKey: 'options.theme.light' },
  { value: 'dark', labelKey: 'options.theme.dark' },
  { value: 'system', labelKey: 'options.theme.system' },
] as const satisfies readonly { value: string; labelKey: MessageKey }[];

/** Stable empty slice so a language with no bands does not churn `useMemo` every render. */
const NO_BANDS: BandSelection = {};

/** Folded by default; the two most common study languages start open. A reload returns here. */
const DEFAULT_EXPANDED: LanguageId[] = ['ja', 'en'];

/** Language names stay in their own language, as language pickers conventionally do. */
const languageOptions = [
  { value: 'zh-CN', label: '中文' },
  { value: 'en-GB', label: 'English' },
] as const;

export function App() {
  const language = useLanguage('meta.optionsTitle');
  const [page, setPage] = React.useState<PageId>('packs');
  const { mode, resolved, setMode } = useTheme();
  const learning = useLearningLanguages();
  const { languages, ready, add, remove } = learning;
  const [expanded, setExpanded] = React.useState<LanguageId[]>(DEFAULT_EXPANDED);

  const openGroup = React.useCallback((id: LanguageId) => {
    setExpanded((previous) => (previous.includes(id) ? previous : [...previous, id]));
  }, []);

  const toggleGroup = React.useCallback((id: LanguageId) => {
    setExpanded((previous) =>
      previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id],
    );
  }, []);

  const addLanguage = React.useCallback(
    (id: LanguageId) => {
      add(id);
      openGroup(id);
    },
    [add, openGroup],
  );

  const removeLanguage = React.useCallback(
    (id: LanguageId) => {
      remove(id);
      setExpanded((previous) => previous.filter((item) => item !== id));
    },
    [remove],
  );

  const library = useLibrary();
  const sites = useSiteRules();
  const dict = useDictSettings();

  React.useEffect(() => {
    if (!ready) return;
    const sync = () => {
      setPage(readPage(languages));
      window.scrollTo({ top: 0 });
    };
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, [ready, languages]);

  // A deep link (or a link from elsewhere) opens the group that owns the page.
  React.useEffect(() => {
    const [kind, target] = page.split(':');
    if ((kind === 'modes' || kind === 'bands') && isSelectableLanguage(target)) openGroup(target);
  }, [page, openGroup]);

  const counts = {
    packs: library.packs.length,
    rules: sites.ruleCount,
    binds: sites.bindCount,
  };

  const renderLink = (id: PageId, labelKey: MessageKey, Icon: LucideIcon, count?: NavEntry['count']) => {
    const active = id === page;
    return (
      <a
        key={id}
        href={`#${hashOf(id)}`}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs leading-normal transition-colors',
          active
            ? 'bg-accent font-medium text-foreground'
            : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
        )}
      >
        <Icon className={cn('size-4 flex-none', active ? 'opacity-100' : 'opacity-80')} />
        <span>{t(labelKey)}</span>
        {count && counts[count] ? (
          <span className="ml-auto text-2xs text-text-faint tabular-nums">{counts[count]}</span>
        ) : null}
      </a>
    );
  };

  const remaining = SELECTABLE_LANGUAGES.filter((pack) => !languages.includes(pack.id));
  const brand = resolveLanguage(languages[0] ?? DEFAULT_LANGUAGE).shortLabel;

  return (
    <div className="mx-auto flex min-h-screen max-w-[1180px] border-x border-border bg-card">
      <aside className="sticky top-0 flex h-screen w-[236px] flex-none flex-col gap-6.5 overflow-y-auto border-r border-border px-3.5 pt-7 pb-6">
        <div className="flex items-center gap-2.5 px-2.5 text-xs font-semibold tracking-tight">
          <span className="grid size-6 flex-none place-items-center rounded-md bg-primary text-[10px] font-bold text-primary-foreground">
            {brand}
          </span>
          <span>{t('meta.brand')}</span>
        </div>

        <nav className="flex flex-col gap-4.5" aria-label={t('options.nav.aria')}>
          {GROUP_ORDER.map((group) => {
            const entries = NAV.filter((entry) => entry.group === group);
            return (
              <div key={group} className="flex flex-col gap-px">
                <div className="px-2.5 pb-1.5 text-[10.5px] tracking-[0.06em] text-text-faint uppercase">
                  {t(GROUP_LABEL_KEYS[group])}
                </div>

                {entries.map((entry) =>
                  renderLink(entry.id, entry.labelKey, entry.icon, entry.count),
                )}

                {group === 'study' ? (
                  <>
                    {languages.map((id) => {
                      const pack = resolveLanguage(id);
                      const open = expanded.includes(id);
                      const listId = `nav-group-${id}`;
                      return (
                        <div key={id} className="mt-2 flex flex-col gap-px border-t border-border pt-2">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              aria-expanded={open}
                              aria-controls={listId}
                              onClick={() => toggleGroup(id)}
                              className="flex min-w-0 flex-1 items-center gap-1 rounded-sm px-2.5 py-1 text-left text-[10.5px] tracking-[0.06em] text-text-faint uppercase hover:text-foreground"
                            >
                              <ChevronRight
                                className={cn(
                                  'size-3 flex-none transition-transform',
                                  open && 'rotate-90',
                                )}
                              />
                              <span className="truncate">{pack.displayName}</span>
                            </button>
                            {languages.length > 1 ? (
                              <button
                                type="button"
                                aria-label={t('options.languages.remove', {
                                  name: pack.displayName,
                                })}
                                onClick={() => removeLanguage(id)}
                                className="grid size-4 flex-none place-items-center rounded-sm text-text-faint hover:bg-secondary hover:text-foreground"
                              >
                                <X className="size-3" />
                              </button>
                            ) : null}
                          </div>
                          <div
                            id={listId}
                            className={cn('flex-col gap-px pl-4', open ? 'flex' : 'hidden')}
                          >
                            {renderLink(`modes:${id}`, 'options.nav.modes', Palette)}
                            {renderLink(`bands:${id}`, 'options.nav.bands', Tags)}
                          </div>
                        </div>
                      );
                    })}
                    {remaining.length ? (
                      <Select value="" onValueChange={addLanguage}>
                        <SelectTrigger
                          className="mt-2 h-7 w-full text-2xs text-muted-foreground"
                          aria-label={t('options.languages.addAria')}
                        >
                          <SelectValue placeholder={t('options.languages.add')} />
                        </SelectTrigger>
                        <SelectContent>
                          {remaining.map((pack) => (
                            <SelectItem key={pack.id} value={pack.id} className="text-xs">
                              {pack.displayName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : null}
                  </>
                ) : null}

                {group === 'appearance' ? (
                  <div className="mt-1.5 flex flex-col gap-1.5">
                    <SegmentedControl
                      fill
                      value={mode}
                      options={themeOptions.map((option) => ({
                        value: option.value,
                        label: t(option.labelKey),
                      }))}
                      onChange={setMode}
                      aria-label={t('options.theme.aria')}
                    />
                    <SegmentedControl
                      fill
                      value={language}
                      options={languageOptions}
                      onChange={(value) => setLanguage(value as Language)}
                      aria-label={t('options.language.aria')}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>

        <div className="mt-auto px-2.5 text-2xs text-text-faint">JMdict · kitsunekko</div>
      </aside>

      <main className="min-w-0 flex-1 px-14 pt-10 pb-24">
        <div className="max-w-[720px]">
          <section className={page === 'packs' ? 'block' : 'hidden'}>
            <PacksPage library={library} />
          </section>
          <section className={page === 'dict' ? 'block' : 'hidden'}>
            <DictPage dict={dict} />
          </section>
          <section className={page === 'vocab' ? 'block' : 'hidden'}>
            <VocabPage />
          </section>
          <section className={page === 'rules' ? 'block' : 'hidden'}>
            <RulesPage sites={sites} />
          </section>
          <section className={page === 'binds' ? 'block' : 'hidden'}>
            <BindsPage library={library} sites={sites} />
          </section>
          <section className={page === 'keys' ? 'block' : 'hidden'}>
            <KeysPage />
          </section>
          {languages.map((id) => (
            <React.Fragment key={id}>
              <section className={page === `modes:${id}` ? 'block' : 'hidden'}>
                <ModesPage language={id} bands={dict.settings.bands[id] ?? NO_BANDS} />
              </section>
              <section className={page === `bands:${id}` ? 'block' : 'hidden'}>
                <BandsPage dict={dict} language={id} />
              </section>
            </React.Fragment>
          ))}
        </div>
      </main>

      <Toaster theme={resolved} />
    </div>
  );
}

export default App;
