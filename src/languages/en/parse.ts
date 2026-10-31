import type { Token } from '@/shared/types';

import { MODALS, normalizeWord, SEMI_MODALS } from './pos';
import {
  greedySpans,
  NP_HEADS,
  NP_POS,
  nounPhraseEnd,
  withGrammar,
  wordList,
  type Span,
  type Word,
} from './words';

/**
 * Deterministic shallow parser for the English local mode.
 *
 * It is deliberately conservative: a role or clause is only written when a narrow rule supports
 * it, otherwise the token stays unmarked and the remote service remains the enhancement that
 * fills the gap. Everything is computed from the tokens' POS and morphology — no lexicon lookup,
 * no new dependency, and no `Token.notes` (user-visible copy belongs to `src/shared/i18n/`).
 *
 * Known limitation: `Intl.Segmenter` keeps `I'm` as one token, so a subject contraction is both
 * the subject and, in the structure layer, the start of the verb phrase.
 */

export type ClauseKind = 'main' | 'attributive' | 'nominal' | 'adverbial';

export type ClauseSpan = { start: number; end: number; kind: ClauseKind };

export type ClauseAnalysis = ClauseSpan & {
  subject?: Span;
  predicate?: Span;
  objects: Span[];
  complement?: Span;
  adverbials: Span[];
};

export type Analysis = { words: Word[]; clauses: ClauseAnalysis[] };

export type ParseFeature = 'syntax' | 'clause' | 'structure' | 'morph';

const SUBJECT_CONTRACTIONS = new Set([
  "i'm", "i've", "i'll", "i'd",
  "you're", "you've", "you'll", "you'd",
  "he's", "he'll", "he'd",
  "she's", "she'll", "she'd",
  "it's",
  "we're", "we've", "we'll", "we'd",
  "they're", "they've", "they'll", "they'd",
]);

const SUBJECT_PRONOUNS = new Set(['i', 'you', 'he', 'she', 'it', 'we', 'they']);
const RELATIVE_MARKERS = new Set(['who', 'whom', 'whose', 'which']);
const REPORTING_VERBS = new Set([
  'know', 'think', 'say', 'believe', 'ask', 'wonder', 'tell', 'show', 'prove', 'expect',
  'hope', 'doubt', 'remember', 'forget',
]);
const INDEFINITE_PRONOUNS = new Set([
  'someone', 'somebody', 'something', 'anyone', 'anybody', 'anything', 'everyone',
  'everybody', 'everything', 'nothing', 'none',
]);
const COPULAS = new Set(['be', 'become', 'seem', 'look', 'feel', 'sound', 'taste', 'smell', 'remain', 'stay', 'grow', 'turn']);

const norm = (word: Word): string => normalizeWord(word.token.surface);
const baseOf = (word: Word): string => (word.token.baseForm || norm(word)).toLowerCase();

const isFinite = (word: Word): boolean => {
  if (word.token.pos === 'AUX') return true;
  if (word.token.pos !== 'VERB') return false;
  const form = word.token.morph?.VerbForm;
  return form === undefined || form === 'Fin';
};

/** A nominal that can host a relative clause: a noun, or an indefinite pronoun. */
const isNominalHead = (word: Word): boolean =>
  word.token.pos === 'PRON'
    ? INDEFINITE_PRONOUNS.has(norm(word))
    : word.token.pos === 'NOUN' || word.token.pos === 'PROPN' || word.token.pos === 'NUM';

const isModal = (word: Word): boolean => MODALS.has(baseOf(word)) || SEMI_MODALS.has(norm(word));

/** Index where the NP ending at `end` starts, or -1 when `end` is not a nominal head. */
const npStartAt = (words: Word[], end: number, lower: number): number => {
  if (end < lower || end >= words.length) return -1;
  const head = words[end];
  if (!NP_HEADS.has(head.token.pos)) return -1;
  let start = end;
  while (
    start - 1 >= lower &&
    words[start - 1].run === head.run &&
    NP_POS.has(words[start - 1].token.pos)
  ) {
    start--;
  }
  return start;
};

