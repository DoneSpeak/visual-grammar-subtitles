import { describe, expect, it } from 'vitest';

import { DICT_DURATION_MAX_MS, DICT_DURATION_MIN_MS, clampDictDuration } from '@/shared/dictSettings';
import { normalizePosColor } from '@/shared/posColors';
import { fmtClock, fmtSize, parseClock } from '@/features/options/lib/format';

describe('clampDictDuration', () => {
  it('clamps to 1–30 s and rounds', () => {
    expect(clampDictDuration(0)).toBe(DICT_DURATION_MIN_MS);
    expect(clampDictDuration(60_000)).toBe(DICT_DURATION_MAX_MS);
    expect(clampDictDuration(4999.6)).toBe(5000);
  });
});

describe('normalizePosColor', () => {
  it('expands shorthand and uppercases', () => {
    expect(normalizePosColor('#abc')).toBe('#AABBCC');
    expect(normalizePosColor('a1b2c3')).toBe('#A1B2C3');
    expect(normalizePosColor('  #FF0000 ')).toBe('#FF0000');
  });

  it('rejects non-hex values', () => {
    expect(normalizePosColor('red')).toBeNull();
    expect(normalizePosColor('#abcd')).toBeNull();
    expect(normalizePosColor(42)).toBeNull();
  });
});

describe('clock parsing/formatting', () => {
  it('parses mm:ss and h:mm:ss', () => {
    expect(parseClock('02:30')).toBe(150);
    expect(parseClock('1:02:03')).toBe(3723);
    expect(parseClock(' 1 : 2 ')).toBe(62);
  });

  it('rejects malformed input', () => {
    expect(parseClock('90')).toBeNull();
    expect(parseClock('a:bc')).toBeNull();
    expect(parseClock('1:2:3:4')).toBeNull();
    expect(parseClock('-1:00')).toBeNull();
  });

  it('formats with hours only when needed', () => {
    expect(fmtClock(150)).toBe('02:30');
    expect(fmtClock(3723)).toBe('1:02:03');
    expect(fmtClock(-4)).toBe('00:00');
  });
});

describe('fmtSize', () => {
  it('switches units at 1024', () => {
    expect(fmtSize(512)).toBe('512B');
    expect(fmtSize(2048)).toBe('2.0KB');
    expect(fmtSize(3 * 1048576)).toBe('3.0MB');
  });
});
