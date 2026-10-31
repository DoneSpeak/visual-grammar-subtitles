import type { AdSlot, SiteRule, SiteRules, UrlParts } from './types';
import { resolveWithAdapter } from './siteAdapters';

export type { AdSlot, SiteAdapterId, SiteRule, SiteRules } from './types';

/** Placeholder names allowed in a template. Unknown `<foo>` stays literal text. */
type Placeholder = 'id' | 'season' | 'episode';

type Compiled = { re: RegExp; placeholders: Placeholder[] };

const MAX_TEMPLATE_LENGTH = 400;
const PLACEHOLDER = /<(id|season|episode)>/g;

export const SITE_RULES_KEY = 'site:rules';

export const isSiteRulesKey = (key: string): boolean => key === SITE_RULES_KEY;

export const defaultSiteRules = (): SiteRules => ({
  version: 2,
  rules: [
    {
      id: 'bilibili',
      name: 'bilibili 番剧',
      enabled: true,
      // ep/ss 号不决定集数，交由 adapter 读取番剧信息。
      urlTemplate: 'https://*.bilibili.com/bangumi/play/*',
      fileTemplate: '',
      seriesAdSlots: {},
      episodeAdSlots: {},
      adapter: 'bilibili',
    },
    {
      id: 'hntaihoo',
      name: 'hntaihoo',
      enabled: true,
      urlTemplate: 'https://*/cid/<id>-<season>-<episode>.html',
      fileTemplate: '',
      seriesAdSlots: {},
      episodeAdSlots: {},
    },
  ],
  binds: {},
});

/**
 * `<id>` → alphanumeric series id, `<season>` / `<episode>` → digits, `*` → any run of
 * non-separator characters, everything else literal.
 */
const escapeLiteral = (text: string): string =>
  [...text]
    .map((ch) => {
      if (ch === '*') return '[^/?#]*';
      return /[.*+?^${}()|[\]\\]/.test(ch) ? `\\${ch}` : ch;
    })
    .join('');

const compiledCache = new Map<string, Compiled | null>();

export const compileTemplate = (template: string, anchored: boolean): Compiled | null => {
  const trimmed = template.trim();
  if (!trimmed || trimmed.length > MAX_TEMPLATE_LENGTH) return null;
  const cacheKey = `${anchored ? '^' : '~'}${trimmed}`;
  const cached = compiledCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const placeholders: Placeholder[] = [];
  let source = '';
  let last = 0;
  for (const match of trimmed.matchAll(PLACEHOLDER)) {
    const at = match.index ?? 0;
    source += escapeLiteral(trimmed.slice(last, at));
    placeholders.push(match[1] as Placeholder);
    source += match[1] === 'id' ? '([A-Za-z0-9]+)' : '(\\d+)';
    last = at + match[0].length;
  }
  source += escapeLiteral(trimmed.slice(last));

  let compiled: Compiled | null = null;
  try {
    compiled = { re: new RegExp(anchored ? `^${source}$` : source), placeholders };
  } catch {
    compiled = null;
  }
  compiledCache.set(cacheKey, compiled);
  return compiled;
};

/** Templates containing `?` match the query string too; otherwise only origin + pathname. */
const matchTarget = (template: string, url: string): string | null => {
  try {
    const parsed = new URL(url);
    return template.includes('?')
      ? `${parsed.origin}${parsed.pathname}${parsed.search}`
      : `${parsed.origin}${parsed.pathname}`;
  } catch {
    return null;
  }
};

export const matchRuleUrl = (rule: SiteRule, url: string): UrlParts | null => {
  const target = matchTarget(rule.urlTemplate, url);
  const compiled = compileTemplate(rule.urlTemplate, true);
  if (!target || !compiled) return null;
  const matched = compiled.re.exec(target);
  if (!matched) return null;

  const value = (name: Placeholder): string | null => {
    const index = compiled.placeholders.indexOf(name);
    return index >= 0 ? (matched[index + 1] ?? null) : null;
  };
  const episode = value('episode');
  return {
    id: value('id'),
    season: value('season'),
    episode: episode === null ? null : Number(episode),
  };
};

