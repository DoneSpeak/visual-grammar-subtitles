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
import { describeSubtitles } from '@/shared/subtitleLabel';
import type { SeriesDir, SubFile } from '@/features/scraper/kitsunekko';
import { fmtDate, fmtSize } from '../lib/format';
import { useKitsunekko, type KitsunekkoController } from '../hooks/use-kitsunekko';
import type { LibraryController } from '../hooks/use-library';

const SUBTITLE_EXT = /\.(srt|vtt|ass|ssa|txt)$/i;

const originSummary = (origin: SubtitleOrigin): string =>
  origin.kind === 'kitsunekko'
    ? `kitsunekko.net · ${origin.seriesPath} · ${origin.archiveName} · ${origin.archiveModified} · 导入于 ${fmtDate(origin.importedAt)}`
    : `本地导入${origin.note ? ` · ${origin.note}` : ''} · ${fmtDate(origin.importedAt)}`;

function KitsuSection({ kitsu, onImport, importing }: {
  kitsu: KitsunekkoController;
  onImport: (dir: SeriesDir, file: SubFile) => Promise<void>;
  importing: string | null;
}) {
  const { trail, listing } = kitsu;
  const dir = trail[trail.length - 1];

  return (
    <Card>
      <CardTitle>在线获取 · kitsunekko</CardTitle>
      <p className="mt-1 mb-2.5 text-xs text-muted-foreground">
        kitsunekko.net 用英文 / 罗马音命名；输入中文 / 日文标题会自动翻译成英文一并搜索。
      </p>
      <div className="flex items-center gap-2">
        <SearchField
          value={kitsu.query}
          placeholder="输入番剧标题，如 Monster、Monogatari"
          autoComplete="off"
          spellCheck={false}
          aria-label="搜索 kitsunekko"
          onChange={(event) => kitsu.setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void kitsu.search();
          }}
        />
        <Button variant="primary" onClick={() => void kitsu.search()} disabled={kitsu.searching}>
          搜索
        </Button>
        {trail.length ? (
          <Button onClick={() => void kitsu.back()} disabled={kitsu.dirLoading}>
            返回
          </Button>
        ) : null}
      </div>

      <div className="mt-2 flex flex-col">
        {dir ? (
          <>
            <div className="px-1 pb-1 text-xs font-medium">{dir.name}</div>
            {kitsu.dirLoading ? (
              <EmptyState>正在读取目录…</EmptyState>
            ) : listing ? (
              <>
                {listing.dirs.map((sub) => (
                  <div key={sub.path} className="flex items-center gap-3 border-t border-border px-1 py-1.5 first:border-t-0">
                    <span className="min-w-0 flex-1 truncate text-xs" title={sub.name}>
                      {sub.name}
                    </span>
                    <span className="flex-none text-2xs text-text-faint">子目录</span>
                    <Button size="sm" onClick={() => void kitsu.openDir(sub)}>
                      打开
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
                      {importing === file.path ? '下载中…' : '下载并导入为包'}
                    </Button>
                  </div>
                ))}
                {listing.dirs.length || listing.files.length ? null : <EmptyState>该目录为空</EmptyState>}
              </>
            ) : null}
          </>
        ) : kitsu.searching ? (
          <EmptyState>正在加载 kitsunekko 索引（首次约 600KB）…</EmptyState>
        ) : kitsu.hits === null ? null : (
          <>
            {kitsu.translated ? <EmptyState>已自动翻译为「{kitsu.translated}」一并搜索</EmptyState> : null}
            {kitsu.hits.length ? (
              kitsu.hits.slice(0, 40).map((hit) => (
                <div key={hit.path} className="flex items-center gap-3 border-t border-border px-1 py-1.5 first:border-t-0">
                  <Globe2 className="size-3.5 flex-none text-text-faint" />
                  <span className="min-w-0 flex-1 truncate text-xs" title={hit.name}>
                    {hit.name}
                  </span>
                  <Button size="sm" onClick={() => void kitsu.openDir(hit)}>
                    查看文件
                  </Button>
                </div>
              ))
            ) : (
              <EmptyState>没有匹配的番剧。kitsunekko 用英文 / 罗马音命名，试试罗马音或英文名。</EmptyState>
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
    const title = typed || (inferred && inferred !== '未归类' ? inferred : '本地导入');
    const { pack, added, errors } = await importLibraryFiles(files, {
      title,
      origin: { kind: 'local', note: folder ? `文件夹：${folder}` : undefined, importedAt: Date.now() },
    });
    if (packTitleRef.current) packTitleRef.current.value = '';
    onImported(pack.id);
    await library.refresh();
    if (added.length) toast.success(`已导入 ${added.length} 份字幕 → ${pack.title}`);
    if (errors.length) toast.error(errors.join('；'));
  };

  const totalBytes = library.entries.reduce((sum, entry) => sum + entry.size, 0);

  return (
    <Card>
      <CardTitle>导入字幕</CardTitle>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={() => fileRef.current?.click()}>
          选择文件
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
        <Button onClick={() => dirRef.current?.click()}>导入文件夹</Button>
        <input
          ref={dirRef}
          type="file"
          multiple
          hidden
          onChange={(event) => {
            const files = [...(event.target.files ?? [])].filter((file) => SUBTITLE_EXT.test(file.name));
            event.target.value = '';
            if (!files.length) {
              toast.error('文件夹里没有 .srt / .vtt / .ass 字幕文件');
              return;
            }
            const folder = files[0].webkitRelativePath.split('/')[0] || '';
            void importFiles(files, folder);
          }}
        />
        <input
          ref={packTitleRef}
          type="search"
          placeholder="包名（可选），如 Monster"
          className="h-[26px] w-[200px] rounded-md border border-border-strong bg-card px-2.5 text-xs focus:border-foreground focus:ring-3 focus:ring-ring focus:outline-none"
        />
        <span className="text-2xs text-text-faint">
          {library.packs.length ? `${library.packs.length} 个包 · ${library.entries.length} 份` : ''}
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
        把 .srt / .vtt / .ass 拖到这里，同一次拖入的文件归入同一个包
      </div>
      <div className="mt-2 text-2xs text-text-faint">
        {library.entries.length ? `合计 ${fmtSize(totalBytes)}` : ''}
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
          aria-label={open ? '收起' : '展开'}
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
          {pack.title}
        </button>
        <Badge>{pack.origin.kind === 'kitsunekko' ? 'kitsunekko' : '本地'}</Badge>
        <Badge>{entries.length} 份</Badge>
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
              来源
            </a>
          ) : null}
        </span>
        <Button
          variant="destructive"
          size="sm"
          onClick={async () => {
            const ok = await confirm({
              title: `删除字幕包「${pack.title}」？`,
              description: `${entries.length} 份字幕将从本地存储移除；已打开页面里的副本不受影响。`,
              confirmLabel: '删除整包',
              destructive: true,
            });
            if (!ok) return;
            await removePack(pack.id);
            await onChanged();
            toast.success(`已删除整包 ${pack.title}`);
          }}
        >
          删除整包
        </Button>
      </div>

      {open ? (
        <div className="mt-2.5 grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-1.5 pl-2">
          {ordered.length ? (
            ordered.map(({ entry, label }) => (
              <Chip
                key={entry.id}
                title={`${label}\n${entry.name}\n${entry.cueCount} 条 · ${fmtSize(entry.size)}`}
                onRemove={async () => {
                  const ok = await confirm({
                    title: `从包中移除「${entry.name}」？`,
                    confirmLabel: '移除',
                    destructive: true,
                  });
                  if (!ok) return;
                  await removeLibraryItem(entry.id);
                  await onChanged();
                  toast.success(`已移除 ${entry.name}`);
                }}
              >
                {label}
              </Chip>
            ))
          ) : (
            <EmptyState>包内没有字幕文件。</EmptyState>
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
        <CardTitle>全部字幕包</CardTitle>
        <span className="text-2xs text-text-faint">
          {library.entries.length ? `合计 ${fmtSize(library.entries.reduce((sum, entry) => sum + entry.size, 0))}` : ''}
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
          <EmptyState>还没有字幕包。导入一套字幕后会按番剧归到一个包里。</EmptyState>
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
      const failed = errors ? `，${errors} 份无法解析` : '';
      if (errors) toast.warning(`已导入 ${entries.length} 份到「${pack.title}」${failed}`);
      else toast.success(`已导入 ${entries.length} 份到「${pack.title}」`);
    } catch (error) {
      toast.error(`下载失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setImporting(null);
    }
  };

  return (
    <>
      <PageHeader
        title="字幕包"
        description="先从 kitsunekko 在线获取（整套番剧一次导入），也可以本地拖入字幕文件。导入后在播放页按包选择。"
      />
      <KitsuSection kitsu={kitsu} onImport={importRemote} importing={importing} />
      <ImportSection library={library} onImported={expand} />
      <Card>
        <SettingRow title="新页面自动套用上次字幕" description="打开播放页时恢复上次选中的字幕包">
          <Switch
            checked={library.autoApply}
            aria-label="新页面自动套用上次字幕"
            onCheckedChange={(checked) => void library.setAutoApply(checked)}
          />
        </SettingRow>
      </Card>
      <PackList library={library} expanded={expanded} setExpanded={setExpanded} confirm={confirmState.confirm} />
      {confirmState.element}
    </>
  );
}
