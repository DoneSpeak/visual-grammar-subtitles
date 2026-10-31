import { describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import fixture from '../../packages/subtitle-contract/fixture.sanno.json';
import { cueTokens, trackHash, validateDocument } from '@/nlp/contract';
import { endpoint } from '@/nlp/settings';

vi.stubGlobal('crypto', webcrypto);

describe('subtitle annotation contract', () => {
  it('matches the Python normalization fingerprint and validates real GiNZA output', async () => {
    expect(await trackHash(fixture.track.cues)).toBe(fixture.source.trackHash);
    const doc = await validateDocument(fixture);
    for (const cue of doc.track.cues) {
      const tokens = cueTokens(doc, cue.id, 'syntax-focus');
      expect(tokens?.map(t => t.surface).join('')).toBe(cue.text);
    }
  });
  it('rejects another track, broken references, and split surrogate pairs', async () => {
    await expect(validateDocument(fixture, '0'.repeat(64))).rejects.toThrow();
    const bad = structuredClone(fixture);
    bad.units[0].tokens[1].start = 2;
    await expect(validateDocument(bad)).rejects.toThrow();
    const broken = structuredClone(fixture);
    broken.units[0].dependencies[0].dependentTokenId = 'missing';
    await expect(validateDocument(broken)).rejects.toThrow();
  });
  it('rejects duplicate mappings and unknown major schema versions', async () => {
    const bad = structuredClone(fixture);
    bad.units[0].mappings.push(bad.units[0].mappings[0]);
    await expect(validateDocument(bad)).rejects.toThrow();
    await expect(validateDocument({ ...fixture, schemaVersion: '2.0.0' })).rejects.toThrow();
  });
  it('falls back for the entire cue when any mapped unit fails', async () => {
    const doc = await validateDocument(fixture);
    const failed = structuredClone(doc);
    failed.units[0].status = 'failed';
    expect(cueTokens(failed, failed.track.cues[0].id, 'syntax-focus')).toBeNull();
  });
  it('allows loopback HTTP and HTTPS but rejects credential and redirect-shaped URLs', () => {
    expect(endpoint('http://127.0.0.1:8765')).toBe('http://127.0.0.1:8765');
    expect(endpoint('https://nlp.example.com')).toBe('https://nlp.example.com');
    for (const url of ['http://example.com', 'file:///tmp/server', 'https://a:b@example.com', 'http://127.0.0.1:8765/?next=x']) expect(() => endpoint(url)).toThrow();
  });
});

it('does not attach a completed old-track analysis to a new selection', async () => {
  const { TrackAnalysis } = await import('@/nlp/client');
  const { defaults } = await import('@/nlp/settings');
  let finishOld: (value: unknown) => void = () => {};
  let starts = 0;
  vi.stubGlobal('chrome', { runtime: { sendMessage: vi.fn(async (msg) => {
    if (msg.action === 'settings') return { ...defaults, enabled: true, profile: 'syntax-focus' };
    starts++;
    if (starts === 1) return new Promise(resolve => { finishOld = resolve; });
    return {};
  }) } });
  const controller = new TrackAnalysis();
  const oldCues = fixture.track.cues.map(c => ({ start: c.startMs / 1000, end: c.endMs / 1000, text: c.text }));
  const first = controller.select(oldCues);
  await vi.waitFor(() => expect(starts).toBe(1));
  const newCue = { start: 0, end: 1, text: '別の字幕' };
  await controller.select([newCue]);
  finishOld({ document: fixture });
  await first;
  expect(controller.tokens(newCue)).toBeNull();
  expect(controller.tokens(oldCues[0])).toBeNull();
});
