import { describe, expect, it, vi } from 'vitest';

import {
  annotateChunks,
  annotateExpressions,
  annotateLevels,
} from '@/features/overlay/tokenize/local';
import {
  chunkElementAt,
  resolveElementStyle,
  tokenStyle,
} from '@/features/overlay/tokenize/style';
import {
  EXPRESSION_ELEMENT,
  LEVEL_ELEMENT,
  POS_ELEMENT,
  resolveFeatures,
  toggleFeatureIn,
} from '@/shared/studyFeatures';
import { withAlpha } from '@/shared/elementStyle';
import {
  LEGACY_POS_COLORS_KEY,
  SUBTITLE_STYLE_KEY,
  copyPreset,
  defaultPreset,
  defaultSubtitleStyle,
  effectiveBox,
  loadSubtitleStyle,
  localOnlyPreset,
  normalizeBoxStyle,
  normalizeElementStyle,
  normalizeSubtitleStyle,
  presetElements,
  presetRequiresRemote,
  type StudyPreset,
  type SubtitleStyle,
} from '@/shared/subtitleStyle';
import type { Token } from '@/shared/types';

const token = (
  surface: string,
  pos: string,
  extra: Partial<Token> = {},
): Token => ({
  surface,
  pos,
  posDetail1: '',
  conjType: '',
  conjForm: '',
  baseForm: '',
  reading: '',
  ...extra,
});

const preset = (features: StudyPreset['features'], overrides: StudyPreset['elements'] = {}): StudyPreset => ({
  ...defaultPreset('pos-basic'),
  features,
  base: { dimOpacity: 1, focusElement: null },
  elements: overrides,
});

describe('element style', () => {
  it('clamps and rejects out-of-range values', () => {
    expect(normalizeElementStyle({ opacity: 2, fontScale: 0.1, color: '#abc' })).toEqual({
      color: '#AABBCC',
      opacity: 1,
      fontScale: 0.5,
    });
    const underline = normalizeElementStyle({
      underline: { enabled: true, style: 'double' as never, thicknessPx: 9, offsetPx: 20 },
    }).underline;
    expect(underline).toEqual({ enabled: true, style: 'solid', thicknessPx: 6, offsetPx: 12 });
    expect(normalizeElementStyle({ radiusPx: 40 }).radiusPx).toBe(16);
    expect(normalizeElementStyle({ color: 'red', backgroundColor: 'url(x)' })).toEqual({});
    expect(normalizeElementStyle({ textColorMode: 'underline-only' }).textColorMode).toBe('underline-only');
    // Off is the only value worth storing; on is the default, so it collapses to no override.
    expect(normalizeElementStyle({ enabled: false })).toEqual({ enabled: false });
    expect(normalizeElementStyle({ enabled: true })).toEqual({});
  });

  it('normalizes the global subtitle box colour and opacity', () => {
    expect(normalizeBoxStyle({ backgroundColor: '#123', backgroundOpacity: 2 })).toEqual({
      backgroundColor: '#112233',
      backgroundOpacity: 1,
    });
    expect(normalizeBoxStyle({ backgroundColor: 'red' }).backgroundColor).toBeUndefined();
    expect(withAlpha('#112233', 0.5)).toBe('rgba(17, 34, 51, 0.5)');
    expect(withAlpha('#11223380', 0.5)).toBe('rgba(17, 34, 51, 0.251)');
  });

  it('uses the global box unless the preset overrides it', () => {
    const style = defaultSubtitleStyle();
    style.box = { backgroundColor: '#000000', backgroundOpacity: 0.4 };
    const shared = defaultPreset('pos-basic');
    expect(effectiveBox(style, shared)).toEqual(style.box);
    const own = { ...shared, box: { backgroundColor: '#FFFFFF', backgroundOpacity: 0.7 } };
    expect(effectiveBox(style, own)).toEqual(own.box);
  });

  it('inherits the global colour for a mode box that only sets an opacity', () => {
    const style = defaultSubtitleStyle();
    style.box = { backgroundColor: '#000000', backgroundOpacity: 0.4 };
    // Turning the mode box on before picking a colour must not hide the global one.
    const own = { ...defaultPreset('pos-basic'), box: { backgroundOpacity: 1 } };
    expect(effectiveBox(style, own)).toEqual({ backgroundColor: '#000000', backgroundOpacity: 1 });
    // Explicit transparency is how a mode says "no box", so it must win.
    const off = { ...defaultPreset('pos-basic'), box: { backgroundColor: '#00000000', backgroundOpacity: 1 } };
    expect(effectiveBox(style, off)).toEqual({ backgroundColor: '#00000000', backgroundOpacity: 1 });
  });
});

