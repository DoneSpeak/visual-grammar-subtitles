/**
 * kitsunekko.net has no search API — only PHP directory listings.
 * The "index" is one large HTML page listing every series folder.
 */

export const KITSUNEKKO_BASE = 'https://kitsunekko.net';
export const JAPANESE_ROOT = 'subtitles/japanese/';

export type SeriesDir = { name: string; path: string };
export type SubFile = { name: string; path: string; url: string; size: number; modified: string };
export type DirListing = { dirs: SeriesDir[]; files: SubFile[] };

const fetchHtml = async (path: string): Promise<string> => {
  const res = await fetch(new URL(path, `${KITSUNEKKO_BASE}/`), { credentials: 'omit' });
  if (!res.ok) throw new Error(`kitsunekko ${res.status} ${res.statusText}`);
  return res.text();
};

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

const decodeEntities = (s: string): string =>
  s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (match, code: string) => {
    if (code.startsWith('#')) {
      const n = code[1] === 'x' || code[1] === 'X' ? Number.parseInt(code.slice(2), 16) : Number.parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : match;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? match;
  });

const stripTags = (s: string): string => s.replace(/<[^>]*>/g, '');

const decodeDirParam = (raw: string): string => {
  try {
    return decodeURIComponent(raw.replace(/\+/g, '%20'));
  } catch {
    return raw;
  }
};

const cleanName = (html: string): string => decodeEntities(stripTags(html)).replace(/\s+/g, ' ').trim();

/** Rows on the Japanese index page: `<a href="/dirlist.php?dir=..."><strong>Name</strong>` */
const INDEX_LINK = /<a href="\/dirlist\.php\?dir=([^"]+)"[^>]*><strong>([\s\S]*?)<\/strong>/g;

export const parseIndex = (html: string): SeriesDir[] => {
  const out: SeriesDir[] = [];
  for (const m of html.matchAll(INDEX_LINK)) {
    const path = decodeDirParam(m[1]);
    const name = cleanName(m[2]);
    if (name && path) out.push({ name, path });
  }
  return out;
};

export const fetchIndex = async (): Promise<SeriesDir[]> =>
  parseIndex(await fetchHtml(`/dirlist.php?dir=${encodeURIComponent(JAPANESE_ROOT)}`));

const normalize = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9぀-ヿ一-鿿]+/g, '');

/** Rank: exact > prefix > substring. */
export const searchSeries = (index: SeriesDir[], query: string): SeriesDir[] => {
  const q = normalize(query);
  if (!q) return [];
  const hits: { dir: SeriesDir; rank: number }[] = [];
  for (const dir of index) {
    const key = normalize(dir.name);
    if (key === q) hits.push({ dir, rank: 0 });
    else if (key.startsWith(q)) hits.push({ dir, rank: 1 });
    else if (key.includes(q)) hits.push({ dir, rank: 2 });
  }
  hits.sort((a, b) => a.rank - b.rank || a.dir.name.length - b.dir.name.length || a.dir.name.localeCompare(b.dir.name));
  return hits.map((h) => h.dir);
};

/** Concatenates searches (original query first), keeping the first hit per series path. */
export const mergeSeries = (lists: SeriesDir[][]): SeriesDir[] => {
  const seen = new Set<string>();
  const out: SeriesDir[] = [];
  for (const list of lists) {
    for (const dir of list) {
      if (seen.has(dir.path)) continue;
      seen.add(dir.path);
      out.push(dir);
    }
  }
  return out;
};

const ROW = /<tr>([\s\S]*?)<\/tr>/g;
const ROW_LINK = /<a href="([^"]+)"[^>]*>\s*<strong>([\s\S]*?)<\/strong>/;
const ROW_SIZE = /class="tdleft"[^>]*title="(\d+)"/;
const ROW_DATE = /class="tdright"[^>]*title="([^"]*)"/;

export const parseListing = (html: string): DirListing => {
  const dirs: SeriesDir[] = [];
  const files: SubFile[] = [];
  for (const row of html.matchAll(ROW)) {
    const link = ROW_LINK.exec(row[1]);
    if (!link) continue;
    const [, href, rawName] = link;
    const name = cleanName(rawName);
    if (!name) continue;
    const path = decodeDirParam(href);
    if (href.endsWith('/')) {
      dirs.push({ name, path });
      continue;
    }
    const size = Number(ROW_SIZE.exec(row[1])?.[1] ?? 0);
    const modified = decodeEntities(ROW_DATE.exec(row[1])?.[1] ?? '');
    files.push({ name, path, url: new URL(href, `${KITSUNEKKO_BASE}/`).href, size, modified });
  }
  return { dirs, files };
};

export const listDir = async (path: string): Promise<DirListing> =>
  parseListing(await fetchHtml(`/dirlist.php?dir=${encodeURIComponent(path)}`));