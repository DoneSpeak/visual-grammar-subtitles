/**
 * ECDICT CSV → bundled English lexicon entries.
 *
 * Source columns: word,phonetic,definition,translation,pos,collins,oxford,tag,bnc,frq,exchange,detail,audio
 * Pure functions only: the CLI (`scripts/build-lexicon.ts`) owns downloads and file IO, so this
 * module can be unit-tested without network access.
 */

export type DictEntry = {
  w: string;
  r: string;
  lv: number;
  p: string[];
  g: string[];
  x: { j: string; e: string }[];
  id: string;
  z?: string[];
  ipa?: string;
  tags?: string[];
  forms?: string[];
  lang?: string;
};

export type RawRow = Record<string, string>;

/**
 * ECDICT exam tags. `zk`/`gk`/`gre` are carried on the entry (so the word is lookup-able) but are
 * not declared as bands in `src/languages/en/bands.ts`, so the options page ignores them.
 */
const TAG_MAP: Record<string, string> = {
  cet4: 'cet4',
  cet6: 'cet6',
  ky: 'kaoyan',
  ielts: 'ielts',
  toefl: 'toefl',
  zk: 'zk',
  gk: 'gk',
  gre: 'gre',
};

/** ECDICT `pos` abbreviations → the shared UPOS skeleton. */
const POS_MAP: Record<string, string> = {
  n: 'NOUN',
  v: 'VERB',
  adj: 'ADJ',
  adv: 'ADV',
  prep: 'ADP',
  pron: 'PRON',
  conj: 'CCONJ',
  sconj: 'SCONJ',
  num: 'NUM',
  art: 'DET',
  det: 'DET',
  int: 'INTJ',
  interj: 'INTJ',
  aux: 'AUX',
  modal: 'AUX',
  part: 'PART',
  particle: 'PART',
  abbr: 'X',
};

/** Single ASCII headwords only: the tokenizer never produces a key for a phrase. */
const HEADWORD = /^[A-Za-z][A-Za-z'-]*$/;

/**
 * Frequency cutoff for words without an exam tag or the Oxford flag. The local parser needs the
 * common verbs and nouns an exam word list skips; `bnc`/`frq` are ECDICT's corpus ranks, lower is
 * more common.
 */
export const FREQUENCY_LIMIT = 20_000;

/** Lowest non-zero corpus rank carried by the row, or `undefined` when it has none. */
export const frequencyOf = (row: RawRow): number | undefined => {
  const ranks = [row.bnc, row.frq]
    .map((value) => Number.parseInt((value ?? '').trim(), 10))
    .filter((value) => Number.isFinite(value) && value > 0);
  return ranks.length ? Math.min(...ranks) : undefined;
};

const lines = (value: string | undefined, limit: number): string[] =>
  (value ?? '')
    // ECDICT writes line breaks either literally or escaped; the card must not show `\n`.
    .replace(/\\n/g, '\n')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, limit);

/** `n:68/v:32` → `NOUN`; unknown abbreviations are dropped rather than guessed. */
export const posOf = (raw: string | undefined): string | undefined => {
  const first = (raw ?? '').split('/')[0]?.split(':')[0]?.trim().toLowerCase();
  if (!first) return undefined;
  return POS_MAP[first.replace(/\.$/, '')];
};

/** ECDICT leaves `pos` empty off the exam list; those rows carry a WordNet marker instead. */
const WORDNET_POS: Record<string, string> = {
  n: 'NOUN',
  v: 'VERB',
  a: 'ADJ',
  s: 'ADJ',
  r: 'ADV',
};

/** `v move fast` / `n. a thing` → `VERB` / `NOUN`; only the first line's marker counts. */
export const posFromDefinition = (definition: string | undefined): string | undefined => {
  const first = (definition ?? '').replace(/\\n/g, '\n').split(/\r?\n/)[0]?.trim() ?? '';
  const marker = /^(n|v|a|s|r)\.?\s/.exec(first)?.at(1);
  return marker ? WORDNET_POS[marker] : undefined;
};

/** Past tense, participle or third person in `exchange` proves the word is (also) a verb. */
const VERB_FORM_KEYS = new Set(['p', 'd', 'i', '3']);

