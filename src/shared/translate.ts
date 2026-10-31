/** kitsunekko indexes series by English / romaji names, so CJK queries need translating first. */
const CJK = /[぀-ヿ㐀-䶿一-鿿豈-﫿가-힯]/;

export const needsEnglish = (text: string): boolean => CJK.test(text);

/** Uses Google's public gtx endpoint (no key). Returns null when the text is already English or the result is unchanged. */
export const translateToEnglish = async (text: string): Promise<string | null> => {
  const source = text.trim();
  if (!source || !needsEnglish(source)) return null;
  const url = new URL('https://translate.googleapis.com/translate_a/single');
  url.searchParams.set('client', 'gtx');
  url.searchParams.set('sl', 'auto');
  url.searchParams.set('tl', 'en');
  url.searchParams.set('dt', 't');
  url.searchParams.set('dj', '1');
  url.searchParams.set('q', source);
  const res = await fetch(url, { credentials: 'omit' });
  if (!res.ok) throw new Error(`translate ${res.status} ${res.statusText}`);
  const data = (await res.json()) as { sentences?: { trans?: string }[] };
  const translated = (data.sentences ?? [])
    .map((sentence) => sentence.trans ?? '')
    .join('')
    .trim();
  return translated && translated.toLowerCase() !== source.toLowerCase() ? translated : null;
};

/** Asks the background worker, which caches results for repeated keystrokes. */
export const requestEnglishQuery = (text: string): Promise<string | null> =>
  new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'translateQuery', query: text }, (res?: { query?: string | null }) => {
      void chrome.runtime.lastError;
      resolve(res?.query ?? null);
    });
  });