import { KITSUNEKKO_BASE, fetchIndex, type SeriesDir, type SubFile } from '@/features/scraper/kitsunekko';
import { fetchSubtitleFiles } from '@/features/scraper/subtitles';
import { importLibraryFiles, type LibraryEntry, type LibraryPack, type SubtitleOrigin } from './library';

const INDEX_KEY = 'kitsu:index';
const INDEX_TTL_MS = 24 * 60 * 60 * 1000;

type IndexCache = { at: number; items: SeriesDir[] };

let indexPromise: Promise<SeriesDir[]> | null = null;

/** The index is one ~600KB page, cached for a day so repeat searches are instant. */
export const loadKitsunekkoIndex = (): Promise<SeriesDir[]> => {
  if (indexPromise) return indexPromise;
  indexPromise = (async () => {
    const raw = await chrome.storage.local.get(INDEX_KEY);
    const cache = raw[INDEX_KEY] as IndexCache | undefined;
    if (cache && Date.now() - cache.at < INDEX_TTL_MS) return cache.items;
    const items = await fetchIndex();
    await chrome.storage.local.set({ [INDEX_KEY]: { at: Date.now(), items } });
    return items;
  })().catch((err) => {
    indexPromise = null;
    throw err;
  });
  return indexPromise;
};

export const kitsunekkoOrigin = (dir: SeriesDir, file: SubFile): SubtitleOrigin => ({
  kind: 'kitsunekko',
  site: 'kitsunekko.net',
  seriesName: dir.name,
  seriesPath: dir.path,
  seriesUrl: `${KITSUNEKKO_BASE}/dirlist.php?dir=${encodeURIComponent(dir.path)}`,
  archiveName: file.name,
  archiveUrl: file.url,
  archiveModified: file.modified,
  importedAt: Date.now(),
});

/** Downloads one archive from kitsunekko and stores its subtitle files as a pack. */
export const importKitsunekkoArchive = async (
  dir: SeriesDir,
  file: SubFile,
): Promise<{ pack: LibraryPack; entries: LibraryEntry[]; errors: number }> => {
  const fetched = await fetchSubtitleFiles(file.url);
  if (!fetched.length) throw new Error(`${file.name} 里没有可识别的字幕文件`);
  const { pack, added, errors } = await importLibraryFiles(
    fetched.map((f) => new File([f.text], f.name, { type: 'text/plain' })),
    { title: dir.name, origin: kitsunekkoOrigin(dir, file) },
  );
  return { pack, entries: added, errors: errors.length };
};