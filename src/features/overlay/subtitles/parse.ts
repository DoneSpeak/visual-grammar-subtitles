import type { Cue } from '@/shared/types';

const TIME_RE = /(?:(\d+):)?(\d{1,3}):(\d{1,2})[.,](\d{1,3})/;

const parseTime = (raw: string): number => {
  const m = raw.match(TIME_RE);
  if (!m) return NaN;
  const [, h, mm, ss, frac] = m;
  return Number(h ?? 0) * 3600 + Number(mm) * 60 + Number(ss) + Number(frac.padEnd(3, '0')) / 1000;
};

const cleanText = (text: string): string =>
  text
    .replace(/<[^>]*>/g, '')
    .replace(/\{\\[^}]*\}/g, '')
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n');

const parseCueBlocks = (src: string): Cue[] => {
  const blocks = src.replace(/\r/g, '').split(/\n\s*\n/);
  const cues: Cue[] = [];
  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.trim() !== '');
    const timeIdx = lines.findIndex((l) => l.includes('-->'));
    if (timeIdx < 0) continue;
    const [left, right] = lines[timeIdx].split('-->');
    const start = parseTime(left ?? '');
    const end = parseTime((right ?? '').trim().split(/\s+/)[0] ?? '');
    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) continue;
    const text = cleanText(lines.slice(timeIdx + 1).join('\n'));
    if (text) cues.push({ start, end, text });
  }
  return cues;
};

const splitAssFields = (line: string, fieldCount: number): string[] => {
  const parts = line.split(',');
  if (fieldCount > 0 && parts.length > fieldCount) {
    return [...parts.slice(0, fieldCount - 1), parts.slice(fieldCount - 1).join(',')];
  }
  return parts;
};

const parseAss = (src: string): Cue[] => {
  let inEvents = false;
  let format: string[] = [];
  const cues: Cue[] = [];
  for (const rawLine of src.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith('[')) {
      inEvents = /^\[events\]$/i.test(line);
      continue;
    }
    if (!inEvents) continue;
    if (/^format\s*:/i.test(line)) {
      format = line.slice(line.indexOf(':') + 1).split(',').map((f) => f.trim().toLowerCase());
      continue;
    }
    if (!/^dialogue\s*:/i.test(line)) continue;
    const parts = splitAssFields(line.slice(line.indexOf(':') + 1), format.length);
    const pick = (name: string) => parts[format.indexOf(name)] ?? '';
    const start = parseTime(pick('start'));
    const end = parseTime(pick('end'));
    const text = cleanText(pick('text').replace(/\\N/gi, '\n').replace(/\\h/g, ' '));
    if (Number.isNaN(start) || Number.isNaN(end) || end <= start || !text) continue;
    cues.push({ start, end, text });
  }
  return cues;
};

export const parseSubtitles = (src: string): Cue[] => {
  const sorted = /^\s*\[script info\]/im.test(src) || /^\s*dialogue\s*:/im.test(src) ? parseAss(src) : parseCueBlocks(src);
  return sorted.sort((a, b) => a.start - b.start);
};