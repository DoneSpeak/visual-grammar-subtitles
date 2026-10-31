/**
 * Build the bundled JLPT dictionary: src/data/jlpt-dict.json
 *
 *   npm run dict:build
 *
 * Sources (both pinned):
 *   - open-anki-jlpt-decks CSVs (MIT)      → headword, reading, JLPT level
 *   - jmdict-simplified examples (CC BY-SA 4.0) → glosses, POS, Tanaka examples
 *
 * The output is committed so `npm run build` works offline.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';

import { parseCsv } from './lexicons/parse-csv.ts';

const JLPT_COMMIT = '1ad66734417aca9dbcca6b2d5ee440cb13ab3ba0';
const JMDICT_VERSION = '3.6.2+20261026175559';
const JLPT_URL = (level: number) =>
  `https://raw.githubusercontent.com/jamsinclair/open-anki-jlpt-decks/${JLPT_COMMIT}/src/n${level}.csv`;
const JMDICT_URL = `https://github.com/scriptin/jmdict-simplified/releases/download/${encodeURIComponent(JMDICT_VERSION)}/jmdict-examples-eng-${encodeURIComponent(JMDICT_VERSION)}.json.tgz`;

const OUT = 'src/data/jlpt-dict.json';
const MIN_COVERAGE = 0.7;

type JlptRow = { expression: string; reading: string; level: number };
type Sentence = { lang?: string; text: string };
type JmdictWord = {
  id: string;
  kanji: { text: string; common?: boolean }[];
  kana: { text: string; common?: boolean }[];
  sense: {
    partOfSpeech: string[];
    gloss: { lang?: string; type?: string | null; text: string }[];
    examples?: { sentences?: Sentence[] }[];
  }[];
};

const fetchOk = async (url: string): Promise<Buffer> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
};

/** Cache downloads so rebuilding after a tuning pass does not re-fetch 130MB. */
const cachedFetch = async (url: string, name: string): Promise<Buffer> => {
  const path = `.cache/dict/${name}`;
  try {
    return await readFile(path);
  } catch {
    // not cached yet
  }
  const data = await fetchOk(url);
  await mkdir('.cache/dict', { recursive: true });
  await writeFile(path, data);
  return data;
};

/** Releases ship a single-file .tgz; parsing one tar member needs no dependency. */
const untarSingleFile = (tgz: Buffer): Buffer => {
  const tar = gunzipSync(tgz);
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');
    if (!name) break;
    const size = parseInt(header.subarray(124, 136).toString('utf8').replace(/\0.*$/, '').trim(), 8);
    const start = offset + 512;
    if (name.endsWith('.json')) return tar.subarray(start, start + size);
    offset = start + Math.ceil(size / 512) * 512;
  }
  throw new Error('no .json member in archive');
};

/** JLPT lists annotate entries as 故～ / こす (みずを～); strip the markers to match JMdict. */
const normalize = (s: string): string =>
  s
    .replace(/[～~]/g, '')
    .replace(/[（(][^）)]*[）)]/g, '')
    .trim();

const POS_LABEL: Record<string, string> = {
  n: '名',
  pn: '代',
  v1: '動',
  v5: '動',
  vs: '動',
  adj_i: '形',
  adj_na: '形',
  adv: '副',
  prt: '助',
  conj: '接',
  exp: '表',
  int: '感',
};

const posLabel = (pos: string): string => {
  if (pos.startsWith('aux-v')) return '助動';
  if (pos === 'aux') return '助';
  if (pos.startsWith('v')) return '動';
  if (pos.startsWith('adj')) return '形';
  return POS_LABEL[pos.replace(/-/g, '_')] ?? '';
};

