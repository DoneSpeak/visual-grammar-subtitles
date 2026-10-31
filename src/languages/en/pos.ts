import { posGroupForPos } from '@/shared/posGroup';
import { isPos, type Pos, type PosGroup, type Token } from '@/shared/types';

/**
 * English local POS rules.
 *
 * The design goal is "never guess a part of speech you cannot support": closed-class words are
 * listed explicitly, irregular verb forms come from a table, and suffix rules only fire on
 * endings that are reliable enough to justify a colour. Everything else is `X` until the lexicon
 * or the remote analyser says otherwise.
 */

export type Tagged = { pos: Pos; baseForm?: string; morph?: Record<string, string> };

const words = (text: string): string[] => text.split(/\s+/).filter(Boolean);

const entry = (pos: Pos, extra: Partial<Tagged> = {}): Tagged => ({ pos, ...extra });

const mapWords = (text: string, value: Tagged): Map<string, Tagged> =>
  new Map(words(text).map((word) => [word, value]));

const MERGE = (maps: Map<string, Tagged>[]): Map<string, Tagged> => {
  const merged = new Map<string, Tagged>();
  for (const map of maps) for (const [word, value] of map) if (!merged.has(word)) merged.set(word, value);
  return merged;
};

const AUX = mapWords(
  'be am is are was were been being have has had having do does did done doing ' +
    'will would shall should can could may might must ought',
  entry('AUX'),
);

/** Inflected auxiliaries still lemmatize to the form a dictionary would carry. */
const AUX_LEMMAS: Record<string, string> = {
  am: 'be',
  is: 'be',
  are: 'be',
  was: 'be',
  were: 'be',
  been: 'be',
  being: 'be',
  has: 'have',
  had: 'have',
  having: 'have',
  does: 'do',
  did: 'do',
  done: 'do',
  doing: 'do',
};
for (const [word, baseForm] of Object.entries(AUX_LEMMAS)) AUX.set(word, entry('AUX', { baseForm }));

/** Contracted auxiliaries keep a single surface token in `Intl.Segmenter`. */
const CONTRACTED_AUX: Map<string, Tagged> = new Map([
  ["i'm", entry('AUX', { baseForm: 'be' })],
  ["you're", entry('AUX', { baseForm: 'be' })],
  ["he's", entry('AUX', { baseForm: 'be' })],
  ["she's", entry('AUX', { baseForm: 'be' })],
  ["it's", entry('AUX', { baseForm: 'be' })],
  ["we're", entry('AUX', { baseForm: 'be' })],
  ["they're", entry('AUX', { baseForm: 'be' })],
  ["that's", entry('AUX', { baseForm: 'be' })],
  ["there's", entry('AUX', { baseForm: 'be' })],
  ["here's", entry('AUX', { baseForm: 'be' })],
  ["what's", entry('AUX', { baseForm: 'be' })],
  ["i've", entry('AUX', { baseForm: 'have' })],
  ["you've", entry('AUX', { baseForm: 'have' })],
  ["we've", entry('AUX', { baseForm: 'have' })],
  ["they've", entry('AUX', { baseForm: 'have' })],
  ["i'll", entry('AUX', { baseForm: 'will' })],
  ["you'll", entry('AUX', { baseForm: 'will' })],
  ["he'll", entry('AUX', { baseForm: 'will' })],
  ["she'll", entry('AUX', { baseForm: 'will' })],
  ["we'll", entry('AUX', { baseForm: 'will' })],
  ["they'll", entry('AUX', { baseForm: 'will' })],
  ["i'd", entry('AUX', { baseForm: 'would' })],
  ["you'd", entry('AUX', { baseForm: 'would' })],
  ["he'd", entry('AUX', { baseForm: 'would' })],
  ["she'd", entry('AUX', { baseForm: 'would' })],
  ["we'd", entry('AUX', { baseForm: 'would' })],
  ["they'd", entry('AUX', { baseForm: 'would' })],
  ["let's", entry('VERB', { baseForm: 'let' })],
]);

const DET = mapWords(
  'a an the this that these those my your his her its our their some any no every each either ' +
    'neither another both all few many much such what which whose',
  entry('DET'),
);

const PRON = mapWords(
  'i me you he him she it we us they them myself yourself himself herself itself ourselves ' +
    'yourselves themselves someone somebody something anyone anybody anything everyone everybody ' +
    'everything nobody nothing none who whom whoever whomever',
  entry('PRON'),
);

const ADP = mapWords(
  'of in on at by for with about against between into through during before after above below ' +
    'from over under across along among around behind beyond despite except inside near onto ' +
    'outside past since toward towards upon within without per via than like as up down out off',
  entry('ADP'),
);

const CCONJ = mapWords('and or but nor yet so', entry('CCONJ'));

