import { useEffect, useRef, useState } from 'react';

import { Button, Card, CardTitle, Input } from '@/design-system';
import { validateDocument } from '@/nlp/contract';
import { listAnalyses, saveAnalysis } from '@/nlp/repository';
import { defaults, endpoint, loadNlpSettings, NLP_SETTINGS_KEY, NLP_TOKEN_KEY, type NlpSettings } from '@/nlp/settings';
import { t, type MessageKey } from '@/shared/i18n';

type Status = { key: MessageKey; params?: Record<string, string | number> } | null;

const SAVE_DELAY_MS = 400;

/** Grammar-analysis settings. Only rendered for modes whose elements come from remote analysis. */
export function NlpPanel() {
  const [cfg, setCfg] = useState<NlpSettings>(defaults);
  const [token, setToken] = useState('');
  const [open, setOpen] = useState(true);
  const [status, setStatus] = useState<Status>(null);
  const [testing, setTesting] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    void loadNlpSettings().then((next) => {
      setCfg(next);
      // An unconfigured service is the one case where the form must be open.
      setOpen(!next.enabled);
    });
    void chrome.storage.local.get(NLP_TOKEN_KEY).then((value) => setToken(String(value[NLP_TOKEN_KEY] ?? '')));
    return () => window.clearTimeout(timer.current);
  }, []);

  const persist = (next: NlpSettings, nextToken: string) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      try {
        endpoint(next.baseUrl);
      } catch {
        return;
      }
      void chrome.storage.local
        .set({ [NLP_SETTINGS_KEY]: { ...next, baseUrl: endpoint(next.baseUrl) }, [NLP_TOKEN_KEY]: nextToken })
        .then(() => setStatus({ key: 'modes.nlp.saved' }));
    }, SAVE_DELAY_MS);
  };

  const update = (patch: Partial<NlpSettings>) => {
    const next = { ...cfg, ...patch };
    setCfg(next);
    persist(next, token);
  };

  const updateToken = (value: string) => {
    setToken(value);
    persist(cfg, value);
  };

  const test = async () => {
    setTesting(true);
    setStatus(null);
    try {
      const result = await chrome.runtime.sendMessage({ type: 'nlp', action: 'capabilities' });
      if (result?.error) throw new Error(String(result.error));
      const provider = result.provider ?? {};
      setStatus({
        key: 'modes.nlp.ready',
        params: { engine: String(provider.engine ?? '?'), version: String(provider.engineVersion ?? '') },
      });
    } catch (error) {
      setStatus({ key: 'modes.nlp.failed', params: { error: String(error) } });
    } finally {
      setTesting(false);
    }
  };

  const importDocument = async (file: File | undefined) => {
    if (!file) return;
    try {
      if (file.size > 100 * 1024 * 1024) throw new Error(t('modes.nlp.fileTooBig'));
      await saveAnalysis(await validateDocument(JSON.parse(await file.text())));
      setStatus({ key: 'modes.nlp.imported' });
    } catch (error) {
      setStatus({ key: 'modes.nlp.failed', params: { error: String(error) } });
    }
  };

  const exportDocuments = async () => {
    try {
      const rows = await listAnalyses();
      if (!rows.length) {
        setStatus({ key: 'modes.nlp.noCache' });
        return;
      }
      for (const row of rows) {
        const url = URL.createObjectURL(new Blob([JSON.stringify(row.doc, null, 2)], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = `${row.hash.slice(0, 12)}.sanno.json`;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 10000);
      }
      setStatus({ key: 'modes.nlp.exported', params: { count: rows.length } });
    } catch (error) {
      setStatus({ key: 'modes.nlp.failed', params: { error: String(error) } });
    }
  };

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <CardTitle>{t('modes.nlp.title')}</CardTitle>
        <Button size="sm" variant="default" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
          {t(open ? 'modes.nlp.hide' : 'modes.nlp.show')}
        </Button>
      </div>
      {open ? (
        <>
          <p className="my-2 text-sm text-muted-foreground">{t('modes.nlp.required')}</p>
          <label className="my-2 flex items-center gap-2">
            <input type="checkbox" checked={cfg.enabled} onChange={(event) => update({ enabled: event.target.checked })} />
            {t('modes.nlp.enable')}
          </label>
          <label className="my-2 block">
            {t('modes.nlp.baseUrl')}
            <Input value={cfg.baseUrl} onChange={(event) => update({ baseUrl: event.target.value })} />
          </label>
          <label className="my-2 block">
            {t('modes.nlp.token')}
            <Input type="password" autoComplete="off" value={token} onChange={(event) => updateToken(event.target.value)} />
          </label>
          <label className="my-2 block">
            {t('modes.nlp.source')}
            <select
              className="mt-1 w-full rounded-md border border-border-strong bg-card px-2 py-1.5 text-sm"
              value={cfg.sourcePreference}
              onChange={(event) =>
                update({ sourcePreference: event.target.value as NlpSettings['sourcePreference'] })
              }
            >
              <option value="prefer-remote">{t('modes.nlp.source.remote')}</option>
              <option value="local-only">{t('modes.nlp.source.local')}</option>
            </select>
          </label>
          <p className="my-2 font-mono text-2xs break-all text-text-faint">
            {t('modes.nlp.origin', { origin: chrome.runtime.getURL('').replace(/\/$/, '') })}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button disabled={testing} onClick={() => void test()}>
              {t(testing ? 'modes.nlp.testing' : 'modes.nlp.test')}
            </Button>
            <label className="inline-flex cursor-pointer items-center rounded-md border border-border-strong px-3 py-1.5 text-sm hover:border-foreground/25">
              {t('modes.nlp.import')}
              <input
                type="file"
                accept=".json"
                className="sr-only"
                onChange={(event) => void importDocument(event.target.files?.[0])}
              />
            </label>
            <Button variant="default" onClick={() => void exportDocuments()}>
              {t('modes.nlp.export')}
            </Button>
          </div>
          <p role="status" aria-live="polite" className="my-2 text-sm text-muted-foreground">
            {status ? t(status.key, status.params) : null}
          </p>
        </>
      ) : null}
    </Card>
  );
}
