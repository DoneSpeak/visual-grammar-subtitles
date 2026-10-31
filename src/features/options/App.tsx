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
import { useTheme } from '@/features/theme/use-theme';
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

type NavEntry = {
  id: PageId;
  label: string;
  group: string;
  icon: LucideIcon;
  count?: 'packs' | 'rules' | 'binds';
};

const NAV: NavEntry[] = [
  { id: 'packs', label: '字幕包', group: '内容', icon: Layers3, count: 'packs' },
  { id: 'dict', label: '学习词典', group: '学习', icon: BookOpen },
  { id: 'rules', label: '站点规则', group: '站点', icon: SlidersHorizontal, count: 'rules' },
  { id: 'binds', label: '番剧绑定', group: '站点', icon: Link2, count: 'binds' },
  { id: 'keys', label: '快捷键', group: '操作', icon: Keyboard },
  { id: 'colors', label: '词性配色', group: '外观', icon: Palette },
];

const GROUPS = [...new Set(NAV.map((entry) => entry.group))];

const PAGE_ALIAS: Record<string, PageId> = { online: 'packs' };

const readPage = (): PageId => {
  const raw = window.location.hash.slice(1);
  const id = (PAGE_ALIAS[raw] ?? raw) as PageId;
  return NAV.some((entry) => entry.id === id) ? id : 'packs';
};

const themeOptions = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'system', label: '跟随系统' },
] as const;

export function App() {
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
          <span>字幕扩展</span>
        </div>

        <nav className="flex flex-col gap-4.5" aria-label="设置页面">
          {GROUPS.map((group) => (
            <div key={group} className="flex flex-col gap-px">
              <div className="px-2.5 pb-1.5 text-[10.5px] tracking-[0.06em] text-text-faint uppercase">
                {group}
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
                    <span>{entry.label}</span>
                    {entry.count && counts[entry.count] ? (
                      <span className="ml-auto text-2xs text-text-faint tabular-nums">{counts[entry.count]}</span>
                    ) : null}
                  </a>
                );
              })}
              {group === '外观' ? (
                <SegmentedControl
                  className="mt-1.5"
                  fill
                  value={mode}
                  options={themeOptions}
                  onChange={setMode}
                  aria-label="主题"
                />
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