const BUILTIN_EPISODE_PATTERNS: RegExp[] = [
  /s\d{1,2}[\s._-]*e(\d{1,4})/i,
  /第\s*(\d{1,3})\s*[話话集]/,
  /(?:^|[\s._\-[\]()])e(?:p|pisode)?[\s._-]*(\d{1,4})(?=[\s._\-[\]()]|$)/i,
  // "12v2": a revision suffix is not part of the episode number.
  /(?:^|[\s._\-[\]()])(\d{1,4})v\d/i,
  /(?:^|[\s._\-[\]()])(\d{1,4})(?=[\s._\-[\]()]|$)/,
];

/** Episode number of a subtitle file name; falls back to builtin heuristics when the rule has no template. */
export const episodeFromName = (name: string, fileTemplate = ''): number | null => {
  const base = name.replace(/\.[^.]+$/, '');
  if (fileTemplate.trim()) {
    const compiled = compileTemplate(fileTemplate, false);
    const index = compiled ? compiled.placeholders.indexOf('episode') : -1;
    const matched = compiled && index >= 0 ? compiled.re.exec(base) : null;
    if (matched) {
      const episode = Number(matched[index + 1]);
      return Number.isFinite(episode) ? episode : null;
    }
    return null;
  }
  for (const pattern of BUILTIN_EPISODE_PATTERNS) {
    const matched = base.match(pattern);
    if (matched) return Number(matched[1]);
  }
  return null;
};

export type AdMap = {
  slots: AdSlot[];
  /** Player timeline → subtitle timeline: ad stretches collapse to their insertion point. */
  toContent: (playerTime: number) => number;
  /** Subtitle timeline → player timeline. */
  toPlayer: (contentTime: number) => number;
  /** The ad stretch covering a player time, if the playhead is inside one. */
  adAt: (playerTime: number) => { index: number; start: number; end: number } | null;
};

const normalizeSlots = (slots: AdSlot[]): AdSlot[] =>
  slots
    .filter((slot) => Number.isFinite(slot.at) && Number.isFinite(slot.duration) && slot.at >= 0 && slot.duration > 0)
    .map((slot) => ({ at: slot.at, duration: slot.duration }))
    .sort((a, b) => a.at - b.at);

export const normalizeAdSlots = (slots: AdSlot[]): AdSlot[] => normalizeSlots(slots ?? []);

/** Mentions of the same ad across episodes drift by a few seconds; averages stay within this window. */
const AD_CLUSTER_TOL = 6;

type AdInterval = { start: number; end: number };

/** Average near-identical start/end times, then merge anything that still overlaps. */
const clusterAdIntervals = (intervals: AdInterval[]): AdSlot[] => {
  const clusters: (AdInterval & { count: number })[] = [];
  for (const item of [...intervals].sort((a, b) => a.start - b.start)) {
    const last = clusters[clusters.length - 1];
    if (
      last &&
      Math.abs(item.start - last.start / last.count) <= AD_CLUSTER_TOL &&
      Math.abs(item.end - last.end / last.count) <= AD_CLUSTER_TOL
    ) {
      last.start += item.start;
      last.end += item.end;
      last.count += 1;
    } else {
      clusters.push({ ...item, count: 1 });
    }
  }

  const merged: AdSlot[] = [];
  for (const { start, end, count } of clusters) {
    const at = Math.round(start / count);
    const duration = Math.round(end / count) - at;
    if (duration <= 0) continue;
    const prev = merged[merged.length - 1];
    // buildAdMap assumes non-overlapping slots, so averaged neighbours must not cross.
    if (prev && at < prev.at + prev.duration) {
      prev.duration = Math.max(prev.at + prev.duration, at + duration) - prev.at;
    } else {
      merged.push({ at, duration });
    }
  }
  return merged;
};

/** Every episode's marks for one series, folded into that series' default positions. */
export const seriesAdSlotsFromEpisodes = (rule: SiteRule, seriesId: string): AdSlot[] => {
  const prefix = `${seriesId}@`;
  const intervals: AdInterval[] = [];
  for (const [key, slots] of Object.entries(rule.episodeAdSlots ?? {})) {
    if (!key.startsWith(prefix)) continue;
    for (const slot of slots) intervals.push({ start: slot.at, end: slot.at + slot.duration });
  }
  return clusterAdIntervals(intervals);
};

