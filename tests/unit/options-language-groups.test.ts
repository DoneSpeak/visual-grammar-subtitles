import { afterEach, describe, expect, it, vi } from 'vitest';

import { previewFor } from '@/features/options/lib/study-fixtures';
import { defaultBandSelection, entryAllowed, entryInBands } from '@/languages/bands';
import { SELECTABLE_LANGUAGES, featuresFor } from '@/languages/registry';
import { loadDictSettings } from '@/shared/dictSettings';
import { defaultSubtitleStyle, presetOrder } from '@/shared/subtitleStyle';
import type { DictEntry } from '@/shared/dictionary';

/**
 * The options page has no per-language branches; it renders whatever each pack declares. These
 * assertions are the contract that keeps that true: every selectable pack must produce a preset
 * list and a preview, so registering a new pack needs no options-page edit.
 */
describe.each(SELECTABLE_LANGUAGES.map((pack) => [pack.id, pack] as const))(
  'options group for %s',
  (_id, pack) => {
    it('offers at least one study mode', () => {
      const registry = featuresFor(pack.id);
      expect(registry.builtIns.length).toBeGreaterThan(0);
      expect(presetOrder(registry, defaultSubtitleStyle(), pack.id).length).toBeGreaterThan(0);
    });

    it('produces a preview line and a palette sample', () => {
      const { tokens, sample } = previewFor(pack.id);
      expect(tokens.length).toBeGreaterThan(0);
      expect(tokens.every((token) => token.surface.length > 0)).toBe(true);
      expect(sample.length).toBeGreaterThanOrEqual(tokens.length);
    });

    it('declares unique band ids, and defaults to every band on', () => {
      const definitions = pack.bands?.definitions ?? [];
      const ids = definitions.map((band) => band.id);
      expect(new Set(ids).size).toBe(ids.length);
      const selection = defaultBandSelection(pack.bands);
      expect(Object.keys(selection).sort()).toEqual([...ids].sort());
    });
  },
);

describe('band predicate semantics', () => {
  const entry = (tags: string[]): DictEntry => ({
    w: 'word',
    r: '',
    lv: 0,
    p: [],
    g: [],
    x: [],
    id: 'word',
    tags,
  });
  const decl = {
    definitions: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
    bandsOf: (candidate: DictEntry) => candidate.tags ?? [],
  };

  it('annotator tags only banded entries', () => {
    expect(entryInBands(decl, entry(['a']), { a: true })).toBe(true);
    expect(entryInBands(decl, entry([]), { a: true })).toBe(false);
    expect(entryInBands(decl, entry(['b']), { a: true, b: false })).toBe(false);
  });

  it('renderer keeps unbanded entries lookup-able', () => {
    expect(entryAllowed(decl, entry([]), { a: false, b: false })).toBe(true);
    expect(entryAllowed(decl, entry(['a']), { a: false, b: false })).toBe(false);
    expect(entryAllowed(decl, entry(['b']), { a: false, b: true })).toBe(true);
  });
});

describe('dictionary band storage', () => {
  const stub = (saved: unknown) => {
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async () => ({ 'dict:settings': saved })),
          set: vi.fn(async () => undefined),
        },
      },
    });
  };

  afterEach(() => vi.unstubAllGlobals());

  it('translates the legacy JLPT levels into the ja bands', async () => {
    stub({ levels: { 1: false, 2: true, 3: true, 4: false, 5: false } });
    const { bands } = await loadDictSettings();
    expect(bands.ja).toEqual({ 1: false, 2: true, 3: true, 4: false, 5: false });
    expect(Object.values(bands.en ?? {}).every(Boolean)).toBe(true);
  });

  it('keeps other languages when only one slice is stored', async () => {
    stub({ bands: { en: { cet4: false, cet6: true, kaoyan: true, ielts: true, toefl: true } } });
    const { bands } = await loadDictSettings();
    expect(bands.en?.cet4).toBe(false);
    expect(bands.ja).toEqual({ 1: true, 2: true, 3: true, 4: true, 5: true });
  });
});