describe('feature points', () => {
  it('resolves dependencies and mutual exclusion', () => {
    expect(resolveFeatures(['nouns'])).toEqual([]);
    expect(resolveFeatures(['pos', 'nouns'])).toEqual(['pos', 'nouns']);
    expect(resolveFeatures(['chunk-rule', 'chunk'])).toEqual(['chunk-rule']);
  });

  it('lets a click displace the rival feature instead of being dropped', () => {
    expect(toggleFeatureIn(['chunk-rule'], 'chunk')).toEqual(['chunk']);
    expect(toggleFeatureIn(['chunk'], 'chunk-rule')).toEqual(['chunk-rule']);
    expect(toggleFeatureIn([], 'nouns')).toEqual(['pos', 'nouns']);
    expect(toggleFeatureIn(['pos', 'nouns'], 'pos')).toEqual([]);
  });
});

describe('per-property resolution', () => {
  const elements = {
    [POS_ELEMENT.noun]: { color: '#111111', opacity: 0.6 },
    [EXPRESSION_ELEMENT]: { color: '#222222', backgroundColor: '#33333333', radiusPx: 4 },
    [LEVEL_ELEMENT]: { backgroundColor: '#44444433', underline: { enabled: true, color: '#555555' } },
    'chunk.bunsetsu:only': { backgroundColor: '#66666633', underline: { enabled: true, color: '#777777' } },
  };

  it('takes one winner per property, highest feature first', () => {
    const style = resolveElementStyle(
      [
        { feature: 'pos', element: POS_ELEMENT.noun },
        { feature: 'level', element: LEVEL_ELEMENT },
        { feature: 'expression', element: EXPRESSION_ELEMENT },
      ],
      elements,
    );
    expect(style.color).toBe('#222222');
    expect(style.backgroundColor).toBe('#33333333');
    expect(style.underline?.color).toBe('#555555');
    expect(style.opacity).toBe(0.6);
  });

  it('lets a chunk background beat the token colour layer', () => {
    const style = resolveElementStyle(
      [
        { feature: 'pos', element: POS_ELEMENT.noun },
        { feature: 'chunk-rule', element: 'chunk.bunsetsu:only' },
      ],
      elements,
    );
    expect(style.backgroundColor).toBe('#66666633');
    expect(style.underline?.color).toBe('#777777');
    expect(style.color).toBe('#111111');
    expect(style.opacity).toBe(0.6);
  });

  it('ranks a level background above a chunk background', () => {
    const style = resolveElementStyle(
      [
        { feature: 'chunk-rule', element: 'chunk.bunsetsu:only' },
        { feature: 'level', element: LEVEL_ELEMENT },
      ],
      elements,
    );
    expect(style.backgroundColor).toBe('#44444433');
    expect(style.underline?.color).toBe('#555555');
  });

  it('lets a switched-off element contribute nothing at all', () => {
    const style = resolveElementStyle(
      [
        { feature: 'pos', element: POS_ELEMENT.noun },
        { feature: 'expression', element: EXPRESSION_ELEMENT },
      ],
      {
        [POS_ELEMENT.noun]: { color: '#111111', opacity: 0.6 },
        [EXPRESSION_ELEMENT]: { ...elements[EXPRESSION_ELEMENT], enabled: false },
      },
    );
    expect(style).toEqual({ color: '#111111', opacity: 0.6 });
  });

  it('drops the text colour when the element is underline-only', () => {
    const style = resolveElementStyle([{ feature: 'pos', element: POS_ELEMENT.noun }], {
      [POS_ELEMENT.noun]: { color: '#111111', textColorMode: 'underline-only' },
    });
    expect(style.color).toBeUndefined();
    expect(style.textColorMode).toBe('underline-only');
  });
});

describe('chunk positions', () => {
  const withGroup = (surface: string, group: string): Token =>
    token(surface, '名詞', { groups: { 'chunk.bunsetsu': group } });

  it('derives first, middle, last and only from the group run', () => {
    const tokens = [
      withGroup('a', 'g1'),
      withGroup('b', 'g1'),
      withGroup('c', 'g2'),
      withGroup('d', 'g2'),
      withGroup('e', 'g2'),
      withGroup('f', 'g3'),
      token('g', '名詞'),
    ];
    expect(chunkElementAt(tokens, 0)).toBe('chunk.bunsetsu:first');
    expect(chunkElementAt(tokens, 1)).toBe('chunk.bunsetsu:last');
    expect(chunkElementAt(tokens, 2)).toBe('chunk.bunsetsu:first');
    expect(chunkElementAt(tokens, 3)).toBe('chunk.bunsetsu:middle');
    expect(chunkElementAt(tokens, 4)).toBe('chunk.bunsetsu:last');
    expect(chunkElementAt(tokens, 5)).toBe('chunk.bunsetsu:only');
    expect(chunkElementAt(tokens, 6)).toBeUndefined();
  });

  it('marks the middle of a three-token chunk', () => {
    const tokens = ['とても', '静か', 'に'].map((surface) =>
      token(surface, '名詞', { groups: { 'chunk.bunsetsu': 'g1' } }),
    );
    expect(chunkElementAt(tokens, 1)).toBe('chunk.bunsetsu:middle');
  });
});