/** Clause boundaries inside one sentence; the first segment is always the main clause. */
const clauseKindAt = (words: Word[], index: number): ClauseKind | undefined => {
  const word = words[index];
  const previous = words[index - 1];
  if (!previous || previous.sentence !== word.sentence) return undefined;
  const surface = norm(word);

  if (word.token.pos === 'SCONJ') {
    return (surface === 'that' || surface === 'whether') && isReporting(previous)
      ? 'nominal'
      : 'adverbial';
  }
  if (surface === 'that' && isReporting(previous)) return 'nominal';
  if ((surface === 'that' || RELATIVE_MARKERS.has(surface)) && isNominalHead(previous)) {
    return 'attributive';
  }
  // Contact relative clause: nominal + subject pronoun + finite verb, e.g. `an offer he can't refuse`.
  const next = words[index + 1];
  if (SUBJECT_PRONOUNS.has(surface) && isNominalHead(previous) && next && isFinite(next)) {
    return 'attributive';
  }
  return undefined;
};

const isReporting = (word: Word): boolean =>
  word.token.pos === 'VERB' && REPORTING_VERBS.has(baseOf(word));

const clauseSpans = (words: Word[]): ClauseSpan[] => {
  if (!words.length) return [];
  const bounds: { at: number; kind: ClauseKind }[] = [{ at: 0, kind: 'main' }];
  for (let index = 1; index < words.length; index++) {
    if (words[index].sentence !== words[index - 1].sentence) {
      bounds.push({ at: index, kind: 'main' });
      continue;
    }
    const kind = clauseKindAt(words, index);
    if (kind && bounds[bounds.length - 1].at !== index) bounds.push({ at: index, kind });
  }
  return bounds.map((bound, position) => ({
    start: bound.at,
    end: (bounds[position + 1]?.at ?? words.length) - 1,
    kind: bound.kind,
  }));
};

const emptyClause = (span: ClauseSpan): ClauseAnalysis => ({ ...span, objects: [], adverbials: [] });

const analyseClause = (words: Word[], span: ClauseSpan): ClauseAnalysis => {
  const clause = emptyClause(span);
  const { start, end } = span;

  let predicateStart = -1;
  for (let index = start; index <= end; index++) {
    if (isFinite(words[index])) {
      predicateStart = index;
      break;
    }
  }
  if (predicateStart < 0) return clause;

  const contracted = predicateStart === start && SUBJECT_CONTRACTIONS.has(norm(words[start]));
  if (contracted) {
    clause.subject = { start, end: start };
    predicateStart = -1;
    for (let index = start + 1; index <= end; index++) {
      if (isFinite(words[index])) {
        predicateStart = index;
        break;
      }
    }
    if (predicateStart < 0) {
      clause.subject = undefined;
      return clause;
    }
  } else {
    let subjectEnd = predicateStart - 1;
    while (subjectEnd >= start && (words[subjectEnd].token.pos === 'ADV' || words[subjectEnd].token.pos === 'PART')) {
      subjectEnd--;
    }
    const subjectStart = npStartAt(words, subjectEnd, start);
    if (subjectStart >= 0) clause.subject = { start: subjectStart, end: subjectEnd };
  }

  let predicateEnd = predicateStart;
  for (let index = predicateStart + 1; index <= end; index++) {
    const pos = words[index].token.pos;
    const participleNot = pos === 'PART' && norm(words[index]) === 'not';
    if (pos === 'AUX' || pos === 'VERB' || participleNot) predicateEnd = index;
    else break;
  }
  clause.predicate = { start: predicateStart, end: predicateEnd };

  const copular = words
    .slice(predicateStart, predicateEnd + 1)
    .some((word) => COPULAS.has(baseOf(word)));

  for (let index = predicateEnd + 1; index <= end; index++) {
    const pos = words[index].token.pos;
    // Coordination starts a new clause the shallow parser does not resolve; stop guessing here.
    if (pos === 'CCONJ' || pos === 'SCONJ') break;
    if (pos === 'ADV') {
      clause.adverbials.push({ start: index, end: index });
      continue;
    }
    if (pos === 'ADP') {
      const nounEnd = nounPhraseEnd(words, index + 1, end + 1);
      if (nounEnd >= 0) {
        clause.adverbials.push({ start: index, end: nounEnd });
        index = nounEnd;
      }
      continue;
    }
    if (copular && pos === 'ADJ' && !clause.complement) {
      clause.complement = { start: index, end: index };
      continue;
    }
    if (NP_POS.has(pos)) {
      const nounEnd = nounPhraseEnd(words, index, end + 1);
      if (nounEnd >= 0) {
        if (copular && !clause.complement && clause.objects.length === 0) {
          clause.complement = { start: index, end: nounEnd };
        } else if (clause.objects.length < 2) {
          clause.objects.push({ start: index, end: nounEnd });
        }
        index = nounEnd;
      }
    }
  }
  return clause;
};

