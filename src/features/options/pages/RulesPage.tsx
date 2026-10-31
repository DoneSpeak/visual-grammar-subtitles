import * as React from 'react';

import {
  Button,
  Card,
  CardTitle,
  EmptyState,
  Input,
  PageHeader,
  Switch,
  toast,
  useConfirm,
} from '@/design-system';
import { adEpisodeKey, matchRuleUrl, resolveSite, type AdSlot, type SiteRule } from '@/shared/siteRules';
import { formatSlotList, groupEpisodeMarks, refreshSeriesDefault, type EpisodeMark } from '../lib/ad-slots';
import { fmtClock, parseClock } from '../lib/format';
import type { SiteRulesController } from '../hooks/use-site-rules';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-[76px] flex-none text-2xs text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

/** Clock field that only accepts `mm:ss` / `h:mm:ss`; rejects by returning false so the draft resets. */
function ClockInput({ value, placeholder, title, onCommit }: {
  value: string;
  placeholder?: string;
  title?: string;
  onCommit: (text: string) => boolean;
}) {
  const [draft, setDraft] = React.useState(value);

  React.useEffect(() => setDraft(value), [value]);

  const commit = () => {
    if (!onCommit(draft)) setDraft(value);
  };

  return (
    <Input
      type="text"
      className="h-6 w-[76px] px-2 text-2xs tabular-nums"
      placeholder={placeholder}
      title={title}
      spellCheck={false}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commit();
      }}
    />
  );
}

