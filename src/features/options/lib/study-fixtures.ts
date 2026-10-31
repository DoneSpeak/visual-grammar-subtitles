import { defaultBandSelection } from '@/languages/bands';
import { resolveLanguage } from '@/languages/registry';
import type { BandSelection, LanguageId } from '@/languages/types';
import type { DictEntry } from '@/shared/dictionary';
import type { Pos, Token } from '@/shared/types';
import {
  annotateChunks,
  annotateExpressions,
  annotateLevels,
} from '@/features/overlay/tokenize/local';

/**
 * Static, already-annotated examples, one per language. The options preview never calls NLP: the
 * local annotators run on the line below with the same inputs the content script supplies, so the
 * preview shows what playback can actually produce rather than a mock.
 *
 * Each line mirrors its pack's tokenizer output token for token: same surfaces, POS tags, POS
 * details and conjugation. A hand-split line would colour and group differently from playback —
 * 役に立ち is one verb, not 役 + に + 立ち. Syntax roles are the exception: only the remote
 * analyser produces them, so they are written in by hand to exercise the syntax palette.
 */

type Extra = Partial<
  Pick<Token, 'conjForm' | 'reading' | 'dictIdx' | 'posDetail1' | 'baseForm' | 'posRaw'>
>;

const w = (
  surface: string,
  pos: Pos,
  grammar: string[] = [],
  extra: Extra = {},
): Token => ({
  surface,
  pos,
  ...(extra.posRaw !== undefined ? { posRaw: extra.posRaw } : {}),
  posDetail1: extra.posDetail1 ?? '',
  conjType: '',
  conjForm: extra.conjForm ?? '',
  baseForm: extra.baseForm ?? '',
  reading: extra.reading ?? '',
  ...(extra.dictIdx !== undefined ? { dictIdx: extra.dictIdx } : {}),
  ...(grammar.length ? { grammar } : {}),
});

export type PreviewFixture = { tokens: Token[]; sample: Token[] };

// --- Japanese -----------------------------------------------------------------------------

const JA_DICT_ENTRIES: DictEntry[] = [
  { w: '役に立つ', r: 'やくにたつ', lv: 4, p: ['表', '動'], g: [], x: [], id: '1537980' },
];

/**
 * お前を乗せて坂道のぼるって決めたんだ。私だって役に立ちたいんだから！
 *
 * A movie line, tokenized exactly as kuromoji/IPADIC emits it — 役に立ち is one verb, ん is
 * a dependent noun, and both sentences stay verbatim. It covers a dictionary hit (役に立つ, N4),
 * the て-form, the quotative って, 連用形 + たい and the explanatory ん + だ + から, with readings
 * for the ruby. Bunsetsu: お前を / 乗せて / 坂道の / ぼるって / 決めたんだ / 私だって /
 * 役に立ちたいんだから / ！.
 *
 * The line contains none of EXPRESSION_SOURCES' fixed patterns, so the expression mode renders it
 * unmarked; that is the line, not a missing annotation.
 */