export const analyze = (tokens: Token[]): Analysis => {
  const words = wordList(tokens);
  return { words, clauses: clauseSpans(words).map((span) => analyseClause(words, span)) };
};

const wordIndexes = (words: Word[], span: Span): number[] => {
  const indexes: number[] = [];
  for (let index = span.start; index <= span.end; index++) {
    if (words[index]) indexes.push(words[index].index);
  }
  return indexes;
};

const ROLE_LABEL: Record<'subject' | 'predicate' | 'object' | 'attributive' | 'adverbial' | 'complement', string> = {
  subject: 'syntax.role:subject',
  predicate: 'syntax.role:predicate',
  object: 'syntax.role:object',
  attributive: 'syntax.role:attributive',
  adverbial: 'syntax.role:adverbial',
  complement: 'syntax.role:complement',
};

const CLAUSE_LABEL: Record<Exclude<ClauseKind, 'main'>, string> = {
  attributive: 'syntax.clause:attributive',
  nominal: 'syntax.clause:nominal',
  adverbial: 'syntax.clause:adverbial',
};

const START_ELEMENT: Record<'NP' | 'VP' | 'PP', string> = {
  NP: 'phrase.structure:NP',
  VP: 'phrase.structure:VP',
  PP: 'phrase.structure:PP',
};

/** Writes the enabled parser layers into `Token.grammar`; disabled layers leave tokens untouched. */
export const applyParse = (tokens: Token[], analysis: Analysis, features: ParseFeature[]): Token[] => {
  const enabled = new Set(features);
  const labels = new Map<number, string[]>();
  const add = (tokenIndex: number, label: string): void => {
    const current = labels.get(tokenIndex);
    if (!current) labels.set(tokenIndex, [label]);
    else if (!current.includes(label)) current.push(label);
  };
  const addSpan = (span: Span, label: string): void => {
    for (const index of wordIndexes(analysis.words, span)) add(index, label);
  };

  for (const clause of analysis.clauses) {
    if (enabled.has('syntax')) {
      if (clause.subject) addSpan(clause.subject, ROLE_LABEL.subject);
      if (clause.predicate) addSpan(clause.predicate, ROLE_LABEL.predicate);
      for (const span of clause.objects) addSpan(span, ROLE_LABEL.object);
      if (clause.complement) addSpan(clause.complement, ROLE_LABEL.complement);
      for (const span of clause.adverbials) addSpan(span, ROLE_LABEL.adverbial);
      if (clause.kind === 'attributive') addSpan(clause, ROLE_LABEL.attributive);
    }
    if (enabled.has('clause') && clause.kind !== 'main') addSpan(clause, CLAUSE_LABEL[clause.kind]);

    if (enabled.has('structure')) {
      if (clause.predicate) {
        // A subject contraction has no separate auxiliary token, so it heads the VP: `I'm gonna make`.
        const contraction =
          clause.subject?.start === clause.start &&
          clause.subject.end === clause.start &&
          analysis.words[clause.start].token.pos === 'AUX';
        addSpan(
          {
            start: contraction ? clause.start : clause.predicate.start,
            end: clause.predicate.end,
          },
          START_ELEMENT.VP,
        );
      }
      if (clause.subject) addSpan(clause.subject, START_ELEMENT.NP);
      for (const span of clause.objects) addSpan(span, START_ELEMENT.NP);
      if (clause.complement && NP_HEADS.has(analysis.words[clause.complement.end].token.pos)) {
        addSpan(clause.complement, START_ELEMENT.NP);
      }
      for (const span of clause.adverbials) {
        const first = analysis.words[span.start];
        const nounEnd = nounPhraseEnd(analysis.words, span.start + 1, span.end + 1);
        if (first?.token.pos === 'ADP' && nounEnd === span.end) {
          addSpan(span, START_ELEMENT.PP);
          addSpan({ start: span.start + 1, end: span.end }, START_ELEMENT.NP);
        }
      }
      // The relative clause extends its head NP: `an offer` + `he can't refuse` → outer NP.
      if (clause.kind === 'attributive' && clause.start > 0) {
        const headStart = npStartAt(analysis.words, clause.start - 1, 0);
        if (headStart >= 0) addSpan({ start: headStart, end: clause.end }, START_ELEMENT.NP);
      }
    }
  }

  if (enabled.has('morph')) {
    analysis.words.forEach((word, position) => {
      const surface = norm(word);
      const token = word.token;
      const labelsForWord: string[] = [];
      const contracted = SUBJECT_CONTRACTIONS.has(surface) || /n't$/.test(surface) || SEMI_MODALS.has(surface);
      if (contracted) labelsForWord.push('morph.form:contraction');
      if (isModal(word)) labelsForWord.push('morph.form:modal');
      if (token.morph?.Polarity === 'Neg' || surface === 'not') labelsForWord.push('morph.form:negation');
      if (token.pos === 'AUX' && !isModal(word)) labelsForWord.push('morph.form:auxiliary');
      const previous = analysis.words[position - 1];
      const baseAfterModal =
        token.pos === 'VERB' && previous?.token.pos === 'AUX' && isModal(previous);
      if (token.pos === 'VERB' && (token.morph?.VerbForm || baseAfterModal)) {
        labelsForWord.push('morph.form:verbForm');
      }
      for (const label of labelsForWord) add(word.index, label);
    });
  }

  return tokens.map((token, index) => {
    const extra = labels.get(index);
    if (!extra) return token;
    return extra.reduce(withGrammar, token);
  });
};

