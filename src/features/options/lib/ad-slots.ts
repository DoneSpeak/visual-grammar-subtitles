import { seriesAdSlotsFromEpisodes, type AdSlot, type SiteRule } from '@/shared/siteRules';
import { fmtClock } from './format';

/** Series defaults are derived, never typed: fold the series' episode marks the same way the playback page does. */
export const refreshSeriesDefault = (rule: SiteRule, seriesId: string): void => {
  const slots = seriesAdSlotsFromEpisodes(rule, seriesId);
  if (slots.length) rule.seriesAdSlots[seriesId] = slots;
  else delete rule.seriesAdSlots[seriesId];
};

export const formatSlotList = (slots: AdSlot[]): string =>
  slots.map((slot) => `${fmtClock(slot.at)}–${fmtClock(slot.at + slot.duration)}`).join(' · ');

export type EpisodeMark = { key: string; series: string; season: string; episode: number; slots: AdSlot[] };

/** `seriesId@season@episode`, grouped by series; `@` inside a series id is tolerated by splitting from the right. */
export const groupEpisodeMarks = (rule: SiteRule): Map<string, EpisodeMark[]> => {
  const groups = new Map<string, EpisodeMark[]>();
  for (const [key, slots] of Object.entries(rule.episodeAdSlots ?? {})) {
    const last = key.lastIndexOf('@');
    const prev = last > 0 ? key.lastIndexOf('@', last - 1) : -1;
    if (prev < 0) continue;
    const episode = Number(key.slice(last + 1));
    if (!Number.isInteger(episode) || !slots.length) continue;
    const series = key.slice(0, prev);
    const mark: EpisodeMark = { key, series, season: key.slice(prev + 1, last), episode, slots };
    const list = groups.get(series);
    if (list) list.push(mark);
    else groups.set(series, [mark]);
  }
  for (const list of groups.values()) list.sort((a, b) => a.episode - b.episode);
  return groups;
};