const main = async (): Promise<void> => {
  console.log('downloading JLPT lists…');
  const rows: JlptRow[] = [];
  for (let level = 1; level <= 5; level++) {
    const csv = parseCsv((await cachedFetch(JLPT_URL(level), `n${level}.csv`)).toString('utf8'));
    for (const r of csv) {
      const raw = r.expression ?? '';
      // Prefix/suffix forms (お～, ～味) never appear as standalone subtitle tokens and
      // collide with real headwords (味/み vs 味/あじ), so drop them.
      if (/[～~]/.test(raw)) continue;
      const expression = normalize(raw);
      const reading = normalize(r.reading ?? '');
      if (expression && reading) rows.push({ expression, reading, level });
    }
  }
  console.log(`  ${rows.length} rows`);
  if (!rows.length) throw new Error('JLPT lists are empty — upstream format changed');

  // Kana-only entries are matched only against kana-only JMdict entries; otherwise
  // every どう/あの homograph in the dictionary would attach.
  const kanjiPairs = new Map<string, number>();
  const kanaOnly = new Map<string, number>();
  const pairKey = (w: string, r: string) => `${w}\u0000${r}`;
  for (const { expression, reading, level } of rows) {
    const key = pairKey(expression, reading);
    if (expression === reading) {
      kanaOnly.set(expression, Math.min(kanaOnly.get(expression) ?? 5, level));
    } else {
      kanjiPairs.set(key, Math.min(kanjiPairs.get(key) ?? 5, level));
    }
  }

  console.log('downloading JMdict examples…');
  const words = (JSON.parse(untarSingleFile(await cachedFetch(JMDICT_URL, 'jmdict-examples-eng.json.tgz')).toString('utf8')) as { words: JmdictWord[] }).words;
  console.log(`  ${words.length} words`);

  type Entry = {
    w: string;
    r: string;
    lv: number;
    p: string[];
    g: string[];
    x: { j: string; e: string }[];
    id: string;
  };
  const chosen = new Map<string, Entry & { common: boolean }>();

  for (const word of words) {
    const kanji = word.kanji.map((k) => k.text);
    const kana = word.kana.map((k) => k.text);
    const hits: { key: string; level: number }[] = [];
    for (const k of kanji) {
      for (const r of kana) {
        const level = kanjiPairs.get(pairKey(k, r));
        if (level !== undefined) hits.push({ key: pairKey(k, r), level });
      }
    }
    if (!hits.length && !kanji.length) {
      for (const r of kana) {
        const level = kanaOnly.get(r);
        if (level !== undefined) hits.push({ key: pairKey(r, r), level });
      }
    }
    if (!hits.length) continue;

    const glosses: string[] = [];
    const pos = new Set<string>();
    const examples: { j: string; e: string }[] = [];
    for (const sense of word.sense) {
      for (const g of sense.gloss.slice(0, 3)) {
        if (g.type !== 'lit' && !glosses.includes(g.text)) glosses.push(g.text);
      }
      for (const p of sense.partOfSpeech) {
        const label = posLabel(p);
        if (label) pos.add(label);
      }
      for (const ex of sense.examples ?? []) {
        if (examples.length >= 2) break;
        const sentences = ex.sentences ?? [];
        const ja = sentences.find((s) => s.lang === 'jpn');
        const en = sentences.find((s) => s.lang === 'eng');
        if (ja && en) examples.push({ j: ja.text, e: en.text });
      }
    }

    const common =
      word.kana.some((k) => k.common) || word.kanji.some((k) => k.common);
    for (const { key, level } of hits) {
      const [w, r] = key.split('\u0000');
      const candidate = { w, r, lv: level, p: [...pos].slice(0, 3), g: glosses.slice(0, 4), x: examples.slice(0, 2), id: word.id, common };
      const prev = chosen.get(key);
      // Prefer common entries, then entries that carry an example sentence.
      const better =
        !prev ||
        (candidate.common && !prev.common) ||
        (candidate.common === prev.common && candidate.x.length > prev.x.length);
      if (better) chosen.set(key, candidate);
    }
  }

  const entries = [...chosen.values()]
    .sort((a, b) => a.lv - b.lv || a.w.localeCompare(b.w, 'ja'))
    .map(({ common: _common, ...entry }) => entry);

  const matched = new Set(entries.map((e) => pairKey(e.w, e.r)));
  for (let level = 1; level <= 5; level++) {
    const ofLevel = rows.filter((r) => r.level === level);
    const hit = ofLevel.filter((r) => matched.has(pairKey(r.expression, r.reading)));
    const withExample = hit.filter((r) => entries.find((e) => e.w === r.expression && e.r === r.reading)?.x.length);
    const coverage = hit.length / Math.max(1, ofLevel.length);
    console.log(
      `N${level}: ${hit.length}/${ofLevel.length} (${Math.round(coverage * 100)}%) matched, ` +
        `${withExample.length} with examples`,
    );
    if (coverage < MIN_COVERAGE) throw new Error(`N${level} coverage ${coverage.toFixed(2)} < ${MIN_COVERAGE}`);
  }

  await mkdir('src/data', { recursive: true });
  await writeFile(OUT, JSON.stringify({ v: 1, entries }));
  console.log(`wrote ${OUT}: ${entries.length} entries, ${(Buffer.byteLength(JSON.stringify({ v: 1, entries })) / 1048576).toFixed(2)}MB`);
};

await main();