describe('local annotations', () => {
  it('groups tokens into rule chunks and splits on particles and punctuation', () => {
    const tokens = [
      token('私', '代名詞'),
      token('は', '助詞'),
      token('静かに', '副詞'),
      token('、', '記号'),
      token('本', '名詞'),
      token('を', '助詞'),
      token('読んだ', '動詞'),
    ];
    const groups = annotateChunks(tokens).map((t) => t.groups?.['chunk.bunsetsu']);
    expect(groups).toEqual(['rule-0', 'rule-0', 'rule-1', undefined, 'rule-2', 'rule-2', 'rule-3']);
  });

  it('tags fixed expressions across token boundaries', () => {
    const tokens = [
      token('食べ', '動詞'),
      token('なければ', '助動詞'),
      token('ならない', '動詞'),
      token('。', '記号'),
    ];
    const tagged = annotateExpressions(tokens);
    expect(tagged[0].grammar).toBeUndefined();
    expect(tagged[1].grammar).toContain(EXPRESSION_ELEMENT);
    expect(tagged[2].grammar).toContain(EXPRESSION_ELEMENT);
  });

  it('tags dictionary words at an enabled study level', () => {
    const entries = [
      { w: '勉強', r: 'ベンキョウ', lv: 3, p: [], g: [], x: [], id: '勉強' },
      { w: '本', r: 'ホン', lv: 5, p: [], g: [], x: [], id: '本' },
    ];
    const tokens = [token('勉強', '名詞', { dictIdx: 0 }), token('本', '名詞', { dictIdx: 1 })];
    const tagged = annotateLevels(tokens, entries, { 3: true });
    expect(tagged[0].grammar).toContain(LEVEL_ELEMENT);
    expect(tagged[1].grammar).toBeUndefined();
  });
});

describe('presets', () => {
  it('keeps palettes independent per preset', () => {
    const style = normalizeSubtitleStyle({
      activeProfileId: 'syntax-focus',
      profiles: { 'pos-basic': { elements: { 'token.pos:NOUN': { color: '#123456' } } } },
    });
    expect(style.activePresetId).toBe('syntax-focus');
    expect(style.presets['pos-basic'].elements['token.pos:NOUN'].color).toBe('#123456');
    expect(style.presets['pos-basic'].customized).toBe(true);
    expect(presetElements(style.presets['syntax-focus'])['syntax.role:topic'].color).toBe('#C084FC');
    expect(presetElements(style.presets['syntax-focus'])['token.pos:NOUN']).toBeUndefined();
  });

  it('fans the v2 chunk element out to every position', () => {
    const style = normalizeSubtitleStyle({
      profiles: { 'chunk-focus': { elements: { 'chunk.bunsetsu:all': { backgroundColor: '#112233' } } } },
    });
    const elements = style.presets['chunk-focus'].elements;
    expect(elements['chunk.bunsetsu:first'].backgroundColor).toBe('#112233');
    expect(elements['chunk.bunsetsu:only'].backgroundColor).toBe('#112233');
    expect(elements['chunk.bunsetsu:all']).toBeUndefined();
  });

  it('restores built-in features when a stored v3 preset omits them', () => {
    const style = normalizeSubtitleStyle({
      version: 3,
      activePresetId: 'pos-basic',
      presets: { 'chunk-focus': { id: 'chunk-focus', elements: {} } },
    });
    expect(style.presets['chunk-focus'].features).toEqual(['chunk-rule']);
  });

  it('stores a switched-off element through normalization', () => {
    const style = normalizeSubtitleStyle({
      version: 3,
      activePresetId: 'pos-basic',
      presets: {
        'pos-basic': {
          id: 'pos-basic',
          features: ['pos'],
          elements: { [POS_ELEMENT.verb]: { enabled: false } },
        },
      },
    });
    expect(style.presets['pos-basic'].elements[POS_ELEMENT.verb]).toEqual({ enabled: false });
  });

  it('copies a preset whole, leaving the source untouched', () => {
    const source: StudyPreset = {
      ...defaultPreset('pos-basic'),
      features: ['pos', 'nouns'],
      base: { dimOpacity: 0.35, focusElement: POS_ELEMENT.noun },
      elements: {
        [POS_ELEMENT.noun]: { color: '#123456', underline: { enabled: true, color: '#654321' } },
      },
      customized: true,
    };
    const copy = copyPreset(source, 'custom:x', ' 我的词性 ');
    expect(copy.id).toBe('custom:x');
    expect(copy.name).toBe('我的词性');
    expect(copy.features).toEqual(['pos', 'nouns']);
    expect(copy.base).toEqual(source.base);
    expect(copy.elements).toEqual(source.elements);
    // A copy is always user-owned, so it never carries the built-in "edited" flag.
    expect(copy.customized).toBeUndefined();
    const copiedUnderline = copy.elements[POS_ELEMENT.noun].underline;
    expect(copiedUnderline).not.toBe(source.elements[POS_ELEMENT.noun].underline);
    copiedUnderline!.color = '#000000';
    copy.elements[POS_ELEMENT.noun].color = '#ABCDEF';
    expect(source.elements[POS_ELEMENT.noun].color).toBe('#123456');
    expect(source.elements[POS_ELEMENT.noun].underline?.color).toBe('#654321');
  });

  it('drops remote features when the grammar service is unavailable', () => {
    const remote = preset(['pos', 'syntax']);
    expect(presetRequiresRemote(remote)).toBe(true);
    const local = localOnlyPreset(remote);
    expect(local.features).toEqual(['pos']);
    expect(presetRequiresRemote(local)).toBe(false);
  });
});