const JA_LINE: Token[] = [
  w('お前', 'NOUN', ['syntax.role:object'], {
    posRaw: '名詞', posDetail1: '代名詞', reading: 'オマエ', baseForm: 'お前',
  }),
  w('を', 'ADP', ['syntax.role:object'], {
    posRaw: '助詞', posDetail1: '格助詞', reading: 'ヲ', baseForm: 'を',
  }),
  w('乗せ', 'VERB', ['syntax.role:predicate'], {
    posRaw: '動詞', posDetail1: '自立', conjForm: '連用形', reading: 'ノセ', baseForm: '乗せる',
  }),
  w('て', 'ADP', ['syntax.role:predicate'], {
    posRaw: '助詞', posDetail1: '接続助詞', reading: 'テ', baseForm: 'て',
  }),
  w('坂道', 'NOUN', ['syntax.role:object'], {
    posRaw: '名詞', posDetail1: '一般', reading: 'サカミチ', baseForm: '坂道',
  }),
  w('の', 'ADP', ['syntax.role:object'], {
    posRaw: '助詞', posDetail1: '格助詞', reading: 'ノ', baseForm: 'の',
  }),
  w('ぼる', 'VERB', ['syntax.role:predicate'], {
    posRaw: '動詞', posDetail1: '自立', conjForm: '基本形', reading: 'ボル', baseForm: 'ぼる',
  }),
  w('って', 'ADP', ['syntax.role:predicate'], {
    posRaw: '助詞', posDetail1: '格助詞', reading: 'ッテ', baseForm: 'って',
  }),
  w('決め', 'VERB', ['syntax.role:predicate'], {
    posRaw: '動詞', posDetail1: '自立', conjForm: '連用形', reading: 'キメ', baseForm: '決める',
  }),
  w('た', 'AUX', ['syntax.role:predicate'], {
    posRaw: '助動詞', conjForm: '基本形', reading: 'タ', baseForm: 'た',
  }),
  w('ん', 'NOUN', ['syntax.role:predicate'], {
    posRaw: '名詞', posDetail1: '非自立', reading: 'ン', baseForm: 'ん',
  }),
  w('だ', 'AUX', ['syntax.role:predicate'], {
    posRaw: '助動詞', conjForm: '基本形', reading: 'ダ', baseForm: 'だ',
  }),
  w('。', 'PUNCT', [], { posRaw: '記号', posDetail1: '句点', reading: '。', baseForm: '。' }),
  w('私', 'NOUN', ['syntax.role:subject'], {
    posRaw: '名詞', posDetail1: '代名詞', reading: 'ワタシ', baseForm: '私',
  }),
  w('だって', 'ADP', ['syntax.role:subject'], {
    posRaw: '助詞', posDetail1: '副助詞', reading: 'ダッテ', baseForm: 'だって',
  }),
  w('役に立ち', 'VERB', ['syntax.role:predicate'], {
    posRaw: '動詞', posDetail1: '自立', conjForm: '連用形', reading: 'ヤクニタチ',
    baseForm: '役に立つ', dictIdx: 0,
  }),
  w('たい', 'AUX', ['syntax.role:predicate'], {
    posRaw: '助動詞', conjForm: '基本形', reading: 'タイ', baseForm: 'たい',
  }),
  w('ん', 'NOUN', ['syntax.role:predicate'], {
    posRaw: '名詞', posDetail1: '非自立', reading: 'ン', baseForm: 'ん',
  }),
  w('だ', 'AUX', ['syntax.role:predicate'], {
    posRaw: '助動詞', conjForm: '基本形', reading: 'ダ', baseForm: 'だ',
  }),
  w('から', 'ADP', ['syntax.role:adverbial'], {
    posRaw: '助詞', posDetail1: '接続助詞', reading: 'カラ', baseForm: 'から',
  }),
  w('！', 'PUNCT', [], { posRaw: '記号', posDetail1: '一般', reading: '！', baseForm: '！' }),
];

/** Extra material for the palette swatches, which need groups the preview line does not cover. */
const JA_SAMPLE_TAIL: Token[] = [
  w('ああ', 'INTJ'),
  w('、', 'PUNCT'),
  w('しかし', 'CCONJ'),
  w('とても', 'ADV'),
  w('静か', 'NOUN', [], { posDetail1: '形容動詞語幹' }),
  w('本', 'NOUN'),
  w('を', 'ADP'),
  w('読んだ', 'VERB', [], { conjForm: '連用タ接続' }),
];

// --- English ------------------------------------------------------------------------------

const EN_DICT_ENTRIES: DictEntry[] = [
  {
    w: 'offer',
    r: '',
    lv: 0,
    p: ['NOUN'],
    g: [],
    x: [],
    id: 'offer',
    lang: 'en',
    ipa: '/ˈɒfə(r)/',
    tags: ['cet4'],
  },
];

const S = (): Token => w(' ', 'SYM');

/**
 * I'm gonna make him an offer he can't refuse.
 *
 * A contracted auxiliary, the reduced future `gonna`, a determiner-led object and a relative
 * clause with a negated modal, two chunks (`gonna make`, `an offer`), an exam word and every POS
 * group the renderer colours. Spaces are tokens, as the English segmenter emits them.
 */
const EN_LINE: Token[] = [
  w("I'm", 'AUX', ['syntax.role:subject'], { baseForm: 'be' }),
  S(),
  w('gonna', 'AUX', ['syntax.role:predicate'], { baseForm: 'gonna' }),
  S(),
  w('make', 'VERB', ['syntax.role:predicate'], { baseForm: 'make' }),
  S(),
  w('him', 'PRON', ['syntax.role:object'], { baseForm: 'him' }),
  S(),
  w('an', 'DET', ['syntax.role:attributive'], { baseForm: 'an' }),
  S(),
  w('offer', 'NOUN', ['syntax.role:object'], { baseForm: 'offer', dictIdx: 0 }),
  S(),
  w('he', 'PRON', ['syntax.role:subject'], { baseForm: 'he' }),
  S(),
  w("can't", 'AUX', ['syntax.role:predicate'], { baseForm: 'can' }),
  S(),
  w('refuse', 'VERB', ['syntax.role:predicate'], { baseForm: 'refuse' }),
  w('.', 'PUNCT'),
];

