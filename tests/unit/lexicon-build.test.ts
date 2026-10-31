import { describe, expect, it } from 'vitest';

import {
  FREQUENCY_LIMIT,
  formsOf,
  frequencyOf,
  posFromDefinition,
  posOf,
  tagsOf,
  toEntry,
  verbFromExchange,
} from '../../scripts/lexicons/en.ts';
import { parseCsv } from '../../scripts/lexicons/parse-csv.ts';
import { toThaiEntries, type CuratedEntry, type KaikkiEntry } from '../../scripts/lexicons/th.ts';

const row = (extra: Record<string, string> = {}): Record<string, string> => ({
  word: 'run',
  phonetic: '/rʌn/',
  definition: 'move fast\noperate',
  translation: '跑\n经营',
  pos: 'v:80/n:20',
  tag: 'cet4 ky gre',
  oxford: '1',
  exchange: 'p:ran/d:run/i:running/3:runs',
  ...extra,
});

describe('ECDICT mapping', () => {
  it('maps columns onto the shared entry contract', () => {
    const entry = toEntry(row())!;
    expect(entry).toMatchObject({
      w: 'run',
      ipa: '/rʌn/',
      g: ['move fast', 'operate'],
      z: ['跑', '经营'],
      p: ['VERB'],
      tags: ['cet4', 'kaoyan', 'gre'],
      forms: ['ran', 'running', 'runs'],
      id: 'en:run',
      lang: 'en',
    });
  });

  it('keeps every exam tag, including ones that are not declared bands', () => {
    expect(tagsOf('cet6 ielts toefl zk gk gre')).toEqual(['cet6', 'ielts', 'toefl', 'zk', 'gk', 'gre']);
    expect(tagsOf('unknown')).toEqual([]);
  });

  it('accepts oxford-only words and rejects words with neither tag nor oxford', () => {
    expect(toEntry(row({ tag: '', oxford: '0' }))).toBeNull();
    expect(toEntry(row({ tag: '', oxford: '1' }))?.tags).toBeUndefined();
  });

  it('admits untagged rows by corpus frequency only', () => {
    const frequent = row({ tag: '', oxford: '0', bnc: '500', frq: '0' });
    expect(toEntry(frequent)?.p).toEqual(['VERB']);
    expect(toEntry(row({ tag: '', oxford: '0', bnc: String(FREQUENCY_LIMIT + 1), frq: '0' }))).toBeNull();
    expect(frequencyOf({ bnc: '900', frq: '300' })).toBe(300);
    expect(frequencyOf({ bnc: '0', frq: '' })).toBeUndefined();
  });

  it('rejects frequency-only rows whose POS cannot be mapped', () => {
    expect(
      toEntry(row({ tag: '', oxford: '0', bnc: '500', pos: 'abbr:1', exchange: '', definition: 'move fast' })),
    ).toBeNull();
  });

  it('reads POS from the WordNet marker when the `pos` column is empty', () => {
    expect(posFromDefinition('v move fast\\noperate')).toBe('VERB');
    expect(posFromDefinition('n. a thing')).toBe('NOUN');
    expect(posFromDefinition('s difficult')).toBe('ADJ');
    expect(posFromDefinition('r competently')).toBe('ADV');
    expect(posFromDefinition('')).toBeUndefined();
    const entry = toEntry(row({ tag: '', oxford: '0', bnc: '500', pos: '', definition: 'v move fast' }));
    expect(entry?.p).toEqual(['VERB']);
    expect(
      toEntry(row({ tag: '', oxford: '0', bnc: '500', pos: '', exchange: '', definition: 'move fast' })),
    ).toBeNull();
  });

  it('prefers verb inflections over the gloss marker', () => {
    expect(verbFromExchange('p:ran/d:run/i:running/3:runs')).toBe('VERB');
    expect(verbFromExchange('s:rules')).toBeUndefined();
    expect(verbFromExchange('')).toBeUndefined();
    const entry = toEntry(row({ tag: '', oxford: '0', bnc: '500', pos: '', definition: 'n. an offer', exchange: 'p:offered/i:offering' }));
    expect(entry?.p).toEqual(['VERB']);
  });

  it('drops inflected rows that point at a lemma', () => {
    expect(toEntry(row({ word: 'went', exchange: '0:go/1:goes' }))).toBeNull();
  });

  it('keeps a lemma row that points at itself', () => {
    const entry = toEntry(row({ word: 'run', exchange: 'p:ran/i:running/d:run/0:run/1:d/3:runs' }));
    expect(entry?.p).toEqual(['VERB']);
    expect(entry?.forms).toEqual(['ran', 'running', 'runs']);
  });

  it('splits literal `\\n` in ECDICT gloss fields', () => {
    const entry = toEntry(row({ definition: 'move fast\\noperate' }))!;
    expect(entry.g).toEqual(['move fast', 'operate']);
  });

  it('drops phrases, empty glosses and the literal `[]` phonetic', () => {
    expect(toEntry(row({ word: 'give up' }))).toBeNull();
    expect(toEntry(row({ definition: '', translation: '' }))).toBeNull();
    expect(toEntry(row({ phonetic: '[]' }))?.ipa).toBeUndefined();
  });

  it('parses POS and exchange defensively', () => {
    expect(posOf('n:68/v:32')).toBe('NOUN');
    expect(posOf('')).toBeUndefined();
    expect(formsOf('p:-/d:do/i:doing/s:does', 'do')).toEqual(['doing', 'does']);
    expect(formsOf('0:go/1:goes/d:gone', 'went')).toEqual(['gone']);
  });

  it('parses quoted CSV fields with commas and newlines', () => {
    const rows = parseCsv('word,definition\nrun,"move fast, quickly\noperate"');
    expect(rows).toEqual([{ word: 'run', definition: 'move fast, quickly\noperate' }]);
    expect(parseCsv('﻿word,definition\nrun,move')[0]).toEqual({ word: 'run', definition: 'move' });
  });
});