export const verbFromExchange = (exchange: string | undefined): string | undefined =>
  (exchange ?? '').split('/').some((part) => {
    const separator = part.indexOf(':');
    if (separator < 0 || !VERB_FORM_KEYS.has(part.slice(0, separator).trim())) return false;
    return part.slice(separator + 1).trim() !== '';
  })
    ? 'VERB'
    : undefined;

/**
 * ECDICT `exchange` is `p:ran/d:run/i:running/3:runs`; only those keys are inflected forms.
 * `0:` marks an inflected row's lemma and `1:` a derived form, so neither belongs in `forms`.
 */
const FORM_KEYS = new Set(['p', 'd', 'i', '3', 'r', 't', 's']);

export const formsOf = (raw: string | undefined, headword: string): string[] => {
  const seen = new Set<string>();
  for (const part of (raw ?? '').split('/')) {
    const separator = part.indexOf(':');
    if (separator < 0 || !FORM_KEYS.has(part.slice(0, separator).trim())) continue;
    const value = part.slice(separator + 1).trim();
    if (!value || value === '-' || value.includes(' ')) continue;
    if (value.toLowerCase() === headword.toLowerCase()) continue;
    if (!HEADWORD.test(value)) continue;
    seen.add(value);
  }
  return [...seen].slice(0, 8);
};

export const tagsOf = (raw: string | undefined): string[] => {
  const tags = new Set<string>();
  for (const tag of (raw ?? '').toLowerCase().split(/\s+/)) {
    const mapped = TAG_MAP[tag];
    if (mapped) tags.add(mapped);
  }
  return [...tags];
};

/**
 * `null` means "not a headword this bundle should carry". Inflected rows (`exchange` carrying a
 * `0:` lemma pointer) are skipped: the tokenizer reaches them through the lemma's `forms`.
 */
export const toEntry = (row: RawRow): DictEntry | null => {
  const word = (row.word ?? '').trim();
  if (!HEADWORD.test(word)) return null;
  // `0:` points at the lemma. A pointer to the word itself (e.g. `run` → `0:run`) is not an
  // inflected row; anything else means the tokenizer reaches this word through the lemma's forms.
  const lemma = (row.exchange ?? '')
    .split('/')
    .map((part) => part.trim())
    .find((part) => part.startsWith('0:'))
    ?.slice(2)
    .trim();
  if (lemma && lemma.toLowerCase() !== word.toLowerCase()) return null;

  const tags = tagsOf(row.tag);
  const oxford = (row.oxford ?? '').trim() === '1';
  const frequencyOnly = !tags.length && !oxford;
  const rank = frequencyOf(row);
  if (frequencyOnly && (rank === undefined || rank > FREQUENCY_LIMIT)) return null;

  const g = lines(row.definition, 3);
  const z = lines(row.translation, 3);
  if (!g.length && !z.length) return null;

  // ECDICT's `pos` column is sparse even for exam words. Verb inflections are the most reliable
  // signal, then the WordNet gloss marker; the parser fails harder without verbs than without nouns.
  const columnPos = posOf(row.pos);
  const pos =
    columnPos && columnPos !== 'X'
      ? columnPos
      : (verbFromExchange(row.exchange) ?? posFromDefinition(row.definition));
  // A frequency-only entry is there to feed the parser, which cannot use a POS-less word.
  if (frequencyOnly && !pos) return null;
  const ipa = (row.phonetic ?? '').trim();
  const forms = formsOf(row.exchange, word);

  return {
    w: word,
    r: '',
    lv: 0,
    p: pos ? [pos] : [],
    g,
    x: [],
    id: `en:${word.toLowerCase()}`,
    ...(z.length ? { z } : {}),
    ...(ipa && ipa !== '[]' ? { ipa } : {}),
    ...(tags.length ? { tags } : {}),
    ...(forms.length ? { forms } : {}),
    lang: 'en',
  };
};

/** Row-level stats the CLI prints after a build. */
export const summarize = (entries: DictEntry[]): Record<string, number> => {
  const counts: Record<string, number> = {
    entries: entries.length,
    untagged: 0,
    withIpa: 0,
    withForms: 0,
  };
  for (const entry of entries) {
    if (!entry.tags?.length) counts.untagged++;
    if (entry.ipa) counts.withIpa++;
    if (entry.forms?.length) counts.withForms++;
  }
  return counts;
};
