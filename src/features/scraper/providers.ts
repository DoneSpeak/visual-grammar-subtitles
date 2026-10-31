import { requestEnglishQuery } from '@/shared/translate';
import type { SubtitleLanguageId } from '@/shared/subtitleLanguages';
import { fetchSubtitleFiles, type FetchedSubtitle } from './subtitles';

/**
 * Subtitle providers for packs that have an online source.
 *
 * The language is chosen by the caller at request time: the learning language and the language
 * the subtitles are written in are different questions. Search and download use the user's own
 * API key; nothing is bundled with the extension.
 */

export type ProviderId = 'subdl' | 'opensubtitles';

export type SeriesHit = { id: string; title: string; year?: number };

export type EpisodeFile = {
  id: string;
  name: string;
  language: string;
  url: string;
  release?: string;
  /** Total bytes of the packaged subtitle files; undefined when the provider does not report it. */
  size?: number;
  /** Human-facing page for the subtitle, when the provider has one. */
  sourceUrl?: string;
};

/** Season/episode are optional: without them the provider lists every subtitle it has. */
export type EpisodeQuery = { season?: number; episode?: number };

export type SubtitleProvider = {
  id: ProviderId;
  /** The language the requested subtitles are written in, not the learning language. */
  language: SubtitleLanguageId;
  requiresKey: boolean;
  search(query: string): Promise<SeriesHit[]>;
  listEpisodes(hit: SeriesHit, query: EpisodeQuery): Promise<EpisodeFile[]>;
  fetch(episode: EpisodeFile): Promise<FetchedSubtitle[]>;
};

export type ProviderDescriptor = {
  id: ProviderId;
  requiresKey: boolean;
  /** Subtitle languages this provider can search for. */
  subtitleLanguages: readonly SubtitleLanguageId[];
  /** Bound to the user's key and language; the UI never passes the key through component state. */
  create(key: string, language: SubtitleLanguageId): SubtitleProvider;
};

export const SUBDL_API = 'https://api.subdl.com/api/v1/subtitles';
export const SUBDL_DOWNLOAD = 'https://dl.subdl.com';
const SUBDL_SITE = 'https://subdl.com';

/**
 * Subtitle languages SubDL serves, mapped to its uppercase codes.
 *
 * `ZH` / `ZH_BG` (Big5) come from Bazarr's SubDL converter rather than SubDL's own docs and are
 * not verified against a live key; keep them in one place so a wrong code is a one-line fix.
 */
const SUBDL_LANGUAGE_CODES: Record<string, string> = {
  en: 'EN',
  th: 'TH',
  'zh-Hans': 'ZH',
  'zh-Hant': 'ZH_BG',
};

export const SUBDL_LANGUAGES: readonly SubtitleLanguageId[] = Object.keys(SUBDL_LANGUAGE_CODES);

/**
 * SubDL code for a language id. The curated ids keep their documented codes; anything else is
 * upper-cased with `-` → `_` (`ko` → `KO`, `pt-br` → `PT_BR`), so a user can type a language this
 * extension does not list. A wrong guess is not fatal: SubDL answers with no results.
 */
export const subdlCode = (language: SubtitleLanguageId): string => {
  const id = language.trim();
  return (
    SUBDL_LANGUAGE_CODES[id] ??
    SUBDL_LANGUAGE_CODES[id.toLowerCase()] ??
    id.toUpperCase().replace(/-/g, '_')
  );
};

/**
 * Documented response shape. The API documents `status`/`error`/`results`/`subtitles`; the
 * per-field names below follow the public examples but are unverified against a live key.
 */
type SubdlUnpackFile = {
  size?: number;
};

type SubdlSubtitle = {
  name?: string;
  language?: string;
  release_name?: string;
  url?: string;
  /** Relative link to the subtitle's page on subdl.com. */
  subtitlePage?: string;
  /** Per-file entries, returned only when the request sets `unpack=1`. */
  unpack_files?: SubdlUnpackFile[];
};

type SubdlResult = {
  sd_id?: number | string;
  name?: string;
  year?: number;
  type?: string;
  subtitles?: SubdlSubtitle[];
};

type SubdlResponse = {
  status?: boolean;
  error?: string;
  results?: SubdlResult[];
  subtitles?: SubdlSubtitle[];
};

