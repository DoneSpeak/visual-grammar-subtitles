import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createSubdlProvider,
  providerFor,
  SUBDL_DOWNLOAD,
} from '@/features/scraper/providers';
import { sanitizeProviderKeys } from '@/shared/providerSettings';
import { requestEnglishQuery } from '@/shared/translate';

vi.mock('@/shared/translate', () => ({ requestEnglishQuery: vi.fn() }));

const englishQuery = vi.mocked(requestEnglishQuery);

const respond = (body: unknown): Response => new Response(JSON.stringify(body), { status: 200 });

const captureFetch = (body: unknown): ReturnType<typeof vi.fn> => {
  const fetchMock = vi.fn(async () => respond(body));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

afterEach(() => vi.unstubAllGlobals());

describe('provider registry', () => {
  it('serves English, Thai and both Chinese scripts from SubDL', () => {
    for (const language of ['en', 'th', 'zh-Hans', 'zh-Hant']) {
      expect(providerFor(language)?.id).toBe('subdl');
    }
  });

  it('leaves Japanese to kitsunekko', () => {
    expect(providerFor('ja')).toBeUndefined();
  });

  it('falls back to SubDL for a language the user typed by hand', () => {
    expect(providerFor('ko')?.id).toBe('subdl');
    expect(providerFor('  ')).toBeUndefined();
  });

  it('shares one SubDL key between every subtitle language', () => {
    expect(providerFor('en')?.id).toBe(providerFor('zh-Hans')?.id);
  });
});

describe('provider keys', () => {
  it('keeps only known non-empty string keys', () => {
    expect(
      sanitizeProviderKeys({ subdl: ' abc ', opensubtitles: '', other: 'x', nope: 1 }),
    ).toEqual({ subdl: 'abc' });
    expect(sanitizeProviderKeys(null)).toEqual({});
  });
});

describe('subdl provider', () => {
  it('requests Thai subtitles and falls back to the Thai language tag', async () => {
    const fetchMock = captureFetch({
      status: true,
      subtitles: [{ release_name: 'Show.S01E01', url: '/subtitle/2.zip' }],
    });
    const provider = createSubdlProvider('key', 'th');
    const files = await provider.listEpisodes({ id: '42', title: 'Show' }, { season: 1, episode: 1 });
    expect(provider.language).toBe('th');
    expect(files[0].language).toBe('TH');
    expect(new URL((fetchMock.mock.calls[0] as unknown as [URL])[0]).searchParams.get('languages')).toBe(
      'TH',
    );
  });

  it('maps Simplified and Traditional Chinese to SubDL codes', async () => {
    const fetchMock = captureFetch({ status: true, subtitles: [] });
    await createSubdlProvider('key', 'zh-Hans').listEpisodes({ id: '42', title: 'Show' }, {});
    await createSubdlProvider('key', 'zh-Hant').listEpisodes({ id: '42', title: 'Show' }, {});
    const asked = fetchMock.mock.calls.map((call) =>
      new URL((call as unknown as [URL])[0]).searchParams.get('languages'),
    );
    expect(asked).toEqual(['ZH', 'ZH_BG']);
  });

  it('derives a SubDL code for a language outside the curated list', async () => {
    const fetchMock = captureFetch({ status: true, subtitles: [] });
    await createSubdlProvider('key', 'KO').listEpisodes({ id: '42', title: 'Show' }, {});
    await createSubdlProvider('key', 'pt-br').listEpisodes({ id: '42', title: 'Show' }, {});
    const asked = fetchMock.mock.calls.map((call) =>
      new URL((call as unknown as [URL])[0]).searchParams.get('languages'),
    );
    expect(asked).toEqual(['KO', 'PT_BR']);
  });

  it('searches by title and maps results', async () => {
    const fetchMock = captureFetch({
      status: true,
      results: [
        { sd_id: 42, name: 'The Wire', year: 2002 },
        { sd_id: 43, year: 1999 },
      ],
    });
    const hits = await createSubdlProvider('key').search('The Wire');
    expect(hits).toEqual([{ id: '42', title: 'The Wire', year: 2002 }]);
    const url = new URL((fetchMock.mock.calls[0] as unknown as [URL])[0]);
    expect(url.searchParams.get('api_key')).toBe('key');
    expect(url.searchParams.get('film_name')).toBe('The Wire');
    expect(url.searchParams.get('type')).toBe('tv');
    expect(url.searchParams.get('languages')).toBe('EN');
  });

  it('lists episode files and resolves download links', async () => {
    const fetchMock = captureFetch({
      status: true,
      subtitles: [
        {
          release_name: 'The.Wire.S01E01.1080p',
          url: '/subtitle/1.zip',
          language: 'EN',
          subtitlePage: '/subtitle/42/the-wire-s01e01',
          unpack_files: [{ size: 1200 }, { size: 800 }],
        },
        { name: 'no url' },
      ],
    });
    const hit = { id: '42', title: 'The Wire' };
    const files = await createSubdlProvider('key').listEpisodes(hit, { season: 1, episode: 1 });
    expect(files).toEqual([
      {
        id: `${SUBDL_DOWNLOAD}/subtitle/1.zip`,
        name: 'The.Wire.S01E01.1080p',
        language: 'EN',
        url: `${SUBDL_DOWNLOAD}/subtitle/1.zip`,
        release: 'The.Wire.S01E01.1080p',
        size: 2000,
        sourceUrl: 'https://subdl.com/subtitle/42/the-wire-s01e01',
      },
    ]);
    const url = new URL((fetchMock.mock.calls[0] as unknown as [URL])[0]);
    expect(url.searchParams.get('sd_id')).toBe('42');
    expect(url.searchParams.get('season_number')).toBe('1');
    expect(url.searchParams.get('episode_number')).toBe('1');
    expect(url.searchParams.get('unpack')).toBe('1');
  });

  it('omits size and source link when the API does not report them', async () => {
    captureFetch({
      status: true,
      subtitles: [{ release_name: 'The.Wire.S01E01', url: '/subtitle/1.zip', language: 'EN' }],
    });
    const files = await createSubdlProvider('key').listEpisodes(
      { id: '42', title: 'The Wire' },
      {},
    );
    expect(files[0].size).toBeUndefined();
    expect(files[0].sourceUrl).toBeUndefined();
  });

  it('surfaces API errors instead of returning empty results', async () => {
    captureFetch({ status: false, error: 'bad key' });
    await expect(createSubdlProvider('key').search('x')).rejects.toThrow('bad key');
  });

  it('retries with the English title when the raw query finds nothing', async () => {
    englishQuery.mockResolvedValue('The Wire');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(respond({ status: true, results: [] }))
      .mockResolvedValueOnce(respond({ status: true, results: [{ sd_id: 42, name: 'The Wire' }] }));
    vi.stubGlobal('fetch', fetchMock);

    const hits = await createSubdlProvider('key').search(' ザ・ワイヤー ');
    expect(englishQuery).toHaveBeenCalledWith('ザ・ワイヤー');
    expect(hits).toEqual([{ id: '42', title: 'The Wire' }]);
    expect(new URL((fetchMock.mock.calls[1] as unknown as [URL])[0]).searchParams.get('film_name')).toBe(
      'The Wire',
    );
  });

  it('does not retry when the translation is unavailable', async () => {
    englishQuery.mockResolvedValue(null);
    const fetchMock = captureFetch({ status: true, results: [] });

    await expect(createSubdlProvider('key').search('ザ・ワイヤー')).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
