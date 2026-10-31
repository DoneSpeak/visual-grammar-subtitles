import * as React from 'react';

import {
  Button,
  Card,
  CardTitle,
  EmptyState,
  Input,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@/design-system';
import type { LibraryPack } from '@/shared/library';
import type { LibraryController } from '../hooks/use-library';
import type { SiteRulesController } from '../hooks/use-site-rules';

/** Radix Select forbids an empty item value, so "未绑定" needs a sentinel. */
const NONE = '__none__';

function PackSelect({ packs, value, placeholder, onChange }: {
  packs: LibraryPack[];
  value: string;
  placeholder: string;
  onChange: (packId: string) => void;
}) {
  return (
    <Select value={value || NONE} onValueChange={(next) => onChange(next === NONE ? '' : next)}>
      <SelectTrigger className="h-6 min-w-[160px] px-2 text-2xs">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{placeholder}</SelectItem>
        {packs.map((pack) => (
          <SelectItem key={pack.id} value={pack.id}>
            {pack.title}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function BindRow({ bindKey, packId, packs, sites }: {
  bindKey: string;
  packId: string;
  packs: LibraryPack[];
  sites: SiteRulesController;
}) {
  const bound = packs.find((pack) => pack.id === packId);

  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-border py-2 first:border-t-0">
      <span className="min-w-0 flex-1 truncate font-mono text-2xs" title={bindKey}>
        {bindKey}
      </span>
      <span className="flex-none text-2xs text-text-faint">{bound?.title ?? '包已删除'}</span>
      <PackSelect
        packs={packs}
        value={bound ? packId : ''}
        placeholder="未绑定"
        onChange={(next) => sites.setBindKey(bindKey, next)}
      />
      <Button variant="destructive" size="sm" onClick={() => sites.removeBind(bindKey)}>
        删除
      </Button>
    </div>
  );
}

function AddBindForm({ packs, sites }: { packs: LibraryPack[]; sites: SiteRulesController }) {
  const rules = sites.rules.rules;
  const [ruleId, setRuleId] = React.useState(rules[0]?.id ?? '');
  const [series, setSeries] = React.useState('');
  const [packId, setPackId] = React.useState('');

  React.useEffect(() => {
    if (!ruleId && rules[0]) setRuleId(rules[0].id);
  }, [ruleId, rules]);

  const add = () => {
    if (!ruleId) {
      toast.error('先创建一条站点规则');
      return;
    }
    if (!packId) {
      toast.error('选择一个字幕包');
      return;
    }
    sites.setBind(ruleId, series.trim() || null, packId);
    setSeries('');
  };

  return (
    <Card>
      <CardTitle>新增绑定</CardTitle>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <Select value={ruleId || NONE} onValueChange={setRuleId} disabled={!rules.length}>
          <SelectTrigger className="h-6 min-w-[180px] px-2 text-2xs">
            <SelectValue placeholder={rules.length ? '选择站点规则' : '无规则'} />
          </SelectTrigger>
          <SelectContent>
            {rules.length ? (
              rules.map((rule) => (
                <SelectItem key={rule.id} value={rule.id}>
                  {rule.name || rule.id} ({rule.id})
                </SelectItem>
              ))
            ) : (
              <SelectItem value={NONE}>无规则</SelectItem>
            )}
          </SelectContent>
        </Select>
        <Input
          className="h-6 min-w-[240px] flex-1 px-2 text-2xs"
          placeholder="系列 ID，如 96527（留空 = 任意）"
          value={series}
          onChange={(event) => setSeries(event.target.value)}
        />
        <PackSelect
          packs={packs}
          value={packId}
          placeholder="选择字幕包"
          onChange={setPackId}
        />
        <Button variant="primary" size="sm" onClick={add}>
          添加
        </Button>
      </div>
    </Card>
  );
}

export function BindsPage({ library, sites }: { library: LibraryController; sites: SiteRulesController }) {
  const bindings = Object.entries(sites.rules.binds);

  return (
    <>
      <PageHeader title="番剧绑定" description="系列 ID → 字幕包；在播放页手动选包也会自动写入。" />
      <Card>
        <CardTitle>当前绑定</CardTitle>
        <div className="mt-1">
          {bindings.length ? (
            bindings.map(([key, packId]) => (
              <BindRow key={key} bindKey={key} packId={packId} packs={library.packs} sites={sites} />
            ))
          ) : (
            <EmptyState>还没有绑定。播放页手动选一次字幕包，或在这里添加。</EmptyState>
          )}
        </div>
      </Card>
      <AddBindForm packs={library.packs} sites={sites} />
    </>
  );
}