/** All parser layers; callers that only need the analysis should use `analyze`. */
export const parse = (tokens: Token[]): Token[] =>
  applyParse(tokens, analyze(tokens), ['syntax', 'clause', 'structure', 'morph']);

/**
 * Semantic chunks, one clause at a time. A clause with an object splits into subject+auxiliary
 * and verb+object; a short verbless clause stays whole; anything the rules cannot place falls
 * back to the greedy NP/PP/VP scan.
 */
export const chunkSpans = (analysis: Analysis): Span[] => {
  const spans: Span[] = [];
  for (const clause of analysis.clauses) {
    const { start, end } = clause;
    if (!clause.predicate) {
      spans.push(...greedySpans(analysis.words, start, end));
      continue;
    }
    const predicate = clause.predicate;
    let mainVerb = -1;
    for (let index = predicate.start; index <= predicate.end; index++) {
      if (analysis.words[index].token.pos === 'VERB') {
        mainVerb = index;
        break;
      }
    }
    const verbStart = mainVerb >= 0 ? mainVerb : predicate.start;
    // A run boundary between the subject and the verb means the greedy scan is the honest answer.
    if (analysis.words[start].run !== analysis.words[verbStart].run) {
      spans.push(...greedySpans(analysis.words, start, end));
      continue;
    }

    const objectEnd = clause.complement?.end ?? clause.objects[clause.objects.length - 1]?.end;
    if (objectEnd !== undefined) {
      if (verbStart > start) spans.push({ start, end: verbStart - 1 });
      spans.push({ start: verbStart, end: objectEnd });
      if (objectEnd < end) spans.push(...greedySpans(analysis.words, objectEnd + 1, end));
      continue;
    }

    if (end - start + 1 <= 5 || mainVerb < 0) {
      spans.push({ start, end });
      continue;
    }
    if (verbStart > start) spans.push({ start, end: verbStart - 1 });
    spans.push({ start: verbStart, end: predicate.end });
    if (predicate.end < end) spans.push(...greedySpans(analysis.words, predicate.end + 1, end));
  }
  return spans;
};
