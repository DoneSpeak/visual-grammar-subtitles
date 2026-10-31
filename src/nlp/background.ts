import { hash, trackHash, validateDocument, type TrackCue } from './contract';
import { readAnalysis, saveAnalysis } from './repository';
import { endpoint, loadNlpSettings, NLP_TOKEN_KEY } from './settings';

async function api(path: string, init: RequestInit = {}) {
  const cfg = await loadNlpSettings();
  if (!cfg.enabled || cfg.sourcePreference === 'local-only') throw Error('Remote NLP disabled');
  const base = endpoint(cfg.baseUrl);
  const token = (await chrome.storage.local.get(NLP_TOKEN_KEY))[NLP_TOKEN_KEY] ?? '';
  const response = await fetch(base + path, { ...init, redirect: 'error', signal: AbortSignal.timeout(30000), headers: { ...init.headers, Authorization: `Bearer ${token}`, 'X-NLP-Extension-Origin': chrome.runtime.getURL('').replace(/\/$/, '') } });
  if (!response.ok) throw Error(`NLP HTTP ${response.status}`);
  const reader = response.body!.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 100 * 1024 * 1024) { await reader.cancel(); throw Error('Analysis exceeds 100 MiB'); } chunks.push(value); }
  const bytes = new Uint8Array(size); let at = 0; for (const c of chunks) { bytes.set(c, at); at += c.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}
export async function nlpMessage(msg: { action: string; cues?: TrackCue[]; hash?: string; jobId?: string; baseUrl?: string }) {
  const cfg = await loadNlpSettings();
  if (msg.action === 'settings') return cfg; // Credentials never cross into content scripts.
  if (msg.action === 'capabilities') return api('/api/v1/capabilities');
  if (cfg.sourcePreference === 'local-only') return {};
  if (msg.action === 'start') {
    const cues = msg.cues!;
    const fingerprint = await trackHash(cues);
    const cached = await readAnalysis(fingerprint).catch(() => null);
    if (cached) return { document: cached };
    if (!cfg.enabled) return {};
    const capabilities = await api('/api/v1/capabilities');
    if (!capabilities.formats.includes('cue-json-v1')) throw Error('Service does not support complete cue tracks');
    const file = JSON.stringify({ format: 'cue-json-v1', cues });
    if (new TextEncoder().encode(file).length > 10 * 1024 * 1024) throw Error('Subtitle exceeds 10 MiB');
    const rawSha256 = await hash(file);
    const metadata = { rawSha256, trackHash: fingerprint, normalizationVersion: 'track-v1', language: 'ja', encoding: 'utf-8', requestedCapabilities: capabilities.capabilities.slice().sort(), schemaMajor: 1 };
    const form = new FormData(); form.set('file', new Blob([file], { type: 'application/json' }), 'track.json'); form.set('metadata', JSON.stringify(metadata));
    const baseUrl = endpoint(cfg.baseUrl);
    const key = await hash(JSON.stringify([baseUrl, fingerprint, capabilities.providerFingerprint, metadata.requestedCapabilities]));
    const retryStorageKey = `nlp:retry:${key}`;
    let requestKey = String((await chrome.storage.local.get(retryStorageKey))[retryStorageKey] ?? key);
    const submit = () => api('/api/v1/analyses', { method: 'POST', headers: { 'Idempotency-Key': requestKey }, body: form });
    let result = await submit();
    if (['failed', 'cancelled'].includes(result.status)) {
      requestKey = await hash(JSON.stringify([key, result.jobId]));
      await chrome.storage.local.set({ [retryStorageKey]: requestKey });
      result = await submit();
    }
    return { ...result, baseUrl };
  }
  if (endpoint(cfg.baseUrl) !== msg.baseUrl) throw Error('NLP endpoint changed');
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(msg.jobId ?? '')) throw Error('Invalid job ID');
  const path = `/api/v1/analyses/${msg.jobId}`;
  const status = await api(path);
  if (status.status === 'succeeded') {
    const doc = await validateDocument(await api(`${path}/result`), msg.hash);
    let persisted = true;
    try { await saveAnalysis(doc); } catch { persisted = false; }
    return { document: doc, persisted };
  }
  return status;
}
