/** bilibili PGC season lookup, run in the background worker: content scripts cannot
 *  fetch another origin (and the API only allows a page-origin CORS request anyway). */

export type PgcEpisode = { id: number; ep: number | null };
export type PgcSeason = { seasonId: number; title: string; episodes: PgcEpisode[] };

export type PgcQuery = { epId?: string; seasonId?: string };

const CACHE_TTL_MS = 10 * 60 * 1000;
// The content script blocks overlay setup on this lookup; a slow API is worth less than a late overlay.
const TIMEOUT_MS = 2500;

const cache = new Map<string, { at: number; value: Promise<PgcSeason | null> }>();

/** "1" → 1; "PV1" / "12.5" stay out of the integer slot the filename heuristic compares. */
const parseEpisode = (title: unknown): number | null => {
  const text = String(title ?? '').trim();
  if (!/^\d+$/.test(text)) return null;
  const value = Number(text);
  return value > 0 ? value : null;
};

const readSeason = async (query: PgcQuery): Promise<PgcSeason | null> => {
  const param = query.epId
    ? `ep_id=${encodeURIComponent(query.epId)}`
    : `season_id=${encodeURIComponent(query.seasonId ?? '')}`;
  const res = await fetch(`https://api.bilibili.com/pgc/view/web/season?${param}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) return null;

  const body = (await res.json()) as {
    code?: number;
    result?: {
      season_id?: number;
      title?: string;
      season_title?: string;
      episodes?: { id?: number; ep_id?: number; title?: unknown }[];
    };
  };
  const result = body.result;
  if (body.code !== 0 || !result || !Number.isFinite(result.season_id)) return null;

  return {
    seasonId: Number(result.season_id),
    title: result.season_title || result.title || '',
    episodes: (result.episodes ?? [])
      .map((ep) => ({ id: Number(ep.id ?? ep.ep_id), ep: parseEpisode(ep.title) }))
      .filter((ep) => Number.isFinite(ep.id)),
  };
};

export const fetchPgcSeason = (query: PgcQuery): Promise<PgcSeason | null> => {
  const key = query.epId ? `ep:${query.epId}` : `ss:${query.seasonId ?? ''}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  const value = readSeason(query).catch(() => null);
  cache.set(key, { at: Date.now(), value });
  // A failed lookup is not worth remembering; the next episode switch retries.
  void value.then((season) => {
    if (!season) cache.delete(key);
  });
  return value;
};