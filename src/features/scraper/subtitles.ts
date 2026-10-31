import { extractZip, isZip } from './zip.ts';

export type FetchedSubtitle = { name: string; text: string };

const SUBTITLE_EXT = /\.(srt|vtt|ass|ssa)$/i;

const basename = (path: string): string => path.split('/').pop() || path;

/** Japanese subtitle files are commonly UTF-8, but Shift-JIS uploads still exist. */
export const decodeSubtitleBytes = (bytes: Uint8Array): string => {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder('utf-8').decode(bytes.subarray(3));
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('shift_jis').decode(bytes);
  }
};

const fetchBytes = async (url: string): Promise<Uint8Array> => {
  const res = await fetch(url, { credentials: 'omit' });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return new Uint8Array(await res.arrayBuffer());
};

export const fetchSubtitleFiles = async (url: string): Promise<FetchedSubtitle[]> => {
  const bytes = await fetchBytes(url);
  if (!isZip(bytes)) {
    const name = basename(new URL(url).pathname);
    return SUBTITLE_EXT.test(name) ? [{ name, text: decodeSubtitleBytes(bytes) }] : [];
  }
  const entries = await extractZip(bytes);
  return entries
    .filter((entry) => SUBTITLE_EXT.test(entry.name))
    .map((entry) => ({ name: basename(entry.name), text: decodeSubtitleBytes(entry.bytes) }));
};