describe('token style', () => {
  it('dims everything outside the focus element', () => {
    const tokens = [token('本', '名詞'), token('読んだ', '動詞')];
    const style: StudyPreset = { ...defaultPreset('pos-basic'), features: ['pos', 'nouns'] };
    style.base = { dimOpacity: 0.35, focusElement: POS_ELEMENT.noun };
    const elements = presetElements(style);
    expect(tokenStyle(tokens, 0, style, elements)?.opacity).toBeUndefined();
    expect(tokenStyle(tokens, 1, style, elements)?.opacity).toBe(0.35);
  });

  it('leaves a token unstyled when its element is switched off', () => {
    const tokens = [token('本', '名詞'), token('読んだ', '動詞', { conjForm: '連用タ接続' })];
    const off = preset(['pos'], {
      [POS_ELEMENT.noun]: { enabled: false },
      [POS_ELEMENT.verb]: { enabled: false },
    });
    const elements = presetElements(off);
    expect(elements[POS_ELEMENT.noun]).toMatchObject({ enabled: false });
    expect(tokenStyle(tokens, 0, off, elements)).toBeUndefined();
    expect(tokenStyle(tokens, 1, off, elements)).toBeUndefined();
  });

  it('does not dim when the focus element itself is switched off', () => {
    const tokens = [token('本', '名詞'), token('読んだ', '動詞')];
    const style: StudyPreset = {
      ...defaultPreset('pos-basic'),
      features: ['pos', 'nouns'],
      elements: { [POS_ELEMENT.noun]: { enabled: false } },
    };
    style.base = { dimOpacity: 0.35, focusElement: POS_ELEMENT.noun };
    expect(tokenStyle(tokens, 1, style, presetElements(style))?.opacity).toBeUndefined();
  });

  it('keeps the inflected-verb hint unless the element overrides it', () => {
    const inflected = token('読んだ', '動詞', { conjForm: '連用タ接続' });
    const base = defaultPreset('pos-basic');
    expect(tokenStyle([inflected], 0, base, presetElements(base))?.opacity).toBe(0.78);
    const custom = preset(['pos'], {
      [POS_ELEMENT.verb]: { opacity: 1, underline: { enabled: false } },
    });
    const style = tokenStyle([inflected], 0, custom, presetElements(custom));
    expect(style?.opacity).toBe(1);
    expect(style?.underline?.enabled).toBe(false);
  });
});

describe('storage', () => {
  it('migrates the legacy flat palette into pos-basic', async () => {
    const get = vi.fn(async () => ({ [LEGACY_POS_COLORS_KEY]: { noun: '#112233' } }));
    vi.stubGlobal('chrome', { storage: { local: { get, set: vi.fn(async () => undefined) } } });
    const style = await loadSubtitleStyle();
    expect(style.presets['pos-basic'].elements['token.pos:NOUN'].color).toBe('#112233');
    expect(style.activePresetId).toBe('pos-basic');
  });

  it('prefers a saved preset set over the legacy key', async () => {
    const saved = normalizeSubtitleStyle({
      activeProfileId: 'reading-assist',
      profiles: { 'pos-basic': { elements: { 'token.pos:NOUN': { color: '#445566' } } } },
    }) satisfies SubtitleStyle;
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async () => ({ [SUBTITLE_STYLE_KEY]: saved, [LEGACY_POS_COLORS_KEY]: { noun: '#112233' } })),
          set: vi.fn(async () => undefined),
        },
      },
    });
    const style = await loadSubtitleStyle();
    expect(style.activePresetId).toBe('reading-assist');
    expect(style.presets['pos-basic'].elements['token.pos:NOUN'].color).toBe('#445566');
  });
});
