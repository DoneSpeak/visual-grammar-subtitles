import type { LayerCfg, LayerId, PageCfg } from './types';
import { defaultLayer, defaultPageCfg } from './types';

// Playback-position and referral params must not split the key, otherwise the same
// video reached from two links gets two subtitle associations.
const VOLATILE_PARAMS = /^(?:utm_.*|t|start|end|si|feature|pp|list|ab_channel|spm_id_from|from_spmid|from_source|vd_source|share_source|share_medium|fbclid|gclid|ref_src)$/i;

export const pageKeyFromUrl = (url: string): string => {
  try {
    const u = new URL(url);
    const params = [...u.searchParams.entries()]
      .filter(([name]) => !VOLATILE_PARAMS.test(name))
      .sort(([a], [b]) => a.localeCompare(b));
    const search = params.length ? `?${new URLSearchParams(params).toString()}` : '';
    // Hash routers (#/watch/123) are part of the route; plain anchors are not.
    const hash = /^#!?\//.test(u.hash) ? u.hash : '';
    return `${u.origin}${u.pathname}${search}${hash}`;
  } catch {
    return url;
  }
};

/** The video often lives in a cross-origin iframe, so the tab URL (not location.href) is the stable key. */
export const resolvePageKey = async (): Promise<string> => {
  const url = await resolvePageUrl();
  return pageKeyFromUrl(url);
};

/** Tab URL, used to match site rules; falls back to the referrer inside cross-origin iframes. */
export const resolvePageUrl = async (): Promise<string> => {
  if (window === window.top) return location.href;
  try {
    const res = await chrome.runtime.sendMessage({ type: 'pageKey' });
    if (res?.url) return res.url as string;
  } catch {
    // background unavailable — fall through
  }
  const ref = document.referrer;
  if (ref && /^https?:/i.test(ref)) return ref;
  return location.href;
};

const storageKey = (key: string) => `cfg:${key}`;

const mergeLayer = (base: LayerCfg, saved?: Partial<LayerCfg>): LayerCfg => ({ ...base, ...saved });

export const loadPageCfg = async (key: string): Promise<PageCfg> => {
  const raw = await chrome.storage.local.get(storageKey(key));
  const saved = raw[storageKey(key)] as PageCfg | undefined;
  const base = defaultPageCfg();
  if (!saved) return base;
  return {
    ...base,
    ...saved,
    subs: {
      a: { ...base.subs.a, ...saved.subs?.a },
      b: { ...base.subs.b, ...saved.subs?.b },
    },
    layers: {
      a: mergeLayer(base.layers.a, saved.layers?.a),
      b: mergeLayer(base.layers.b, saved.layers?.b),
    },
  };
};

export const savePageCfg = async (key: string, cfg: PageCfg): Promise<void> => {
  await chrome.storage.local.set({ [storageKey(key)]: cfg });
};

export const makeSaver = (key: string, getCfg: () => PageCfg) => {
  let timer: number | undefined;
  return () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = window.setTimeout(() => {
      void savePageCfg(key, getCfg());
      timer = undefined;
    }, 300);
  };
};

export const mergeDefaultLayer = defaultLayer;

/** Which library item (or local file name) was used for this video and layer. */
export type SubAssoc = { id: string; name: string; at: number };
export type AssocMap = Partial<Record<LayerId, SubAssoc>>;

const assocStorageKey = (key: string) => `assoc:${key}`;

export const loadAssoc = async (key: string): Promise<AssocMap> => {
  const raw = await chrome.storage.local.get(assocStorageKey(key));
  return (raw[assocStorageKey(key)] as AssocMap | undefined) ?? {};
};

export const setAssoc = async (key: string, layer: LayerId, value: SubAssoc | null): Promise<void> => {
  const map = await loadAssoc(key);
  if (value) map[layer] = value;
  else delete map[layer];
  const name = assocStorageKey(key);
  if (Object.keys(map).length === 0) await chrome.storage.local.remove(name);
  else await chrome.storage.local.set({ [name]: map });
};