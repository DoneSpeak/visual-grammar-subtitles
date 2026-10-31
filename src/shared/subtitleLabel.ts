/** Display labels for subtitle files: turn raw file names into "01 Herr Dr. Tenma". */

export const baseName = (fileName: string): string => fileName.replace(/\.[^.]+$/, '');

/** Longest prefix/suffix shared by every file in a pack, trimmed to a separator. */
export const commonAffixes = (names: string[]): { prefix: string; suffix: string } => {
  if (names.length < 2) return { prefix: '', suffix: '' };
  const bases = names.map(baseName);
  let prefix = bases[0];
  for (const base of bases) {
    let i = 0;
    while (i < prefix.length && i < base.length && prefix[i] === base[i]) i += 1;
    prefix = prefix.slice(0, i);
  }
  let suffix = bases[0];
  for (const base of bases) {
    let i = 0;
    while (i < suffix.length && i < base.length && suffix[suffix.length - 1 - i] === base[base.length - 1 - i]) i += 1;
    suffix = suffix.slice(suffix.length - i);
  }

  let cut = -1;
  for (const ch of [' ', '.', '_', '-']) cut = Math.max(cut, prefix.lastIndexOf(ch));
  prefix = cut >= 0 ? prefix.slice(0, cut + 1) : '';

  const firstSep = suffix.search(/[\s._-]/);
  suffix = firstSep < 0 ? '' : suffix.slice(firstSep);
  return { prefix, suffix };
};

const CHAPTER_NOISE = /^(?:chapter|ch|ep|episode|第)?[\s._-]*0*(\d{1,4})$/i;
const LANG_TAIL = /[\s._-]+(?:jpn|jp|ja|japanese|eng|en|english|zh|chs|cht|chi|chinese|kor|kr)$/i;
const HASH_TAG = /\[[0-9a-f]{6,8}\]/gi;

/** "Herr_Dr._Tenma_[5CBB3C92]" → "Herr Dr. Tenma" */
const cleanTitle = (raw: string): string =>
  raw
    .replace(HASH_TAG, ' ')
    .replace(/_+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export type ParsedEntry = { ep: number | null; title: string };

/** "Monster S01E01 Herr_Dr._Tenma_[5CBB3C92].srt" → { ep: 1, title: "Herr Dr. Tenma" } */
export const parseEntry = (name: string, affix: { prefix: string; suffix: string }): ParsedEntry => {
  const base = baseName(name);
  let core = base;
  if (affix.prefix && base.startsWith(affix.prefix)) core = base.slice(affix.prefix.length);
  if (affix.suffix && core.endsWith(affix.suffix)) core = core.slice(0, -affix.suffix.length);
  core = core.replace(/^[\s._-]+|[\s._-]+$/g, '');
  if (!core) return { ep: null, title: cleanTitle(base) };

  const se = core.match(/s(\d{1,2})[\s._-]*e(\d{1,4})/i);
  const lead = core.match(/^(\d{1,4})(?=[\s._-]|$)/);
  const jp = core.match(/第\s*(\d{1,3})\s*[話话集]/);

  let ep: string | undefined;
  let after = 0;
  if (se) {
    ep = se[2];
    after = (se.index ?? 0) + se[0].length;
  } else if (lead) {
    ep = lead[1];
    after = lead[0].length;
  } else if (jp) {
    ep = jp[1];
    after = (jp.index ?? 0) + jp[0].length;
  } else {
    ep = base.match(/s(\d{1,2})[\s._-]*e(\d{1,4})/i)?.[2];
  }
  if (!ep) return { ep: null, title: cleanTitle(core) };

  let rest = cleanTitle(core.slice(after)).replace(LANG_TAIL, '').trim();
  const noise = rest.match(CHAPTER_NOISE);
  if (noise && Number(noise[1]) === Number(ep)) rest = '';

  return { ep: Number(ep), title: rest };
};

export type SubtitleLabel = ParsedEntry & { label: string };

/** Labels depend on the whole pack: shared prefix/suffix and episode number padding. */
export const describeSubtitles = (names: string[]): Map<string, SubtitleLabel> => {
  const affix = commonAffixes(names);
  const parsed = names.map((name) => [name, parseEntry(name, affix)] as const);
  const width = Math.max(2, String(parsed.reduce((max, [, p]) => Math.max(max, p.ep ?? 0), 0)).length);
  const out = new Map<string, SubtitleLabel>();
  for (const [name, p] of parsed) {
    const label =
      p.ep === null ? p.title : `${String(p.ep).padStart(width, '0')}${p.title ? ` ${p.title}` : ''}`;
    out.set(name, { ...p, label });
  }
  return out;
};