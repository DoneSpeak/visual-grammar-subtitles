/**
 * Build the visual-vocabulary index consumed by the word card.
 *
 *   pnpm vocab:build
 *
 * Inputs (dev time, produced by python/vocabulary):
 *   python/vocabulary/dist/vocabulary.ja.yaml
 *   python/vocabulary/dist/assets/openmoji/*.svg
 *   python/vocabulary/dist/licenses/*
 *
 * Outputs (committed, so `pnpm build` needs neither Python nor PyYAML):
 *   public/dict/vocabulary.json   entry id → OpenMoji hexcode + zh gloss
 *   public/vocab/openmoji/*.svg   copied byte-for-byte, unmodified
 *   public/vocab/licenses/*       upstream licence texts
 *
 * Only `approved` entries with a single sense reach this file; the Python
 * builder already enforced review status, visual score and SVG safety.
 */
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = join(root, 'python/vocabulary/dist');
const DICT_FILE = join(root, 'public/dict/jlpt-dict.json');
const OUT_JSON = join(root, 'public/dict/vocabulary.json');
const OUT_ASSETS = join(root, 'public/vocab/openmoji');
const OUT_LICENSES = join(root, 'public/vocab/licenses');

type Gloss = Record<string, string>;
type VocabularySense = {
  conceptId: string;
  gloss: Gloss;
  image: { provider: string; hexcode: string; path: string };
};
type VocabularyEntry = {
  id: string;
  lemma: string;
  reading: string;
  level: string;
  senses: VocabularySense[];
};
type VocabularyDoc = { entries: VocabularyEntry[] };
type DictRow = { id: string; w: string; r: string; lv: number };
/** The options gallery reads the headword back from here; the card only needs `i`/`z`. */
type ImageRecord = { i: string; z?: string; w: string; r: string; lv: number };

const toHiragana = (text: string): string =>
  text.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

const readJson = async <T>(path: string): Promise<T> => JSON.parse(await readFile(path, 'utf8')) as T;

/**
 * Resolve a vocabulary lemma to a JLPT dictionary row. The two upstreams
 * disagree on headword form (いす vs 椅子), so fall back from exact
 * (headword, reading) to headword, then to a unique reading.
 */
const matchEntry = (word: VocabularyEntry, dict: DictRow[], byWord: Map<string, DictRow[]>, byReading: Map<string, DictRow[]>): DictRow | undefined => {
  const reading = toHiragana(word.reading);
  const sameWord = byWord.get(word.lemma) ?? [];
  const exact = sameWord.find((row) => toHiragana(row.r) === reading);
  if (exact) return exact;
  if (sameWord.length) return sameWord[0];
  const sameReading = byReading.get(reading) ?? [];
  return sameReading.length === 1 ? sameReading[0] : undefined;
};

const main = async (): Promise<void> => {
  const doc = parse(await readFile(join(SRC_DIR, 'vocabulary.ja.yaml'), 'utf8')) as VocabularyDoc;
  const dict = (await readJson<{ entries: DictRow[] }>(DICT_FILE)).entries;

  const byWord = new Map<string, DictRow[]>();
  const byReading = new Map<string, DictRow[]>();
  for (const row of dict) {
    byWord.set(row.w, [...(byWord.get(row.w) ?? []), row]);
    const reading = toHiragana(row.r);
    byReading.set(reading, [...(byReading.get(reading) ?? []), row]);
  }

  const images: Record<string, ImageRecord> = {};
  const hexcodes = new Set<string>();
  const unmatched: string[] = [];

  for (const word of doc.entries) {
    // Multi-sense words would need the sentence to disambiguate; the card has
    // no sense picker, so skip them rather than guess an image.
    if (word.senses.length !== 1) continue;
    const sense = word.senses[0];
    const row = matchEntry(word, dict, byWord, byReading);
    if (!row) {
      unmatched.push(`${word.lemma}（${word.reading}）`);
      continue;
    }
    if (images[row.id]) continue;
    images[row.id] = {
      i: sense.image.hexcode,
      ...(sense.gloss['zh-Hans'] ? { z: sense.gloss['zh-Hans'] } : {}),
      w: row.w,
      r: row.r,
      lv: row.lv,
    };
    hexcodes.add(sense.image.hexcode);
  }

  const sorted = Object.fromEntries(Object.entries(images).sort(([a], [b]) => a.localeCompare(b)));
  await mkdir(dirname(OUT_JSON), { recursive: true });
  await writeFile(OUT_JSON, `${JSON.stringify({ v: 1, images: sorted })}\n`);

  await mkdir(OUT_ASSETS, { recursive: true });
  const available = new Set((await readdir(join(SRC_DIR, 'assets/openmoji'))).map((name) => name.replace(/\.svg$/, '')));
  for (const hexcode of hexcodes) {
    if (!available.has(hexcode)) throw new Error(`missing SVG for ${hexcode}`);
    await cp(join(SRC_DIR, `assets/openmoji/${hexcode}.svg`), join(OUT_ASSETS, `${hexcode}.svg`));
  }

  await mkdir(OUT_LICENSES, { recursive: true });
  for (const name of await readdir(join(SRC_DIR, 'licenses'))) {
    await cp(join(SRC_DIR, `licenses/${name}`), join(OUT_LICENSES, name));
  }

  console.log(`[vocab] ${Object.keys(sorted).length} entries, ${hexcodes.size} images → public/vocab`);
  if (unmatched.length) console.log(`[vocab] ${unmatched.length} words not in the JLPT dictionary: ${unmatched.join('、')}`);
};

await main();
