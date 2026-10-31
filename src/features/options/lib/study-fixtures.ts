import type { DictEntry } from '@/shared/dictionary';
import type { Pos, Token } from '@/shared/types';
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

type Extra = Partial<Pick<Token, 'conjForm' | 'reading' | 'dictIdx' | 'posDetail1'>>;

const w = (
  surface: string,
  pos: Pos,
  grammar: string[] = [],
  extra: Extra = {},
): Token => ({
  surface,
  pos,
  posDetail1: extra.posDetail1 ?? '',
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
  w('私', 'PRON', ['syntax.role:topic'], { reading: 'ワタシ' }),
  w('は', 'ADP', ['syntax.role:topic'], { reading: 'ハ' }),
  w('とても', 'ADV', ['syntax.role:adverbial'], { reading: 'トテモ' }),
  w('静か', 'NOUN', ['syntax.role:modifier'], { reading: 'シズカ', posDetail1: '形容動詞語幹' }),
  w('に', 'ADP', ['syntax.role:modifier'], { reading: 'ニ' }),
  w('日本語', 'NOUN', ['syntax.role:object'], { reading: 'ニホンゴ' }),
  w('を', 'ADP', ['syntax.role:object'], { reading: 'ヲ' }),
  w('勉強', 'NOUN', ['syntax.role:predicate'], { reading: 'ベンキョウ', dictIdx: 0 }),
  w('し', 'VERB', ['syntax.role:predicate'], { reading: 'シ', conjForm: '連用形' }),
  w('なければ', 'AUX', ['syntax.role:predicate'], { reading: 'ナケレバ' }),
  w('ならない', 'VERB', ['syntax.role:predicate'], { reading: 'ナラナイ' }),
  w('。', 'PUNCT'),
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
  w('ああ', 'INTJ'),
  w('、', 'PUNCT'),
  w('しかし', 'CCONJ'),
  w('とても', 'ADV'),
  w('静か', 'NOUN', [], { posDetail1: '形容動詞語幹' }),
  w('本', 'NOUN'),
  w('を', 'ADP'),
  w('読んだ', 'VERB', [], { conjForm: '連用タ接続' }),
];
