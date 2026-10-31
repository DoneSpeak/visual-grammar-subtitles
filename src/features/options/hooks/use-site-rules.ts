import * as React from 'react';

import {
  bindKey,
  defaultSiteRules,
  loadSiteRules,
  saveSiteRules,
  SITE_RULES_KEY,
  type SiteRule,
  type SiteRules,
} from '@/shared/siteRules';

const SAVE_DELAY = 250;
/** Ignore our own writes echoed back through storage.onChanged. */
const OWN_WRITE_WINDOW = 800;

export type SiteRulesController = {
  rules: SiteRules;
  ruleCount: number;
  bindCount: number;
  addRule: () => void;
  removeRule: (ruleId: string) => void;
  /** Clone one rule, let the caller mutate the draft, then save. */
  editRule: (ruleId: string, edit: (draft: SiteRule) => void) => void;
  setBind: (ruleId: string, seriesId: string | null, packId: string) => void;
  /** Same as `setBind`, for rows that only know their `<ruleId>#<seriesId>` key. */
  setBindKey: (key: string, packId: string) => void;
  removeBind: (key: string) => void;
  replaceRules: (rules: SiteRules) => void;
};

export const useSiteRules = (): SiteRulesController => {
  const [rules, setRules] = React.useState<SiteRules>(() => defaultSiteRules());
  const rulesRef = React.useRef(rules);
  const timer = React.useRef(0);
  const lastSave = React.useRef(0);

  const flush = React.useCallback(() => {
    if (!timer.current) return;
    window.clearTimeout(timer.current);
    timer.current = 0;
    lastSave.current = Date.now();
    void saveSiteRules(rulesRef.current);
  }, []);

  const commit = React.useCallback((next: SiteRules) => {
    rulesRef.current = next;
    setRules(next);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = 0;
      lastSave.current = Date.now();
      void saveSiteRules(rulesRef.current);
    }, SAVE_DELAY);
  }, []);

  React.useEffect(() => {
    void loadSiteRules().then((loaded) => {
      rulesRef.current = loaded;
      setRules(loaded);
    });

    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'local' || !changes[SITE_RULES_KEY]) return;
      if (Date.now() - lastSave.current < OWN_WRITE_WINDOW) return;
      void loadSiteRules().then((loaded) => {
        rulesRef.current = loaded;
        setRules(loaded);
      });
    };
    const onPageHide = () => flush();

    chrome.storage.onChanged.addListener(onChanged);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      chrome.storage.onChanged.removeListener(onChanged);
      window.removeEventListener('pagehide', onPageHide);
      flush();
    };
  }, [flush]);

  const addRule = React.useCallback(() => {
    const rule: SiteRule = {
      id: `rule-${Date.now().toString(36)}`,
      name: '新规则',
      enabled: true,
      urlTemplate: '',
      fileTemplate: '',
      seriesAdSlots: {},
      episodeAdSlots: {},
    };
    const previous = rulesRef.current;
    commit({ ...previous, rules: [...previous.rules, rule] });
  }, [commit]);

  const removeRule = React.useCallback(
    (ruleId: string) => {
      const previous = rulesRef.current;
      commit({ ...previous, rules: previous.rules.filter((rule) => rule.id !== ruleId) });
    },
    [commit],
  );

  const editRule = React.useCallback(
    (ruleId: string, edit: (draft: SiteRule) => void) => {
      const previous = rulesRef.current;
      const index = previous.rules.findIndex((rule) => rule.id === ruleId);
      if (index < 0) return;
      const draft = structuredClone(previous.rules[index]);
      edit(draft);
      const nextRules = previous.rules.slice();
      nextRules[index] = draft;
      commit({ ...previous, rules: nextRules });
    },
    [commit],
  );

  const setBind = React.useCallback(
    (ruleId: string, seriesId: string | null, packId: string) => {
      const previous = rulesRef.current;
      commit({ ...previous, binds: { ...previous.binds, [bindKey(ruleId, seriesId)]: packId } });
    },
    [commit],
  );

  const setBindKey = React.useCallback(
    (key: string, packId: string) => {
      const previous = rulesRef.current;
      commit({ ...previous, binds: { ...previous.binds, [key]: packId } });
    },
    [commit],
  );

  const removeBind = React.useCallback(
    (key: string) => {
      const previous = rulesRef.current;
      const binds = { ...previous.binds };
      delete binds[key];
      commit({ ...previous, binds });
    },
    [commit],
  );

  const replaceRules = React.useCallback(
    (next: SiteRules) => {
      commit(next);
    },
    [commit],
  );

  return {
    rules,
    ruleCount: rules.rules.length,
    bindCount: Object.keys(rules.binds).length,
    addRule,
    removeRule,
    editRule,
    setBind,
    setBindKey,
    removeBind,
    replaceRules,
  };
};
