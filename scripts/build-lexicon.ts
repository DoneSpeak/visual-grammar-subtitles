/**
 * Build the bundled English and Thai lexicons.
 *
 *   pnpm lexicon:build            # both languages, downloads enabled
 *   pnpm lexicon:build th --offline
 *   pnpm lexicon:build en --breadth (th only; ignored for en)
 *
 * Inputs are pinned in `data/dictionary/sources.lock.yaml`; outputs are committed so
 * `pnpm build` needs neither network nor Python:
 *
 *   public/dict/en/lexicon.json   ECDICT → English entries
 *   public/dict/th/lexicon.json   curated Chinese glosses + Kaikki enrichment
 *
 * Per-language provenance lives in docs/dict/en.md and docs/dict/th.md.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse } from 'yaml';

import { summarize, toEntry, type DictEntry, type RawRow } from './lexicons/en.ts';
import { parseCsv } from './lexicons/parse-csv.ts';
import {
  parseKaikkiJsonl,
  toThaiEntries,
  type CuratedEntry,
  type KaikkiEntry,
} from './lexicons/th.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOCK_FILE = join(ROOT, 'data/dictionary/sources.lock.yaml');
const CURATED_TH = join(ROOT, 'data/dictionary/th.curated.yaml');
const CACHE_DIR = join(ROOT, '.cache/dict');
const OUT_EN = join(ROOT, 'public/dict/en/lexicon.json');
const OUT_TH = join(ROOT, 'public/dict/th/lexicon.json');

type Lock = {
  en?: { url: string; sha256?: string | null; file?: string };
  th?: { kaikki?: { url: string; sha256?: string | null; extractedAt?: string } };
};

const args = process.argv.slice(2);
const offline = args.includes('--offline');
const breadth = args.includes('--breadth');
const targets = args.filter((arg) => !arg.startsWith('--'));
const wanted = (language: string): boolean =>
  targets.length === 0 || targets.includes('all') || targets.includes(language);

const sha256 = (data: Buffer): string => createHash('sha256').update(data).digest('hex');

/** Downloads once, then reuses `.cache/dict`; a pinned hash that does not match aborts. */
const cachedFetch = async (url: string, name: string, hash?: string | null): Promise<Buffer> => {
  const path = join(CACHE_DIR, name);
  let data: Buffer;
  try {
    data = await readFile(path);
  } catch {
    if (offline) throw new Error(`offline: ${name} is not cached (${path})`);
    console.log(`  downloading ${url}`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
    data = Buffer.from(await response.arrayBuffer());
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(path, data);
  }
  if (hash) {
    const actual = sha256(data);
    if (actual !== hash) {
      throw new Error(`sha256 mismatch for ${name}\n  expected ${hash}\n  actual   ${actual}`);
    }
  } else {
    console.warn(`  ! ${name} has no pinned sha256; update data/dictionary/sources.lock.yaml`);
  }
  return data;
};

const buildEn = async (lock: Lock): Promise<void> => {
  if (!lock.en?.url) throw new Error('sources.lock.yaml is missing en.url');
  console.log('[lexicon:en] ECDICT');
  const csv = (await cachedFetch(lock.en.url, lock.en.file ?? 'ecdict.csv', lock.en.sha256)).toString(
    'utf8',
  );
  const rows = parseCsv(csv) as RawRow[];
  const byId = new Map<string, DictEntry>();
  for (const row of rows) {
    const entry = toEntry(row);
    if (entry && !byId.has(entry.id)) byId.set(entry.id, entry);
  }
  const entries = [...byId.values()].sort((a, b) => a.w.localeCompare(b.w, 'en'));
  if (!entries.length) throw new Error('ECDICT produced no entries — upstream format changed');
  await mkdir(dirname(OUT_EN), { recursive: true });
  await writeFile(OUT_EN, `${JSON.stringify({ v: 1, entries })}\n`);
  const stats = summarize(entries);
  console.log(
    `  ${stats.entries} entries (${stats.untagged} untagged, ${stats.withIpa} with IPA, ` +
      `${stats.withForms} with inflections) → ${OUT_EN}`,
  );
};

const buildTh = async (lock: Lock): Promise<void> => {
  console.log('[lexicon:th] curated + Kaikki');
  const curated = parse(await readFile(CURATED_TH, 'utf8')) as { entries?: CuratedEntry[] };
  const rows = curated.entries ?? [];
  let kaikki: KaikkiEntry[] = [];
  if (!offline && lock.th?.kaikki?.url) {
    const text = (await cachedFetch(lock.th.kaikki.url, 'kaikki-th.jsonl', lock.th.kaikki.sha256)).toString(
      'utf8',
    );
    kaikki = parseKaikkiJsonl(text);
  } else if (!offline) {
    console.warn('  ! no th.kaikki.url in sources.lock.yaml; building curated-only');
  }
  const entries = toThaiEntries(rows, kaikki, breadth);
  if (!entries.length) throw new Error('Thai lexicon is empty — check the curated review status');
  await mkdir(dirname(OUT_TH), { recursive: true });
  await writeFile(OUT_TH, `${JSON.stringify({ v: 1, entries })}\n`);
  console.log(
    `  ${entries.length} entries (${rows.length} curated, ${kaikki.length} Kaikki rows` +
      `${breadth ? ', breadth on' : ''}) → ${OUT_TH}`,
  );
};

const lock = parse(await readFile(LOCK_FILE, 'utf8')) as Lock;
if (wanted('en')) await buildEn(lock);
if (wanted('th')) await buildTh(lock);