const SCONJ = mapWords(
  'because although though while whereas unless until if when whenever where wherever whether',
  entry('SCONJ'),
);

const PART = mapWords("not n't to", entry('PART'));

const NUM = mapWords(
  'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen ' +
    'sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety ' +
    'hundred thousand million billion trillion dozen',
  entry('NUM'),
);

const INTJ = mapWords(
  'oh wow hey hi hello yeah yes no okay ok alright ah um uh hmm please thanks thank sorry bye goodbye',
  entry('INTJ'),
);

const CLOSED: Map<string, Tagged> = MERGE([
  CONTRACTED_AUX,
  AUX,
  DET,
  PRON,
  ADP,
  SCONJ,
  CCONJ,
  PART,
  NUM,
  INTJ,
]);

/** Tokens that are also function words; the lexicon must not claim them. */
export const FUNCTION_WORDS: ReadonlySet<string> = new Set([
  'SYM',
  'PUNCT',
  'AUX',
  'ADP',
  'CCONJ',
  'SCONJ',
  'PART',
]);

/** Normalizes the curly apostrophes `Intl.Segmenter` leaves in the surface. */
export const normalizeWord = (surface: string): string =>
  surface.toLowerCase().replace(/[’‘]/g, "'");

/** Closed-class tag for a word, if it is one. */
export const closedClass = (word: string): Tagged | undefined => CLOSED.get(word);

/** Negated contraction → auxiliary base form, e.g. `don't` → `do`, `won't` → `will`. */
export const negatedBase = (word: string): string | undefined => {
  if (word === 'cannot') return 'can';
  if (!word.endsWith("n't")) return undefined;
  const stem = word.slice(0, -3);
  const IRREGULAR: Record<string, string> = {
    ca: 'can',
    wo: 'will',
    sha: 'shall',
    ai: 'be',
    do: 'do',
    does: 'do',
    did: 'do',
    is: 'be',
    are: 'be',
    was: 'be',
    were: 'be',
    have: 'have',
    has: 'have',
    had: 'have',
    could: 'could',
    would: 'would',
    should: 'should',
    must: 'must',
    need: 'need',
    dare: 'dare',
    might: 'might',
  };
  return IRREGULAR[stem] ?? (stem || undefined);
};

const PAST: Record<string, string> = {
  went: 'go', said: 'say', made: 'make', took: 'take', came: 'come', saw: 'see', knew: 'know',
  got: 'get', gave: 'give', found: 'find', thought: 'think', told: 'tell', became: 'become',
  left: 'leave', felt: 'feel', brought: 'bring', began: 'begin', kept: 'keep', held: 'hold',
  wrote: 'write', stood: 'stand', heard: 'hear', meant: 'mean', met: 'meet', ran: 'run',
  paid: 'pay', sat: 'sit', spoke: 'speak', lay: 'lie', led: 'lead', grew: 'grow', lost: 'lose',
  fell: 'fall', sent: 'send', built: 'build', understood: 'understand', drew: 'draw',
  broke: 'break', spent: 'spend', rose: 'rise', drove: 'drive', bought: 'buy', wore: 'wear',
  chose: 'choose', ate: 'eat', won: 'win', sang: 'sing', caught: 'catch', taught: 'teach',
  threw: 'throw', slept: 'sleep', drank: 'drink', flew: 'fly', forgot: 'forget',
  forgave: 'forgive', hid: 'hide', rode: 'ride', sold: 'sell', shook: 'shake', shone: 'shine',
  shot: 'shoot', stole: 'steal', stuck: 'stick', struck: 'strike', swam: 'swim',
  swung: 'swing', tore: 'tear', woke: 'wake',
};

const PARTICIPLE: Record<string, string> = {
  gone: 'go', seen: 'see', taken: 'take', given: 'give', written: 'write', spoken: 'speak',
  broken: 'break', chosen: 'choose', eaten: 'eat', fallen: 'fall', forgotten: 'forget',
  known: 'know', shown: 'show', driven: 'drive', grown: 'grow', thrown: 'throw', flown: 'fly',
  drawn: 'draw', worn: 'wear', torn: 'tear', stolen: 'steal', shaken: 'shake', hidden: 'hide',
  ridden: 'ride', risen: 'rise', sung: 'sing', swum: 'swim', begun: 'begin', drunk: 'drink',
  rung: 'ring', sprung: 'spring', sunk: 'sink',
};

/**
 * Irregular forms the tokenizer can confirm without a lexicon. Copulas (`been`, `done`) are
 * deliberately absent: the closed-class AUX table claims them first.
 */
export const irregularForm = (
  word: string,
): { baseForm: string; morph: Record<string, string> } | undefined => {
  if (PAST[word]) return { baseForm: PAST[word], morph: { Tense: 'Past' } };
  if (PARTICIPLE[word]) return { baseForm: PARTICIPLE[word], morph: { VerbForm: 'Part' } };
  return undefined;
};

