import type { DictEntry } from '@/shared/dictionary';
import type { Token } from '@/shared/types';
import {
  annotateChunks,
  annotateExpressions,
  annotateLevels,
} from '@/features/overlay/tokenize/local';

/**
 * Static, already-annotated examples. The options preview never calls NLP: the local annotators
 * run on a hand-written line with the same inputs the content script supplies, so the preview
 * shows what playback can actually produce rather than a mock.
 */

type Extra = Partial<Pick<Token, 'conjForm' | 'reading' | 'dictIdx'>>;

const w = (
  surface: string,
  pos: string,
  grammar: string[] = [],
  extra: Extra = {},
): Token => ({
  surface,
  pos,
  posDetail1: '',
  conjType: '',
  conjForm: extra.conjForm ?? '',
  baseForm: '',
  reading: extra.reading ?? '',
  ...(extra.dictIdx !== undefined ? { dictIdx: extra.dictIdx } : {}),
  ...(grammar.length ? { grammar } : {}),
});

const DICT_ENTRIES: DictEntry[] = [
  { w: '勉強', r: 'ベンキョウ', lv: 3, p: [], g: [], x: [], id: '勉強' },
];

const LEVELS: Record<number, boolean> = { 3: true };

/**
 * 私はとても静かに日本語を勉強しなければならない。
 *
 * Exercises every feature at once: all POS groups present, syntax roles, a three-token chunk
 * (なので `静か` is a middle element), a fixed expression spanning しなければならない, a
 * study-plan word and readings for the ruby.
 */
const PREVIEW_LINE: Token[] = [
  w('私', '代名詞', ['syntax.role:topic'], { reading: 'ワタシ' }),
  w('は', '助詞', ['syntax.role:topic'], { reading: 'ハ' }),
  w('とても', '副詞', ['syntax.role:adverbial'], { reading: 'トテモ' }),
  w('静か', '形状詞', ['syntax.role:modifier'], { reading: 'シズカ' }),
  w('に', '助詞', ['syntax.role:modifier'], { reading: 'ニ' }),
  w('日本語', '名詞', ['syntax.role:object'], { reading: 'ニホンゴ' }),
  w('を', '助詞', ['syntax.role:object'], { reading: 'ヲ' }),
  w('勉強', '名詞', ['syntax.role:predicate'], { reading: 'ベンキョウ', dictIdx: 0 }),
  w('し', '動詞', ['syntax.role:predicate'], { reading: 'シ', conjForm: '連用形' }),
  w('なければ', '助動詞', ['syntax.role:predicate'], { reading: 'ナケレバ' }),
  w('ならない', '動詞', ['syntax.role:predicate'], { reading: 'ナラナイ' }),
  w('。', '記号'),
];

/** The same converters the content script runs, so the preview cannot drift from playback. */
export const PREVIEW_TOKENS: Token[] = annotateLevels(
  annotateExpressions(annotateChunks(PREVIEW_LINE)),
  DICT_ENTRIES,
  LEVELS,
);

/** Extra material for the palette swatches, which need groups the preview line does not cover. */
export const SAMPLE_TOKENS: Token[] = [
  ...PREVIEW_TOKENS,
  w('ああ', '感動詞'),
  w('、', '記号'),
  w('しかし', '接続詞'),
  w('とても', '副詞'),
  w('静か', '形状詞'),
  w('本', '名詞'),
  w('を', '助詞'),
  w('読んだ', '動詞', [], { conjForm: '連用タ接続' }),
];
