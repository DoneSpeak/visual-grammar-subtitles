import { describe, expect, it } from 'vitest';

import {
  adEpisodeKey,
  bindKey,
  buildAdMap,
  compileTemplate,
  episodeFromName,
  matchPackByTitle,
  matchRuleUrl,
  normalizeAdSlots,
  resolveAdSlots,
  type SiteRule,
} from '@/shared/siteRules';

const rule = (overrides: Partial<SiteRule> = {}): SiteRule => ({
  id: 'test',
  name: 'test',
  enabled: true,
  urlTemplate: 'https://*/cid/<id>-<season>-<episode>.html',
  fileTemplate: '',
  seriesAdSlots: {},
  episodeAdSlots: {},
  seriesAdDuration: {},
  ...overrides,
});

describe('compileTemplate', () => {
  it('rejects empty and over-long templates', () => {
    expect(compileTemplate('', true)).toBeNull();
    expect(compileTemplate('   ', true)).toBeNull();
    expect(compileTemplate('a'.repeat(401), true)).toBeNull();
  });
});

describe('matchRuleUrl', () => {
  it('captures id, season and episode placeholders', () => {
    expect(matchRuleUrl(rule(), 'https://example.com/cid/abc-2-11.html')).toEqual({
      id: 'abc',
      season: '2',
      episode: 11,
    });
  });

  it('returns null for a non-matching url', () => {
    expect(matchRuleUrl(rule(), 'https://example.com/other/abc-2-11.html')).toBeNull();
  });

  it('ignores the query string unless the template contains ?', () => {
    const queryRule = rule({ urlTemplate: 'https://example.com/watch?ep=<episode>' });
    expect(matchRuleUrl(queryRule, 'https://example.com/watch?ep=7')).toEqual({
      id: null,
      season: null,
      episode: 7,
    });
    expect(matchRuleUrl(queryRule, 'https://example.com/watch?ep=7&x=1')).toBeNull();
  });

  it('leaves unknown placeholders literal', () => {
    expect(compileTemplate('https://x.com/<foo>', true)).not.toBeNull();
    expect(matchRuleUrl(rule({ urlTemplate: 'https://x.com/<foo>' }), 'https://x.com/%3Cfoo%3E')).toBeNull();
  });
});

describe('episodeFromName', () => {
  it('uses builtin heuristics when no file template is set', () => {
    expect(episodeFromName('Show S01E05 title.srt')).toBe(5);
    expect(episodeFromName('Show 第3話.srt')).toBe(3);
    expect(episodeFromName('Show - 12v2.mkv')).toBe(12);
    expect(episodeFromName('Show - 07 [1080p].ass')).toBe(7);
    expect(episodeFromName('no number here.srt')).toBeNull();
  });

  it('prefers the rule file template when set', () => {
    expect(episodeFromName('Show EP04 [jpn].srt', '*EP<episode> [*]')).toBe(4);
    expect(episodeFromName('Show 04.srt', '*EP<episode> [*]')).toBeNull();
  });
});

describe('ad slots', () => {
  it('normalizes: finite, non-negative, positive duration, sorted', () => {
    expect(
      normalizeAdSlots([
        { at: 30, duration: 5 },
        { at: 10, duration: 2 },
        { at: -1, duration: 2 },
        { at: 12, duration: 0 },
        { at: Number.NaN, duration: 3 },
      ]),
    ).toEqual([
      { at: 10, duration: 2 },
      { at: 30, duration: 5 },
    ]);
  });

  it('builds the ad episode key', () => {
    expect(adEpisodeKey('abc', '1', 3)).toBe('abc@1@3');
    expect(adEpisodeKey(null, null, 3)).toBe('*@*@3');
    expect(adEpisodeKey('abc', '1', null)).toBeNull();
  });

  it('prefers episode slots, then series slots, then empty', () => {
    const withSlots = rule({
      episodeAdSlots: { 'abc@1@3': [{ at: 5, duration: 2 }] },
      seriesAdSlots: { abc: [{ at: 90, duration: 30 }] },
    });
    expect(resolveAdSlots(withSlots, 'abc', '1', 3)).toEqual({
      slots: [{ at: 5, duration: 2 }],
      adDuration: 15,
      adEpisodeKey: 'abc@1@3',
    });
    expect(resolveAdSlots(withSlots, 'abc', '1', 4).slots).toEqual([{ at: 90, duration: 30 }]);
    expect(resolveAdSlots(rule(), 'abc', '1', 4).slots).toEqual([]);
  });

  it('uses the series skip duration, defaulting to 15 seconds', () => {
    const custom = rule({ seriesAdDuration: { abc: 20 } });
    expect(resolveAdSlots(custom, 'abc', '1', 3).adDuration).toBe(20);
    expect(resolveAdSlots(custom, 'other', '1', 3).adDuration).toBe(15);
    expect(resolveAdSlots(custom, null, null, 3).adDuration).toBe(15);
  });

  it('maps between player and content timelines and finds the covering ad', () => {
    const map = buildAdMap([
      { at: 10, duration: 5 },
      { at: 30, duration: 10 },
    ]);
    expect(map.toContent(9)).toBe(9);
    expect(map.toContent(12)).toBe(10);
    expect(map.toContent(20)).toBe(15);
    expect(map.toPlayer(9)).toBe(9);
    expect(map.toPlayer(10)).toBe(15);
    expect(map.toPlayer(15)).toBe(20);
    expect(map.adAt(12)).toEqual({ index: 0, start: 10, end: 15 });
    expect(map.adAt(20)).toBeNull();
  });
});

describe('bindings', () => {
  it('uses * for a missing series id', () => {
    expect(bindKey('rule', 'abc')).toBe('rule#abc');
    expect(bindKey('rule', null)).toBe('rule#*');
  });

  it('matches packs by normalized title only when unambiguous', () => {
    const packs = [{ title: 'Monster' }, { title: '进击的巨人' }];
    expect(matchPackByTitle(packs, 'monster!')).toEqual({ title: 'Monster' });
    expect(matchPackByTitle(packs, '进击的巨人')).toEqual({ title: '进击的巨人' });
    expect(matchPackByTitle(packs, 'M')).toBeNull();
    expect(matchPackByTitle(packs, 'unknown')).toBeNull();
  });
});
