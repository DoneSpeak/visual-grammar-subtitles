export const NLP_SETTINGS_KEY = 'nlp:settings';
export const NLP_TOKEN_KEY = 'nlp:apiToken';
export type NlpSettings = { enabled: boolean; baseUrl: string; sourcePreference: 'prefer-remote' | 'local-only' };
export const defaults: NlpSettings = { enabled: false, baseUrl: 'http://127.0.0.1:8765', sourcePreference: 'prefer-remote' };
export const loadNlpSettings = async (): Promise<NlpSettings> => ({ ...defaults, ...((await chrome.storage.local.get(NLP_SETTINGS_KEY))[NLP_SETTINGS_KEY] as Partial<NlpSettings> | undefined) });
export function endpoint(value: string): string {
  const u = new URL(value);
  if (u.username || u.password || u.search || u.hash || u.pathname !== '/' || (u.protocol !== 'https:' && !(u.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)))) throw Error('Use a loopback HTTP or HTTPS origin');
  return u.origin;
}
