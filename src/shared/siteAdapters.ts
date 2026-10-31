import type { SiteAdapterId } from './types';

export type AdapterHit = {
  seriesId: string | null;
  seriesTitle: string | null;
  season: string | null;
  episode: number | null;
};

type PgcReply = {
  seasonId?: number;
  title?: string;
  episodes?: { id: number; ep: number | null }[];
  error?: string;
};

const BILIBILI_PLAY = /\/bangumi\/play\/(ep|ss)(\d+)/;

/** `/bangumi/play/ep510759` → season 41417, 夏日重现, episode 1 (via the background lookup). */
const resolveBilibili = async (url: string): Promise<AdapterHit | null> => {
  let matched: RegExpExecArray | null;
  try {
    matched = BILIBILI_PLAY.exec(new URL(url).pathname);
  } catch {
    return null;
  }
  if (!matched) return null;

  const [, kind, id] = matched;
  let reply: PgcReply | undefined;
  try {
    reply = (await chrome.runtime.sendMessage({
      type: 'bilibiliPgcSeason',
      epId: kind === 'ep' ? id : undefined,
      seasonId: kind === 'ss' ? id : undefined,
    })) as PgcReply | undefined;
  } catch {
    return null;
  }
  if (!reply || reply.error || reply.seasonId === undefined) return null;

  const episodes = reply.episodes ?? [];
  const episode =
    kind === 'ep' ? (episodes.find((ep) => String(ep.id) === id)?.ep ?? null) : (episodes[0]?.ep ?? null);
  return { seriesId: String(reply.seasonId), seriesTitle: reply.title ?? null, season: null, episode };
};

const ADAPTERS: Record<SiteAdapterId, (url: string) => Promise<AdapterHit | null>> = {
  bilibili: resolveBilibili,
};

export const resolveWithAdapter = async (adapter: SiteAdapterId, url: string): Promise<AdapterHit | null> =>
  ADAPTERS[adapter]?.(url) ?? null;