function EpisodeRow({ rule, sites, mark }: {
  rule: SiteRule;
  sites: SiteRulesController;
  mark: EpisodeMark;
}) {
  const edit = (fn: (draft: SiteRule) => void) => sites.editRule(rule.id, fn);

  const setSlot = (index: number, start: number, finish: number) => {
    edit((draft) => {
      const slot = draft.episodeAdSlots[mark.key]?.[index];
      if (!slot) return;
      slot.at = start;
      slot.duration = finish - start;
      refreshSeriesDefault(draft, mark.series);
    });
  };

  const removeSlot = (index: number) => {
    edit((draft) => {
      const slots = draft.episodeAdSlots[mark.key];
      if (!slots) return;
      slots.splice(index, 1);
      if (!slots.length) delete draft.episodeAdSlots[mark.key];
      refreshSeriesDefault(draft, mark.series);
    });
  };

  const addSlot = () => {
    edit((draft) => {
      (draft.episodeAdSlots[mark.key] ??= []).push({ at: 0, duration: 15 });
      refreshSeriesDefault(draft, mark.series);
    });
  };

  const removeEpisode = () => {
    edit((draft) => {
      delete draft.episodeAdSlots[mark.key];
      refreshSeriesDefault(draft, mark.series);
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-[72px] flex-none text-2xs text-muted-foreground">
        {mark.season === '*' ? `第 ${mark.episode} 集` : `S${mark.season} · ${mark.episode}`}
      </span>
      {mark.slots.map((slot, index) => {
        const end = slot.at + slot.duration;
        return (
          <span key={index} className="inline-flex items-center gap-1">
            <span className="text-2xs text-text-faint">起</span>
            <ClockInput
              value={fmtClock(slot.at)}
              placeholder="08:17"
              title="广告开始时刻，格式 08:17 或 1:08:17"
              onCommit={(text) => {
                const start = parseClock(text);
                if (start === null || start >= end) return false;
                setSlot(index, start, end);
                return true;
              }}
            />
            <span className="text-2xs text-text-faint">止</span>
            <ClockInput
              value={fmtClock(end)}
              placeholder="08:47"
              title="广告结束时刻"
              onCommit={(text) => {
                const finish = parseClock(text);
                if (finish === null || finish <= slot.at) return false;
                setSlot(index, slot.at, finish);
                return true;
              }}
            />
            <Button variant="destructive" size="icon-sm" aria-label="删除这段广告" onClick={() => removeSlot(index)}>
              ×
            </Button>
          </span>
        );
      })}
      <Button size="sm" onClick={addSlot}>
        + 段
      </Button>
      <Button variant="destructive" size="sm" onClick={removeEpisode}>
        删除集
      </Button>
    </div>
  );
}

function AddSlotForm({ rule, sites }: { rule: SiteRule; sites: SiteRulesController }) {
  const [series, setSeries] = React.useState('');
  const [season, setSeason] = React.useState('');
  const [episode, setEpisode] = React.useState('');
  const [start, setStart] = React.useState('');
  const [end, setEnd] = React.useState('');
  const [message, setMessage] = React.useState('');

  const add = () => {
    const episodeNo = Number(episode.trim());
    const startAt = parseClock(start.trim());
    const finishAt = parseClock(end.trim());
    if (
      !series.trim() ||
      !Number.isInteger(episodeNo) ||
      episodeNo < 0 ||
      startAt === null ||
      finishAt === null ||
      finishAt <= startAt
    ) {
      setMessage('填齐系列、集号与起止时刻');
      return;
    }
    const key = adEpisodeKey(series.trim(), season.trim() === '*' ? null : season.trim() || null, episodeNo);
    if (!key) {
      setMessage('集号无效');
      return;
    }
    sites.editRule(rule.id, (draft) => {
      (draft.episodeAdSlots[key] ??= []).push({ at: startAt, duration: finishAt - startAt });
      refreshSeriesDefault(draft, series.trim());
    });
    setMessage('');
    setEpisode('');
    setStart('');
    setEnd('');
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-[76px] flex-none text-2xs text-muted-foreground">新增广告</span>
      <Input
        className="h-6 w-[104px] px-2 text-2xs"
        placeholder="系列 ID"
        title="与站点规则解析出的 id 一致，例：96527"
        value={series}
        onChange={(event) => setSeries(event.target.value)}
      />
      <Input
        className="h-6 w-[64px] px-2 text-2xs"
        placeholder="季 *"
        title="季节号；未知填 * 或留空"
        value={season}
        onChange={(event) => setSeason(event.target.value)}
      />
      <Input
        className="h-6 w-[56px] px-2 text-2xs"
        placeholder="集"
        title="集号"
        value={episode}
        onChange={(event) => setEpisode(event.target.value)}
      />
      <Input
        className="h-6 w-[92px] px-2 text-2xs"
        placeholder="开始 08:17"
        value={start}
        onChange={(event) => setStart(event.target.value)}
      />
      <Input
        className="h-6 w-[92px] px-2 text-2xs"
        placeholder="结束 08:47"
        value={end}
        onChange={(event) => setEnd(event.target.value)}
      />
      <Button size="sm" onClick={add}>
        添加
      </Button>
      {message ? <span className="text-2xs text-destructive">{message}</span> : null}
    </div>
  );
}

function AdSlotsEditor({ rule, sites }: { rule: SiteRule; sites: SiteRulesController }) {
  const [needle, setNeedle] = React.useState('');
  const groups = React.useMemo(() => groupEpisodeMarks(rule), [rule]);
  const total = [...groups.values()].reduce((count, list) => count + list.length, 0);

  const query = needle.trim().toLowerCase();
  const visible = [...groups]
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([series, marks]) => {
      if (!query) return [{ series, marks }];
      const seriesHit = series.toLowerCase().includes(query);
      const shown = seriesHit ? marks : marks.filter((mark) => String(mark.episode) === query);
      return shown.length ? [{ series, marks: shown }] : [];
    });

  return (
    <details className="border-t border-border pt-2.5">
      <summary className="cursor-pointer py-1 text-xs text-muted-foreground">
        广告位 · 按剧集 · {groups.size} 系列 / {total} 集
      </summary>
      <div className="flex flex-col gap-2.5 py-2">
        <Input
          type="search"
          className="h-6 w-[220px] px-2 text-2xs"
          placeholder="筛选系列或集号"
          value={needle}
          onChange={(event) => setNeedle(event.target.value)}
        />
        {visible.length ? (
          visible.map(({ series, marks }) => (
            <div key={series} className="flex flex-col gap-1.5 rounded-lg border border-border p-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium">{series}</span>
                <span className="truncate text-2xs text-text-faint">
                  默认 {formatSlotList(seriesAdSlotsOf(rule, series))}
                </span>
              </div>
              {marks.map((mark) => (
                <EpisodeRow key={mark.key} rule={rule} sites={sites} mark={mark} />
              ))}
            </div>
          ))
        ) : (
          <EmptyState>
            {groups.size ? '没有匹配的剧集。' : '还没有单集广告位。播放页标记一次，或在下方向导添加。'}
          </EmptyState>
        )}
        <AddSlotForm rule={rule} sites={sites} />
      </div>
    </details>
  );
}

const seriesAdSlotsOf = (rule: SiteRule, series: string): AdSlot[] => rule.seriesAdSlots[series] ?? [];

function ParseTest({ rule }: { rule: SiteRule }) {
  const [url, setUrl] = React.useState('');
  const [adapterNote, setAdapterNote] = React.useState('');
  const seq = React.useRef(0);

  React.useEffect(() => {
    const text = url.trim();
    if (!text || !rule.adapter) {
      setAdapterNote('');
      return;
    }
    const current = ++seq.current;
    const timer = window.setTimeout(() => {
      void resolveSite({ version: 2, rules: [rule], binds: {} }, text).then((resolved) => {
        if (current !== seq.current || !resolved) return;
        setAdapterNote(` · 自动解析：${resolved.seriesTitle ?? '-'} 第 ${resolved.episode ?? '-'} 集`);
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [url, rule]);

  const text = url.trim();
  const hit = text ? matchRuleUrl(rule, text) : null;
  const result = !text
    ? ''
    : hit
      ? `id=${hit.id ?? '-'} · season=${hit.season ?? '-'} · episode=${hit.episode ?? '-'}${adapterNote}`
      : '不匹配';

  return (
    <Field label="解析测试">
      <Input
        type="search"
        className="h-6 min-w-[240px] flex-1 px-2 text-2xs"
        placeholder="粘贴一个页面 URL 测试解析"
        value={url}
        onChange={(event) => setUrl(event.target.value)}
      />
      {result ? (
        <span className={hit ? 'text-2xs text-muted-foreground' : 'text-2xs text-destructive'}>{result}</span>
      ) : null}
    </Field>
  );
}

function RuleEditor({ rule, sites, confirm }: {
  rule: SiteRule;
  sites: SiteRulesController;
  confirm: ReturnType<typeof useConfirm>['confirm'];
}) {
  const edit = (patch: Partial<SiteRule>) => sites.editRule(rule.id, (draft) => Object.assign(draft, patch));

  return (
    <div className="flex flex-col gap-2 border-t border-border py-3.5 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Switch
            checked={rule.enabled}
            aria-label="启用这条规则"
            title="启用这条规则"
            onCheckedChange={(enabled) => edit({ enabled })}
          />
          <Input
            type="search"
            className="h-6 w-[160px] px-2 text-2xs"
            placeholder="名称"
            value={rule.name}
            onChange={(event) => edit({ name: event.target.value })}
          />
        </div>
        <Button
          variant="destructive"
          size="sm"
          onClick={async () => {
            const ok = await confirm({
              title: `删除规则「${rule.name || rule.id}」？`,
              confirmLabel: '删除规则',
              destructive: true,
            });
            if (ok) sites.removeRule(rule.id);
          }}
        >
          删除规则
        </Button>
      </div>

      <Field label="URL 模板">
        <Input
          type="search"
          className="h-6 min-w-[240px] flex-1 px-2 text-2xs"
          placeholder="https://*/cid/<id>-<season>-<episode>.html"
          value={rule.urlTemplate}
          onChange={(event) => edit({ urlTemplate: event.target.value })}
        />
      </Field>

      {rule.adapter ? (
        <Field label="自动解析">
          <span className="text-2xs text-text-faint">
            {rule.adapter === 'bilibili' ? 'bilibili 番剧：按 ep / ss 号读取季 ID、番剧名与集数' : rule.adapter}
          </span>
        </Field>
      ) : null}

      <ParseTest rule={rule} />

      <Field label="文件名模板">
        <Input
          type="search"
          className="h-6 min-w-[240px] flex-1 px-2 text-2xs"
          placeholder="留空用内置规则；例：* - <episode> [*]"
          value={rule.fileTemplate}
          onChange={(event) => edit({ fileTemplate: event.target.value })}
        />
      </Field>

      <AdSlotsEditor rule={rule} sites={sites} />
    </div>
  );
}

export function RulesPage({ sites }: { sites: SiteRulesController }) {
  const confirmState = useConfirm();
  const fileRef = React.useRef<HTMLInputElement>(null);

  const exportRules = () => {
    const blob = new Blob([JSON.stringify(sites.rules, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'jp-sub-site-rules.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  const importRules = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as Partial<{ rules: SiteRule[]; binds: Record<string, string> }>;
      if (!Array.isArray(parsed.rules)) throw new Error('缺少 rules 数组');
      const rules = parsed.rules.map((rule) => ({
        ...rule,
        seriesAdSlots: rule.seriesAdSlots ?? {},
        episodeAdSlots: rule.episodeAdSlots ?? {},
      }));
      sites.replaceRules({ version: 2, rules, binds: parsed.binds ?? {} });
      toast.success(`已导入 ${rules.length} 条规则`);
    } catch (error) {
      toast.error(`导入失败：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return (
    <>
      <PageHeader title="站点规则" description="按 URL 模板识别平台与集数；广告位用于补偿内嵌广告占用的时间。" />
      <Card>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <CardTitle>规则列表</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" size="sm" onClick={sites.addRule}>
              新增规则
            </Button>
            <Button size="sm" onClick={exportRules}>
              导出 JSON
            </Button>
            <Button size="sm" onClick={() => fileRef.current?.click()}>
              导入 JSON
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".json"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void importRules(file);
              }}
            />
          </div>
        </div>
        <div>
          {sites.rules.rules.length ? (
            sites.rules.rules.map((rule) => (
              <RuleEditor key={rule.id} rule={rule} sites={sites} confirm={confirmState.confirm} />
            ))
          ) : (
            <EmptyState>还没有站点规则。</EmptyState>
          )}
        </div>
      </Card>

      <p className="text-2xs leading-relaxed text-text-faint">
        模板示例：<Code>https://*</Code> + <Code>/cid/&lt;id&gt;-&lt;season&gt;-&lt;episode&gt;.html</Code>；
        <Code>&lt;id&gt;</Code> 系列、<Code>&lt;season&gt;</Code> 季、<Code>&lt;episode&gt;</Code> 集、
        <Code>*</Code> 任意段。 广告位插入点填 <Code>08:17</Code>（分:秒，超过 1 小时用 <Code>1:08:17</Code>），
        广告结束时刻填在同一行。 播放页右上角「字幕设置 → 跳过标记」可以在看的过程中直接标记起点和终点；
        系列默认值由全部已标记剧集自动汇总，不需要手动设定。
      </p>
      {confirmState.element}
    </>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded-sm bg-secondary px-1 py-px font-mono text-[11px]">{children}</code>;
}