describe('Thai mapping', () => {
  const curated = (extra: Partial<CuratedEntry> = {}): CuratedEntry => ({
    word: 'กิน',
    zh: '吃',
    pos: 'VERB',
    reviewStatus: 'approved',
    ...extra,
  });

  const kaikki = (extra: Partial<KaikkiEntry> = {}): KaikkiEntry => ({
    word: 'กิน',
    lang: 'Thai',
    lang_code: 'th',
    pos: 'verb',
    senses: [{ glosses: ['to eat'] }],
    sounds: [{ ipa: '/kin/' }],
    ...extra,
  });

  it('publishes approved curated entries and skips drafts', () => {
    const entries = toThaiEntries(
      [curated(), curated({ word: 'ดื่ม', zh: '喝', reviewStatus: 'draft' })],
      [],
    );
    expect(entries.map((entry) => entry.w)).toEqual(['กิน']);
    expect(entries[0]).toMatchObject({ z: ['吃'], p: ['VERB'], id: 'th:กิน', lang: 'th' });
  });

  it('merges duplicate curated senses into one entry', () => {
    const entries = toThaiEntries(
      [curated(), curated({ word: 'คืน', zh: '归还', pos: 'VERB' }), curated({ word: 'คืน', zh: '夜', pos: 'NOUN' })],
      [],
    );
    const night = entries.find((entry) => entry.w === 'คืน')!;
    expect(night.z).toEqual(['归还', '夜']);
    expect(night.p).toEqual(['VERB', 'NOUN']);
  });

  it('takes English glosses, POS and IPA from Kaikki when curated omits them', () => {
    const [entry] = toThaiEntries([curated({ pos: undefined })], [kaikki()]);
    expect(entry.g).toEqual(['to eat']);
    expect(entry.p).toEqual(['VERB']);
    expect(entry.ipa).toBe('/kin/');
  });

  it('prefers curated English glosses and POS over Kaikki', () => {
    const [entry] = toThaiEntries([curated({ en: 'consume', pos: 'VERB' })], [kaikki({ pos: 'verb' })]);
    expect(entry.g).toEqual(['consume']);
    expect(entry.p).toEqual(['VERB']);
  });

  it('maps UPOS tags written directly in the curated YAML', () => {
    const entries = toThaiEntries(
      [
        curated({ word: 'และ', zh: '和', pos: 'CCONJ', en: 'and' }),
        curated({ word: 'ถ้า', zh: '如果', pos: 'SCONJ', en: 'if' }),
      ],
      [],
    );
    expect(entries.find((entry) => entry.w === 'และ')?.p).toEqual(['CCONJ']);
    expect(entries.find((entry) => entry.w === 'ถ้า')?.p).toEqual(['SCONJ']);
  });

  it('rejects non-Thai words and empty glosses', () => {
    expect(toThaiEntries([curated({ word: 'eat' })], [])).toEqual([]);
    expect(toThaiEntries([curated({ zh: ' ' })], [])).toEqual([]);
  });

  it('adds Kaikki headwords only with breadth enabled', () => {
    const extra = kaikki({ word: 'น้ำ', senses: [{ glosses: ['water'] }] });
    expect(toThaiEntries([curated()], [extra])).toHaveLength(1);
    expect(toThaiEntries([curated()], [extra], true).map((entry) => entry.w).sort()).toEqual([
      'น้ำ',
      'กิน',
    ].sort());
  });
});