const request = async (
  key: string,
  language: string,
  params: Record<string, string>,
): Promise<SubdlResponse> => {
  const url = new URL(SUBDL_API);
  url.searchParams.set('api_key', key);
  url.searchParams.set('languages', language);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  const res = await fetch(url, { credentials: 'omit' });
  if (!res.ok) throw new Error(`SubDL ${res.status} ${res.statusText}`);
  const data = (await res.json()) as SubdlResponse;
  if (data.status === false) throw new Error(data.error || 'SubDL request failed');
  return data;
};

const searchByTitle = async (
  key: string,
  language: string,
  query: string,
): Promise<SeriesHit[]> => {
  const data = await request(key, language, { film_name: query, type: 'tv', subs_per_page: '30' });
  return (data.results ?? [])
    .filter((result) => result.name)
    .map((result) => ({
      id: String(result.sd_id ?? result.name),
      title: result.name as string,
      year: result.year,
    }));
};

/**
 * SubDL indexes English titles only. A query in another script that finds nothing is retried
 * with its English translation; both the retry and a translation failure stay invisible to the
 * caller, which sees a plain empty result list instead of an error.
 */
const searchWithTranslation = async (
  key: string,
  language: string,
  query: string,
): Promise<SeriesHit[]> => {
  const direct = await searchByTitle(key, language, query);
  if (direct.length) return direct;
  let english: string | null = null;
  try {
    english = await requestEnglishQuery(query);
  } catch {
    english = null;
  }
  if (!english || english.toLowerCase() === query.toLowerCase()) return direct;
  return searchByTitle(key, language, english);
};

const toEpisode = (subtitle: SubdlSubtitle, fallbackLanguage: string): EpisodeFile | null => {
  if (!subtitle.url) return null;
  const url = subtitle.url.startsWith('http') ? subtitle.url : `${SUBDL_DOWNLOAD}${subtitle.url}`;
  const sizes = (subtitle.unpack_files ?? [])
    .map((file) => file.size)
    .filter((size): size is number => typeof size === 'number' && size > 0);
  return {
    id: url,
    name: subtitle.release_name || subtitle.name || url.split('/').pop() || 'subtitle.zip',
    language: subtitle.language || fallbackLanguage,
    url,
    release: subtitle.release_name,
    size: sizes.length ? sizes.reduce((sum, size) => sum + size, 0) : undefined,
    sourceUrl: subtitle.subtitlePage
      ? new URL(subtitle.subtitlePage, SUBDL_SITE).toString()
      : undefined,
  };
};

/**
 * One provider instance per subtitle language, all sharing the `subdl` key id: a key saved while
 * searching one language is reused for every other. Any language is accepted — the code is derived
 * by `subdlCode`, so an id outside the curated list still reaches the API.
 */
export const createSubdlProvider = (
  key: string,
  language: SubtitleLanguageId = 'en',
): SubtitleProvider => {
  const languageCode = subdlCode(language);
  return {
    id: 'subdl',
    language,
    requiresKey: true,

    search: (query) => searchWithTranslation(key, languageCode, query.trim()),

    async listEpisodes(hit, { season, episode }) {
      // `unpack=1` adds per-file `size` entries; it does not change the download URL we use.
      const params: Record<string, string> = {
        sd_id: hit.id,
        type: 'tv',
        subs_per_page: '30',
        unpack: '1',
      };
      if (season !== undefined) params.season_number = String(season);
      if (episode !== undefined) params.episode_number = String(episode);
      const data = await request(key, languageCode, params);
      const subtitles = data.subtitles ?? data.results?.[0]?.subtitles ?? [];
      return subtitles
        .map((subtitle) => toEpisode(subtitle, languageCode))
        .filter((item): item is EpisodeFile => item !== null);
    },

    fetch: (episode) => fetchSubtitleFiles(episode.url),
  };
};

/** SubDL serves any language id, so it is the fallback for ids the curated lists do not name. */
const SUBDL_DESCRIPTOR: ProviderDescriptor = {
  id: 'subdl',
  requiresKey: true,
  subtitleLanguages: SUBDL_LANGUAGES,
  create: createSubdlProvider,
};

export const PROVIDERS: ProviderDescriptor[] = [SUBDL_DESCRIPTOR];

/**
 * The provider that can search the given subtitle language. Japanese belongs to kitsunekko, so it
 * has none here; every other id — including one typed by the user — resolves to SubDL.
 */
export const providerFor = (language: SubtitleLanguageId): ProviderDescriptor | undefined => {
  const id = language.trim();
  if (!id || id === 'ja') return undefined;
  return PROVIDERS.find((provider) => provider.subtitleLanguages.includes(id)) ?? SUBDL_DESCRIPTOR;
};