/** Slots are expressed on the subtitle (content) timeline, so their positions don't drift as durations change. */
export const buildAdMap = (slots: AdSlot[]): AdMap => {
  const sorted = normalizeSlots(slots);
  return {
    slots: sorted,
    toContent: (playerTime) => {
      let shift = 0;
      for (const slot of sorted) {
        const start = slot.at + shift;
        const end = start + slot.duration;
        if (playerTime < start) return playerTime - shift;
        if (playerTime < end) return slot.at;
        shift += slot.duration;
      }
      return playerTime - shift;
    },
    toPlayer: (contentTime) => {
      let shift = 0;
      for (const slot of sorted) {
        if (contentTime < slot.at) break;
        shift += slot.duration;
      }
      return contentTime + shift;
    },
    adAt: (playerTime) => {
      let shift = 0;
      for (let index = 0; index < sorted.length; index += 1) {
        const slot = sorted[index];
        const start = slot.at + shift;
        const end = start + slot.duration;
        if (playerTime < start) return null;
        if (playerTime < end) return { index, start, end };
        shift += slot.duration;
      }
      return null;
    },
  };
};

export type ResolvedSite = {
  rule: SiteRule;
  seriesId: string | null;
  /** Human title of the series, when the adapter knows it. */
  seriesTitle: string | null;
  season: string | null;
  episode: number | null;
  slots: AdSlot[];
  /** Key into `rule.episodeAdSlots`; null when the episode is unknown. */
  adEpisodeKey: string | null;
};

/** `<seriesId>@<season>@<episode>`; unknown parts become `*`. Null without an episode number. */
export const adEpisodeKey = (
  seriesId: string | null,
  season: string | null,
  episode: number | null,
): string | null => (episode === null ? null : `${seriesId ?? '*'}@${season ?? '*'}@${episode}`);

export const resolveAdSlots = (
  rule: SiteRule,
  seriesId: string | null,
  season: string | null,
  episode: number | null,
): Pick<ResolvedSite, 'slots' | 'adEpisodeKey'> => {
  const key = adEpisodeKey(seriesId, season, episode);
  const episodeSlots = key ? rule.episodeAdSlots?.[key] : undefined;
  if (episodeSlots) return { slots: episodeSlots, adEpisodeKey: key };
  const seriesSlots = seriesId ? rule.seriesAdSlots?.[seriesId] : undefined;
  return { slots: seriesSlots ?? [], adEpisodeKey: key };
};

export const resolveSiteRule = (rules: SiteRules, url: string): ResolvedSite | null => {
  for (const rule of rules.rules) {
    if (!rule.enabled) continue;
    const hit = matchRuleUrl(rule, url);
    if (!hit) continue;
    return {
      rule,
      seriesId: hit.id,
      seriesTitle: null,
      season: hit.season,
      episode: hit.episode,
      ...resolveAdSlots(rule, hit.id, hit.season, hit.episode),
    };
  }
  return null;
};

/** `resolveSiteRule` plus the rule's built-in adapter, which may take a network round trip. */
export const resolveSite = async (rules: SiteRules, url: string): Promise<ResolvedSite | null> => {
  const base = resolveSiteRule(rules, url);
  if (!base?.rule.adapter) return base;

  const hit = await resolveWithAdapter(base.rule.adapter, url);
  if (!hit) return base;

  const seriesId = hit.seriesId ?? base.seriesId;
  const season = hit.season ?? base.season;
  const episode = hit.episode ?? base.episode;
  return {
    ...base,
    seriesId,
    seriesTitle: hit.seriesTitle,
    season,
    episode,
    ...resolveAdSlots(base.rule, seriesId, season, episode),
  };
};

/** `<ruleId>#<seriesId>`; `#*` when the rule captures no series id. */
export const bindKey = (ruleId: string, seriesId: string | null): string => `${ruleId}#${seriesId ?? '*'}`;

export const boundPackOf = (rules: SiteRules, ruleId: string, seriesId: string | null): string =>
  rules.binds[bindKey(ruleId, seriesId)] ?? '';

