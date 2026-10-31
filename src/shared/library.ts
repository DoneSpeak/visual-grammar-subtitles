import { parseSubtitles } from '@/features/overlay/subtitles/parse';

/** Where a pack came from, so a series can always be traced back to its source. */
export type SubtitleOrigin =
  | {
      kind: 'kitsunekko';
      site: 'kitsunekko.net';
      seriesName: string;
      seriesPath: string;
      seriesUrl: string;
      archiveName: string;
      archiveUrl: string;
      archiveModified: string;
      importedAt: number;
    }
  | { kind: 'local'; note?: string; importedAt: number };

/** One anime = one pack. Entries inside a pack are episodes of that series. */
export type LibraryPack = {
  id: string;
  title: string;
  origin: SubtitleOrigin;
  addedAt: number;
  updatedAt: number;
};

export type LibraryEntry = {
  id: string;
  packId: string;
  name: string;
  size: number;
  addedAt: number;
  cueCount: number;
};

export type LibrarySettings = { lastId: string; autoApply: boolean };

export type PackInput = { title: string; origin: SubtitleOrigin };

const PACKS_KEY = 'lib:packs';
const INDEX_KEY = 'lib:index';
const SETTINGS_KEY = 'lib:settings';
const itemKey = (id: string) => `lib:item:${id}`;

const UNFILED_TITLE = '未归类';

export const isLibraryKey = (key: string): boolean =>
  key === PACKS_KEY || key === INDEX_KEY || key === SETTINGS_KEY || key.startsWith('lib:item:');

const readIndex = async (): Promise<LibraryEntry[]> => {
  const raw = await chrome.storage.local.get(INDEX_KEY);
  return (raw[INDEX_KEY] as LibraryEntry[] | undefined) ?? [];
};

const readPacks = async (): Promise<LibraryPack[]> => {
  const raw = await chrome.storage.local.get(PACKS_KEY);
  return (raw[PACKS_KEY] as LibraryPack[] | undefined) ?? [];
};

/** "Monster S01E01 Chapter 1 jpn.srt" → "Monster"; "01.srt" → "未归类". */
export const inferPackTitle = (fileName: string): string => {
  const base = fileName.replace(/\.[^.]+$/, '').trim();
  const m = base.match(/^(.*?)[\s._-]+(?:s\d{1,2})?e?\d{1,4}(?:\D|$)/i);
  const title = m?.[1]?.trim().replace(/[\s._-]+$/, '');
  return title && title.length >= 2 ? title : UNFILED_TITLE;
};

let migration: Promise<void> | null = null;

/** Older imports were a flat list with no pack; group them by inferred series title. */
const ensureMigrated = (): Promise<void> => {
  if (migration) return migration;
  migration = (async () => {
    const [index, packs] = await Promise.all([readIndex(), readPacks()]);
    const known = new Set(packs.map((p) => p.id));
    const orphans = index.filter((e) => !e.packId || !known.has(e.packId));
    if (!orphans.length) return;

    const byTitle = new Map(packs.map((p) => [p.title, p]));
    const now = Date.now();
    const created: LibraryPack[] = [];
    for (const entry of orphans) {
      const title = inferPackTitle(entry.name);
      let pack = byTitle.get(title);
      if (!pack) {
        pack = {
          id: crypto.randomUUID(),
          title,
          origin: { kind: 'local', note: '旧版本导入，来源未记录', importedAt: now },
          addedAt: entry.addedAt,
          updatedAt: entry.addedAt,
        };
        byTitle.set(title, pack);
        created.push(pack);
      }
      entry.packId = pack.id;
    }

    await Promise.all([
      chrome.storage.local.set({ [INDEX_KEY]: index }),
      chrome.storage.local.set({ [PACKS_KEY]: [...packs, ...created] }),
    ]);
  })().catch((err) => {
    migration = null;
    throw err;
  });
  return migration;
};

export const listPacks = async (): Promise<LibraryPack[]> => {
  await ensureMigrated();
  return [...(await readPacks())].sort((a, b) => b.updatedAt - a.updatedAt);
};

export const listLibrary = async (): Promise<LibraryEntry[]> => {
  await ensureMigrated();
  return [...(await readIndex())].sort((a, b) => b.addedAt - a.addedAt);
};

export const readLibraryText = async (id: string): Promise<string | null> => {
  const raw = await chrome.storage.local.get(itemKey(id));
  const text = raw[itemKey(id)];
  return typeof text === 'string' ? text : null;
};

