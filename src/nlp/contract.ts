import { normalizePos, type Cue, type Token } from '@/shared/types';
import { validateShape } from './schema';
export type Span = { start: number; end: number };
export type Annotation = { id: string; layer: string; label: string; quality: string; spans: Span[] };
export type AnalysisToken = Span & { id: string; surface: string; pos: string; rawPos?: string; lemma?: string; reading?: string };
export type AnalysisUnit = { id: string; providerId: string; status: 'complete' | 'failed'; capabilities: string[]; text: string; offsetEncoding: 'utf16'; mappings: { unitStart: number; unitEnd: number; cueId: string; cueStart: number; cueEnd: number }[]; tokens: AnalysisToken[]; annotations: Annotation[]; dependencies: { dependentTokenId: string; headTokenId: string | null; relation: string }[] };
export type TrackCue = { id: string; startMs: number; endMs: number; text: string };
export type AnalysisDocument = { format: 'subtitle-annotation'; schemaVersion: string; documentId: string; source: { trackHash: string; rawSha256: string; normalizationVersion: 'track-v1'; format: string }; track: { language: string; cues: TrackCue[] }; providers: { id: string; kind: string; capabilities: string[] }[]; units: AnalysisUnit[] };
export const hash = async (text: string): Promise<string> => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), n => n.toString(16).padStart(2, '0')).join('');
export const toTrack = (cues: Cue[]): TrackCue[] => cues.map((c, i) => ({ id: `c${String(i + 1).padStart(6, '0')}`, startMs: Math.round(c.start * 1000), endMs: Math.round(c.end * 1000), text: c.text }));
export const trackHash = (cues: TrackCue[], language = 'ja') => hash(JSON.stringify(['track-v1', language, cues.map(c => [c.startMs, c.endMs, c.text])]));

export async function validateDocument(input: unknown, expectedHash?: string): Promise<AnalysisDocument> {
  validateShape(input);
  const d = input as AnalysisDocument;
  if (!d || d.format !== 'subtitle-annotation' || !/^1\.\d+\.\d+$/.test(d.schemaVersion) || d.source?.normalizationVersion !== 'track-v1' || !/^[a-f0-9]{64}$/.test(d.source.rawSha256) || d.track?.language !== 'ja' || !Array.isArray(d.track.cues) || d.track.cues.length > 50000 || !Array.isArray(d.units) || !Array.isArray(d.providers)) throw Error('Invalid analysis document');
  const actualHash = await trackHash(d.track.cues);
  if (actualHash !== d.source.trackHash || (expectedHash && expectedHash !== actualHash)) throw Error('Subtitle fingerprint mismatch');
  const cues = new Map(d.track.cues.map(c => [c.id, c]));
  if (cues.size !== d.track.cues.length) throw Error('Duplicate cue');
  for (const c of cues.values()) if (typeof c.text !== 'string' || !Number.isSafeInteger(c.startMs) || !Number.isSafeInteger(c.endMs) || c.startMs < 0 || c.endMs < c.startMs) throw Error('Invalid cue');
  const segmenter = new Intl.Segmenter('ja', { granularity: 'grapheme' });
  const boundaryCache = new Map<string, Set<number>>();
  const slice = (text: string, start: number, end: number) => {
    let boundaries = boundaryCache.get(text);
    if (!boundaries) { boundaries = new Set([text.length, ...Array.from(segmenter.segment(text), s => s.index)]); boundaryCache.set(text, boundaries); }
    if (!Number.isInteger(start) || !Number.isInteger(end) || start >= end || !boundaries.has(start) || !boundaries.has(end)) throw Error('Invalid annotation offset');
    return text.slice(start, end);
  };
  const covered = new Map<string, Span[]>();
  const unitIds = new Set<string>();
  for (const u of d.units) {
    if (unitIds.has(u.id) || !d.providers.some(p => p.id === u.providerId) || u.offsetEncoding !== 'utf16' || !['complete', 'failed'].includes(u.status)) throw Error('Invalid analysis unit');
    unitIds.add(u.id);
    const ids = new Set<string>(); let last = 0;
    for (const t of u.tokens) {
      if (ids.has(t.id) || t.start < last || slice(u.text, t.start, t.end) !== t.surface) throw Error('Invalid token');
      ids.add(t.id); last = t.end;
    }
    for (const m of u.mappings) {
      const c = cues.get(m.cueId);
      if (!c || slice(u.text, m.unitStart, m.unitEnd) !== slice(c.text, m.cueStart, m.cueEnd)) throw Error('Invalid mapping');
      const spans = covered.get(c.id) ?? [];
      if (spans.some(s => m.cueStart < s.end && s.start < m.cueEnd)) throw Error('Overlapping mappings');
      spans.push({ start: m.cueStart, end: m.cueEnd }); covered.set(c.id, spans);
    }
    for (const a of u.annotations) for (const s of a.spans) slice(u.text, s.start, s.end);
    for (const e of u.dependencies) if (!ids.has(e.dependentTokenId) || (e.headTokenId !== null && !ids.has(e.headTokenId))) throw Error('Invalid dependency');
  }
  return d;
}

// Compile intersecting annotations into disjoint pieces. A split token retains its reading in details only.
export function cueTokens(d: AnalysisDocument, cueId: string, profile: string): Token[] | null {
  const cue = d.track.cues.find(c => c.id === cueId);
  if (!cue) return null;
  const parts: { start: number; end: number; token?: AnalysisToken; labels: string[]; groups: Record<string, string> }[] = [];
  const mappings = d.units.flatMap(u => u.mappings.filter(m => m.cueId === cueId).map(m => ({ u, m }))).sort((a, b) => a.m.cueStart - b.m.cueStart);
  let end = 0;
  for (const { u, m } of mappings) {
    if (u.status !== 'complete' || m.cueStart !== end) return null;
    end = m.cueEnd;
    const boundaries = new Set([m.unitStart, m.unitEnd]);
    for (const s of [...u.tokens, ...u.annotations.flatMap(a => a.spans)]) for (const n of [s.start, s.end]) if (n > m.unitStart && n < m.unitEnd) boundaries.add(n);
    const sorted = [...boundaries].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
      const start = sorted[i - 1], finish = sorted[i];
      // The annotation id is what lets the renderer know two adjacent tokens sit in the same
      // chunk: labels alone would merge neighbouring bunsetsu.
      const covering = u.annotations.filter(a => a.spans.some(s => s.start <= start && s.end >= finish));
      parts.push({ start: start - m.unitStart + m.cueStart, end: finish - m.unitStart + m.cueStart,
        token: u.tokens.find(t => t.start <= start && t.end >= finish),
        labels: covering.map(a => `${a.layer}:${a.label}`),
        groups: Object.fromEntries(covering.map(a => [a.layer, a.id])) });
    }
  }
  if (end !== cue.text.length) return null;
  return parts.map(p => {
    const surface = cue.text.slice(p.start, p.end), t = p.token;
    return { surface, pos: normalizePos(t?.pos), posRaw: t?.pos, baseForm: t?.lemma ?? '', reading: surface === t?.surface ? t.reading ?? '' : '', grammar: p.labels, groups: p.groups, studyProfile: profile };
  });
}
