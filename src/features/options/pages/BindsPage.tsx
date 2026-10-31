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
import { packTitleForDisplay, ruleNameForDisplay, t } from '@/shared/i18n';
import type { LibraryPack } from '@/shared/library';
import type { LibraryController } from '../hooks/use-library';
import type { SiteRulesController } from '../hooks/use-site-rules';

/** Radix Select forbids an empty item value, so "unbound" needs a sentinel. */
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
            {packTitleForDisplay(pack.title, t)}
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
      <span className="flex-none text-2xs text-text-faint">
        {bound ? packTitleForDisplay(bound.title, t) : t('binds.packDeleted')}
      </span>
      <PackSelect
        packs={packs}
        value={bound ? packId : ''}
        placeholder={t('binds.unbound')}
        onChange={(next) => sites.setBindKey(bindKey, next)}
      />
      <Button variant="destructive" size="sm" onClick={() => sites.removeBind(bindKey)}>
        {t('binds.delete')}
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
      toast.error(t('binds.needRule'));
      return;
    }
    if (!packId) {
      toast.error(t('binds.needPack'));
      return;
    }
    sites.setBind(ruleId, series.trim() || null, packId);
    setSeries('');
  };

  return (
    <Card>
      <CardTitle>{t('binds.addTitle')}</CardTitle>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <Select value={ruleId || NONE} onValueChange={setRuleId} disabled={!rules.length}>
          <SelectTrigger className="h-6 min-w-[180px] px-2 text-2xs">
            <SelectValue
              placeholder={rules.length ? t('binds.rulePlaceholder') : t('binds.noRules')}
            />
          </SelectTrigger>
          <SelectContent>
            {rules.length ? (
              rules.map((rule) => (
                <SelectItem key={rule.id} value={rule.id}>
                  {t('binds.ruleOption', {
                    name: ruleNameForDisplay(rule.name, t) || rule.id,
                    id: rule.id,
                  })}
                </SelectItem>
              ))
            ) : (
              <SelectItem value={NONE}>{t('binds.noRules')}</SelectItem>
            )}
          </SelectContent>
        </Select>
        <Input
          className="h-6 min-w-[240px] flex-1 px-2 text-2xs"
          placeholder={t('binds.seriesPlaceholder')}
          value={series}
          onChange={(event) => setSeries(event.target.value)}
        />
        <PackSelect
          packs={packs}
          value={packId}
          placeholder={t('binds.packPlaceholder')}
          onChange={setPackId}
        />
        <Button variant="primary" size="sm" onClick={add}>
          {t('binds.add')}
        </Button>
      </div>
    </Card>
  );
}

export function BindsPage({ library, sites }: { library: LibraryController; sites: SiteRulesController }) {
  const bindings = Object.entries(sites.rules.binds);

  return (
    <>
      <PageHeader title={t('binds.title')} description={t('binds.description')} />
      <Card>
        <CardTitle>{t('binds.current')}</CardTitle>
        <div className="mt-1">
          {bindings.length ? (
            bindings.map(([key, packId]) => (
              <BindRow key={key} bindKey={key} packId={packId} packs={library.packs} sites={sites} />
            ))
          ) : (
            <EmptyState>{t('binds.empty')}</EmptyState>
          )}
        </div>
      </Card>
      <AddBindForm packs={library.packs} sites={sites} />
    </>
  );
}