const samePack = (pack: LibraryPack, input: PackInput): boolean => {
  if (pack.origin.kind !== input.origin.kind) return false;
  if (pack.origin.kind === 'kitsunekko' && input.origin.kind === 'kitsunekko') {
    return pack.origin.seriesPath === input.origin.seriesPath;
  }
  return pack.title === input.title;
};

/** Reuse the pack for the same series; a newer archive just refreshes its origin. */
const resolvePack = async (input: PackInput): Promise<LibraryPack> => {
  await ensureMigrated();
  const packs = await readPacks();
  const existing = packs.find((p) => samePack(p, input));
  if (!existing) {
    const now = Date.now();
    const pack: LibraryPack = {
      id: crypto.randomUUID(),
      title: input.title,
      origin: input.origin,
      addedAt: now,
      updatedAt: now,
    };
    await chrome.storage.local.set({ [PACKS_KEY]: [...packs, pack] });
    return pack;
  }
  const updated: LibraryPack = {
    ...existing,
    title: input.title || existing.title,
    origin: input.origin,
    updatedAt: Date.now(),
  };
  await chrome.storage.local.set({ [PACKS_KEY]: packs.map((p) => (p.id === existing.id ? updated : p)) });
  return updated;
};

export const importLibraryFiles = async (
  files: File[],
  input: PackInput,
): Promise<{ pack: LibraryPack; added: LibraryEntry[]; errors: string[] }> => {
  const pack = await resolvePack(input);
  const index = await readIndex();
  const byName = new Map(index.filter((e) => e.packId === pack.id).map((e) => [e.name, e]));
  const added: LibraryEntry[] = [];
  const errors: string[] = [];

  for (const file of files) {
    const text = await file.text();
    const cues = parseSubtitles(text);
    if (cues.length === 0) {
      errors.push(`${file.name}: 未解析到任何字幕`);
      continue;
    }
    const existing = byName.get(file.name);
    const entry: LibraryEntry = {
      id: existing?.id ?? crypto.randomUUID(),
      packId: pack.id,
      name: file.name,
      size: file.size,
      addedAt: Date.now(),
      cueCount: cues.length,
    };
    byName.set(entry.name, entry);
    await chrome.storage.local.set({ [itemKey(entry.id)]: text });
    added.push(entry);
  }

  if (added.length) {
    const keep = index.filter((e) => e.packId !== pack.id);
    await chrome.storage.local.set({ [INDEX_KEY]: [...keep, ...byName.values()] });
  }
  return { pack, added, errors };
};

const clearLastIfRemoved = async (removed: Set<string>): Promise<void> => {
  const settings = await getLibrarySettings();
  if (removed.has(settings.lastId)) await patchLibrarySettings({ lastId: '' });
};

const dropEmptyPack = async (packId: string): Promise<void> => {
  const [index, packs] = await Promise.all([readIndex(), readPacks()]);
  if (index.some((e) => e.packId === packId)) return;
  await chrome.storage.local.set({ [PACKS_KEY]: packs.filter((p) => p.id !== packId) });
};

export const removePack = async (packId: string): Promise<void> => {
  await ensureMigrated();
  const index = await readIndex();
  const doomed = index.filter((e) => e.packId === packId);
  const packs = await readPacks();
  if (doomed.length) await chrome.storage.local.remove(doomed.map((e) => itemKey(e.id)));
  await chrome.storage.local.set({
    [INDEX_KEY]: index.filter((e) => e.packId !== packId),
    [PACKS_KEY]: packs.filter((p) => p.id !== packId),
  });
  await clearLastIfRemoved(new Set(doomed.map((e) => e.id)));
};

export const removeLibraryItem = async (id: string): Promise<void> => {
  await ensureMigrated();
  const index = await readIndex();
  const entry = index.find((e) => e.id === id);
  await chrome.storage.local.remove(itemKey(id));
  await chrome.storage.local.set({ [INDEX_KEY]: index.filter((e) => e.id !== id) });
  await clearLastIfRemoved(new Set([id]));
  if (entry) await dropEmptyPack(entry.packId);
};

export const getLibrarySettings = async (): Promise<LibrarySettings> => {
  const raw = await chrome.storage.local.get(SETTINGS_KEY);
  const saved = raw[SETTINGS_KEY] as Partial<LibrarySettings> | undefined;
  return { lastId: saved?.lastId ?? '', autoApply: saved?.autoApply ?? false };
};

export const patchLibrarySettings = async (patch: Partial<LibrarySettings>): Promise<void> => {
  const next = { ...(await getLibrarySettings()), ...patch };
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
};