const LY_EXCEPTIONS = new Set([
  'apply', 'ally', 'assembly', 'belly', 'comply', 'family', 'fly', 'holy', 'imply', 'italy',
  'jelly', 'july', 'melancholy', 'monopoly', 'multiply', 'only', 'rely', 'reply', 'silly',
  'supply', 'ugly',
]);

const ED_EXCEPTIONS = new Set([
  'bleed', 'breed', 'creed', 'deed', 'feed', 'freed', 'greed', 'indeed', 'need', 'proceed',
  'seed', 'speed', 'succeed', 'exceed', 'weed',
]);

const NOUN_ENDINGS = /(?:tion|sion|ness|ity|ment|ance|ence|ship|hood|ism|ist)$/;
const ADJ_ENDINGS = /(?:ous|ive|able|ible|ful|less|ic)$/;

/**
 * Suffix fallback, applied only after the lexicon has had its say. `previousPos` is the POS of
 * the preceding word token, skipping whitespace; it lets `-ing` become a verb only in a clearly
 * auxiliary context, which is the one case the ending alone cannot decide.
 */
export const suffixTag = (
  word: string,
  previousPos?: Pos,
): { pos: Pos; morph?: Record<string, string> } | undefined => {
  if (word.length > 5 && word.endsWith('ing')) {
    return previousPos === 'AUX'
      ? { pos: 'VERB', morph: { VerbForm: 'Ger' } }
      : undefined;
  }
  if (word.length > 4 && word.endsWith('ed') && !ED_EXCEPTIONS.has(word)) {
    return { pos: 'VERB', morph: { Tense: 'Past' } };
  }
  if (word.length > 3 && word.endsWith('ly') && !LY_EXCEPTIONS.has(word)) {
    return { pos: 'ADV' };
  }
  if (NOUN_ENDINGS.test(word)) return { pos: 'NOUN' };
  if (ADJ_ENDINGS.test(word)) return { pos: 'ADJ' };
  return undefined;
};

/** Candidate lemmas, surface first, then the stems a plural/tense/gerund ending may hide. */
export const lemmaCandidates = (word: string): string[] => {
  const candidates = new Set<string>([word]);
  if (word.length > 3 && word.endsWith('ies')) candidates.add(`${word.slice(0, -3)}y`);
  if (word.length > 3 && word.endsWith('es')) candidates.add(word.slice(0, -2));
  if (word.length > 2 && word.endsWith('s') && !/(?:ss|us|is)$/.test(word)) {
    candidates.add(word.slice(0, -1));
  }
  if (word.length > 3 && word.endsWith('ied')) candidates.add(`${word.slice(0, -3)}y`);
  if (word.length > 3 && word.endsWith('ed')) {
    candidates.add(word.slice(0, -2));
    if (/([b-df-hj-np-tv-z])\1ed$/.test(word)) candidates.add(word.slice(0, -3));
  }
  if (word.length > 4 && word.endsWith('ing')) {
    candidates.add(word.slice(0, -3));
    candidates.add(`${word.slice(0, -3)}e`);
    if (/([b-df-hj-np-tv-z])\1ing$/.test(word)) candidates.add(word.slice(0, -4));
  }
  return [...candidates];
};

/** Penn Treebank / Universal tag → the shared POS skeleton. */
const RAW_POS: Record<string, Pos> = {
  NN: 'NOUN', NNS: 'NOUN', NNP: 'PROPN', NNPS: 'PROPN', PRP: 'PRON', PRP$: 'PRON',
  VB: 'VERB', VBD: 'VERB', VBG: 'VERB', VBN: 'VERB', VBP: 'VERB', VBZ: 'VERB',
  JJ: 'ADJ', JJR: 'ADJ', JJS: 'ADJ', RB: 'ADV', RBR: 'ADV', RBS: 'ADV', WRB: 'ADV',
  IN: 'ADP', DT: 'DET', CC: 'CCONJ', CD: 'NUM', MD: 'AUX', TO: 'PART', UH: 'INTJ',
  WP: 'PRON', WDT: 'DET', POS: 'PART', EX: 'PRON', RP: 'PART', PDT: 'DET', FW: 'X',
};

export const toPos = (raw: string): Pos => {
  const tag = raw.trim();
  if (isPos(tag)) return tag;
  return RAW_POS[tag] ?? RAW_POS[tag.toUpperCase()] ?? 'X';
};

export const posGroup = (token: Token): PosGroup => posGroupForPos(token.pos);

/** Past tense, gerund/participle, or an irregular stem that differs from the surface. */
export const isInflected = (token: Token): boolean => {
  if (token.morph?.Tense || token.morph?.VerbForm) return true;
  return token.pos === 'VERB' && normalizeWord(token.surface) !== token.baseForm;
};
