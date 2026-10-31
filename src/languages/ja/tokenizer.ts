import kuromoji from '@sglkc/kuromoji';
import type { IpadicFeatures } from '@sglkc/kuromoji';

import type { DictFile } from '@/shared/dictionary';
import type { Token } from '@/shared/types';
import { hydrateVocabulary, type VocabularyFile } from '@/shared/vocabulary';
import type { LanguageRuntime, Lexicon, Tokenizer } from '@/languages/tokenizers';

import { DictIndex } from './lexicon';
import { toPos } from './pos';

/**
 * Heavy Japanese dependencies: kuromoji and the bundled JLPT dictionary.
 *
 * Only `src/languages/tokenizers.ts` imports this module (and only the background entrypoint
 * imports that), so the content bundle never pays for the dictionary.
 */

type Kuromoji = { tokenize(text: string): IpadicFeatures[] };

let tokenizerPromise: Promise<Kuromoji> | null = null;

const getTokenizer = (): Promise<Kuromoji> => {
  if (tokenizerPromise) return tokenizerPromise;
  tokenizerPromise = new Promise((resolve, reject) => {
    kuromoji.builder({ dicPath: chrome.runtime.getURL('dict/') }).build((err, built) => {
      if (err) {
        const error = `kuromoji init failed: ${String(err)}`;
        console.error('[jp-sub]', error);
        reject(new Error(error));
        return;
      }
      resolve(built as unknown as Kuromoji);
    });
  });
  return tokenizerPromise;
};

const toToken = (raw: IpadicFeatures): Token => ({
  surface: raw.surface_form ?? '',
  pos: toPos(raw.pos ?? ''),
  posRaw: raw.pos ?? '',
  posDetail1: raw.pos_detail_1 ?? '',
  conjType: raw.conjugated_type ?? '',
  conjForm: raw.conjugated_form ?? '',
  baseForm: raw.basic_form ?? '',
  reading: raw.reading ?? '',
});

let dictPromise: Promise<DictIndex | null> | null = null;

const getDictIndex = (): Promise<DictIndex | null> => {
  if (dictPromise) return dictPromise;
  dictPromise = Promise.all([
    fetch(chrome.runtime.getURL('dict/jlpt-dict.json')).then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<DictFile>;
    }),
    // Optional: a build without the visual vocabulary still yields a text-only card.
    fetch(chrome.runtime.getURL('dict/vocabulary.json'))
      .then((res) => (res.ok ? (res.json() as Promise<VocabularyFile>) : null))
      .catch(() => null),
  ])
    .then(([file, vocabulary]) => new DictIndex(hydrateVocabulary(file.entries, vocabulary)))
    .catch((err) => {
      console.error('[jp-sub] dictionary load failed', err);
      return null;
    });
  return dictPromise;
};

export const createJaRuntime = async (): Promise<LanguageRuntime> => {
  const [tokenizer, index] = await Promise.all([getTokenizer(), getDictIndex()]);
  const wrapped: Tokenizer = { tokenize: (text) => tokenizer.tokenize(text).map(toToken) };
  const lexicon: Lexicon | null = index;
  return { tokenizer: wrapped, lexicon };
};
