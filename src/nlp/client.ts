import type { Cue } from '@/shared/types';
import { cueTokens, toTrack, validateDocument, type AnalysisDocument } from './contract';
import { defaults, type NlpSettings } from './settings';

export class TrackAnalysis {
  private generation = 0;
  private document: AnalysisDocument | null = null;
  private cues: Cue[] = [];
  private language = 'ja';
  private settings: NlpSettings = defaults;
  status = '';
  private async request(payload: Record<string, unknown>) {
    const result = await chrome.runtime.sendMessage({ type: 'nlp', ...payload });
    if (result?.error) throw Error(result.error);
    return result;
  }
  async select(cues: Cue[], language: string) {
    const generation = ++this.generation;
    this.document = null; this.cues = cues; this.language = language;
    if (!cues.length) return;
    try {
      this.settings = await this.request({ action: 'settings' });
      let result = await this.request({ action: 'start', cues: toTrack(cues), language });
      const { jobId, baseUrl, trackHash } = result;
      const deadline = Date.now() + 600000;
      let delay = 1000;
      while (!result.document && jobId && generation === this.generation) {
        if (['failed', 'cancelled'].includes(result.status)) throw Error(`NLP ${result.status}`);
        if (Date.now() > deadline) throw Error('NLP timeout');
        this.status = `NLP: ${result.status}`;
        await new Promise(resolve => setTimeout(resolve, delay + Math.random() * 200));
        if (generation !== this.generation) return;
        result = await this.request({ action: 'poll', jobId, baseUrl, hash: trackHash });
        delay = Math.min(5000, delay * 1.5);
      }
      if (generation === this.generation && result.document) {
        const document = await validateDocument(result.document);
        if (generation !== this.generation) return;
        this.document = document;
        this.status = result.persisted === false ? 'NLP ready (session only)' : 'NLP ready';
      }
    } catch (error) { if (generation === this.generation) { this.status = String(error); console.info('[jp-sub] Local NLP fallback:', error); } }
  }
  async refreshSettings() {
    const previous = this.settings;
    this.settings = await this.request({ action: 'settings' });
    if (this.settings.enabled && this.settings.sourcePreference !== 'local-only' && (!previous.enabled || previous.baseUrl !== this.settings.baseUrl || previous.sourcePreference === 'local-only')) void this.select(this.cues, this.language);
  }
  ready(): boolean {
    return this.document !== null;
  }
  tokens(cue: Cue) {
    if (!this.document || this.settings.sourcePreference === 'local-only') return null;
    const index = this.cues.indexOf(cue);
    if (index < 0) return null;
    return cueTokens(this.document, `c${String(index + 1).padStart(6, '0')}`, '');
  }
  stop() { this.generation++; this.document = null; }
}
