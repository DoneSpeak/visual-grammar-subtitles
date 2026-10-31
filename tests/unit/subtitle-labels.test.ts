import { describe, expect, it } from 'vitest';

import { commonAffixes, describeSubtitles, parseEntry } from '@/shared/subtitleLabel';

describe('commonAffixes', () => {
  it('trims shared prefix/suffix to separators', () => {
    expect(commonAffixes(['Show - 01.srt', 'Show - 02.srt'])).toEqual({ prefix: 'Show - ', suffix: '' });
    expect(commonAffixes(['a.srt'])).toEqual({ prefix: '', suffix: '' });
  });
});

describe('parseEntry', () => {
  it('extracts episode and cleans the title', () => {
    expect(parseEntry('Monster S01E01 Herr_Dr._Tenma_[5CBB3C92].srt', { prefix: '', suffix: '' })).toEqual({
      ep: 1,
      title: 'Herr Dr. Tenma',
    });
  });

  it('drops a chapter suffix that repeats the episode number', () => {
    expect(parseEntry('05 Chapter 5.srt', { prefix: '', suffix: '' })).toEqual({ ep: 5, title: '' });
  });

  it('keeps the base name when stripping the affix leaves nothing', () => {
    expect(parseEntry('Show 01.srt', { prefix: 'Show 01.srt', suffix: '' })).toEqual({
      ep: null,
      title: 'Show 01',
    });
  });
});

describe('describeSubtitles', () => {
  it('pads episode numbers to the pack width', () => {
    const labels = describeSubtitles(['Show 1.srt', 'Show 10.srt']);
    expect(labels.get('Show 1.srt')?.label).toBe('01');
    expect(labels.get('Show 10.srt')?.label).toBe('10');
  });

  it('keeps a title after the episode', () => {
    const labels = describeSubtitles(['Show - 03 - Title.srt', 'Show - 04 - Other.srt']);
    expect(labels.get('Show - 03 - Title.srt')?.label).toBe('03 - Title');
  });
});
