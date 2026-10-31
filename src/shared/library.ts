import { DEFAULT_LANGUAGE, detectLanguageId } from '@/languages/registry';
import type { LanguageId } from '@/languages/types';
import { parseSubtitles } from '@/features/overlay/subtitles/parse';
import { LEGACY_ORIGIN_NOTE, UNFILED_TITLE } from './persistedText';
import { t } from './i18n';

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
  | {
      kind: 'provider';
      provider: string;
      seriesId?: string;
      season?: number;
      episode?: number;
      release?: string;
      url?: string;
      importedAt: number;
    }
  | { kind: 'local'; note?: string; importedAt: number };

/** One series = one pack. Entries inside a pack are episodes of that series. */
export type LibraryPack = {
  id: string;
  title: string;
  /** The language the subtitles are written in; the packs page groups by it. */
  language: LanguageId;
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

export type PackInput = { title: string; origin: SubtitleOrigin; language?: LanguageId };

const PACKS_KEY = 'lib:packs';
const INDEX_KEY = 'lib:index';
const SETTINGS_KEY = 'lib:settings';
const itemKey = (id: string) => `lib:item:${id}`;

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

/** Legacy packs predate `language`; infer it from the first subtitle in the pack. */
const hasLanguage = (pack: LibraryPack): boolean =>
  typeof (pack as Partial<LibraryPack>).language === 'string';

const detectPackLanguage = async (pack: LibraryPack, index: LibraryEntry[]): Promise<LanguageId> => {
  if (pack.origin.kind === 'kitsunekko') return 'ja';
  const first = index.find((entry) => entry.packId === pack.id);
  if (!first) return DEFAULT_LANGUAGE;
  const raw = await chrome.storage.local.get(itemKey(first.id));
  const text = raw[itemKey(first.id)];
  if (typeof text !== 'string') return DEFAULT_LANGUAGE;
  const detected = detectLanguageId(text.slice(0, 4000));
  return detected === 'plain' ? DEFAULT_LANGUAGE : detected;
};

/** Older imports were a flat list with no pack and no language; fill both in once. */
const ensureMigrated = (): Promise<void> => {
  if (migration) return migration;
  migration = (async () => {
    const [index, packs] = await Promise.all([readIndex(), readPacks()]);
    const known = new Set(packs.map((p) => p.id));
    const orphans = index.filter((e) => !e.packId || !known.has(e.packId));
    let nextPacks = packs;
    let changed = false;

    if (orphans.length) {
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
            language: DEFAULT_LANGUAGE,
            origin: { kind: 'local', note: LEGACY_ORIGIN_NOTE, importedAt: now },
            addedAt: entry.addedAt,
            updatedAt: entry.addedAt,
          };
          byTitle.set(title, pack);
          created.push(pack);
        }
        entry.packId = pack.id;
      }
      nextPacks = [...packs, ...created];
      changed = true;
    }

    if (nextPacks.some((pack) => !hasLanguage(pack))) {
      nextPacks = await Promise.all(
        nextPacks.map(async (pack) =>
          hasLanguage(pack) ? pack : { ...pack, language: await detectPackLanguage(pack, index) },
        ),
      );
      changed = true;
    }

    if (!changed) return;
    await Promise.all([
      chrome.storage.local.set({ [INDEX_KEY]: index }),
      chrome.storage.local.set({ [PACKS_KEY]: nextPacks }),
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
  if (pack.origin.kind === 'provider' && input.origin.kind === 'provider') {
    return (
      pack.origin.provider === input.origin.provider &&
      pack.origin.seriesId === input.origin.seriesId
    );
  }
  return pack.title === input.title;
};

const packLanguage = (input: PackInput): LanguageId =>
  input.language ?? (input.origin.kind === 'kitsunekko' ? 'ja' : DEFAULT_LANGUAGE);

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
      language: packLanguage(input),
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
    language: input.language ?? existing.language,
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
  const read = await Promise.all(files.map(async (file) => ({ file, text: await file.text() })));
  const detected = detectLanguageId(read.map((item) => item.text).join('\n').slice(0, 4000));
  const pack = await resolvePack({
    ...input,
    language: input.language ?? (detected === 'plain' ? undefined : detected),
  });
  const index = await readIndex();
  const byName = new Map(index.filter((e) => e.packId === pack.id).map((e) => [e.name, e]));
  const added: LibraryEntry[] = [];
  const errors: string[] = [];

  for (const { file, text } of read) {
    const cues = parseSubtitles(text);
    if (cues.length === 0) {
      errors.push(t('errors.unparsableFile', { name: file.name }));
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