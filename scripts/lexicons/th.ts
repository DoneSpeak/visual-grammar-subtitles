/**
 * Thai lexicon entries from two sources:
 *
 *   1. `data/dictionary/th.curated.yaml` — human-reviewable Chinese glosses. This is the word
 *      list: only reviewed (`reviewStatus: approved`) entries are published.
 *   2. kaikki.org Thai JSONL — Wiktionary-derived English glosses, POS and IPA that enrich (and,
 *      with `breadth`, extend) the curated list.
 *
 * Pure functions only; the CLI owns downloads and file IO.
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
  lang?: string;
};

export type CuratedEntry = {
  word: string;
  zh: string;
  en?: string;
  pos?: string;
  ipa?: string;
  reviewStatus?: string;
};

export type KaikkiEntry = {
  word?: string;
  lang?: string;
  lang_code?: string;
  pos?: string;
  senses?: { glosses?: string[] }[];
  sounds?: { ipa?: string }[];
};

/** Also accepts UPOS tags written directly in the curated YAML (`CCONJ`, `SCONJ`, …). */
const POS_MAP: Record<string, string> = {
  noun: 'NOUN',
  'proper noun': 'PROPN',
  name: 'PROPN',
  verb: 'VERB',
  adj: 'ADJ',
  adjective: 'ADJ',
  adv: 'ADV',
  adverb: 'ADV',
  pron: 'PRON',
  pronoun: 'PRON',
  det: 'DET',
  determiner: 'DET',
  num: 'NUM',
  numeral: 'NUM',
  particle: 'PART',
  part: 'PART',
  conj: 'CCONJ',
  conjunction: 'CCONJ',
  cconj: 'CCONJ',
  sconj: 'SCONJ',
  subordinator: 'SCONJ',
  aux: 'AUX',
  propn: 'PROPN',
  punct: 'PUNCT',
  sym: 'SYM',
  x: 'X',
  prep: 'ADP',
  postp: 'ADP',
  adp: 'ADP',
  intj: 'INTJ',
  interj: 'INTJ',
};

const THAI_WORD = /^[\p{Script=Thai}]+$/u;

/** Thai marks can arrive decomposed; the runtime compares NFC strings. */
export const normalizeThai = (value: string): string => value.normalize('NFC').trim();

export const posOf = (raw: string | undefined): string | undefined =>
  raw ? POS_MAP[raw.trim().toLowerCase()] : undefined;

/** Flatten every sense's glosses, first occurrence wins. */
export const glossesOf = (entry: KaikkiEntry, limit = 3): string[] => {
  const seen = new Set<string>();
  for (const sense of entry.senses ?? []) {
    for (const gloss of sense.glosses ?? []) {
      const text = gloss.trim();
      if (text) seen.add(text);
    }
  }
  return [...seen].slice(0, limit);
};

export const ipaOf = (entry: KaikkiEntry): string | undefined =>
  (entry.sounds ?? []).map((sound) => sound.ipa?.trim()).find((ipa) => ipa && ipa !== '-');

const isThaiKaikki = (entry: KaikkiEntry): boolean =>
  (entry.lang === 'Thai' || entry.lang_code === 'th') && Boolean(entry.word && THAI_WORD.test(entry.word));

/** Tolerant JSONL reader: one malformed line must not fail a 40MB build. */
export const parseKaikkiJsonl = (text: string): KaikkiEntry[] => {
  const entries: KaikkiEntry[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as KaikkiEntry;
      if (isThaiKaikki(parsed)) entries.push(parsed);
    } catch {
      // Skip the line; the report counts how many survived.
    }
  }
  return entries;
};

/** One enriched record per word; Kaikki repeats a word for each POS. */
const groupKaikki = (rows: KaikkiEntry[]): Map<string, DictEntry> => {
  const byWord = new Map<string, DictEntry>();
  for (const row of rows) {
    const word = normalizeThai(row.word!);
    const glosses = glossesOf(row);
    const pos = posOf(row.pos);
    const ipa = ipaOf(row);
    const current = byWord.get(word);
    if (!current) {
      byWord.set(word, {
        w: word,
        r: '',
        lv: 0,
        p: pos ? [pos] : [],
        g: glosses,
        x: [],
        id: `th:${word}`,
        ...(ipa ? { ipa } : {}),
        lang: 'th',
      });
      continue;
    }
    if (!current.p.length && pos) current.p = [pos];
    if (!current.ipa && ipa) current.ipa = ipa;
    for (const gloss of glosses) {
      if (current.g.length < 3 && !current.g.includes(gloss)) current.g.push(gloss);
    }
  }
  return byWord;
};

/**
 * Curated entries define the published word list. `breadth` adds every Thai Kaikki headword,
 * which trades bundle size for coverage; the default keeps the bundle small and reviewed.
 */
export const toThaiEntries = (
  curated: CuratedEntry[],
  kaikki: KaikkiEntry[],
  breadth = false,
): DictEntry[] => {
  const enriched = groupKaikki(kaikki);
  const byWord = new Map<string, DictEntry>();

  for (const row of curated) {
    const word = normalizeThai(row.word ?? '');
    if (!THAI_WORD.test(word)) continue;
    if (row.reviewStatus !== 'approved') continue;
    const zh = (row.zh ?? '').trim();
    if (!zh) continue;
    const source = enriched.get(word);
    const pos = posOf(row.pos) ?? source?.p[0];
    const ipa = (typeof row.ipa === 'string' ? row.ipa.trim() : '') || source?.ipa;
    // YAML folds unquoted `true`/`false` into booleans; only strings are glosses.
    const en = typeof row.en === 'string' ? row.en.trim() : undefined;
    const g = en ? [en] : (source?.g ?? []);

    const existing = byWord.get(word);
    if (!existing) {
      byWord.set(word, {
        w: word,
        r: '',
        lv: 0,
        p: pos ? [pos] : [],
        g,
        x: [],
        id: `th:${word}`,
        z: [zh],
        ...(ipa ? { ipa } : {}),
        lang: 'th',
      });
      continue;
    }
    // The same headword can carry several senses (ผม "I" / "hair", คืน "night" / "return").
    if (!existing.z!.includes(zh)) existing.z!.push(zh);
    if (pos && !existing.p.includes(pos)) existing.p.push(pos);
    if (!existing.ipa && ipa) existing.ipa = ipa;
    for (const gloss of g) {
      if (existing.g.length < 3 && !existing.g.includes(gloss)) existing.g.push(gloss);
    }
  }

  const entries = [...byWord.values()];
  const seen = new Set(byWord.keys());

  if (breadth) {
    for (const entry of enriched.values()) {
      if (seen.has(entry.w) || !entry.g.length) continue;
      entries.push(entry);
      seen.add(entry.w);
    }
  }

  // Code-point order, not `localeCompare`: ICU versions differ and the committed JSON must be stable.
  return entries.sort((a, b) => (a.w < b.w ? -1 : a.w > b.w ? 1 : 0));
};