const EN_SAMPLE_TAIL: Token[] = [
  S(),
  w('but', 'CCONJ', [], { baseForm: 'but' }),
  S(),
  w('wow', 'INTJ', [], { baseForm: 'wow' }),
  S(),
  w('very', 'ADV', [], { baseForm: 'very' }),
  S(),
  w('quickly', 'ADV', [], { baseForm: 'quickly' }),
  S(),
  w('London', 'PROPN', [], { baseForm: 'London' }),
  S(),
  w('three', 'NUM', [], { baseForm: 'three' }),
  S(),
  w('must', 'AUX', [], { baseForm: 'must' }),
];

// --- Thai ---------------------------------------------------------------------------------

/**
 * ภาพในอดีตจริง ๆ ไม่เคยจากเราไปไหน (the image of the past never really leaves us).
 *
 * Thai writes without spaces except around the ๆ repetition mark, so those two spaces are tokens
 * of their own. The negation and the past-experience marker stay in the predicate.
 */
const TH_LINE: Token[] = [
  w('ภาพ', 'NOUN', ['syntax.role:topic'], { baseForm: 'ภาพ' }),
  w('ใน', 'ADP', ['syntax.role:modifier'], { baseForm: 'ใน' }),
  w('อดีต', 'NOUN', ['syntax.role:modifier'], { baseForm: 'อดีต' }),
  w('จริง', 'ADV', ['syntax.role:adverbial'], { baseForm: 'จริง' }),
  w(' ', 'SYM'),
  w('ๆ', 'PUNCT', ['syntax.role:adverbial']),
  w(' ', 'SYM'),
  w('ไม่', 'PART', ['syntax.role:predicate'], { baseForm: 'ไม่' }),
  w('เคย', 'AUX', ['syntax.role:predicate'], { baseForm: 'เคย' }),
  w('จาก', 'ADP', ['syntax.role:adverbial'], { baseForm: 'จาก' }),
  w('เรา', 'PRON', ['syntax.role:object'], { baseForm: 'เรา' }),
  w('ไป', 'VERB', ['syntax.role:predicate'], { baseForm: 'ไป' }),
  w('ไหน', 'PRON', ['syntax.role:adverbial'], { baseForm: 'ไหน' }),
];

const TH_SAMPLE_TAIL: Token[] = [
  w('แต่', 'CCONJ', [], { baseForm: 'แต่' }),
  w('มาก', 'ADV', [], { baseForm: 'มาก' }),
  w('สวย', 'ADJ', [], { baseForm: 'สวย' }),
  w('โอ้', 'INTJ', [], { baseForm: 'โอ้' }),
  w('สาม', 'NUM', [], { baseForm: 'สาม' }),
  w('กรุงเทพ', 'PROPN', [], { baseForm: 'กรุงเทพ' }),
  w('แล้ว', 'ADV', [], { baseForm: 'แล้ว' }),
];

// --- Factory ------------------------------------------------------------------------------

type Spec = {
  line: Token[];
  entries: DictEntry[];
  tail: Token[];
};

const SPECS: Record<string, Spec> = {
  ja: { line: JA_LINE, entries: JA_DICT_ENTRIES, tail: JA_SAMPLE_TAIL },
  en: { line: EN_LINE, entries: EN_DICT_ENTRIES, tail: EN_SAMPLE_TAIL },
  th: { line: TH_LINE, entries: [], tail: TH_SAMPLE_TAIL },
};

/**
 * Annotated preview and palette sample for one language. `bands` is the same selection the
 * dictionary page edits, so unchecking a band makes its highlight disappear here too; omitting it
 * uses the pack's default (every declared band on).
 */
export const previewFor = (language: LanguageId, bands?: BandSelection): PreviewFixture => {
  const spec = SPECS[language] ?? SPECS.ja;
  const selection = bands ?? defaultBandSelection(resolveLanguage(language).bands);
  const tokens = annotateLevels(
    annotateExpressions(annotateChunks(spec.line, language), language),
    spec.entries,
    selection,
    language,
  );
  return { tokens, sample: [...tokens, ...spec.tail] };
};
