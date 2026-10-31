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
import { useTheme } from '@/features/theme/use-theme';
import type { LibraryEntry } from '@/shared/library';
import type { DictTrigger } from '@/shared/dictSettings';
import type { SubFile } from '@/features/scraper/kitsunekko';
import { orderEntries } from './entries';
import { usePopup, type PopupController } from './use-popup';

const themeOptions = [
  { value: 'light', label: '浅' },
  { value: 'dark', label: '深' },
  { value: 'system', label: '系统' },
] as const;

const levelOptions = [
  { value: '1', label: 'N1' },
  { value: '2', label: 'N2' },
  { value: '3', label: 'N3' },
  { value: '4', label: 'N4' },
  { value: '5', label: 'N5' },
] as const;

const triggerOptions: { value: DictTrigger; label: string }[] = [
  { value: 'click', label: '点击' },
  { value: 'hover', label: '悬停' },
];

const durationOptions = [
  { value: 'cue', label: '跟随字幕' },
  { value: 'fixed', label: '固定' },
] as const;

const pronounceOptions = [{ value: 'romaji', label: '罗马音' }] as const;

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
          <div className="truncate text-xs font-semibold">字幕扩展</div>
          <div className="text-2xs text-text-faint">v{version}</div>
        </div>
      </div>
      <div className="flex flex-none items-center gap-1.5">
        <SegmentedControl value={mode} options={themeOptions} onChange={setMode} aria-label="主题" />
        <Button variant="ghost" size="sm" onClick={() => void popup.openPanel()}>
          面板
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
      return { text: hasTab ? '当前页不可用（受限页面）' : '没有活动标签页', title: '' };
    }
  }, [tabUrl, hasTab]);

  const meta = React.useMemo(() => {
    if (!site) return '未匹配站点规则 · 可在「站点」中配置';
    const ep =
      site.episode === null ? '' : site.season ? `第 ${site.season} 季 第 ${site.episode} 集` : `第 ${site.episode} 集`;
    const series = site.seriesTitle || (site.seriesId ? `系列 ${site.seriesId}` : '');
    return [site.rule.name, series, ep].filter(Boolean).join(' · ');
  }, [site]);

  const statusText = !statusChecked
    ? '正在检测播放器…'
    : status
      ? status.subtitle
        ? `当前字幕：${status.subtitle}`
        : '播放器已就绪，尚未载入字幕'
      : '未检测到播放器：打开视频页，或刷新页面后重试';

  return (
    <Card variant="box" className="mx-3.5 mb-2.5 px-3 py-2.5">
      <div className="truncate text-xs font-medium" title={host.title}>
        {host.text}
      </div>
      <div className="mt-0.5 truncate text-2xs text-muted-foreground">{meta}</div>
      {boundPack ? (
        <div className="mt-0.5 truncate text-2xs text-muted-foreground" title={boundPack.title}>
          已绑定字幕包：{boundPack.title}
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
            {status.theater ? '退出全页平铺' : '视频平铺全网页'}
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
      title={`${entry.name}\n${entry.cueCount} 条`}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="flex-none text-2xs text-text-faint tabular-nums">{entry.cueCount} 条</span>
      <Button size="sm" disabled={applying} onClick={() => void apply()}>
        {applying ? '套用中…' : '套用'}
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
        <span className="min-w-0 flex-1 truncate font-medium">{pack.title}</span>
        <Badge className="flex-none">{packEntries.length} 份</Badge>
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
            <EmptyState>包内没有字幕文件</EmptyState>
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
        返回搜索结果
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
            {importing === file.path ? '下载中…' : '导入'}
          </Button>
        </div>
      ))}
      {state.dirs.length || state.files.length ? null : <EmptyState>该目录为空。</EmptyState>}
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
      {query ? <div className="px-2 pt-1 pb-0.5 text-2xs font-medium text-text-faint">本地</div> : null}
      {popup.packs.length ? (
        popup.visiblePacks.length ? (
          popup.visiblePacks.map((pack) => <PackGroup key={pack.id} popup={popup} packId={pack.id} />)
        ) : (
          query && <EmptyState className="px-2">本地 · 无匹配</EmptyState>
        )
      ) : (
        <EmptyState className="px-2">还没有本地字幕包。搜 kitsunekko 下载，或到完整设置里导入文件。</EmptyState>
      )}

      {query ? (
        <>
          <div className="flex items-baseline gap-2 px-2 pt-2 pb-0.5 text-2xs font-medium text-text-faint">
            <span>在线 · kitsunekko</span>
            {translated ? <span className="truncate font-normal">{translated}</span> : null}
          </div>
          {searching ? (
            <EmptyState className="px-2">正在搜索 kitsunekko…</EmptyState>
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
              <EmptyState className="px-2">kitsunekko 无匹配番剧（用英文 / 罗马音命名）。</EmptyState>
            )
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function SitesResults({ popup }: { popup: PopupController }) {
  if (!popup.rules.rules.length) {
    return <EmptyState className="px-2">还没有站点规则。到完整设置里新增一条。</EmptyState>;
  }

  return (
    <div className="flex flex-col">
      {popup.rules.rules.map((rule) => {
        const host = hostOf(rule.urlTemplate);
        return (
          <div key={rule.id} className="border-t border-border px-2 py-1.5 first:border-t-0">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-xs" title={rule.name}>
                {rule.name}
              </span>
              <Switch
                checked={rule.enabled}
                aria-label={`${rule.name} 启用`}
                onCheckedChange={(enabled) => void popup.toggleRule(rule.id, enabled)}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  host ? void chrome.tabs.create({ url: host }) : popup.openOptions('#rules')
                }
              >
                {host ? '打开' : '编辑'}
              </Button>
            </div>
            <div className="truncate font-mono text-[10.5px] text-text-faint" title={rule.urlTemplate}>
              {rule.urlTemplate}
              {rule.adapter ? ' · 自动解析番剧 / 集数' : ''}
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
      title: '取词等级',
      control: (
        <PillGroup
          name="dictLevels"
          multiple
          options={levelOptions}
          value={levels}
          disabled={off}
          aria-label="取词等级"
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
      title: '触发',
      control: (
        <PillGroup
          name="dictTrigger"
          options={triggerOptions}
          value={dict.trigger}
          aria-label="触发方式"
          onChange={(next) => void popup.saveDict({ trigger: next as DictTrigger })}
        />
      ),
    },
    {
      title: '查词暂停',
      control: (
        <Switch
          checked={dict.pauseOnLookup}
          disabled={off || dict.trigger !== 'click'}
          aria-label="查词时暂停播放"
          onCheckedChange={(pauseOnLookup) => void popup.saveDict({ pauseOnLookup })}
        />
      ),
    },
    {
      title: '卡片持续',
      control: (
        <>
          <PillGroup
            name="dictDuration"
            options={durationOptions}
            value={dict.duration.mode}
            aria-label="卡片持续时间"
            onChange={(next) =>
              void popup.saveDict({ duration: { ...dict.duration, mode: next as 'cue' | 'fixed' } })
            }
          />
          {dict.duration.mode === 'fixed' && !off ? (
            <DurationInput
              valueMs={dict.duration.ms}
              aria-label="固定显示秒数"
              onChange={(seconds) => void popup.setDictDurationSeconds(seconds)}
            />
          ) : null}
        </>
      ),
    },
    {
      title: '发音',
      control: (
        <PillGroup
          name="dictPronounce"
          multiple
          options={pronounceOptions}
          value={dict.pronunciation.romaji ? ['romaji'] : []}
          aria-label="发音"
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
        <h2 className="m-0 text-xs font-semibold">学习</h2>
        <Switch
          checked={dict.enabled}
          aria-label="启用词典"
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
  const popup = usePopup();
  const { resolved } = useTheme();

  return (
    <div className="w-[372px] bg-background text-foreground">
      <div className="flex max-h-[600px] flex-col overflow-y-auto">
        <Header popup={popup} />
        <PageCard popup={popup} />

        <div className="mx-3.5 mb-2.5 rounded-lg border border-border bg-card p-2.5">
          <Tabs value={popup.activeTab} onValueChange={(value) => popup.setActiveTab(value as 'subs' | 'sites')}>
            <TabsList aria-label="面板">
              <TabsTrigger value="subs">字幕</TabsTrigger>
              <TabsTrigger value="sites">站点</TabsTrigger>
            </TabsList>
            <TabsContent value="subs" className="mt-2">
              <SearchField
                autoFocus
                value={popup.query}
                placeholder="搜索本地字幕包 / kitsunekko（中文自动英译）"
                autoComplete="off"
                spellCheck={false}
                aria-label="搜索字幕"
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
            站点规则
          </button>
          <button
            type="button"
            className="cursor-pointer border-0 bg-transparent p-0 text-muted-foreground hover:text-foreground hover:underline"
            onClick={() => popup.openOptions('#binds')}
          >
            番剧绑定
          </button>
          <span className="flex-1" />
          <button
            type="button"
            className="cursor-pointer border-0 bg-transparent p-0 text-muted-foreground hover:text-foreground hover:underline"
            onClick={() => popup.openOptions()}
          >
            完整设置
          </button>
        </footer>
      </div>
      <Toaster theme={resolved} />
    </div>
  );
}

export default App;
