import { describe, expect, it } from 'vitest';

import { inferPackTitle } from '@/shared/library';
import { groupEpisodeMarks, refreshSeriesDefault } from '@/features/options/lib/ad-slots';
import type { SiteRule } from '@/shared/siteRules';

describe('inferPackTitle', () => {
  it('keeps the series name before the episode marker', () => {
    expect(inferPackTitle('Monster S01E01 Chapter 1 jpn.srt')).toBe('Monster');
    expect(inferPackTitle('进击的巨人 - 05.mkv')).toBe('进击的巨人');
    expect(inferPackTitle('Show_02.ass')).toBe('Show');
  });

  it('falls back to 未归类 without a usable title', () => {
    expect(inferPackTitle('01.srt')).toBe('未归类');
    expect(inferPackTitle('a 01.srt')).toBe('未归类');
  });
});

const adRule = (): SiteRule => ({
  id: 'r',
  name: 'r',
  enabled: true,
  urlTemplate: 'https://x.com/<id>',
  fileTemplate: '',
  seriesAdSlots: {},
  episodeAdSlots: {
    'series@1@2': [{ at: 32, duration: 10 }],
    'series@1@1': [{ at: 30, duration: 10 }],
    'other@2@1': [{ at: 5, duration: 3 }],
  },
});

describe('groupEpisodeMarks', () => {
  it('groups by series, sorted by episode', () => {
    const groups = groupEpisodeMarks(adRule());
    expect([...groups.keys()]).toEqual(['series', 'other']);
    expect(groups.get('series')?.map((mark) => mark.episode)).toEqual([1, 2]);
    expect(groups.get('series')?.[0]).toMatchObject({ series: 'series', season: '1', episode: 1 });
  });

  it('skips malformed keys and empty slot lists', () => {
    const rule = adRule();
    rule.episodeAdSlots['no-at-sign'] = [{ at: 1, duration: 1 }];
    rule.episodeAdSlots['empty@1@3'] = [];
    expect(groupEpisodeMarks(rule).has('no-at-sign')).toBe(false);
    expect(groupEpisodeMarks(rule).has('empty')).toBe(false);
  });
});

describe('refreshSeriesDefault', () => {
  it('folds episode marks into one series slot', () => {
    const rule = adRule();
    refreshSeriesDefault(rule, 'series');
    const slots = rule.seriesAdSlots.series;
    expect(slots).toHaveLength(1);
    expect(slots[0].duration).toBe(10);
    expect(slots[0].at).toBeGreaterThanOrEqual(30);
    expect(slots[0].at).toBeLessThanOrEqual(32);
  });

  it('deletes the default when the series has no marks', () => {
    const rule = adRule();
    rule.seriesAdSlots.missing = [{ at: 1, duration: 1 }];
    refreshSeriesDefault(rule, 'missing');
    expect(rule.seriesAdSlots.missing).toBeUndefined();
  });
});