const normalizeTitle = (text: string): string => text.toLowerCase().replace(/[\p{P}\p{S}\s]+/gu, '');

/** The one pack whose title matches the site's series title; null when none or several do. */
export const matchPackByTitle = <T extends { title: string }>(packs: T[], title: string): T | null => {
  const want = normalizeTitle(title);
  if (want.length < 2) return null;

  const candidates = packs
    .map((pack) => ({ pack, key: normalizeTitle(pack.title) }))
    .filter(({ key }) => key.length >= 2);
  const exact = candidates.filter(({ key }) => key === want);
  if (exact.length === 1) return exact[0].pack;

  const loose = candidates.filter(({ key }) => key.includes(want) || want.includes(key));
  return loose.length === 1 ? loose[0].pack : null;
};

const normalizeRule = (rule: SiteRule): SiteRule => ({
  ...rule,
  seriesAdSlots: rule.seriesAdSlots && typeof rule.seriesAdSlots === 'object' ? rule.seriesAdSlots : {},
  episodeAdSlots: rule.episodeAdSlots && typeof rule.episodeAdSlots === 'object' ? rule.episodeAdSlots : {},
});

export const loadSiteRules = async (): Promise<SiteRules> => {
  const raw = await chrome.storage.local.get(SITE_RULES_KEY);
  const saved = raw[SITE_RULES_KEY] as Partial<SiteRules> | undefined;
  const base = defaultSiteRules();
  if (!saved) return base;

  const rules = (Array.isArray(saved.rules) ? saved.rules : base.rules).map(normalizeRule);
  const binds = saved.binds && typeof saved.binds === 'object' ? saved.binds : {};
  if ((saved.version ?? 1) >= 2) return { version: 2, rules, binds };

  // Rules saved before the bilibili adapter existed: append the built-in rules once.
  const known = new Set(rules.map((rule) => rule.id));
  const migrated: SiteRules = {
    version: 2,
    rules: [...rules, ...base.rules.filter((rule) => !known.has(rule.id))],
    binds,
  };
  await saveSiteRules(migrated);
  return migrated;
};

export const saveSiteRules = async (rules: SiteRules): Promise<void> => {
  await chrome.storage.local.set({ [SITE_RULES_KEY]: rules });
};

export const setSeriesBind = async (
  ruleId: string,
  seriesId: string | null,
  packId: string,
): Promise<void> => {
  const rules = await loadSiteRules();
  const key = bindKey(ruleId, seriesId);
  if (rules.binds[key] === packId) return;
  await saveSiteRules({ ...rules, binds: { ...rules.binds, [key]: packId } });
};

/** Save one episode's ad slots (empty = drop the override). Returns the persisted rules, or null. */
export const saveEpisodeAdSlots = async (
  ruleId: string,
  seriesId: string | null,
  season: string | null,
  episode: number | null,
  slots: AdSlot[],
): Promise<SiteRules | null> => {
  const key = adEpisodeKey(seriesId, season, episode);
  if (!key) return null;

  const rules = await loadSiteRules();
  const rule = rules.rules.find((item) => item.id === ruleId);
  if (!rule) return null;

  const next = { ...rule.episodeAdSlots };
  const cleaned = normalizeSlots(slots);
  if (cleaned.length) next[key] = cleaned;
  else delete next[key];

  // The series default is a running average over every marked episode, so it firms up as marks accumulate.
  const series = { ...rule.seriesAdSlots };
  if (seriesId) {
    const averaged = seriesAdSlotsFromEpisodes({ ...rule, episodeAdSlots: next }, seriesId);
    if (averaged.length) series[seriesId] = averaged;
    else delete series[seriesId];
  }

  const updated: SiteRules = {
    ...rules,
    rules: rules.rules.map((item) =>
      item.id === ruleId ? { ...item, episodeAdSlots: next, seriesAdSlots: series } : item,
    ),
  };
  await saveSiteRules(updated);
  return updated;
};

export const pickEpisodeEntry = <T extends { name: string }>(
  entries: T[],
  episode: number,
  fileTemplate: string,
): T | null => entries.find((entry) => episodeFromName(entry.name, fileTemplate) === episode) ?? null;