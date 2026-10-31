import * as React from 'react';
import {
  BookOpen,
  Keyboard,
  Layers3,
  Link2,
  Palette,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react';

import { SegmentedControl, Toaster, cn } from '@/design-system';
import { useLanguage } from '@/features/i18n/use-language';
import { useTheme } from '@/features/theme/use-theme';
import { setLanguage, t, type Language, type MessageKey } from '@/shared/i18n';
import { useDictSettings } from './hooks/use-dict-settings';
import { useLibrary } from './hooks/use-library';
import { usePosColors } from './hooks/use-pos-colors';
import { useSiteRules } from './hooks/use-site-rules';
import { BindsPage } from './pages/BindsPage';
import { ColorsPage } from './pages/ColorsPage';
import { DictPage } from './pages/DictPage';
import { KeysPage } from './pages/KeysPage';
import { PacksPage } from './pages/PacksPage';
import { RulesPage } from './pages/RulesPage';

type PageId = 'packs' | 'dict' | 'rules' | 'binds' | 'keys' | 'colors';

type GroupId = 'content' | 'study' | 'site' | 'actions' | 'appearance';

type NavEntry = {
  id: PageId;
  labelKey: MessageKey;
  group: GroupId;
  icon: LucideIcon;
  count?: 'packs' | 'rules' | 'binds';
};

const NAV: NavEntry[] = [
  { id: 'packs', labelKey: 'options.nav.packs', group: 'content', icon: Layers3, count: 'packs' },
  { id: 'dict', labelKey: 'options.nav.dict', group: 'study', icon: BookOpen },
  { id: 'rules', labelKey: 'options.nav.rules', group: 'site', icon: SlidersHorizontal, count: 'rules' },
  { id: 'binds', labelKey: 'options.nav.binds', group: 'site', icon: Link2, count: 'binds' },
  { id: 'keys', labelKey: 'options.nav.keys', group: 'actions', icon: Keyboard },
  { id: 'colors', labelKey: 'options.nav.colors', group: 'appearance', icon: Palette },
];

const GROUP_ORDER: GroupId[] = ['content', 'study', 'site', 'actions', 'appearance'];

const GROUP_LABEL_KEYS: Record<GroupId, MessageKey> = {
  content: 'options.nav.group.content',
  study: 'options.nav.group.study',
  site: 'options.nav.group.site',
  actions: 'options.nav.group.actions',
  appearance: 'options.nav.group.appearance',
};

const PAGE_ALIAS: Record<string, PageId> = { online: 'packs' };

const readPage = (): PageId => {
  const raw = window.location.hash.slice(1);
  const id = (PAGE_ALIAS[raw] ?? raw) as PageId;
  return NAV.some((entry) => entry.id === id) ? id : 'packs';
};

const themeOptions = [
  { value: 'light', labelKey: 'options.theme.light' },
  { value: 'dark', labelKey: 'options.theme.dark' },
  { value: 'system', labelKey: 'options.theme.system' },
] as const satisfies readonly { value: string; labelKey: MessageKey }[];

/** Language names stay in their own language, as language pickers conventionally do. */
const languageOptions = [
  { value: 'zh-CN', label: '中文' },
  { value: 'en-GB', label: 'English' },
] as const;

export function App() {
  const language = useLanguage('meta.optionsTitle');
  const [page, setPage] = React.useState<PageId>(readPage);
  const { mode, resolved, setMode } = useTheme();

  const library = useLibrary();
  const sites = useSiteRules();
  const dict = useDictSettings();
  const posColors = usePosColors();

  React.useEffect(() => {
    const onHash = () => {
      setPage(readPage());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const counts = {
    packs: library.packs.length,
    rules: sites.ruleCount,
    binds: sites.bindCount,
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-[1180px] border-x border-border bg-card">
      <aside className="sticky top-0 flex h-screen w-[236px] flex-none flex-col gap-6.5 overflow-y-auto border-r border-border px-3.5 pt-7 pb-6">
        <div className="flex items-center gap-2.5 px-2.5 text-xs font-semibold tracking-tight">
          <span className="grid size-6 flex-none place-items-center rounded-md bg-primary text-[10px] font-bold text-primary-foreground">
            JP
          </span>
          <span>{t('meta.brand')}</span>
        </div>

        <nav className="flex flex-col gap-4.5" aria-label={t('options.nav.aria')}>
          {GROUP_ORDER.map((group) => (
            <div key={group} className="flex flex-col gap-px">
              <div className="px-2.5 pb-1.5 text-[10.5px] tracking-[0.06em] text-text-faint uppercase">
                {t(GROUP_LABEL_KEYS[group])}
              </div>
              {NAV.filter((entry) => entry.group === group).map((entry) => {
                const active = entry.id === page;
                const Icon = entry.icon;
                return (
                  <a
                    key={entry.id}
                    href={`#${entry.id}`}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs leading-normal transition-colors',
                      active
                        ? 'bg-accent font-medium text-foreground'
                        : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                    )}
                  >
                    <Icon className={cn('size-4 flex-none', active ? 'opacity-100' : 'opacity-80')} />
                    <span>{t(entry.labelKey)}</span>
                    {entry.count && counts[entry.count] ? (
                      <span className="ml-auto text-2xs text-text-faint tabular-nums">{counts[entry.count]}</span>
                    ) : null}
                  </a>
                );
              })}
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
          ))}
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
          <section className={page === 'rules' ? 'block' : 'hidden'}>
            <RulesPage sites={sites} />
          </section>
          <section className={page === 'binds' ? 'block' : 'hidden'}>
            <BindsPage library={library} sites={sites} />
          </section>
          <section className={page === 'keys' ? 'block' : 'hidden'}>
            <KeysPage />
          </section>
          <section className={page === 'colors' ? 'block' : 'hidden'}>
            <ColorsPage posColors={posColors} />
          </section>
        </div>
      </main>

      <Toaster theme={resolved} />
    </div>
  );
}

export default App;
